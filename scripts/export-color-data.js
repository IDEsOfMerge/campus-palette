#!/usr/bin/env node
'use strict';

// Dev-only analytical exporter for Campus Palette.
// Reads palettes/*.js and scripts/color-science.js directly and writes:
//   - analysis/data/themes_summary.csv
//   - analysis/data/tokens_long.csv
//   - analysis/data/pairwise_distances.csv
//   - analysis/data/cvd_pairs.csv
//
// Run with: node scripts/export-color-data.js

const fs = require('fs');
const path = require('path');
const cs = require('./color-science');

const ROOT = path.join(__dirname, '..');
const PALETTES_DIR = path.join(ROOT, 'palettes');
const OUT_DIR = path.join(ROOT, 'analysis', 'data');

const GROUP_ORDER = [
  'Global Classics',
  'Ivy League',
  'US Public Flagships',
  'US Private Research & STEM',
  'Liberal Arts & Regional Gems',
  'Canadian Universities',
];

const CONTEXT_ROLES = ['bg', 'fg'];
const SYNTAX_ROLES = [
  'accentKeyword', 'accentStorage', 'accentString', 'accentRegex',
  'accentFunction', 'accentFunctionDim', 'accentType', 'accentInterface',
  'accentNumber', 'accentDecorator', 'accentNamespace',
  'colorError', 'colorWarning',
];
const CRITICAL_SET = new Set(cs.CRITICAL_SYNTAX_ROLES);

function csvEscape(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(filename, header, rows) {
  const outPath = path.join(OUT_DIR, filename);
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(','));
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  return { outPath, count: rows.length };
}

function loadPalettes() {
  const files = fs.readdirSync(PALETTES_DIR).filter((f) => f.endsWith('.js')).sort();
  const palettes = files.map((f) => require(path.join(PALETTES_DIR, f)));
  palettes.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    if (a.year !== b.year) return a.year - b.year;
    if (a.university !== b.university) return a.university.localeCompare(b.university);
    return (a.tokens.mode === 'light' ? 0 : 1) - (b.tokens.mode === 'light' ? 0 : 1);
  });
  return palettes;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const palettes = loadPalettes();

  const summaryRows = [];
  const tokenRows = [];
  const cvdRows = [];
  const pairwiseRows = [];

  // Cache Lab & OKLab per palette for fast pairwise + CVD computations
  const labBySlug = new Map();

  for (const p of palettes) {
    const t = p.tokens;
    const audit = cs.auditPalette(p);
    const m = audit.metrics;

    const roleLabs = {};
    let sumL = 0;
    let sumC = 0;

    const emitToken = (role, kind) => {
      const hex = t[role].toUpperCase();
      const oklab = cs.hexToOklab(hex);
      const oklch = cs.hexToOklch(hex);
      const lab = cs.hexToLab(hex);
      const wcag = cs.contrastRatio(hex, t.bg);
      const lc = cs.apcaContrast(hex, t.bg);
      roleLabs[role] = lab;
      if (kind === 'syntax') {
        sumL += oklch.L;
        sumC += oklch.C;
      }
      tokenRows.push([
        p.slug, p.university, p.shortName, p.group, p.country, p.city, p.year, t.mode,
        role, kind, hex,
        oklch.L.toFixed(5), oklch.C.toFixed(5), oklch.h.toFixed(2),
        oklab.a.toFixed(5), oklab.b.toFixed(5),
        lab.L.toFixed(3), lab.a.toFixed(3), lab.b.toFixed(3),
        wcag.toFixed(2), lc.toFixed(1),
      ]);
    };

    for (const role of CONTEXT_ROLES) emitToken(role, 'context');
    for (const role of SYNTAX_ROLES) emitToken(role, 'syntax');
    labBySlug.set(p.slug, roleLabs);

    summaryRows.push([
      p.slug, p.university, p.shortName, p.group, p.country, p.city, p.year, p.brandUrl || '', t.mode,
      t.bg.toUpperCase(), t.fg.toUpperCase(),
      t.accentKeyword.toUpperCase(), t.accentCursor.toUpperCase(), t.accentStatusBar.toUpperCase(),
      m.fgBg.toFixed(2), m.fgLc.toFixed(1), m.commentBg.toFixed(2),
      m.minSyntaxCr.toFixed(2), m.minSyntaxRole,
      (sumL / SYNTAX_ROLES.length).toFixed(4),
      (sumC / SYNTAX_ROLES.length).toFixed(4),
      audit.metrics.severeCvdCount,
      audit.warnings.length,
    ]);

    // Intra-theme CVD pair audit across all 13 syntax roles (78 pairs/theme)
    const simCache = { protan: {}, deutan: {}, tritan: {} };
    for (const role of SYNTAX_ROLES) {
      for (const cvdType of ['protan', 'deutan', 'tritan']) {
        simCache[cvdType][role] = cs.hexToLab(cs.simulateCvd(t[role], cvdType));
      }
    }

    for (let i = 0; i < SYNTAX_ROLES.length; i++) {
      for (let j = i + 1; j < SYNTAX_ROLES.length; j++) {
        const r1 = SYNTAX_ROLES[i];
        const r2 = SYNTAX_ROLES[j];
        const lab1 = roleLabs[r1];
        const lab2 = roleLabs[r2];
        const d76Norm = cs.deltaE76(lab1, lab2);
        const d00Norm = cs.ciede2000(lab1, lab2);
        const dp76 = cs.deltaE76(simCache.protan[r1], simCache.protan[r2]);
        const dp00 = cs.ciede2000(simCache.protan[r1], simCache.protan[r2]);
        const dd76 = cs.deltaE76(simCache.deutan[r1], simCache.deutan[r2]);
        const dd00 = cs.ciede2000(simCache.deutan[r1], simCache.deutan[r2]);
        const dt76 = cs.deltaE76(simCache.tritan[r1], simCache.tritan[r2]);
        const dt00 = cs.ciede2000(simCache.tritan[r1], simCache.tritan[r2]);

        const opts = [
          ['protan', dp76, dp00],
          ['deutan', dd76, dd00],
          ['tritan', dt76, dt00],
        ];
        opts.sort((a, b) => a[1] - b[1]);
        const [worstType, minCvd76, minCvd00] = opts[0];
        const isCrit = CRITICAL_SET.has(r1) && CRITICAL_SET.has(r2);
        const flagWarn = isCrit && d76Norm >= 15.0 && minCvd76 < 10.0;
        const flagSev = isCrit && d76Norm >= 15.0 && minCvd76 < 5.0;

        cvdRows.push([
          p.slug, p.university, p.shortName, p.group, t.mode,
          r1, r2, isCrit ? 'true' : 'false',
          d76Norm.toFixed(3), d00Norm.toFixed(3),
          dp76.toFixed(3), dp00.toFixed(3),
          dd76.toFixed(3), dd00.toFixed(3),
          dt76.toFixed(3), dt00.toFixed(3),
          minCvd76.toFixed(3), minCvd00.toFixed(3),
          worstType,
          flagWarn ? 'true' : 'false',
          flagSev ? 'true' : 'false',
        ]);
      }
    }
  }

  // Pairwise within-mode perceptual distances (CIEDE2000 & CIE76 across 13 syntax roles)
  for (const mode of ['light', 'dark']) {
    const sub = palettes.filter((p) => p.tokens.mode === mode);
    for (let i = 0; i < sub.length; i++) {
      for (let j = i + 1; j < sub.length; j++) {
        const pa = sub[i];
        const pb = sub[j];
        const la = labBySlug.get(pa.slug);
        const lb = labBySlug.get(pb.slug);
        let sum00 = 0;
        let sum76 = 0;
        let min00 = Infinity;
        let max00 = -Infinity;
        for (const role of SYNTAX_ROLES) {
          const d00 = cs.ciede2000(la[role], lb[role]);
          const d76 = cs.deltaE76(la[role], lb[role]);
          sum00 += d00;
          sum76 += d76;
          if (d00 < min00) min00 = d00;
          if (d00 > max00) max00 = d00;
        }
        const bg00 = cs.ciede2000(la.bg, lb.bg);
        pairwiseRows.push([
          mode,
          pa.slug, pa.university, pa.shortName, pa.group,
          pb.slug, pb.university, pb.shortName, pb.group,
          (sum00 / SYNTAX_ROLES.length).toFixed(4),
          max00.toFixed(4),
          min00.toFixed(4),
          (sum76 / SYNTAX_ROLES.length).toFixed(4),
          bg00.toFixed(4),
        ]);
      }
    }
  }

  const r1 = writeCsv('themes_summary.csv', [
    'theme_slug', 'university', 'short_name', 'group', 'country', 'city', 'year', 'brand_url', 'mode',
    'bg', 'fg', 'accent_keyword', 'accent_cursor', 'accent_status_bar',
    'fg_bg_wcag', 'fg_bg_apca_lc', 'comment_bg_wcag', 'min_syntax_wcag', 'min_syntax_role',
    'mean_syntax_oklch_L', 'mean_syntax_oklch_C', 'cvd_severe_count', 'cvd_warning_count',
  ], summaryRows);

  const r2 = writeCsv('tokens_long.csv', [
    'theme_slug', 'university', 'short_name', 'group', 'country', 'city', 'year', 'mode',
    'role', 'role_kind', 'hex',
    'oklch_L', 'oklch_C', 'oklch_h', 'oklab_a', 'oklab_b',
    'cie_L', 'cie_a', 'cie_b', 'wcag_bg', 'apca_lc',
  ], tokenRows);

  const r3 = writeCsv('pairwise_distances.csv', [
    'mode', 'slug_a', 'university_a', 'short_a', 'group_a',
    'slug_b', 'university_b', 'short_b', 'group_b',
    'mean_de00', 'max_de00', 'min_de00', 'mean_de76', 'bg_de00',
  ], pairwiseRows);

  const r4 = writeCsv('cvd_pairs.csv', [
    'theme_slug', 'university', 'short_name', 'group', 'mode',
    'role1', 'role2', 'is_critical_pair',
    'd76_normal', 'd00_normal',
    'd76_protan', 'd00_protan', 'd76_deutan', 'd00_deutan', 'd76_tritan', 'd00_tritan',
    'min_cvd_d76', 'min_cvd_d00', 'worst_type', 'flagged_warning', 'flagged_severe',
  ], cvdRows);

  console.log(`Exported ${palettes.length} themes across ${GROUP_ORDER.length} groupings:`);
  for (const r of [r1, r2, r3, r4]) {
    const kb = (fs.statSync(r.outPath).size / 1024).toFixed(1);
    console.log(`  - ${path.relative(ROOT, r.outPath)} (${r.count} rows, ${kb} KB)`);
  }
}

main();
