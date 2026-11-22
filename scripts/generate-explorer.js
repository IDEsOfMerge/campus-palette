#!/usr/bin/env node
'use strict';

// Generates the self-contained, zero-CDN interactive Campus Palette &
// Colorimetry Explorer in two deployment targets from a single source of truth
// (`palettes/*.js` + `scripts/color-science.js`):
//   1. `site/index.html` (+ `site/.nojekyll`) for GitHub Pages
//   2. `assets/explorer/explorer.html` for the in-editor VS Code / Positron
//      Webview command (`campusPalette.openExplorer`) with strict nonce CSP.
//
// Run with: node scripts/generate-explorer.js

const fs = require('fs');
const path = require('path');
const cs = require('./color-science');

const ROOT_DIR = path.join(__dirname, '..');
const PALETTES_DIR = path.join(ROOT_DIR, 'palettes');
const SITE_DIR = path.join(ROOT_DIR, 'site');
const WEBVIEW_DIR = path.join(ROOT_DIR, 'assets', 'explorer');

const GROUP_ORDER = [
  'Ivy League',
  'Canadian Universities',
  'US Public Flagships',
  'US Private Research & STEM',
  'Liberal Arts & Regional Gems',
  'Global Classics',
];

const SEARCH_ALIASES = {
  harvard: ['crimson', 'veritas', 'yard', 'massachusetts', 'ma'],
  yale: ['bulldogs', 'elis', 'connecticut', 'ct'],
  upenn: ['penn', 'quakers', 'philly', 'pennsylvania', 'pa'],
  princeton: ['tigers', 'new jersey', 'nj'],
  columbia: ['cu', 'lions', 'morningside', 'nyc', 'new york', 'ny', 'philolexian'],
  brown: ['bears', 'rhode island', 'ri'],
  dartmouth: ['big green', 'new hampshire', 'nh'],
  cornell: ['big red', 'carnelian', 'ny'],
  mcgill: ['martlets', 'quebec', 'qc', 'montreal'],
  utoronto: ['uoft', 'u of t', 'varsity blues', 'ontario', 'on', 'toronto'],
  queens: ['gaels', 'tricolour', 'tricolor', 'ontario', 'on', 'kingston'],
  western: ['uwo', 'mustangs', 'ontario', 'on', 'london'],
  ualberta: ['uofa', 'u of a', 'golden bears', 'alberta', 'ab', 'edmonton'],
  ubc: ['thunderbirds', 'british columbia', 'bc', 'vancouver'],
  waterloo: ['uwaterloo', 'warriors', 'ontario', 'on'],
  uvic: ['vikes', 'british columbia', 'bc', 'victoria', 'salish'],
  unc: ['tar heels', 'carolina', 'north carolina', 'nc'],
  umich: ['michigan', 'wolverines', 'maize', 'mi'],
  uva: ['virginia', 'cavaliers', 'wahoos', 'rotunda', 'va'],
  uw: ['udub', 'huskies', 'washington', 'wa', 'seattle'],
  berkeley: ['cal', 'ucb', 'golden bears', 'california', 'ca'],
  utaustin: ['ut', 'longhorns', 'burnt orange', 'texas', 'tx', 'austin'],
  gatech: ['gt', 'yellow jackets', 'georgia', 'ga', 'atlanta', 'georgia institute of technology'],
  ucla: ['bruins', 'westwood', 'los angeles', 'california', 'ca'],
  nyu: ['violets', 'greenwich', 'nyc', 'new york', 'ny'],
  duke: ['blue devils', 'north carolina', 'nc', 'durham'],
  northwestern: ['nu', 'wildcats', 'illinois', 'il', 'evanston'],
  mit: ['massachusetts institute of technology', 'engineers', 'beavers', 'stata', 'ma'],
  stanford: ['cardinal', 'palo alto', 'california', 'ca'],
  uchicago: ['maroons', 'phoenix', 'hyde park', 'illinois', 'il'],
  caltech: ['california institute of technology', 'jpl', 'beavers', 'california', 'ca', 'pasadena'],
  georgetown: ['hoyas', 'hilltop', 'dc', 'potomac'],
  williams: ['ephs', 'berkshires', 'massachusetts', 'ma'],
  notredame: ['nd', 'fighting irish', 'golden dome', 'indiana', 'in'],
  stedwards: ['st edwards', 'seu', 'hilltoppers', 'sorin', 'bluebonnet', 'texas', 'tx', 'austin'],
  rice: ['owls', 'texas', 'tx', 'houston'],
  oxford: ['ox', 'oxbridge', 'bodleian', 'england', 'britain', 'united kingdom'],
  cambridge: ['cantab', 'oxbridge', 'england', 'britain', 'united kingdom'],
  eth: ['ethz', 'swiss', 'zurich', 'eidgenossische'],
  utokyo: ['todai', 'hongo', 'ginkgo', 'akamon', 'tokyo'],
};

const SIMILARITY_KEYS = [
  'accentKeyword',
  'accentStorage',
  'accentString',
  'accentRegex',
  'accentFunction',
  'accentFunctionDim',
  'accentType',
  'accentInterface',
  'accentNumber',
  'accentDecorator',
  'accentNamespace',
  'colorError',
  'colorWarning',
];

function extractRationale(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split(/\r?\n/);
  const commentLines = [];
  for (const line of lines) {
    if (line.startsWith("'use strict'")) continue;
    if (line.trim() === '') {
      if (commentLines.length > 0) continue;
      continue;
    }
    if (line.startsWith('//')) {
      commentLines.push(line.replace(/^\/\/\s?/, ''));
    } else if (line.startsWith('module.exports')) {
      break;
    }
  }
  // Drop the title comment line (e.g. "Columbia University (1754, New York, NY) -- Dark")
  const body = commentLines.slice(1).filter((l, idx) => !(idx === 0 && l.trim() === ''));
  return body.join(' ').replace(/\s+/g, ' ').trim();
}

function loadThemeDataset() {
  const files = fs.readdirSync(PALETTES_DIR).filter((f) => f.endsWith('.js')).sort();
  const byBase = new Map();

  for (const file of files) {
    const full = path.join(PALETTES_DIR, file);
    const mod = require(full);
    const baseSlug = mod.slug.replace(/-(light|dark)$/, '');
    const audit = cs.auditPalette(mod);
    const tk = mod.tokens;
    const aliasList = SEARCH_ALIASES[baseSlug] || [];
    const entry = {
      slug: mod.slug,
      baseSlug,
      label: mod.label,
      university: mod.university,
      shortName: mod.shortName,
      group: mod.group,
      country: mod.country,
      city: mod.city,
      year: mod.year,
      mode: tk.mode,
      subtitle: mod.subtitle,
      story: extractRationale(full),
      aliasList,
      metrics: audit.metrics,
      tokens: {
        bg: tk.bg,
        fg: tk.fg,
        bgLine: tk.bgLine,
        bgWidget: tk.bgWidget,
        bgInput: tk.bgInput,
        bgSidebar: tk.bgSidebar,
        bgPanel: tk.bgPanel,
        bgActivity: tk.bgActivity,
        tintHover: tk.tintHover,
        tintSelect: tk.tintSelect,
        borderSubtle: tk.borderSubtle,
        borderStrong: tk.borderStrong,
        fgSecondary: tk.fgSecondary,
        fgMuted: tk.fgMuted,
        fgVariable: tk.fgVariable,
        fgPunct: tk.fgPunct,
        fgComment: tk.fgComment,
        fgParameter: tk.fgParameter,
        fgProperty: tk.fgProperty,
        accentKeyword: tk.accentKeyword,
        accentStorage: tk.accentStorage,
        accentString: tk.accentString,
        accentRegex: tk.accentRegex,
        accentFunction: tk.accentFunction,
        accentFunctionDim: tk.accentFunctionDim,
        accentType: tk.accentType,
        accentInterface: tk.accentInterface,
        accentNumber: tk.accentNumber,
        accentDecorator: tk.accentDecorator,
        accentNamespace: tk.accentNamespace,
        accentCursor: tk.accentCursor,
        accentFocus: tk.accentFocus,
        accentBadge: tk.accentBadge,
        accentButton: tk.accentButton,
        accentStatusBar: tk.accentStatusBar,
        colorError: tk.colorError,
        colorWarning: tk.colorWarning,
        colorInfo: tk.colorInfo,
        gitAdd: tk.gitAdd,
        gitDelete: tk.gitDelete,
        ansi: tk.ansi,
      },
    };
    if (!byBase.has(baseSlug)) byBase.set(baseSlug, {});
    byBase.get(baseSlug)[tk.mode] = entry;
  }

  const groupBuckets = new Map(GROUP_ORDER.map((g) => [g, []]));
  for (const [baseSlug, pair] of byBase.entries()) {
    if (!pair.light || !pair.dark) {
      throw new Error(`Incomplete Light/Dark pair for campus "${baseSlug}"`);
    }
    const grp = pair.dark.group;
    if (!groupBuckets.has(grp)) {
      throw new Error(`Unexpected collegiate grouping "${grp}" on "${baseSlug}"`);
    }
    groupBuckets.get(grp).push(pair);
  }

  const campusGroups = [];
  const dataset = [];
  for (const grp of GROUP_ORDER) {
    const pairs = groupBuckets.get(grp);
    pairs.sort((a, b) => (a.dark.year - b.dark.year) || a.dark.shortName.localeCompare(b.dark.shortName));
    campusGroups.push({
      group: grp,
      universities: pairs.map((p) => p.dark.university),
    });
    for (const pair of pairs) {
      dataset.push(pair.light, pair.dark);
    }
  }

  return { dataset, campusGroups };
}

function jacobiEigenSymmetric(A) {
  const n = A.length;
  const M = A.map((row) => row.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const maxIter = Math.max(120, n * n * 8);
  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0;
    let q = 1;
    let maxVal = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const av = Math.abs(M[i][j]);
        if (av > maxVal) {
          maxVal = av;
          p = i;
          q = j;
        }
      }
    }
    if (maxVal < 1e-10) break;
    const diff = M[q][q] - M[p][p];
    const t = Math.abs(M[p][q]) < 1e-18 * Math.abs(diff)
      ? M[p][q] / diff
      : (() => {
          const phi = diff / (2 * M[p][q]);
          return (phi >= 0 ? 1 : -1) / (Math.abs(phi) + Math.sqrt(phi * phi + 1));
        })();
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    const tau = s / (1 + c);
    const h = t * M[p][q];
    M[p][p] -= h;
    M[q][q] += h;
    M[p][q] = 0;
    M[q][p] = 0;
    for (let k = 0; k < n; k++) {
      if (k !== p && k !== q) {
        const mkp = M[k][p];
        const mkq = M[k][q];
        M[k][p] = M[p][k] = mkp - s * (mkq + tau * mkp);
        M[k][q] = M[q][k] = mkq + s * (mkp - tau * mkq);
      }
      const vkp = V[k][p];
      const vkq = V[k][q];
      V[k][p] = vkp - s * (vkq + tau * vkp);
      V[k][q] = vkq + s * (vkp - tau * vkq);
    }
  }
  const pairs = Array.from({ length: n }, (_, i) => ({
    val: M[i][i],
    vec: V.map((row) => row[i]),
  }));
  pairs.sort((a, b) => b.val - a.val);
  return pairs;
}

function computeClassicalMds2d(D) {
  const n = D.length;
  const D2 = D.map((row) => row.map((v) => v * v));
  const rowMean = D2.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const grandMean = rowMean.reduce((a, b) => a + b, 0) / n;
  const B = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => -0.5 * (D2[i][j] - rowMean[i] - rowMean[j] + grandMean))
  );
  const eigs = jacobiEigenSymmetric(B);
  const posSum = eigs.reduce((acc, e) => acc + Math.max(0, e.val), 0) || 1;
  const l0 = Math.max(0, eigs[0].val);
  const l1 = Math.max(0, eigs[1].val);
  const s0 = Math.sqrt(l0);
  const s1 = Math.sqrt(l1);
  const coords = Array.from({ length: n }, (_, i) => [eigs[0].vec[i] * s0, eigs[1].vec[i] * s1]);
  return {
    coords,
    v1: Math.round((l0 / posSum) * 1000) / 10,
    v2: Math.round((l1 / posSum) * 1000) / 10,
  };
}

function enrichDatasetWithSimilarity(dataset) {
  const labBySlug = new Map();
  for (const th of dataset) {
    labBySlug.set(
      th.slug,
      SIMILARITY_KEYS.map((k) => cs.hexToLab(th.tokens[k]))
    );
  }
  const pairDe = (slugA, slugB) => {
    const la = labBySlug.get(slugA);
    const lb = labBySlug.get(slugB);
    let sum = 0;
    for (let i = 0; i < la.length; i++) sum += cs.ciede2000(la[i], lb[i]);
    return sum / la.length;
  };

  const mdsMeta = {};
  for (const mode of ['light', 'dark']) {
    const modeThemes = dataset.filter((th) => th.mode === mode);
    const n = modeThemes.length;
    const D = Array.from({ length: n }, () => Array(n).fill(0));
    let closestPair = { de: Infinity, a: '', b: '' };
    let farthestPair = { de: -1, a: '', b: '' };

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = pairDe(modeThemes[i].slug, modeThemes[j].slug);
        D[i][j] = D[j][i] = d;
        if (d < closestPair.de) {
          closestPair = { de: Math.round(d * 100) / 100, a: modeThemes[i].label, b: modeThemes[j].label };
        }
        if (d > farthestPair.de) {
          farthestPair = { de: Math.round(d * 100) / 100, a: modeThemes[i].label, b: modeThemes[j].label };
        }
      }
    }

    const { coords, v1, v2 } = computeClassicalMds2d(D);
    // Consistent orientation across Light and Dark:
    // Dartmouth on -X (pine/emerald), Northwestern on +Y (royal violet)
    const dartIdx = modeThemes.findIndex((th) => th.slug === `dartmouth-${mode}`);
    const nwIdx = modeThemes.findIndex((th) => th.slug === `northwestern-${mode}`);
    if (dartIdx >= 0 && coords[dartIdx][0] > 0) coords.forEach((p) => { p[0] = -p[0]; });
    if (nwIdx >= 0 && coords[nwIdx][1] < 0) coords.forEach((p) => { p[1] = -p[1]; });

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of coords) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    modeThemes.forEach((th, idx) => {
      const [x, y] = coords[idx];
      th.mds = {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        nx: Math.round(((x - minX) / spanX) * 10000) / 10000,
        ny: Math.round(((y - minY) / spanY) * 10000) / 10000,
      };
    });

    modeThemes.forEach((th, i) => {
      const dists = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const rawDe = D[i][j];
        dists.push({ slug: modeThemes[j].slug, rawDe, de: Math.round(rawDe * 10) / 10 });
      }
      dists.sort((a, b) => (a.rawDe - b.rawDe) || a.slug.localeCompare(b.slug));
      th.neighbors = dists.slice(0, 6).map(({ slug, de }) => ({ slug, de }));
      const farItem = dists[dists.length - 1];
      th.farthest = farItem ? { slug: farItem.slug, de: farItem.de } : null;
    });

    mdsMeta[mode] = {
      count: n,
      v1,
      v2,
      minX: Math.round(minX * 10) / 10,
      maxX: Math.round(maxX * 10) / 10,
      minY: Math.round(minY * 10) / 10,
      maxY: Math.round(maxY * 10) / 10,
      closestPair,
      farthestPair,
    };
  }

  return mdsMeta;
}

function buildHtml({ dataset, campusGroups, mdsMeta, target }) {
  const isWeb = target === 'web';
  const totalCampuses = campusGroups.reduce((acc, g) => acc + g.universities.length, 0);
  const cspTag = isWeb
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />`
    : '{{CSP_META}}';
  const scriptOpen = isWeb ? '<script>' : '<script nonce="{{CSP_NONCE}}">';
  const seoTags = isWeb
    ? `
  <meta name="description" content="Explore 80 university-inspired Light &amp; Dark OKLCH themes across 40 iconic US, Canadian &amp; global campuses with live code preview, CIEDE2000 similarity map, CVD simulation, and 8 terminal/IDE exporters." />
  <meta property="og:title" content="Campus Palette — Interactive Workbench &amp; Colorimetry Explorer" />
  <meta property="og:description" content="Explore 80 university-inspired Light &amp; Dark OKLCH themes across 40 iconic US, Canadian &amp; global campuses with live code preview, CIEDE2000 similarity map, CVD simulation, and 8 terminal/IDE exporters." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://idesofmerge.github.io/campus-palette/" />
  <meta property="og:image" content="https://idesofmerge.github.io/campus-palette/og-preview.png" />
  <meta property="og:image:alt" content="Campus Palette — 40 Iconic Universities · 80 OKLCH Themes for VS Code &amp; Positron" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Campus Palette — Interactive Workbench &amp; Colorimetry Explorer" />
  <meta name="twitter:description" content="Explore 80 university-inspired Light &amp; Dark OKLCH themes across 40 iconic US, Canadian &amp; global campuses with live code preview, CIEDE2000 similarity map, CVD simulation, and 8 terminal/IDE exporters." />
  <meta name="twitter:image" content="https://idesofmerge.github.io/campus-palette/og-preview.png" />
  <link rel="icon" type="image/png" href="./icon.png" />`
    : '';

  const serializedData = JSON.stringify(dataset);
  const serializedGroups = JSON.stringify(campusGroups);
  const serializedMdsMeta = JSON.stringify(mdsMeta);

  return `<!DOCTYPE html>
<html lang="en" data-shell-mode="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${cspTag}
  <title>Campus Palette — Interactive Workbench &amp; Colorimetry Explorer</title>${seoTags}
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    :root {
      color-scheme: dark;
      --shell-bg: #10141a;
      --shell-surface: #171c24;
      --shell-elevated: #1e2430;
      --shell-border: #2a3240;
      --shell-border-strong: #3e485c;
      --shell-text: #edf1f7;
      --shell-muted: #98a3b4;
      --shell-accent: #6cace4;
      --shell-accent-fg: #0b141d;
      --shell-radius: 10px;
      --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }

    html[data-shell-mode="light"],
    body[data-shell-mode="light"] {
      color-scheme: light;
      --shell-bg: #f4f2ec;
      --shell-surface: #ffffff;
      --shell-elevated: #ece9e0;
      --shell-border: #d8d3c6;
      --shell-border-strong: #b6afa0;
      --shell-text: #171b22;
      --shell-muted: #555e6d;
      --shell-accent: #1d4e89;
      --shell-accent-fg: #ffffff;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--shell-bg);
      color: var(--shell-text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      transition: background-color 160ms ease, color 160ms ease;
    }

    .page-wrap {
      max-width: 1320px;
      margin: 0 auto;
      padding: 20px 20px 44px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Top Header */
    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 18px;
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-crest {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
    }

    .brand h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 650;
      letter-spacing: -0.015em;
      line-height: 1.2;
    }

    .brand-sub {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--shell-muted);
    }

    .top-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      max-width: 100%;
    }

    button, select, .btn-link {
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 550;
      line-height: 1;
      border-radius: 7px;
      border: 1px solid var(--shell-border);
      background: var(--shell-elevated);
      color: var(--shell-text);
      padding: 8px 11px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background-color 120ms ease, border-color 120ms ease, transform 80ms ease;
    }

    button:hover, select:hover, .btn-link:hover {
      border-color: var(--shell-border-strong);
    }

    button:active {
      transform: translateY(1px);
    }

    button:disabled {
      opacity: 0.55;
      cursor: default;
      transform: none;
    }

    .btn-primary {
      background: var(--shell-text);
      color: var(--shell-bg);
      border-color: var(--shell-text);
      font-weight: 600;
    }

    .btn-primary:hover {
      opacity: 0.92;
      border-color: var(--shell-text);
    }

    .kbd-hint {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(127, 127, 127, 0.18);
      opacity: 0.85;
    }

    .sync-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--shell-muted);
      padding: 6px 10px;
      border-radius: 7px;
      border: 1px solid var(--shell-border);
      background: var(--shell-elevated);
      cursor: pointer;
      user-select: none;
    }

    .sync-toggle input {
      margin: 0;
      cursor: pointer;
    }

    /* Collegiate Grouping Selector Rail */
    .campus-panel {
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .campus-filter-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--shell-border);
    }

    .campus-search {
      font-family: var(--font-sans);
      font-size: 12px;
      padding: 6.5px 10px;
      border-radius: 7px;
      border: 1px solid var(--shell-border);
      background: var(--shell-bg);
      color: var(--shell-text);
      flex: 1 1 240px;
      min-width: 180px;
      max-width: 360px;
      outline: none;
      transition: border-color 120ms ease;
    }

    .campus-search::placeholder {
      color: var(--shell-muted);
    }

    .campus-search:focus {
      border-color: var(--shell-accent);
    }

    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      max-width: 100%;
    }

    .filter-chip {
      padding: 5px 8.5px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 550;
      line-height: 1.25;
      background: var(--shell-bg);
      border: 1px solid var(--shell-border);
      color: var(--shell-muted);
      max-width: 100%;
      white-space: normal;
      text-align: left;
    }

    .filter-chip:hover {
      color: var(--shell-text);
      border-color: var(--shell-border-strong);
    }

    .filter-chip[aria-pressed="true"] {
      background: var(--shell-text);
      color: var(--shell-bg);
      border-color: var(--shell-text);
      font-weight: 600;
    }

    .filter-count {
      margin-left: auto;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--shell-muted);
      white-space: nowrap;
    }

    .campus-groups {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
    }

    .group-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }

    .group-label {
      font-size: 10px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--shell-muted);
    }

    .group-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .campus-pill {
      padding: 5px 8.5px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 500;
      background: var(--shell-bg);
      border: 1px solid var(--shell-border);
      color: var(--shell-muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
    }

    .campus-pill:hover {
      color: var(--shell-text);
      border-color: var(--shell-border-strong);
    }

    .campus-pill[aria-pressed="true"] {
      background: var(--shell-text);
      color: var(--shell-bg);
      border-color: var(--shell-text);
      font-weight: 600;
    }

    .mini-strip {
      display: inline-flex;
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid rgba(128, 128, 128, 0.35);
      height: 10px;
      flex-shrink: 0;
    }

    .mini-strip span {
      width: 5px;
      height: 10px;
      display: block;
    }

    .campus-empty {
      padding: 12px 4px 4px;
      font-size: 12.5px;
      color: var(--shell-muted);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .campus-empty[hidden],
    .campus-groups[hidden],
    .compare-strip[hidden],
    .map-strip[hidden] {
      display: none;
    }

    .reset-filter-btn {
      padding: 4px 9px;
      font-size: 11px;
    }

    /* Story + Mode/CVD Control Bar */
    .story-bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
      padding: 16px 18px;
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
    }

    @media (max-width: 960px) {
      .story-bar { grid-template-columns: minmax(0, 1fr); }
    }

    .story-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 12px;
    }

    .story-title {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .story-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 5px;
      background: var(--shell-elevated);
      border: 1px solid var(--shell-border);
      color: var(--shell-muted);
    }

    .story-sub {
      font-size: 12.5px;
      color: var(--shell-muted);
      margin-top: 3px;
      display: block;
    }

    .story-text {
      margin: 7px 0 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--shell-muted);
      max-width: 86ch;
    }

    .story-text code {
      font-family: var(--font-mono);
      font-size: 11.5px;
      padding: 1px 4.5px;
      border-radius: 4px;
      background: var(--shell-elevated);
      border: 1px solid var(--shell-border);
      color: var(--shell-text);
    }

    .control-clusters {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
      max-width: 100%;
    }

    @media (max-width: 960px) {
      .control-clusters { align-items: flex-start; }
    }

    .seg-group {
      display: inline-flex;
      background: var(--shell-bg);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--shell-border);
      gap: 2px;
      flex-wrap: wrap;
      max-width: 100%;
    }

    .seg-btn {
      border: none;
      background: transparent;
      color: var(--shell-muted);
      padding: 6px 10px;
      border-radius: 5px;
      font-size: 11.5px;
      font-weight: 550;
    }

    .seg-btn:hover {
      color: var(--shell-text);
    }

    .seg-btn[aria-selected="true"],
    .seg-btn[aria-pressed="true"] {
      background: var(--shell-surface);
      color: var(--shell-text);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
    }

    /* Nearest Chromatic Neighbors Strip inside Story Bar */
    .neighbor-bar {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed var(--shell-border);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      max-width: 100%;
    }

    .neighbor-lbl {
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--shell-muted);
      margin-right: 2px;
    }

    .neighbor-chip-wrap {
      display: inline-flex;
      align-items: stretch;
      border-radius: 6px;
      border: 1px solid var(--shell-border);
      background: var(--shell-bg);
      overflow: hidden;
      transition: border-color 120ms ease;
      max-width: 100%;
    }

    .neighbor-chip-wrap:hover {
      border-color: var(--shell-border-strong);
    }

    .neighbor-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3.5px 7.5px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--shell-text);
      font-size: 11.5px;
      font-weight: 550;
      cursor: pointer;
    }

    .neighbor-chip:hover {
      background: var(--shell-elevated);
    }

    .neighbor-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 2.5px solid currentColor;
      box-sizing: border-box;
    }

    .neighbor-de {
      font-family: var(--font-mono);
      font-size: 10.5px;
      color: var(--shell-muted);
    }

    .neighbor-cmp-btn {
      padding: 3px 6px;
      border: none;
      border-left: 1px solid var(--shell-border);
      border-radius: 0;
      background: transparent;
      color: var(--shell-muted);
      font-size: 11px;
      cursor: pointer;
    }

    .neighbor-cmp-btn:hover {
      background: var(--shell-elevated);
      color: var(--shell-text);
    }

    .neighbor-sep {
      color: var(--shell-border-strong);
      margin: 0 2px;
      user-select: none;
    }

    /* Env actions, Compare Toggle & Multi-Format Export */
    #env-actions {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .export-group {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      max-width: 100%;
    }

    #export-format {
      padding: 7px 10px;
      max-width: 100%;
    }

    #btn-compare-toggle[aria-pressed="true"],
    #btn-map-toggle[aria-pressed="true"] {
      background: var(--shell-accent);
      color: var(--shell-accent-fg);
      border-color: var(--shell-accent);
      font-weight: 600;
    }

    /* Interactive Perceptual Similarity Map Strip */
    .map-strip {
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .map-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 276px;
      gap: 14px;
      align-items: stretch;
    }

    .mds-svg-wrap {
      background: var(--shell-bg);
      border: 1px solid var(--shell-border);
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      min-width: 0;
      max-width: 100%;
    }

    #mds-svg {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      user-select: none;
    }

    .mds-node {
      cursor: pointer;
      transition: opacity 140ms ease;
    }

    .mds-node:hover .mds-label-bg,
    .mds-node.is-active .mds-label-bg {
      stroke-width: 1.5;
    }

    .mds-node.is-dimmed {
      opacity: 0.22;
    }

    .mds-inspector {
      background: var(--shell-bg);
      border: 1px solid var(--shell-border);
      border-radius: 8px;
      padding: 12px 13px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    .mds-insp-head {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mds-insp-kicker {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--shell-muted);
    }

    .mds-insp-title {
      font-size: 14.5px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--shell-text);
    }

    .mds-insp-meta {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--shell-muted);
    }

    .mds-insp-sub {
      font-size: 11.5px;
      color: var(--shell-muted);
      line-height: 1.4;
      margin: 2px 0 0;
    }

    .mds-insp-swatches {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 5px;
    }

    .mds-insp-sw {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      color: var(--shell-muted);
    }

    .mds-insp-sw span {
      width: 100%;
      height: 18px;
      border-radius: 4px;
      border: 1px solid var(--shell-border-strong);
    }

    .mds-insp-dist {
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      font-family: var(--font-mono);
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mds-insp-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .mds-insp-actions button {
      flex: 1 1 auto;
      justify-content: center;
      font-size: 11.5px;
      padding: 6px 10px;
    }

    .mds-legend-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 12px;
      font-size: 11px;
      color: var(--shell-muted);
    }

    .mds-legend-key {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      min-width: 0;
      max-width: 100%;
    }

    .mds-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .mds-legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      border: 1px solid rgba(128, 128, 128, 0.45);
      flex-shrink: 0;
    }

    /* Side-by-Side Compare Strip */
    .compare-strip {
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .compare-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 14px;
    }

    .compare-title-wrap {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      min-width: 0;
    }

    .compare-title-wrap h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
    }

    .compare-de-badge {
      font-family: var(--font-mono);
      font-size: 11.5px;
      font-weight: 650;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--shell-elevated);
      border: 1px solid var(--shell-border-strong);
      color: var(--shell-text);
      white-space: nowrap;
    }

    .compare-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      max-width: 100%;
    }

    .compare-label {
      font-size: 12px;
      font-weight: 550;
      color: var(--shell-muted);
    }

    #compare-select {
      padding: 7px 10px;
      max-width: 100%;
    }

    .compare-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .compare-card {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--shell-border-strong);
      border-top-width: 3px;
      font-family: var(--font-mono);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .compare-card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 10px;
      padding: 8px 12px;
      border-bottom: 1px solid transparent;
      font-family: var(--font-sans);
      font-size: 12px;
    }

    .compare-card-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .compare-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 650;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .compare-meta-sub {
      font-size: 11px;
    }

    .compare-code {
      margin: 0;
      padding: 10px 0;
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 1.55;
      overflow-x: auto;
      flex: 1;
    }

    .compare-metrics {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 12px;
      padding: 7px 12px;
      border-top: 1px solid transparent;
      font-size: 11px;
    }

    .compare-swatches {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 5px;
      padding: 7px 10px 8px;
      border-top: 1px solid transparent;
    }

    .compare-swatch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 4px 5px;
      border-radius: 5px;
      border: 1px solid rgba(128, 128, 128, 0.28);
      background: transparent;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 550;
      cursor: pointer;
      min-width: 0;
    }

    .compare-swatch-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      flex-shrink: 0;
    }

    /* Simulated Positron / VS Code Workbench */
    .workbench {
      border-radius: var(--shell-radius);
      overflow: hidden;
      border: 1px solid var(--shell-border-strong);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
      font-family: var(--font-mono);
    }

    .wb-titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 12px;
      height: 38px;
      border-bottom: 1px solid transparent;
      font-size: 12px;
    }

    .wb-tabs {
      display: flex;
      align-items: stretch;
      height: 100%;
      gap: 2px;
      overflow-x: auto;
      min-width: 0;
      max-width: 100%;
    }

    .wb-dots {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 10px;
      flex-shrink: 0;
    }

    .wb-dots span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }

    .wb-tab {
      border: none;
      border-top: 2px solid transparent;
      border-radius: 0;
      padding: 0 12px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      background: transparent;
      cursor: pointer;
      height: 100%;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .wb-pill {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .wb-body {
      display: grid;
      grid-template-columns: 44px 236px minmax(0, 1fr);
      min-height: 380px;
    }

    .wb-activity {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 0;
      gap: 14px;
      border-right: 1px solid transparent;
    }

    .wb-act-icon {
      width: 44px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-left: 2px solid transparent;
      opacity: 0.85;
    }

    .wb-sidebar {
      padding: 12px;
      border-right: 1px solid transparent;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      font-size: 11.5px;
      min-width: 0;
    }

    @media (max-width: 960px) {
      .wb-body { grid-template-columns: minmax(0, 1fr); }
      .wb-activity { display: none; }
      .wb-sidebar {
        border-right: none;
        border-bottom: 1px solid transparent;
      }
    }

    .wb-sec-head {
      font-family: var(--font-sans);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .wb-file-item {
      padding: 4px 7px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 2px;
    }

    .wb-var-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      padding: 3px 0;
      font-size: 11px;
    }

    .wb-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .wb-editor {
      margin: 0;
      padding: 14px 0;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.62;
      overflow-x: auto;
      flex: 1;
    }

    .code-line {
      display: flex;
      padding: 0 16px 0 0;
      min-width: max-content;
    }

    .line-num {
      width: 42px;
      padding-right: 14px;
      text-align: right;
      user-select: none;
      flex-shrink: 0;
    }

    .wb-console {
      padding: 10px 16px 12px;
      border-top: 1px solid transparent;
      font-size: 11.5px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .ansi-strip {
      display: grid;
      grid-template-columns: repeat(16, minmax(0, 1fr));
      gap: 4px;
      padding-top: 4px;
    }

    .ansi-cell {
      height: 16px;
      border-radius: 3px;
      border: 1px solid rgba(128, 128, 128, 0.28);
      cursor: pointer;
      padding: 0;
      transition: transform 90ms ease;
    }

    .ansi-cell:hover {
      transform: scaleY(1.25);
    }

    .wb-statusbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 12px;
      font-size: 11.5px;
    }

    .wb-sb-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      min-width: 0;
    }

    @keyframes blinkCursor {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0.18; }
    }

    .sim-cursor {
      display: inline-block;
      width: 7px;
      height: 1.12em;
      vertical-align: text-bottom;
      margin-left: 1px;
      animation: blinkCursor 1.1s infinite;
    }

    /* Live WCAG / APCA / CVD Metrics Drawer KPI Strip */
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .kpi-card {
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
      padding: 11px 14px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .kpi-label {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--shell-muted);
    }

    .kpi-value {
      font-family: var(--font-mono);
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .kpi-sub {
      font-size: 11px;
      color: var(--shell-muted);
      overflow-wrap: anywhere;
    }

    /* Science Studio Grid */
    .studio-grid {
      display: grid;
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 16px;
      align-items: start;
    }

    @media (max-width: 1024px) {
      .studio-grid { grid-template-columns: minmax(0, 1fr); }
    }

    .panel-card {
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .panel-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .panel-head h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
    }

    .panel-meta {
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--shell-muted);
    }

    .table-scroll {
      overflow-x: auto;
      max-width: 100%;
    }

    table.audit-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .audit-table th {
      text-align: left;
      font-weight: 600;
      color: var(--shell-muted);
      padding: 7px 8px;
      border-bottom: 1px solid var(--shell-border);
      font-size: 11px;
      white-space: nowrap;
    }

    .audit-table td {
      padding: 6.5px 8px;
      border-bottom: 1px solid var(--shell-border);
      font-family: var(--font-mono);
      font-size: 11.5px;
      white-space: nowrap;
    }

    .audit-table tr.token-row {
      cursor: pointer;
      transition: background-color 100ms ease;
    }

    .audit-table tr.token-row:hover {
      background: var(--shell-elevated);
    }

    .audit-table td.role-cell {
      font-family: var(--font-sans);
      font-weight: 500;
    }

    .swatch-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }

    .audit-table .swatch-chip {
      flex-wrap: nowrap;
    }

    .swatch-box {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1px solid rgba(128, 128, 128, 0.35);
      display: inline-block;
      flex-shrink: 0;
    }

    .canvas-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .canvas-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 8px;
      border-radius: 8px;
      background: var(--shell-bg);
      border: 1px solid var(--shell-border);
      width: 100%;
      overflow: hidden;
    }

    .canvas-wrap canvas {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .pair-compare {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--shell-border);
      font-size: 12px;
      color: var(--shell-muted);
      flex-wrap: wrap;
    }

    .toast {
      position: fixed;
      bottom: 18px;
      right: 18px;
      background: var(--shell-text);
      color: var(--shell-bg);
      padding: 8px 14px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px);
      transition: opacity 150ms ease, transform 150ms ease;
      z-index: 50;
      max-width: calc(100vw - 36px);
    }

    .toast[data-visible="true"] {
      opacity: 1;
      transform: translateY(0);
    }

    footer.foot {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--shell-muted);
      padding-top: 4px;
    }

    footer.foot a {
      color: var(--shell-text);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* Mobile & Narrow-Viewport Responsive Polish */
    @media (max-width: 780px) {
      .page-wrap {
        padding: 12px 12px 32px;
        gap: 12px;
      }

      .topbar {
        padding: 12px 14px;
        gap: 10px;
      }

      .top-actions {
        width: 100%;
        gap: 6px;
      }

      .export-group {
        width: 100%;
      }

      #export-format {
        flex: 1 1 150px;
        min-width: 0;
      }

      #env-actions {
        width: 100%;
        gap: 6px;
      }

      .campus-filter-bar {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .campus-search {
        flex: none;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }

      .filter-count {
        margin-left: 0;
      }

      .story-bar {
        padding: 12px 14px;
      }

      .compare-strip,
      .map-strip {
        padding: 12px;
      }

      .map-layout {
        grid-template-columns: minmax(0, 1fr);
      }

      .compare-controls {
        width: 100%;
      }

      #compare-select {
        flex: 1 1 170px;
        min-width: 0;
      }

      .compare-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .compare-swatches {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .wb-titlebar {
        height: auto;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px 10px;
      }

      .wb-tabs {
        width: 100%;
        height: auto;
      }

      .wb-tab {
        padding: 6px 9px;
      }

      .wb-sidebar {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px 12px;
      }

      .ansi-strip {
        grid-template-columns: repeat(8, minmax(0, 1fr));
      }

      .kpi-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .panel-card {
        padding: 12px 14px;
      }
    }
  </style>
</head>
<body data-shell-mode="dark" data-target="${target}" data-initial-theme="">
  <div class="page-wrap">
    <header class="topbar">
      <div class="brand">
        <svg class="brand-crest" viewBox="0 0 36 36" aria-hidden="true">
          <defs>
            <clipPath id="crest-clip-left"><rect x="0" y="0" width="18" height="36" /></clipPath>
            <clipPath id="crest-clip-right"><rect x="18" y="0" width="18" height="36" /></clipPath>
          </defs>
          <path id="crest-left" d="M5,4 L31,4 L31,18 C31,26 24.5,31 18,33.5 C11.5,31 5,26 5,18 Z" fill="#EEF4F9" clip-path="url(#crest-clip-left)" />
          <path id="crest-right" d="M5,4 L31,4 L31,18 C31,26 24.5,31 18,33.5 C11.5,31 5,26 5,18 Z" fill="#091822" clip-path="url(#crest-clip-right)" />
          <path id="crest-chevron" d="M5,14.5 L18,20.5 L31,14.5 L31,18.8 L18,24.8 L5,18.8 Z" fill="#6CACE4" />
          <polygon id="crest-star" points="18,7 19.6,10.3 23.2,10.7 20.5,13 21.2,16.5 18,14.7 14.8,16.5 15.5,13 12.8,10.7 16.4,10.3" fill="#B9D9EB" />
          <path id="crest-rim" d="M5,4 L31,4 L31,18 C31,26 24.5,31 18,33.5 C11.5,31 5,26 5,18 Z" fill="none" stroke="#6CACE4" stroke-width="1.8" stroke-linejoin="round" />
        </svg>
        <div>
          <h1>Campus Palette</h1>
          <p class="brand-sub">${totalCampuses} Iconic Universities · ${dataset.length} OKLCH-Calibrated Light &amp; Dark Themes for VS Code &amp; Positron</p>
        </div>
      </div>

      <div class="top-actions" id="top-actions">
        <button type="button" id="btn-prev-theme" title="Previous theme (Up / Left Arrow)">←</button>
        <button type="button" id="btn-toggle-mode" class="btn-primary" title="Flip Light and Dark variant of active university (T)">
          <span id="toggle-mode-label">Switch to Light</span>
          <span class="kbd-hint">T</span>
        </button>
        <button type="button" id="btn-next-theme" title="Next theme (Down / Right Arrow)">→</button>
        <button type="button" id="btn-random-theme" title="Jump to a random university theme (R)">
          Random <span class="kbd-hint">R</span>
        </button>
        <button type="button" id="btn-compare-toggle" aria-pressed="false" title="Toggle side-by-side comparison mode (C)">
          Compare <span class="kbd-hint">C</span>
        </button>
        <button type="button" id="btn-map-toggle" aria-pressed="false" title="Toggle interactive CIEDE2000 similarity map (M)">
          Map <span class="kbd-hint">M</span>
        </button>
        <span class="export-group">
          <select id="export-format" aria-label="Export palette format" title="Choose palette export format">
            <option value="vscode">VS Code (settings.json)</option>
            <option value="ghostty">Ghostty</option>
            <option value="wezterm">WezTerm (TOML)</option>
            <option value="alacritty">Alacritty (TOML)</option>
            <option value="windowsterminal">Windows Terminal (JSON)</option>
            <option value="kitty">Kitty (.conf)</option>
            <option value="iterm2">iTerm2 (.itermcolors)</option>
            <option value="css">CSS Custom Properties</option>
          </select>
          <button type="button" id="btn-copy-export" title="Copy active theme in selected format">Copy</button>
          <button type="button" id="btn-download-export" title="Download active theme file in selected format">Download</button>
        </span>
        <span id="env-actions"></span>
      </div>
    </header>

    <nav class="campus-panel" aria-label="Universities by collegiate grouping">
      <div class="campus-filter-bar" id="campus-filter-bar">
        <input type="search" id="campus-search" class="campus-search" placeholder="Filter campuses by name, city, country, group, or year… (/)" aria-label="Filter campuses by name, city, country, group, or founding year" autocomplete="off" spellcheck="false" />
        <div class="filter-chips" id="group-chips" role="group" aria-label="Filter by collegiate grouping">
          <button type="button" class="filter-chip" data-group="All" aria-pressed="true">All (${totalCampuses})</button>
          <button type="button" class="filter-chip" data-group="Ivy League" aria-pressed="false">Ivy League</button>
          <button type="button" class="filter-chip" data-group="Canadian Universities" aria-pressed="false">Canadian Universities</button>
          <button type="button" class="filter-chip" data-group="US Public Flagships" aria-pressed="false">US Public Flagships</button>
          <button type="button" class="filter-chip" data-group="US Private Research &amp; STEM" aria-pressed="false">US Private Research &amp; STEM</button>
          <button type="button" class="filter-chip" data-group="Liberal Arts &amp; Regional Gems" aria-pressed="false">Liberal Arts &amp; Regional Gems</button>
          <button type="button" class="filter-chip" data-group="Global Classics" aria-pressed="false">Global Classics</button>
        </div>
        <span class="filter-count" id="filter-count" aria-live="polite">Showing ${totalCampuses} / ${totalCampuses} campuses</span>
      </div>
      <div class="campus-groups" id="campus-groups"></div>
      <div class="campus-empty" id="campus-empty" hidden>No matching campuses. <button type="button" id="btn-reset-filters" class="reset-filter-btn">Reset filters</button></div>
    </nav>

    <section class="story-bar" aria-labelledby="active-theme-heading">
      <div>
        <div class="story-head">
          <h2 class="story-title" id="active-theme-heading"></h2>
          <span class="story-badge" id="active-theme-meta"></span>
        </div>
        <span class="story-sub" id="active-theme-subtitle"></span>
        <p class="story-text" id="active-theme-story"></p>
        <div class="neighbor-bar" id="neighbor-bar" aria-label="Nearest chromatic neighbors by CIEDE2000"></div>
      </div>

      <div class="control-clusters">
        <div class="seg-group" role="tablist" aria-label="Color vision deficiency simulation">
          <button type="button" class="seg-btn cvd-btn" data-cvd="normal" role="tab" aria-selected="true">Normal <span class="kbd-hint">1</span></button>
          <button type="button" class="seg-btn cvd-btn" data-cvd="protan" role="tab" aria-selected="false">Protanopia <span class="kbd-hint">2</span></button>
          <button type="button" class="seg-btn cvd-btn" data-cvd="deutan" role="tab" aria-selected="false">Deuteranopia <span class="kbd-hint">3</span></button>
          <button type="button" class="seg-btn cvd-btn" data-cvd="tritan" role="tab" aria-selected="false">Tritanopia <span class="kbd-hint">4</span></button>
        </div>
      </div>
    </section>

    <section class="map-strip" id="map-strip" aria-label="Interactive Perceptual Similarity Map" hidden>
      <div class="compare-head">
        <div class="compare-title-wrap">
          <h2>Perceptual Similarity Map (CIEDE2000 MDS)</h2>
          <span class="panel-meta" id="map-variance-note"></span>
        </div>
        <div class="compare-controls">
          <div class="seg-group" role="group" aria-label="Map polarity">
            <button type="button" class="seg-btn map-mode-btn" data-map-mode="light" aria-pressed="false">Light (${totalCampuses})</button>
            <button type="button" class="seg-btn map-mode-btn" data-map-mode="dark" aria-pressed="true">Dark (${totalCampuses})</button>
          </div>
          <label class="compare-label" for="map-color-by">Color:</label>
          <select id="map-color-by" aria-label="Color map nodes by">
            <option value="swatch">Theme Swatch</option>
            <option value="group">Grouping</option>
            <option value="country">Country</option>
          </select>
        </div>
      </div>
      <div class="map-layout">
        <div class="mds-svg-wrap">
          <svg id="mds-svg" viewBox="0 0 920 520" role="img" aria-label="2D Classical MDS scatter plot of Campus Palette themes in CIEDE2000 color space"></svg>
        </div>
        <aside class="mds-inspector" id="mds-inspector" aria-live="polite"></aside>
      </div>
      <div class="mds-legend-row">
        <span id="mds-legend-key" class="mds-legend-key">Inner dot = editor bg · outer ring = signature keyword accent · dotted links = top-3 nearest siblings to active theme</span>
        <span>Click node to activate · Shift+Click to compare</span>
      </div>
    </section>

    <section class="compare-strip" id="compare-strip" aria-label="Side-by-side theme comparison" hidden>
      <div class="compare-head">
        <div class="compare-title-wrap">
          <h2>Side-by-Side Compare</h2>
          <span class="compare-de-badge" id="compare-de-badge"></span>
          <span class="panel-meta" id="compare-vision-note"></span>
        </div>
        <div class="compare-controls">
          <label class="compare-label" for="compare-select">Theme B:</label>
          <select id="compare-select" aria-label="Select comparison theme"></select>
          <button type="button" id="btn-compare-swap" title="Swap Theme A (active) and Theme B (compare target)">Swap A ↔ B</button>
        </div>
      </div>
      <div class="compare-grid" id="compare-grid"></div>
    </section>

    <main class="workbench" id="workbench" aria-label="Simulated Positron and VS Code Workbench">
      <div class="wb-titlebar" id="wb-titlebar">
        <div class="wb-tabs">
          <div class="wb-dots" aria-hidden="true">
            <span id="dot-close"></span>
            <span id="dot-min"></span>
            <span id="dot-max"></span>
          </div>
          <button type="button" class="wb-tab lang-tab" id="tab-py" data-lang="py">campus_study.py</button>
          <button type="button" class="wb-tab lang-tab" id="tab-r" data-lang="r">enrollment_model.R</button>
          <button type="button" class="wb-tab lang-tab" id="tab-ts" data-lang="ts">workbench.ts</button>
          <button type="button" class="wb-tab lang-tab" id="tab-sql" data-lang="sql">campus_metrics.sql</button>
          <button type="button" class="wb-tab lang-tab" id="tab-qmd" data-lang="qmd">seminar_report.qmd</button>
        </div>
        <span class="wb-pill" id="wb-vision-pill"></span>
      </div>

      <div class="wb-body">
        <aside class="wb-activity" id="wb-activity" aria-hidden="true">
          <div class="wb-act-icon" id="act-icon-active">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z"/></svg>
          </div>
          <div class="wb-act-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          </div>
          <div class="wb-act-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="9" r="3"/><path d="M6 9v6M18 12c0 3-3 4-12 4"/></svg>
          </div>
          <div class="wb-act-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
          </div>
        </aside>

        <aside class="wb-sidebar" id="wb-sidebar">
          <div>
            <div class="wb-sec-head" id="wb-exp-head">Explorer · Research Lab</div>
            <div id="wb-file-list"></div>
          </div>
          <div id="wb-positron-pane" style="padding-top:10px;border-top:1px solid transparent">
            <div class="wb-sec-head" id="wb-var-head">Positron · Variables</div>
            <div id="wb-var-list"></div>
          </div>
        </aside>

        <div class="wb-main">
          <pre class="wb-editor" id="wb-editor"></pre>
          <div class="wb-console" id="wb-console">
            <div id="wb-console-lines"></div>
            <div>
              <div class="wb-sec-head" id="wb-ansi-head" style="margin-bottom:4px">Integrated Terminal · 16 ANSI Slots (click any swatch to copy hex)</div>
              <div class="ansi-strip" id="ansi-strip"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="wb-statusbar" id="wb-statusbar">
        <div class="wb-sb-group">
          <span id="sb-git">⎇ main · Positron Python 3.12 / R 4.4</span>
          <span id="sb-cvd-gate"></span>
        </div>
        <div class="wb-sb-group">
          <span id="sb-contrast"></span>
          <strong id="sb-label"></strong>
        </div>
      </div>
    </main>

    <section class="kpi-strip" id="metrics-drawer" aria-label="Live WCAG, APCA, and CVD Metrics Summary">
      <div class="kpi-card">
        <span class="kpi-label">Primary fg / bg WCAG 2.1</span>
        <span class="kpi-value" id="kpi-wcag"></span>
        <span class="kpi-sub" id="kpi-wcag-sub"></span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">APCA-W3 Perceptual |Lc|</span>
        <span class="kpi-value" id="kpi-apca"></span>
        <span class="kpi-sub" id="kpi-apca-sub"></span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Syntax Contrast Floor</span>
        <span class="kpi-value" id="kpi-floor"></span>
        <span class="kpi-sub" id="kpi-floor-sub"></span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Critical Syntax CVD ΔE*ab</span>
        <span class="kpi-value" id="kpi-cvd"></span>
        <span class="kpi-sub" id="kpi-cvd-sub"></span>
      </div>
    </section>

    <section class="studio-grid" aria-label="Perceptual Colorimetry Audit">
      <div class="panel-card">
        <div class="panel-head">
          <h2>Perceptual Token Inspector (click any row to copy hex)</h2>
          <span class="panel-meta" id="audit-summary-badge"></span>
        </div>
        <div class="table-scroll">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Semantic Role</th>
                <th>Hex</th>
                <th>OKLCH (L% · C · H°)</th>
                <th>WCAG / bg</th>
                <th>WCAG / line</th>
                <th>APCA |Lc|</th>
              </tr>
            </thead>
            <tbody id="audit-tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="canvas-stack">
        <div class="panel-card">
          <div class="panel-head">
            <h2>OKLab a–b Chromaticity Polygon</h2>
            <span class="panel-meta" id="chroma-meta">Solid = active · Dashed = Light/Dark sibling</span>
          </div>
          <div class="canvas-wrap">
            <canvas id="canvas-chroma" width="320" height="260"></canvas>
          </div>
          <div class="pair-compare" id="pair-compare-box"></div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <h2>OKLCH Lightness Staggering &amp; CVD Safety</h2>
            <span class="panel-meta" id="cvd-min-readout"></span>
          </div>
          <div class="canvas-wrap">
            <canvas id="canvas-lightness" width="320" height="190"></canvas>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <span>Every color synthesized in OKLCH &amp; verified against WCAG 2.1, APCA-W3, CIEDE2000 &amp; Machado et al. (2009) dichromacy matrices. Independent university-inspired color themes with zero official institutional affiliation.</span>
      <span id="footer-links"></span>
    </footer>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  ${scriptOpen}
    (function () {
      'use strict';

      const THEMES = ${serializedData};
      const CAMPUS_GROUPS = ${serializedGroups};
      const MDS_META = ${serializedMdsMeta};
      const IS_WEB = document.body.dataset.target === 'web';
      const vscodeApi = (!IS_WEB && typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;

      // --- Colorimetry Math ---
      function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      function rgbToHex(r, g, b) {
        const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
        return '#' + c(r) + c(g) + c(b);
      }
      function srgbToLin(c) {
        const u = c / 255;
        return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
      }
      function linToSrgb(u) {
        const x = Math.max(0, Math.min(1, u));
        return (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
      }
      const CVD_MATRICES = {
        protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
        deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
        tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
      };
      function simHex(hex, mode) {
        if (!mode || mode === 'normal') return hex;
        const [r, g, b] = hexToRgb(hex).map(srgbToLin);
        const m = CVD_MATRICES[mode];
        return rgbToHex(
          linToSrgb(m[0][0] * r + m[0][1] * g + m[0][2] * b),
          linToSrgb(m[1][0] * r + m[1][1] * g + m[1][2] * b),
          linToSrgb(m[2][0] * r + m[2][1] * g + m[2][2] * b)
        );
      }
      function hexToOklch(hex) {
        const [r, g, b] = hexToRgb(hex).map(srgbToLin);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        return { L, C: Math.hypot(a, b2), H: (Math.atan2(b2, a) * 180 / Math.PI + 360) % 360, a, b: b2 };
      }
      function hexToLab(hex) {
        const [r, g, b] = hexToRgb(hex).map(srgbToLin);
        const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
        const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
        const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
        const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        const fx = f(x), fy = f(y), fz = f(z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
      }
      function deltaE76(h1, h2) {
        const a = hexToLab(h1), b = hexToLab(h2);
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      }
      function relLum(hex) {
        const [r, g, b] = hexToRgb(hex).map(srgbToLin);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      function wcag(h1, h2) {
        const l1 = relLum(h1), l2 = relLum(h2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      function apcaLc(txtHex, bgHex) {
        const lin = (h) => hexToRgb(h).map((c) => Math.pow(c / 255, 2.4));
        const yOf = ([r, g, b]) => {
          const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
          return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
        };
        const yt = yOf(lin(txtHex)), yb = yOf(lin(bgHex));
        if (Math.abs(yb - yt) < 0.0005) return 0;
        if (yb > yt) {
          const s = (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14;
          return s < 0.1 ? 0 : (s - 0.027) * 100;
        }
        const s = (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14;
        return s > -0.1 ? 0 : (s + 0.027) * 100;
      }

      // --- State ---
      const DEFAULT_SLUG = 'columbia-dark';
      let activeSlug = DEFAULT_SLUG;
      let workbenchActiveLabel = document.body.dataset.initialTheme || '';
      let activeLang = 'py';
      let activeCvd = 'normal';
      let liveSyncWorkbench = false;
      let searchQuery = '';
      let activeGroup = 'All';
      let compareEnabled = false;
      let compareSlug = null;
      let compareUserPinned = false;
      let mapEnabled = false;
      let mapMode = 'dark';
      let mapModePinned = null;
      let mapColorBy = 'swatch';
      let mapHoverSlug = null;

      const TOTAL_CAMPUSES = CAMPUS_GROUPS.reduce((acc, g) => acc + g.universities.length, 0);

      function safeDecode(str) {
        try {
          return decodeURIComponent(str);
        } catch (_) {
          return str;
        }
      }

      function parseUrlHash(rawHash) {
        const cleaned = String(rawHash || '').replace(/^#/, '').trim();
        if (!cleaned) return {};
        const parts = cleaned.split('&');
        const out = {};
        if (parts[0] && !parts[0].includes('=')) out.slug = safeDecode(parts[0]);
        for (const p of parts) {
          const eq = p.indexOf('=');
          if (eq <= 0) continue;
          const k = safeDecode(p.slice(0, eq));
          const v = safeDecode(p.slice(eq + 1));
          out[k] = v;
        }
        return out;
      }

      function applyHashState(rawHash) {
        const prev = {
          activeSlug,
          compareEnabled,
          compareSlug,
          compareUserPinned,
          activeCvd,
          mapEnabled,
          mapMode,
          mapModePinned,
        };
        const cleaned = String(rawHash || '').replace(/^#/, '').trim();
        const parsed = parseUrlHash(rawHash);
        // Reset every optional flag cleanly before applying new hash parameters
        compareEnabled = false;
        compareSlug = null;
        compareUserPinned = false;
        activeCvd = 'normal';
        mapEnabled = false;
        mapModePinned = null;

        if (!cleaned) {
          activeSlug = DEFAULT_SLUG;
        } else if (parsed.slug && THEMES.some((t) => t.slug === parsed.slug)) {
          activeSlug = parsed.slug;
        }
        if (parsed.compare && THEMES.some((t) => t.slug === parsed.compare)) {
          compareEnabled = true;
          compareSlug = parsed.compare;
          compareUserPinned = true;
        } else if (parsed.compare === '1') {
          compareEnabled = true;
        }
        if (parsed.cvd && ['normal', 'protan', 'deutan', 'tritan'].includes(parsed.cvd)) {
          activeCvd = parsed.cvd;
        }
        if (parsed.map === '1' || parsed.map === 'light' || parsed.map === 'dark') {
          mapEnabled = true;
          if (parsed.map === 'light' || parsed.map === 'dark') {
            mapMode = parsed.map;
            mapModePinned = parsed.map;
          }
        }
        if (!mapModePinned) {
          const active = THEMES.find((x) => x.slug === activeSlug) || THEMES[0];
          mapMode = active ? active.mode : 'dark';
        }
        return (
          prev.activeSlug !== activeSlug ||
          prev.compareEnabled !== compareEnabled ||
          prev.compareSlug !== compareSlug ||
          prev.compareUserPinned !== compareUserPinned ||
          prev.activeCvd !== activeCvd ||
          prev.mapEnabled !== mapEnabled ||
          prev.mapMode !== mapMode ||
          prev.mapModePinned !== mapModePinned
        );
      }

      function buildShareHash() {
        const parts = [activeSlug];
        if (compareEnabled) {
          const cur = getActiveTheme();
          const pinned = (compareUserPinned && compareSlug)
            ? THEMES.find((x) => x.slug === compareSlug)
            : null;
          const cmpObj = pinned || findSibling(cur) || THEMES.find((x) => x.slug !== cur.slug);
          const cmp = cmpObj ? cmpObj.slug : null;
          if (cmp) parts.push('compare=' + encodeURIComponent(cmp));
        }
        if (activeCvd !== 'normal') parts.push('cvd=' + encodeURIComponent(activeCvd));
        if (mapEnabled) parts.push('map=' + (mapModePinned ? mapModePinned : '1'));
        return '#' + parts.join('&');
      }

      function syncUrlHash() {
        if (!IS_WEB || !window.history || !window.history.replaceState) return;
        const nextHash = buildShareHash();
        if (window.location.hash !== nextHash) {
          window.history.replaceState(null, '', nextHash);
        }
      }

      // Initialize starting theme & view state from VS Code active theme or URL hash
      if (workbenchActiveLabel) {
        const match = THEMES.find((t) => t.label === workbenchActiveLabel);
        if (match) activeSlug = match.slug;
      } else if (IS_WEB && window.location.hash) {
        applyHashState(window.location.hash);
      }

      function escHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function getActiveTheme() {
        return THEMES.find((x) => x.slug === activeSlug) || THEMES[0];
      }

      function matchesGroup(th, grp) {
        if (!grp || grp === 'All') return true;
        return th.group === grp;
      }

      function matchesCampusFilter(th) {
        if (!matchesGroup(th, activeGroup)) return false;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const hay = [
          th.university,
          th.shortName,
          th.label,
          th.group,
          th.country,
          th.city,
          String(th.year),
          th.subtitle,
          th.slug,
        ].join(' ').toLowerCase();
        const aliasList = Array.isArray(th.aliasList) ? th.aliasList : [];
        return q.split(/\\s+/).every((part) => (
          hay.includes(part) || aliasList.includes(part)
        ));
      }

      function getNavigableThemes() {
        const filtered = THEMES.filter((t) => matchesCampusFilter(t));
        return filtered.length > 0 ? filtered : THEMES;
      }

      let toastTimer = null;
      function showToast(msg) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.dataset.visible = 'true';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.dataset.visible = 'false'; }, 1900);
      }

      function copyText(txt, label) {
        const toastMsg = label || ('Copied ' + txt);
        if (vscodeApi) {
          vscodeApi.postMessage({ type: 'copyText', text: txt });
          showToast(toastMsg);
          return;
        }
        const fallbackCopy = () => {
          try {
            const ta = document.createElement('textarea');
            ta.value = txt;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          } catch (_) {}
          showToast(toastMsg);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(() => showToast(toastMsg)).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      }

      function downloadFile(filename, content, mimeType, toastLabel) {
        try {
          const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast(toastLabel || ('Downloaded ' + filename));
        } catch (_) {
          copyText(content, 'Copied ' + filename + ' to clipboard');
        }
      }

      function findSibling(th) {
        const other = th.mode === 'light' ? 'dark' : 'light';
        return THEMES.find((x) => x.university === th.university && x.mode === other);
      }

      function getCompareTheme(cur) {
        if (compareUserPinned && compareSlug) {
          const pinned = THEMES.find((x) => x.slug === compareSlug);
          if (pinned) return pinned;
        }
        const sib = findSibling(cur) || THEMES.find((x) => x.slug !== cur.slug) || cur;
        compareSlug = sib.slug;
        return sib;
      }

      function simulateTokens(tk, cvdMode) {
        const out = {};
        for (const [k, v] of Object.entries(tk)) {
          if (k === 'ansi') continue;
          out[k] = simHex(v, cvdMode);
        }
        return out;
      }

      function formatPaletteExport(th, fmt) {
        const t = th.tokens;
        const a = t.ansi;
        const ansiOrder = [
          'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
          'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
        ];
        const metaNote = th.label + ' (' + th.university + ', ' + th.city + ', est. ' + th.year + ')';

        if (fmt === 'vscode') {
          return {
            text: JSON.stringify({ 'workbench.colorTheme': th.label }, null, 2),
            filename: 'campus-palette-' + th.slug + '.settings.json',
            mime: 'application/json;charset=utf-8',
            label: 'Copied VS Code settings.json for ' + th.label,
          };
        }
        if (fmt === 'ghostty') {
          const lines = [
            '# Campus Palette — ' + metaNote,
            'background = ' + t.bg,
            'foreground = ' + t.fg,
            'cursor-color = ' + t.accentCursor,
            'cursor-text = ' + t.bg,
            'selection-background = ' + t.tintSelect,
            'selection-foreground = ' + t.fg,
          ];
          ansiOrder.forEach((slot, idx) => {
            lines.push('palette = ' + idx + '=' + a[slot]);
          });
          return {
            text: lines.join('\\n'),
            filename: 'campus-palette-' + th.slug + '.ghostty',
            mime: 'text/plain;charset=utf-8',
            label: 'Copied Ghostty theme for ' + th.label,
          };
        }
        if (fmt === 'wezterm') {
          const lines = [
            '# Campus Palette — ' + metaNote,
            '[metadata]',
            'name = "' + th.label + '"',
            'author = "Campus Palette"',
            '',
            '[colors]',
            'foreground = "' + t.fg + '"',
            'background = "' + t.bg + '"',
            'cursor_bg = "' + t.accentCursor + '"',
            'cursor_fg = "' + t.bg + '"',
            'cursor_border = "' + t.accentCursor + '"',
            'selection_bg = "' + t.tintSelect + '"',
            'selection_fg = "' + t.fg + '"',
            'ansi = [',
          ];
          ansiOrder.slice(0, 8).forEach((slot) => {
            lines.push('  "' + a[slot] + '",');
          });
          lines.push(']');
          lines.push('brights = [');
          ansiOrder.slice(8).forEach((slot) => {
            lines.push('  "' + a[slot] + '",');
          });
          lines.push(']');
          return {
            text: lines.join('\\n'),
            filename: 'campus-palette-' + th.slug + '.wezterm.toml',
            mime: 'text/plain;charset=utf-8',
            label: 'Copied WezTerm TOML for ' + th.label,
          };
        }
        if (fmt === 'alacritty') {
          const lines = [
            '# Campus Palette — ' + metaNote,
            '[colors.primary]',
            'background = "' + t.bg + '"',
            'foreground = "' + t.fg + '"',
            '',
            '[colors.cursor]',
            'text = "' + t.bg + '"',
            'cursor = "' + t.accentCursor + '"',
            '',
            '[colors.selection]',
            'text = "' + t.fg + '"',
            'background = "' + t.tintSelect + '"',
            '',
            '[colors.normal]',
            'black = "' + a.black + '"',
            'red = "' + a.red + '"',
            'green = "' + a.green + '"',
            'yellow = "' + a.yellow + '"',
            'blue = "' + a.blue + '"',
            'magenta = "' + a.magenta + '"',
            'cyan = "' + a.cyan + '"',
            'white = "' + a.white + '"',
            '',
            '[colors.bright]',
            'black = "' + a.brightBlack + '"',
            'red = "' + a.brightRed + '"',
            'green = "' + a.brightGreen + '"',
            'yellow = "' + a.brightYellow + '"',
            'blue = "' + a.brightBlue + '"',
            'magenta = "' + a.brightMagenta + '"',
            'cyan = "' + a.brightCyan + '"',
            'white = "' + a.brightWhite + '"',
          ];
          return {
            text: lines.join('\\n'),
            filename: 'campus-palette-' + th.slug + '.alacritty.toml',
            mime: 'text/plain;charset=utf-8',
            label: 'Copied Alacritty TOML for ' + th.label,
          };
        }
        if (fmt === 'windowsterminal') {
          const scheme = {
            name: 'Campus Palette — ' + th.label,
            background: t.bg,
            foreground: t.fg,
            cursorColor: t.accentCursor,
            selectionBackground: t.tintSelect,
            black: a.black,
            red: a.red,
            green: a.green,
            yellow: a.yellow,
            blue: a.blue,
            purple: a.magenta,
            cyan: a.cyan,
            white: a.white,
            brightBlack: a.brightBlack,
            brightRed: a.brightRed,
            brightGreen: a.brightGreen,
            brightYellow: a.brightYellow,
            brightBlue: a.brightBlue,
            brightPurple: a.brightMagenta,
            brightCyan: a.brightCyan,
            brightWhite: a.brightWhite,
          };
          return {
            text: JSON.stringify(scheme, null, 2),
            filename: 'campus-palette-' + th.slug + '.windows-terminal.json',
            mime: 'application/json;charset=utf-8',
            label: 'Copied Windows Terminal JSON for ' + th.label,
          };
        }
        if (fmt === 'kitty') {
          const lines = [
            '# Campus Palette — ' + metaNote,
            'background ' + t.bg,
            'foreground ' + t.fg,
            'cursor ' + t.accentCursor,
            'cursor_text_color ' + t.bg,
            'selection_background ' + t.tintSelect,
            'selection_foreground ' + t.fg,
            'active_border_color ' + t.accentFocus,
            'inactive_border_color ' + t.borderSubtle,
          ];
          ansiOrder.forEach((slot, idx) => {
            lines.push('color' + idx + ' ' + a[slot]);
          });
          return {
            text: lines.join('\\n'),
            filename: 'campus-palette-' + th.slug + '.kitty.conf',
            mime: 'text/plain;charset=utf-8',
            label: 'Copied Kitty config for ' + th.label,
          };
        }
        if (fmt === 'iterm2') {
          const itermEntry = (keyName, hexVal) => {
            const [r, g, b] = hexToRgb(hexVal.slice(0, 7));
            return [
              '  <key>' + keyName + '</key>',
              '  <dict>',
              '    <key>Color Space</key>',
              '    <string>sRGB</string>',
              '    <key>Red Component</key>',
              '    <real>' + (r / 255).toFixed(6) + '</real>',
              '    <key>Green Component</key>',
              '    <real>' + (g / 255).toFixed(6) + '</real>',
              '    <key>Blue Component</key>',
              '    <real>' + (b / 255).toFixed(6) + '</real>',
              '  </dict>',
            ].join('\\n');
          };
          const blocks = [
            itermEntry('Background Color', t.bg),
            itermEntry('Foreground Color', t.fg),
            itermEntry('Bold Color', t.fg),
            itermEntry('Cursor Color', t.accentCursor),
            itermEntry('Cursor Text Color', t.bg),
            itermEntry('Selection Color', t.tintSelect),
            itermEntry('Selected Text Color', t.fg),
          ];
          ansiOrder.forEach((slot, idx) => {
            blocks.push(itermEntry('Ansi ' + idx + ' Color', a[slot]));
          });
          const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
            '<plist version="1.0">',
            '<!-- Campus Palette — ' + metaNote + ' -->',
            '<dict>',
            blocks.join('\\n'),
            '</dict>',
            '</plist>',
          ].join('\\n');
          return {
            text: xml,
            filename: 'campus-palette-' + th.slug + '.itermcolors',
            mime: 'application/xml;charset=utf-8',
            label: 'Copied iTerm2 .itermcolors XML for ' + th.label,
          };
        }
        const cssLines = [
          '/* Campus Palette — ' + metaNote + ' */',
          ':root {',
          '  --cp-bg: ' + t.bg + ';',
          '  --cp-bg-line: ' + t.bgLine + ';',
          '  --cp-bg-sidebar: ' + t.bgSidebar + ';',
          '  --cp-bg-panel: ' + t.bgPanel + ';',
          '  --cp-fg: ' + t.fg + ';',
          '  --cp-fg-secondary: ' + t.fgSecondary + ';',
          '  --cp-fg-muted: ' + t.fgMuted + ';',
          '  --cp-fg-comment: ' + t.fgComment + ';',
          '  --cp-border: ' + t.borderSubtle + ';',
          '  --cp-selection: ' + t.tintSelect + ';',
          '  --cp-cursor: ' + t.accentCursor + ';',
          '  --cp-focus: ' + t.accentFocus + ';',
          '  --cp-keyword: ' + t.accentKeyword + ';',
          '  --cp-storage: ' + t.accentStorage + ';',
          '  --cp-string: ' + t.accentString + ';',
          '  --cp-regex: ' + t.accentRegex + ';',
          '  --cp-function: ' + t.accentFunction + ';',
          '  --cp-type: ' + t.accentType + ';',
          '  --cp-interface: ' + t.accentInterface + ';',
          '  --cp-number: ' + t.accentNumber + ';',
          '  --cp-decorator: ' + t.accentDecorator + ';',
          '  --cp-namespace: ' + t.accentNamespace + ';',
          '  --cp-error: ' + t.colorError + ';',
          '  --cp-warning: ' + t.colorWarning + ';',
          '  --cp-info: ' + t.colorInfo + ';',
        ];
        ansiOrder.forEach((slot, idx) => {
          cssLines.push('  --cp-ansi-' + idx + ': ' + a[slot] + ';');
        });
        cssLines.push('}');
        return {
          text: cssLines.join('\\n'),
          filename: 'campus-palette-' + th.slug + '.css',
          mime: 'text/css;charset=utf-8',
          label: 'Copied CSS Custom Properties for ' + th.label,
        };
      }

      // Populate Compare target dropdown with all 80 themes
      const compareSelect = document.getElementById('compare-select');
      THEMES.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.slug;
        opt.textContent = t.label + ' (' + t.city + ' · ' + t.year + ')';
        compareSelect.appendChild(opt);
      });

      // Environment-specific action buttons
      const envWrap = document.getElementById('env-actions');
      const footLinks = document.getElementById('footer-links');
      if (vscodeApi) {
        envWrap.innerHTML =
          '<button type="button" id="btn-apply-vscode">Apply to Workbench</button>' +
          '<label class="sync-toggle" title="Automatically apply every clicked theme to your Positron / VS Code window">' +
          '<input type="checkbox" id="chk-live-sync" /> Live-sync IDE</label>';
        footLinks.textContent = 'Running inside VS Code / Positron Webview · Strict offline CSP';

        document.getElementById('btn-apply-vscode').addEventListener('click', () => {
          const cur = getActiveTheme();
          if (cur) {
            workbenchActiveLabel = cur.label;
            vscodeApi.postMessage({ type: 'applyTheme', label: cur.label });
            showToast('Applied "' + cur.label + '" to Workbench');
            render();
          }
        });
        document.getElementById('chk-live-sync').addEventListener('change', (e) => {
          liveSyncWorkbench = !!e.target.checked;
          if (liveSyncWorkbench) {
            const cur = getActiveTheme();
            if (cur) {
              workbenchActiveLabel = cur.label;
              vscodeApi.postMessage({ type: 'applyTheme', label: cur.label });
            }
          }
          render();
        });
        window.addEventListener('message', (event) => {
          const msg = event.data;
          if (msg && msg.type === 'activeThemeChanged' && typeof msg.label === 'string') {
            workbenchActiveLabel = msg.label;
            const match = THEMES.find((t) => t.label === msg.label);
            if (match) {
              activeSlug = match.slug;
              if (compareUserPinned && compareSlug === match.slug) {
                compareUserPinned = false;
                compareSlug = null;
              }
              mapHoverSlug = null;
              if (!mapModePinned) mapMode = match.mode;
            }
            render();
          }
        });
      } else {
        envWrap.innerHTML =
          '<button type="button" id="btn-share-url" title="Copy permalink to current theme and view state">Share Link</button>' +
          '<a class="btn-link" href="vscode:extension/idesofmerge.campus-palette" title="Open extension in VS Code">Install in VS Code</a>' +
          '<a class="btn-link" href="https://github.com/idesofmerge/campus-palette" target="_blank" rel="noopener">GitHub ↗</a>';
        footLinks.innerHTML =
          '<a href="https://github.com/idesofmerge/campus-palette#color-science" target="_blank" rel="noopener">Color-Science Write-Up</a> · ' +
          '<a href="https://github.com/idesofmerge/campus-palette" target="_blank" rel="noopener">MIT License</a>';

        document.getElementById('btn-share-url').addEventListener('click', () => {
          const url = window.location.href.split('#')[0] + buildShareHash();
          copyText(url, 'Copied permalink (' + buildShareHash() + ')');
        });
      }

      function selectSlug(slug, fromUserAction) {
        activeSlug = slug;
        if (compareUserPinned && compareSlug === slug) {
          compareUserPinned = false;
          compareSlug = null;
        }
        mapHoverSlug = null;
        const cur = getActiveTheme();
        if (!mapModePinned) mapMode = cur.mode;
        syncUrlHash();
        if (fromUserAction && vscodeApi && liveSyncWorkbench) {
          workbenchActiveLabel = cur.label;
          vscodeApi.postMessage({ type: 'applyTheme', label: cur.label });
        }
        render();
      }

      function openCompareWith(slug) {
        if (!THEMES.some((t) => t.slug === slug) || slug === activeSlug) return;
        compareEnabled = true;
        compareSlug = slug;
        compareUserPinned = true;
        syncUrlHash();
        render();
      }

      // Render 6 collegiate grouping selector strip with search & grouping filtering
      function renderCampusRail(cur) {
        document.querySelectorAll('.filter-chip').forEach((chip) => {
          chip.setAttribute('aria-pressed', String(chip.dataset.group === activeGroup));
        });

        const container = document.getElementById('campus-groups');
        const emptyHint = document.getElementById('campus-empty');
        const countEl = document.getElementById('filter-count');
        container.innerHTML = '';

        let visibleCount = 0;
        CAMPUS_GROUPS.forEach((grpObj) => {
          const matching = [];
          grpObj.universities.forEach((uniName) => {
            const sameMode = THEMES.find((t) => t.university === uniName && t.mode === cur.mode);
            const otherMode = THEMES.find((t) => t.university === uniName && t.mode !== cur.mode);
            const target = (sameMode && matchesCampusFilter(sameMode))
              ? sameMode
              : ((otherMode && matchesCampusFilter(otherMode)) ? otherMode : null);
            if (target) matching.push(target);
          });
          if (matching.length === 0) return;

          const block = document.createElement('div');
          block.className = 'group-block';
          const lbl = document.createElement('div');
          lbl.className = 'group-label';
          lbl.textContent = grpObj.group + ' · ' + matching.length;
          block.appendChild(lbl);

          const pills = document.createElement('div');
          pills.className = 'group-pills';
          matching.forEach((target) => {
            visibleCount++;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'campus-pill';
            btn.setAttribute('aria-pressed', String(target.slug === cur.slug));
            btn.title = target.university + ' (' + target.city + ', est. ' + target.year + ') — ' + target.subtitle;

            const strip = document.createElement('span');
            strip.className = 'mini-strip';
            [target.tokens.bg, target.tokens.accentKeyword, target.tokens.accentString, target.tokens.accentFunction, target.tokens.accentType].forEach((hx) => {
              const s = document.createElement('span');
              s.style.backgroundColor = simHex(hx, activeCvd);
              strip.appendChild(s);
            });
            btn.appendChild(strip);
            btn.appendChild(document.createTextNode(target.shortName));
            btn.addEventListener('click', () => selectSlug(target.slug, true));
            pills.appendChild(btn);
          });
          block.appendChild(pills);
          container.appendChild(block);
        });

        countEl.textContent = 'Showing ' + visibleCount + ' / ' + TOTAL_CAMPUSES + ' campuses';
        container.hidden = visibleCount === 0;
        emptyHint.hidden = visibleCount > 0;
      }

      function sp(color, text, extra) {
        return '<span style="color:' + color + (extra ? ';' + extra : '') + '">' + text + '</span>';
      }

      function buildCodeSample(c, lang, th) {
        const cur = '<span class="sim-cursor" style="background:' + c.accentCursor + '"></span>';
        if (lang === 'py') {
          return [
            sp(c.fgComment, '# Campus Palette · Longitudinal research cohort &amp; OKLCH colorimetry', 'font-style:italic'),
            sp(c.accentKeyword, 'from', 'font-weight:700') + ' ' + sp(c.accentNamespace, 'dataclasses') + ' ' + sp(c.accentKeyword, 'import', 'font-weight:700') + ' ' + sp(c.accentFunction, 'dataclass'),
            sp(c.accentKeyword, 'import', 'font-weight:700') + ' ' + sp(c.accentNamespace, 're'),
            '',
            sp(c.accentDecorator, '@dataclass(frozen=True)', 'font-style:italic'),
            sp(c.accentStorage, 'class', 'font-style:italic') + ' ' + sp(c.accentType, 'CampusStudy', 'font-weight:700') + sp(c.fgPunct, ':'),
            '    ' + sp(c.fgProperty, 'institution') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'str', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, '"' + escHtml(th.university) + '"'),
            '    ' + sp(c.fgProperty, 'founded_year') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'int', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, String(th.year)),
            '    ' + sp(c.fgProperty, 'campus_city') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'str', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, '"' + escHtml(th.city) + '"'),
            '',
            sp(c.accentStorage, 'def', 'font-style:italic') + ' ' + sp(c.accentFunction, 'validate_token_hex') + sp(c.fgPunct, '(') + sp(c.fgParameter, 'swatch', 'font-style:italic') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'str', 'font-style:italic') + sp(c.fgPunct, ') -&gt;') + ' ' + sp(c.accentInterface, 'bool', 'font-style:italic') + sp(c.fgPunct, ':'),
            '    ' + sp(c.accentKeyword, 'return', 'font-weight:700') + ' ' + sp(c.accentNamespace, 're') + sp(c.fgPunct, '.') + sp(c.accentFunction, 'fullmatch') + sp(c.fgPunct, '(') + sp(c.accentRegex, 'r"^#[0-9A-F]{6}$"') + sp(c.fgPunct, ', ') + sp(c.fgParameter, 'swatch', 'font-style:italic') + sp(c.fgPunct, ')') + ' ' + sp(c.accentKeyword, 'is not', 'font-weight:700') + ' ' + sp(c.accentNumber, 'None') + cur,
          ];
        }
        if (lang === 'r') {
          return [
            sp(c.fgComment, '# Campus Palette · Reproducible research pipeline in Positron R', 'font-style:italic'),
            sp(c.accentFunction, 'library') + sp(c.fgPunct, '(') + sp(c.accentNamespace, 'tidyverse') + sp(c.fgPunct, ')'),
            '',
            sp(c.accentDecorator, '#| label: cohort-' + escHtml(th.slug), 'font-style:italic'),
            sp(c.accentFunction, 'score_campus_palette') + ' ' + sp(c.accentKeyword, '&lt;-', 'font-weight:700') + ' ' + sp(c.accentKeyword, 'function', 'font-weight:700') + sp(c.fgPunct, '(') + sp(c.fgParameter, 'tokens_tbl', 'font-style:italic') + sp(c.fgPunct, ', ') + sp(c.fgParameter, 'wcag_floor', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, '4.5') + sp(c.fgPunct, ') {'),
            '  ' + sp(c.fgVariable, 'summary_df') + ' ' + sp(c.accentKeyword, '&lt;-', 'font-weight:700') + ' ' + sp(c.fgParameter, 'tokens_tbl', 'font-style:italic') + ' ' + sp(c.accentKeyword, '|&gt;', 'font-weight:700'),
            '    ' + sp(c.accentNamespace, 'dplyr') + sp(c.fgPunct, '::') + sp(c.accentFunction, 'filter') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'campus') + ' ' + sp(c.fgPunct, '==') + ' ' + sp(c.accentString, '"' + escHtml(th.shortName) + '"') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'founded') + ' ' + sp(c.fgPunct, '==') + ' ' + sp(c.accentNumber, String(th.year) + 'L') + sp(c.fgPunct, ')') + ' ' + sp(c.accentKeyword, '|&gt;', 'font-weight:700'),
            '    ' + sp(c.accentFunction, 'mutate') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'passes_aa') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.fgVariable, 'contrast_cr') + ' ' + sp(c.fgPunct, '&gt;=') + ' ' + sp(c.fgParameter, 'wcag_floor', 'font-style:italic') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'group') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, '"' + escHtml(th.group) + '"') + sp(c.fgPunct, ')'),
            '  ' + sp(c.accentKeyword, 'return', 'font-weight:700') + sp(c.fgPunct, '(') + sp(c.fgVariable, 'summary_df') + sp(c.fgPunct, ')') + cur,
            sp(c.fgPunct, '}'),
          ];
        }
        if (lang === 'ts') {
          return [
            sp(c.fgComment, '// Live-preview campus picker &amp; paired Light/Dark workbench switcher', 'font-style:italic'),
            sp(c.accentKeyword, 'export', 'font-weight:700') + ' ' + sp(c.accentStorage, 'interface', 'font-style:italic') + ' ' + sp(c.accentInterface, 'CampusThemeEntry', 'font-style:italic') + ' ' + sp(c.fgPunct, '{'),
            '  ' + sp(c.accentStorage, 'readonly', 'font-style:italic') + ' ' + sp(c.fgProperty, 'label') + sp(c.fgPunct, ':') + ' ' + sp(c.accentType, 'string', 'font-weight:700') + sp(c.fgPunct, ';'),
            '  ' + sp(c.fgProperty, 'group') + sp(c.fgPunct, ':') + ' ' + sp(c.accentType, 'string', 'font-weight:700') + sp(c.fgPunct, '; ') + sp(c.fgProperty, 'mode') + sp(c.fgPunct, ':') + ' ' + sp(c.accentString, '"light"') + ' ' + sp(c.accentKeyword, '|', 'font-weight:700') + ' ' + sp(c.accentString, '"dark"') + sp(c.fgPunct, ';'),
            sp(c.fgPunct, '}'),
            '',
            sp(c.accentDecorator, '@command', 'font-style:italic') + sp(c.fgPunct, '(') + sp(c.accentString, '"campusPalette.toggleTheme"') + sp(c.fgPunct, ')'),
            sp(c.accentKeyword, 'export async', 'font-weight:700') + ' ' + sp(c.accentStorage, 'function', 'font-style:italic') + ' ' + sp(c.accentFunction, 'activateCampusTheme') + sp(c.fgPunct, '(') + sp(c.fgParameter, 'entry', 'font-style:italic') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'CampusThemeEntry', 'font-style:italic') + sp(c.fgPunct, ') {'),
            '  ' + sp(c.accentStorage, 'const', 'font-style:italic') + ' ' + sp(c.fgVariable, 'catalogSize') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, String(THEMES.length)) + sp(c.fgPunct, ';'),
            '  ' + sp(c.accentKeyword, 'await', 'font-weight:700') + ' ' + sp(c.accentNamespace, 'workbench') + sp(c.fgPunct, '.') + sp(c.accentFunction, 'setColorTheme') + sp(c.fgPunct, '(') + sp(c.accentString, '"' + escHtml(th.label) + '"') + sp(c.fgPunct, ');') + cur,
            sp(c.fgPunct, '}'),
          ];
        }
        if (lang === 'sql') {
          return [
            sp(c.fgComment, '-- Institutional research warehouse · WCAG &amp; APCA contrast audit', 'font-style:italic'),
            sp(c.accentKeyword, 'WITH', 'font-weight:700') + ' ' + sp(c.accentType, 'campus_audit', 'font-weight:700') + ' ' + sp(c.accentKeyword, 'AS', 'font-weight:700') + ' ' + sp(c.fgPunct, '('),
            '  ' + sp(c.accentKeyword, 'SELECT', 'font-weight:700') + ' ' + sp(c.fgProperty, 'slug') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'university') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'grouping') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'founded_year') + sp(c.fgPunct, ','),
            '         ' + sp(c.accentFunction, 'ROUND') + sp(c.fgPunct, '(') + sp(c.accentFunction, 'MIN') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'wcag_ratio') + sp(c.fgPunct, '), ') + sp(c.accentNumber, '2') + sp(c.fgPunct, ') ') + sp(c.accentKeyword, 'AS', 'font-weight:700') + ' ' + sp(c.fgVariable, 'syntax_floor') + sp(c.fgPunct, ','),
            '         ' + sp(c.accentFunction, 'ROUND') + sp(c.fgPunct, '(') + sp(c.accentFunction, 'AVG') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'apca_lc') + sp(c.fgPunct, '), ') + sp(c.accentNumber, '1') + sp(c.fgPunct, ') ') + sp(c.accentKeyword, 'AS', 'font-weight:700') + ' ' + sp(c.fgVariable, 'mean_lc'),
            '  ' + sp(c.accentKeyword, 'FROM', 'font-weight:700') + ' ' + sp(c.accentNamespace, 'colorimetry') + sp(c.fgPunct, '.') + sp(c.accentType, 'campus_tokens', 'font-weight:700'),
            '  ' + sp(c.accentKeyword, 'WHERE', 'font-weight:700') + ' ' + sp(c.fgProperty, 'country') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, "'" + escHtml(th.country) + "'") + ' ' + sp(c.accentKeyword, 'AND', 'font-weight:700') + ' ' + sp(c.fgProperty, 'mode') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, "'" + escHtml(th.mode) + "'"),
            '  ' + sp(c.accentKeyword, 'GROUP BY', 'font-weight:700') + ' ' + sp(c.accentNumber, '1') + sp(c.fgPunct, ', ') + sp(c.accentNumber, '2') + sp(c.fgPunct, ', ') + sp(c.accentNumber, '3') + sp(c.fgPunct, ', ') + sp(c.accentNumber, '4'),
            sp(c.fgPunct, ')'),
            sp(c.accentKeyword, 'SELECT', 'font-weight:700') + ' ' + sp(c.fgPunct, '*') + ' ' + sp(c.accentKeyword, 'FROM', 'font-weight:700') + ' ' + sp(c.accentType, 'campus_audit', 'font-weight:700') + ' ' + sp(c.accentKeyword, 'WHERE', 'font-weight:700') + ' ' + sp(c.fgVariable, 'syntax_floor') + ' ' + sp(c.fgPunct, '&gt;=') + ' ' + sp(c.accentNumber, '4.50') + ' ' + sp(c.accentKeyword, 'ORDER BY', 'font-weight:700') + ' ' + sp(c.fgProperty, 'founded_year') + ' ' + sp(c.accentKeyword, 'ASC', 'font-weight:700') + sp(c.fgPunct, ';') + cur,
          ];
        }
        return [
          sp(c.fgPunct, '---'),
          sp(c.fgProperty, 'title') + sp(c.fgPunct, ': ') + sp(c.accentString, '"' + escHtml(th.label) + ' — Reproducible Colorimetry Note"'),
          sp(c.fgProperty, 'subtitle') + sp(c.fgPunct, ': ') + sp(c.accentString, '"' + escHtml(th.university) + ' · ' + escHtml(th.city) + ' (est. ' + th.year + ')"'),
          sp(c.fgProperty, 'format') + sp(c.fgPunct, ': ') + sp(c.accentType, 'html', 'font-weight:700'),
          sp(c.fgPunct, '---'),
          '',
          sp(c.accentKeyword, '## ' + escHtml(th.university) + ' (' + escHtml(th.group) + ')', 'font-weight:700'),
          '',
          sp(c.fg, 'All 20 syntax &amp; diagnostic foreground tokens clear ') + sp(c.fg, '**WCAG 2.1 AA (4.5:1)**', 'font-weight:700') + sp(c.fg, ' on ') + sp(c.accentType, '\\x60editor.background\\x60') + sp(c.fg, '.'),
          '',
          sp(c.accentDecorator, '\\x60\\x60\\x60{r}', 'font-style:italic'),
          sp(c.accentFunction, 'plot_oklch_gamut') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'slug') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, '"' + escHtml(th.slug) + '"') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'year') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, String(th.year) + 'L') + sp(c.fgPunct, ')') + cur,
          sp(c.accentDecorator, '\\x60\\x60\\x60', 'font-style:italic'),
        ];
      }

      function buildMiniCodeSample(c, lang, th) {
        const cur = '<span class="sim-cursor" style="background:' + c.accentCursor + '"></span>';
        if (lang === 'py') {
          return [
            sp(c.fgComment, '# ' + escHtml(th.label) + ' · ' + escHtml(th.city), 'font-style:italic'),
            sp(c.accentDecorator, '@dataclass(frozen=True)', 'font-style:italic'),
            sp(c.accentStorage, 'class', 'font-style:italic') + ' ' + sp(c.accentType, 'CampusStudy', 'font-weight:700') + sp(c.fgPunct, ':'),
            '    ' + sp(c.fgProperty, 'slug') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'str', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, '"' + escHtml(th.slug) + '"'),
            '    ' + sp(c.fgProperty, 'founded') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'int', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, String(th.year)) + '  ' + sp(c.fgComment, '# ' + escHtml(th.country), 'font-style:italic') + cur,
            '    ' + sp(c.fgProperty, 'wcag_aa') + sp(c.fgPunct, ':') + ' ' + sp(c.accentInterface, 'bool', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, 'True'),
          ];
        }
        if (lang === 'r') {
          return [
            sp(c.fgComment, '# ' + escHtml(th.label) + ' · OKLCH contrast check', 'font-style:italic'),
            sp(c.accentFunction, 'verify') + ' ' + sp(c.accentKeyword, '&lt;-', 'font-weight:700') + ' ' + sp(c.accentKeyword, 'function', 'font-weight:700') + sp(c.fgPunct, '(') + sp(c.fgParameter, 'df', 'font-style:italic') + sp(c.fgPunct, ', ') + sp(c.fgParameter, 'floor', 'font-style:italic') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, '4.5') + sp(c.fgPunct, ') {'),
            '  ' + sp(c.fgParameter, 'df', 'font-style:italic') + ' ' + sp(c.accentKeyword, '|&gt;', 'font-weight:700') + ' ' + sp(c.accentNamespace, 'dplyr') + sp(c.fgPunct, '::') + sp(c.accentFunction, 'filter') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'campus') + ' ' + sp(c.fgPunct, '==') + ' ' + sp(c.accentString, '"' + escHtml(th.shortName) + '"') + sp(c.fgPunct, ')') + ' ' + sp(c.accentKeyword, '|&gt;', 'font-weight:700'),
            '    ' + sp(c.accentFunction, 'mutate') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'ok') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.fgVariable, 'ratio') + ' ' + sp(c.fgPunct, '&gt;=') + ' ' + sp(c.fgParameter, 'floor', 'font-style:italic') + sp(c.fgPunct, ', ') + sp(c.fgProperty, 'yr') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, String(th.year) + 'L') + sp(c.fgPunct, ')'),
            '  ' + sp(c.accentKeyword, 'return', 'font-weight:700') + sp(c.fgPunct, '(') + sp(c.fgVariable, 'ok') + sp(c.fgPunct, ')') + cur,
            sp(c.fgPunct, '}'),
          ];
        }
        if (lang === 'ts') {
          return [
            sp(c.fgComment, '// ' + escHtml(th.label) + ' · Campus Theme Entry', 'font-style:italic'),
            sp(c.accentKeyword, 'export', 'font-weight:700') + ' ' + sp(c.accentStorage, 'interface', 'font-style:italic') + ' ' + sp(c.accentInterface, 'CampusThemePair', 'font-style:italic') + ' ' + sp(c.fgPunct, '{'),
            '  ' + sp(c.accentStorage, 'readonly', 'font-style:italic') + ' ' + sp(c.fgProperty, 'slug') + sp(c.fgPunct, ':') + ' ' + sp(c.accentType, 'string', 'font-weight:700') + sp(c.fgPunct, ';') + ' ' + sp(c.fgComment, '// ' + escHtml(th.slug), 'font-style:italic'),
            '  ' + sp(c.fgProperty, 'mode') + sp(c.fgPunct, ':') + ' ' + sp(c.accentString, '"' + escHtml(th.mode) + '"') + sp(c.fgPunct, '; ') + sp(c.fgProperty, 'year') + sp(c.fgPunct, ':') + ' ' + sp(c.accentNumber, String(th.year)) + sp(c.fgPunct, ';'),
            '  ' + sp(c.fgProperty, 'apply') + sp(c.fgPunct, ': () =&gt;') + ' ' + sp(c.accentFunction, 'setTheme') + sp(c.fgPunct, '(') + sp(c.accentString, '"' + escHtml(th.label) + '"') + sp(c.fgPunct, ');') + cur,
            sp(c.fgPunct, '}'),
          ];
        }
        if (lang === 'sql') {
          return [
            sp(c.fgComment, '-- ' + escHtml(th.label) + ' · ' + escHtml(th.group), 'font-style:italic'),
            sp(c.accentKeyword, 'SELECT', 'font-weight:700') + ' ' + sp(c.fgProperty, 'slug') + sp(c.fgPunct, ', ') + sp(c.accentFunction, 'MIN') + sp(c.fgPunct, '(') + sp(c.fgProperty, 'wcag_cr') + sp(c.fgPunct, ') ') + sp(c.accentKeyword, 'AS', 'font-weight:700') + ' ' + sp(c.fgVariable, 'floor_cr'),
            sp(c.accentKeyword, 'FROM', 'font-weight:700') + ' ' + sp(c.accentNamespace, 'colorimetry') + sp(c.fgPunct, '.') + sp(c.accentType, 'campus_tokens', 'font-weight:700'),
            sp(c.accentKeyword, 'WHERE', 'font-weight:700') + ' ' + sp(c.fgProperty, 'slug') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentString, "'" + escHtml(th.slug) + "'"),
            '  ' + sp(c.accentKeyword, 'AND', 'font-weight:700') + ' ' + sp(c.fgProperty, 'founded_year') + ' ' + sp(c.fgPunct, '=') + ' ' + sp(c.accentNumber, String(th.year)),
            sp(c.accentKeyword, 'GROUP BY', 'font-weight:700') + ' ' + sp(c.fgProperty, 'slug') + sp(c.fgPunct, ';') + cur,
          ];
        }
        return [
          sp(c.fgPunct, '---'),
          sp(c.fgProperty, 'title') + sp(c.fgPunct, ': ') + sp(c.accentString, '"' + escHtml(th.label) + '"'),
          sp(c.fgPunct, '---'),
          sp(c.accentKeyword, '## ' + escHtml(th.university) + ' (' + th.year + ')', 'font-weight:700'),
          sp(c.fg, 'All syntax roles clear ') + sp(c.fg, '**WCAG 2.1 AA (4.5:1)**', 'font-weight:700') + sp(c.fg, '.'),
          sp(c.accentFunction, 'audit_theme') + sp(c.fgPunct, '(') + sp(c.accentString, '"' + escHtml(th.slug) + '"') + sp(c.fgPunct, ')') + cur,
        ];
      }

      const AUDIT_ROLES = [
        ['Editor Text (fg)', 'fg'],
        ['Secondary UI Text', 'fgSecondary'],
        ['Comment (fgComment)', 'fgComment'],
        ['Variable', 'fgVariable'],
        ['Parameter (italic)', 'fgParameter'],
        ['Property', 'fgProperty'],
        ['Keyword (bold)', 'accentKeyword'],
        ['Storage / Modifier', 'accentStorage'],
        ['String Literal', 'accentString'],
        ['Regex / Escape', 'accentRegex'],
        ['Function / Method', 'accentFunction'],
        ['Type / Class (bold)', 'accentType'],
        ['Interface / Trait', 'accentInterface'],
        ['Number / Constant', 'accentNumber'],
        ['Decorator / Macro', 'accentDecorator'],
        ['Namespace / Module', 'accentNamespace'],
        ['Diagnostic Error', 'colorError'],
        ['Diagnostic Warning', 'colorWarning'],
      ];

      const POLY_KEYS = [
        'accentKeyword', 'accentStorage', 'accentString', 'accentRegex', 'accentFunction',
        'accentType', 'accentInterface', 'accentNumber', 'accentDecorator', 'accentNamespace',
      ];
      const POLY_NAMES = ['kw', 'sto', 'str', 'rgx', 'fn', 'typ', 'ifc', 'num', 'dec', 'ns'];
      const CRITICAL_KEYS = [
        ['kw', 'accentKeyword'],
        ['stor', 'accentStorage'],
        ['str', 'accentString'],
        ['fn', 'accentFunction'],
        ['type', 'accentType'],
        ['num', 'accentNumber'],
        ['err', 'colorError'],
      ];
      const COMPARE_SWATCH_ROLES = [
        ['bg', 'bg'],
        ['kw', 'accentKeyword'],
        ['str', 'accentString'],
        ['fn', 'accentFunction'],
        ['type', 'accentType'],
        ['cur', 'accentCursor'],
      ];

      function computeMinCritDe(simTokens) {
        let minCritDe = Infinity;
        let minPairNames = '';
        for (let i = 0; i < CRITICAL_KEYS.length; i++) {
          for (let j = i + 1; j < CRITICAL_KEYS.length; j++) {
            const [n1, k1] = CRITICAL_KEYS[i];
            const [n2, k2] = CRITICAL_KEYS[j];
            const d = deltaE76(simTokens[k1], simTokens[k2]);
            if (d < minCritDe) {
              minCritDe = d;
              minPairNames = n1 + '/' + n2;
            }
          }
        }
        return { minCritDe, minPairNames };
      }

      const SIM_KEYS_CLIENT = [
        'accentKeyword', 'accentStorage', 'accentString', 'accentRegex',
        'accentFunction', 'accentFunctionDim', 'accentType', 'accentInterface',
        'accentNumber', 'accentDecorator', 'accentNamespace', 'colorError', 'colorWarning',
      ];

      function ciede2000Client(lab1, lab2) {
        const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
        const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
        const Cbar = 0.5 * (C1 + C2);
        const Cbar7 = Math.pow(Cbar, 7);
        const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625)));
        const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
        const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
        const h1p = (a1p || b1) ? ((Math.atan2(b1, a1p) * 180 / Math.PI) + 360) % 360 : 0;
        const h2p = (a2p || b2) ? ((Math.atan2(b2, a2p) * 180 / Math.PI) + 360) % 360 : 0;
        const dLp = L2 - L1, dCp = C2p - C1p;
        let dhp = 0;
        if (C1p * C2p !== 0) {
          if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
          else dhp = (h2p - h1p > 180) ? (h2p - h1p - 360) : (h2p - h1p + 360);
        }
        const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * Math.PI / 180);
        const Lbp = 0.5 * (L1 + L2), Cbp = 0.5 * (C1p + C2p);
        let Hbp = h1p + h2p;
        if (C1p * C2p !== 0) {
          if (Math.abs(h1p - h2p) <= 180) Hbp = 0.5 * (h1p + h2p);
          else Hbp = (h1p + h2p < 360) ? 0.5 * (h1p + h2p + 360) : 0.5 * (h1p + h2p - 360);
        }
        const rad = Math.PI / 180;
        const T = 1 - 0.17 * Math.cos((Hbp - 30) * rad) + 0.24 * Math.cos(2 * Hbp * rad) + 0.32 * Math.cos((3 * Hbp + 6) * rad) - 0.20 * Math.cos((4 * Hbp - 63) * rad);
        const dTheta = 30 * Math.exp(-Math.pow((Hbp - 275) / 25, 2));
        const Cbp7 = Math.pow(Cbp, 7);
        const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + 6103515625));
        const SL = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
        const SC = 1 + 0.045 * Cbp;
        const SH = 1 + 0.015 * Cbp * T;
        const RT = -Math.sin(2 * dTheta * rad) * RC;
        return Math.sqrt(Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2) + RT * (dCp / SC) * (dHp / SH));
      }

      function meanSyntaxDe00Tokens(tokA, tokB) {
        if (!tokA || !tokB) return 0;
        let sum = 0;
        for (let i = 0; i < SIM_KEYS_CLIENT.length; i++) {
          const k = SIM_KEYS_CLIENT[i];
          sum += ciede2000Client(hexToLab(tokA[k]), hexToLab(tokB[k]));
        }
        return sum / SIM_KEYS_CLIENT.length;
      }

      function meanSyntaxDe00(thA, thB) {
        if (!thA || !thB || thA.slug === thB.slug) return 0;
        return meanSyntaxDe00Tokens(thA.tokens, thB.tokens);
      }

      function buildCompareCard(roleTag, th, sim) {
        const card = document.createElement('div');
        card.className = 'compare-card';
        card.style.backgroundColor = sim.bg;
        card.style.color = sim.fg;
        card.style.borderColor = sim.borderStrong;
        card.style.borderTopColor = sim.accentFocus;

        const head = document.createElement('div');
        head.className = 'compare-card-head';
        head.style.backgroundColor = sim.bgActivity;
        head.style.borderBottomColor = sim.borderSubtle;
        head.innerHTML =
          '<span class="compare-card-title">' +
            '<span class="compare-badge" style="background:' + sim.bgLine + ';color:' + sim.fgSecondary + '">' + escHtml(roleTag) + '</span>' +
            '<strong style="color:' + sim.fg + '">' + escHtml(th.label) + '</strong>' +
          '</span>' +
          '<span class="compare-meta-sub" style="color:' + sim.fgSecondary + '">' + escHtml(th.city) + ' · ' + th.year + '</span>';
        card.appendChild(head);

        const pre = document.createElement('pre');
        pre.className = 'compare-code';
        pre.style.backgroundColor = sim.bg;
        const lines = buildMiniCodeSample(sim, activeLang, th);
        pre.innerHTML = lines.map((ln, idx) => {
          const hi = idx === 3;
          return '<div class="code-line" style="background:' + (hi ? sim.bgLine : 'transparent') + '">' +
            '<span class="line-num" style="color:' + (hi ? sim.fgSecondary : sim.fgMuted) + '">' + (idx + 1) + '</span>' +
            '<span>' + (ln || ' ') + '</span></div>';
        }).join('');
        card.appendChild(pre);

        const fgW = wcag(sim.fg, sim.bg).toFixed(2);
        const fgLc = Math.abs(apcaLc(sim.fg, sim.bg)).toFixed(1);
        const crit = computeMinCritDe(sim);
        const cvdText = 'Min ΔE*ab ' + crit.minCritDe.toFixed(1) + ' (' + crit.minPairNames + ')';

        const metrics = document.createElement('div');
        metrics.className = 'compare-metrics';
        metrics.style.backgroundColor = sim.bgPanel;
        metrics.style.borderTopColor = sim.borderSubtle;
        metrics.style.color = sim.fgSecondary;
        metrics.innerHTML =
          '<span>WCAG fg/bg <strong style="color:' + sim.fg + '">' + fgW + ':1</strong></span>' +
          '<span>APCA |Lc| <strong style="color:' + sim.fg + '">' + fgLc + '</strong></span>' +
          '<span style="color:' + sim.accentType + '">' + escHtml(cvdText) + '</span>';
        card.appendChild(metrics);

        const swatches = document.createElement('div');
        swatches.className = 'compare-swatches';
        swatches.style.backgroundColor = sim.bgSidebar;
        swatches.style.borderTopColor = sim.borderSubtle;
        COMPARE_SWATCH_ROLES.forEach(([shortLbl, tokKey]) => {
          const hex = sim[tokKey];
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'compare-swatch';
          btn.style.color = sim.fgSecondary;
          btn.style.borderColor = sim.borderSubtle;
          btn.title = th.label + ' · ' + shortLbl + ': ' + hex + ' (click to copy)';
          btn.innerHTML = '<span class="compare-swatch-dot" style="background:' + hex + '"></span><span>' + shortLbl + '</span>';
          btn.addEventListener('click', () => copyText(hex, 'Copied ' + th.label + ' ' + shortLbl + ' (' + hex + ')'));
          swatches.appendChild(btn);
        });
        card.appendChild(swatches);

        return card;
      }

      function renderCompareStrip(th, c, cmpTheme, simCmp, cvdTitle) {
        const strip = document.getElementById('compare-strip');
        const toggleBtn = document.getElementById('btn-compare-toggle');
        toggleBtn.setAttribute('aria-pressed', String(compareEnabled));
        strip.hidden = !compareEnabled;
        if (!compareEnabled || !cmpTheme || !simCmp) return;

        compareSelect.value = cmpTheme.slug;
        const liveDe = th.slug === cmpTheme.slug ? 0 : meanSyntaxDe00Tokens(c, simCmp);
        const deBadge = document.getElementById('compare-de-badge');
        deBadge.textContent = 'ΔE₀₀ ' + liveDe.toFixed(1) + (activeCvd !== 'normal' ? ' (' + activeCvd + ')' : '');
        document.getElementById('compare-vision-note').textContent =
          cvdTitle + ' · Dashed OKLab polygon tracks Theme B';

        const grid = document.getElementById('compare-grid');
        grid.innerHTML = '';
        grid.appendChild(buildCompareCard('Theme A · Active', th, c));
        grid.appendChild(buildCompareCard('Theme B · Compare', cmpTheme, simCmp));
      }

      function drawChromaCanvas(simCur, simRef, isLightShell, isCompareActive) {
        const canvas = document.getElementById('canvas-chroma');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = 320, h = 260;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const maxC = 0.27;
        const scale = 108 / maxC;
        const gridColor = isLightShell ? 'rgba(24,27,32,0.12)' : 'rgba(236,239,244,0.12)';
        const labelColor = isLightShell ? 'rgba(24,27,32,0.58)' : 'rgba(236,239,244,0.58)';

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        [0.08, 0.16, 0.24].forEach((r) => {
          ctx.beginPath();
          ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.beginPath();
        ctx.moveTo(16, cy); ctx.lineTo(w - 16, cy);
        ctx.moveTo(cx, 12); ctx.lineTo(cx, h - 12);
        ctx.stroke();

        ctx.fillStyle = labelColor;
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText('+a (red)', w - 58, cy - 5);
        ctx.fillText('-a (green)', 14, cy - 5);
        ctx.fillText('+b (yellow)', cx + 5, 20);
        ctx.fillText('-b (blue)', cx + 5, h - 10);

        if (simRef) {
          const refPts = POLY_KEYS.map((k) => {
            const hex = simRef[k];
            const ok = hexToOklch(hex);
            return { x: cx + ok.a * scale, y: cy - ok.b * scale, hex };
          });
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = isCompareActive
            ? (isLightShell ? 'rgba(24,27,32,0.55)' : 'rgba(236,239,244,0.55)')
            : (isLightShell ? 'rgba(24,27,32,0.32)' : 'rgba(236,239,244,0.32)');
          ctx.lineWidth = isCompareActive ? 1.5 : 1.25;
          ctx.beginPath();
          refPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.closePath();
          ctx.stroke();
          ctx.restore();

          if (isCompareActive) {
            refPts.forEach((p) => {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
              ctx.fillStyle = p.hex;
              ctx.fill();
              ctx.lineWidth = 1;
              ctx.strokeStyle = isLightShell ? 'rgba(24,27,32,0.5)' : 'rgba(236,239,244,0.5)';
              ctx.stroke();
            });
          }
        }

        const pts = POLY_KEYS.map((k, idx) => {
          const hex = simCur[k];
          const ok = hexToOklch(hex);
          return { x: cx + ok.a * scale, y: cy - ok.b * scale, hex, lbl: POLY_NAMES[idx] };
        });

        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.strokeStyle = simCur.accentFocus;
        ctx.lineWidth = 1.9;
        ctx.stroke();

        pts.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.2, 0, Math.PI * 2);
          ctx.fillStyle = p.hex;
          ctx.fill();
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = simCur.bg;
          ctx.stroke();
        });
      }

      function drawLightnessCanvas(simCur, isLightShell) {
        const canvas = document.getElementById('canvas-lightness');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = 320, h = 190;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const padL = 34, padR = 14, padT = 16, padB = 28;
        const plotW = w - padL - padR;
        const plotH = h - padT - padB;
        const yOfL = (L) => padT + (1 - L) * plotH;

        const gridColor = isLightShell ? 'rgba(24,27,32,0.12)' : 'rgba(236,239,244,0.12)';
        const txtColor = isLightShell ? 'rgba(24,27,32,0.62)' : 'rgba(236,239,244,0.62)';

        ctx.font = '10px ui-monospace, monospace';
        [0, 0.25, 0.5, 0.75, 1].forEach((lv) => {
          const y = yOfL(lv);
          ctx.strokeStyle = gridColor;
          ctx.beginPath();
          ctx.moveTo(padL, y); ctx.lineTo(w - padR, y);
          ctx.stroke();
          ctx.fillStyle = txtColor;
          ctx.fillText(Math.round(lv * 100) + '%', 4, y + 3);
        });

        const bgL = hexToOklch(simCur.bg).L;
        const cmtL = hexToOklch(simCur.fgComment).L;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = simCur.fgComment;
        ctx.beginPath();
        ctx.moveTo(padL, yOfL(cmtL)); ctx.lineTo(w - padR, yOfL(cmtL));
        ctx.stroke();
        ctx.restore();

        const step = plotW / POLY_KEYS.length;
        POLY_KEYS.forEach((k, i) => {
          const hex = simCur[k];
          const L = hexToOklch(hex).L;
          const x = padL + step * (i + 0.5);
          const y = yOfL(L);
          const yBg = yOfL(bgL);

          ctx.strokeStyle = hex;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(x, yBg);
          ctx.lineTo(x, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = hex;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = simCur.bg;
          ctx.stroke();

          ctx.fillStyle = txtColor;
          ctx.fillText(POLY_NAMES[i], x - 9, h - 10);
        });
      }

      const GROUP_COLORS_MAP = {
        'Ivy League': '#B52B3B',
        'Canadian Universities': '#0077B6',
        'US Public Flagships': '#D97706',
        'US Private Research & STEM': '#7C3AED',
        'Liberal Arts & Regional Gems': '#0F9D7A',
        'Global Classics': '#C0267B',
      };
      const COUNTRY_COLORS_MAP = {
        'USA': '#2563EB',
        'Canada': '#DC2626',
        'UK': '#7C3AED',
        'Switzerland': '#0D9488',
        'Japan': '#D97706',
      };

      function renderNeighborBar(th) {
        const bar = document.getElementById('neighbor-bar');
        if (!bar || !th.neighbors) return;
        bar.innerHTML = '';

        const lbl = document.createElement('span');
        lbl.className = 'neighbor-lbl';
        lbl.textContent = 'Nearest (ΔE₀₀):';
        bar.appendChild(lbl);

        const makeChip = (slug, de, isFar) => {
          const target = THEMES.find((x) => x.slug === slug);
          if (!target) return null;
          const wrap = document.createElement('span');
          wrap.className = 'neighbor-chip-wrap';

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'neighbor-chip';
          btn.title = (isFar ? 'Maximum chromatic contrast: ' : 'Nearest chromatic neighbor: ') + target.label + ' (mean ΔE₀₀ ' + de.toFixed(1) + ') — click to activate, Shift+Click to compare';
          const dot = document.createElement('span');
          dot.className = 'neighbor-dot';
          dot.style.backgroundColor = simHex(target.tokens.bg, activeCvd);
          dot.style.borderColor = simHex(target.tokens.accentKeyword, activeCvd);
          btn.appendChild(dot);
          btn.appendChild(document.createTextNode(target.shortName + ' '));
          const deSpan = document.createElement('span');
          deSpan.className = 'neighbor-de';
          deSpan.textContent = de.toFixed(1);
          btn.appendChild(deSpan);
          btn.addEventListener('click', (e) => {
            if (e.shiftKey) openCompareWith(target.slug);
            else selectSlug(target.slug, true);
          });

          const cmpBtn = document.createElement('button');
          cmpBtn.type = 'button';
          cmpBtn.className = 'neighbor-cmp-btn';
          cmpBtn.textContent = '⇄';
          cmpBtn.title = 'Compare ' + th.label + ' vs ' + target.label;
          cmpBtn.setAttribute('aria-label', 'Compare with ' + target.label);
          cmpBtn.addEventListener('click', () => openCompareWith(target.slug));

          wrap.appendChild(btn);
          wrap.appendChild(cmpBtn);
          return wrap;
        };

        th.neighbors.forEach((n) => {
          const el = makeChip(n.slug, n.de, false);
          if (el) bar.appendChild(el);
        });

        if (th.farthest) {
          const sep = document.createElement('span');
          sep.className = 'neighbor-sep';
          sep.textContent = '·';
          bar.appendChild(sep);

          const flbl = document.createElement('span');
          flbl.className = 'neighbor-lbl';
          flbl.textContent = 'Farthest:';
          bar.appendChild(flbl);

          const fel = makeChip(th.farthest.slug, th.farthest.de, true);
          if (fel) bar.appendChild(fel);
        }
      }

      function renderMapInspector(inspTheme, activeTheme) {
        const panel = document.getElementById('mds-inspector');
        if (!panel || !inspTheme) return;
        const isSelf = inspTheme.slug === activeTheme.slug;
        const sw = [
          ['BG', simHex(inspTheme.tokens.bg, activeCvd)],
          ['KW', simHex(inspTheme.tokens.accentKeyword, activeCvd)],
          ['STR', simHex(inspTheme.tokens.accentString, activeCvd)],
          ['FN', simHex(inspTheme.tokens.accentFunction, activeCvd)],
          ['TYPE', simHex(inspTheme.tokens.accentType, activeCvd)],
        ];

        let distHtml = '';
        if (isSelf) {
          const n0 = inspTheme.neighbors && inspTheme.neighbors[0];
          const n0t = n0 ? THEMES.find((x) => x.slug === n0.slug) : null;
          const ft = inspTheme.farthest ? THEMES.find((x) => x.slug === inspTheme.farthest.slug) : null;
          distHtml =
            '<div><strong>Nearest:</strong> ' + escHtml(n0t ? n0t.shortName : '—') + (n0 ? ' (' + n0.de.toFixed(1) + ' ΔE₀₀)' : '') + '</div>' +
            '<div><strong>Farthest:</strong> ' + escHtml(ft ? ft.shortName : '—') + (inspTheme.farthest ? ' (' + inspTheme.farthest.de.toFixed(1) + ' ΔE₀₀)' : '') + '</div>';
        } else {
          const de = meanSyntaxDe00(activeTheme, inspTheme);
          distHtml =
            '<div><strong>vs ' + escHtml(activeTheme.shortName) + ':</strong> ' + de.toFixed(1) + ' mean ΔE₀₀</div>' +
            '<div style="color:var(--shell-muted)">' + (inspTheme.mode === activeTheme.mode ? 'Same polarity (13 syntax roles)' : 'Cross-polarity distance') + '</div>';
        }

        panel.innerHTML =
          '<div class="mds-insp-head">' +
            '<span class="mds-insp-kicker">' + (isSelf ? 'Active Theme' : 'Inspected Campus') + '</span>' +
            '<div class="mds-insp-title">' + escHtml(inspTheme.label) + '</div>' +
            '<div class="mds-insp-meta">' + escHtml(inspTheme.city) + ' · ' + inspTheme.year + ' · ' + escHtml(inspTheme.group) + '</div>' +
            '<p class="mds-insp-sub">' + escHtml(inspTheme.subtitle) + '</p>' +
          '</div>' +
          '<div class="mds-insp-swatches">' +
            sw.map(([lbl, hx]) => '<div class="mds-insp-sw"><span style="background:' + hx + '"></span>' + lbl + '</div>').join('') +
          '</div>' +
          '<div class="mds-insp-dist">' + distHtml + '</div>' +
          '<div class="mds-insp-actions">' +
            '<button type="button" id="mds-btn-activate" class="btn-primary"' + (isSelf ? ' disabled' : '') + '>' + (isSelf ? '✓ Active' : 'Activate') + '</button>' +
            '<button type="button" id="mds-btn-compare"' + (isSelf ? ' disabled' : '') + '>Compare vs Active</button>' +
          '</div>';

        const actBtn = document.getElementById('mds-btn-activate');
        const cmpBtn = document.getElementById('mds-btn-compare');
        if (actBtn && !isSelf) actBtn.addEventListener('click', () => selectSlug(inspTheme.slug, true));
        if (cmpBtn && !isSelf) cmpBtn.addEventListener('click', () => openCompareWith(inspTheme.slug));
      }

      function computeCollisionFreeLabels(modeThemes, posBySlug, W, H, padL, padR, padT, padB, poleBoxes) {
        const minX = 8;
        const maxX = W - 8;
        const minY = padT - 2;
        const maxY = H - padB + 4;
        const cxMid = W / 2;
        const cyMid = (padT + H - padB) / 2;

        const allDots = modeThemes.map((t) => {
          const [px, py] = posBySlug.get(t.slug);
          return { slug: t.slug, x: px, y: py };
        });

        // Order most crowded / edge-constrained nodes first so dense clusters get clean local slots
        const ranked = modeThemes.map((t) => {
          const [px, py] = posBySlug.get(t.slug);
          const lblText = t.shortName;
          const w = Math.ceil(lblText.length * 5.8 + 12);
          const h = 14.5;
          let crowding = 0;
          for (let i = 0; i < allDots.length; i++) {
            const d = Math.hypot(allDots[i].x - px, allDots[i].y - py);
            if (d > 0.1 && d < 95) crowding += 1 / (d + 8);
          }
          const edgeDist = Math.min(px - minX, maxX - px, py - minY, maxY - py);
          const edgePressure = edgeDist < 45 ? (45 - edgeDist) * 0.02 : 0;
          return { slug: t.slug, ax: px, ay: py, w, h, priority: crowding + edgePressure };
        });
        ranked.sort((a, b) => (b.priority - a.priority) || a.slug.localeCompare(b.slug));

        const placed = [];
        const placedMap = new Map();

        const rectsOverlap = (ax, ay, aw, ah, bx, by, bw, bh, padX, padY) => (
          Math.abs(ax - bx) < (aw + bw) / 2 + padX &&
          Math.abs(ay - by) < (ah + bh) / 2 + padY
        );

        const rectHitsDot = (cx, cy, w, h, dx, dy, minClear) => {
          const nearX = Math.max(cx - w / 2, Math.min(dx, cx + w / 2));
          const nearY = Math.max(cy - h / 2, Math.min(dy, cy + h / 2));
          return Math.hypot(dx - nearX, dy - nearY) < minClear;
        };

        const segsCross = (ax, ay, bx, by, cx, cy, dx, dy) => {
          const ccw = (p1x, p1y, p2x, p2y, p3x, p3y) => (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
          return (
            ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
            ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
          );
        };

        const isClear = (cx, cy, w, h, padX, padY, dotClear) => {
          if (cx - w / 2 < minX || cx + w / 2 > maxX || cy - h / 2 < minY || cy + h / 2 > maxY) {
            return false;
          }
          for (let pb = 0; pb < poleBoxes.length; pb++) {
            const box = poleBoxes[pb];
            if (rectsOverlap(cx, cy, w, h, box.cx, box.cy, box.hw * 2, box.hh * 2, 2, 2)) return false;
          }
          for (let m = 0; m < allDots.length; m++) {
            if (rectHitsDot(cx, cy, w, h, allDots[m].x, allDots[m].y, dotClear)) return false;
          }
          for (let j = 0; j < placed.length; j++) {
            const p = placed[j];
            if (rectsOverlap(cx, cy, w, h, p.x, p.y, p.w, p.h, padX, padY)) return false;
          }
          return true;
        };

        const scoreCandidate = (node, cx, cy) => {
          const dist = Math.hypot(cx - node.ax, cy - node.ay);
          let crossings = 0;
          for (let j = 0; j < placed.length; j++) {
            const p = placed[j];
            if (segsCross(node.ax, node.ay, cx, cy, p.ax, p.ay, p.x, p.y)) crossings++;
          }
          // Subtle preference for clean vertical (above/below) alignment directly near the dot
          const dx = Math.abs(cx - node.ax);
          const dy = cy - node.ay;
          const cardinalBonus = (dx < 8 && dy < 0) ? -3 : (dx < 8 ? -1.5 : 0);
          return dist + crossings * 28 + cardinalBonus;
        };

        // Preferred angular offsets starting with directly above, below, right, left, then diagonals
        const baseAngles = [
          -90, 90, 0, 180, -45, -135, 45, 135,
          -22.5, -67.5, -112.5, -157.5, 22.5, 67.5, 112.5, 157.5,
          -11.25, -33.75, -56.25, -78.75, -101.25, -123.75, -146.25, -168.75,
          11.25, 33.75, 56.25, 78.75, 101.25, 123.75, 146.25, 168.75,
        ].map((deg) => deg * Math.PI / 180);

        const rings = [19, 25, 32, 40, 50, 62, 76, 92, 110, 132, 156, 184];

        for (let i = 0; i < ranked.length; i++) {
          const node = ranked[i];
          let best = null;
          let bestScore = Infinity;

          for (let rIdx = 0; rIdx < rings.length; rIdx++) {
            const r = rings[rIdx];
            // Early exit once we already have a great close candidate and outer rings cannot beat it
            if (best && r - 4 > bestScore) break;
            for (let aIdx = 0; aIdx < baseAngles.length; aIdx++) {
              const ang = baseAngles[aIdx];
              // Elliptical expansion matches horizontal label aspect ratio cleanly
              const rx = r + (Math.abs(Math.cos(ang)) * node.w * 0.34);
              const ry = r + (Math.abs(Math.sin(ang)) * node.h * 0.22);
              const cx = node.ax + Math.cos(ang) * rx;
              const cy = node.ay + Math.sin(ang) * ry;
              if (!isClear(cx, cy, node.w, node.h, 3.5, 3.0, 11.5)) continue;
              const sc = scoreCandidate(node, cx, cy);
              if (sc < bestScore) {
                bestScore = sc;
                best = { x: cx, y: cy };
              }
            }
          }

          // Fallback fine canvas scan if dense cluster fills local rings
          if (!best) {
            for (let y = minY + node.h / 2 + 2; y <= maxY - node.h / 2 - 2; y += 12) {
              for (let x = minX + node.w / 2 + 2; x <= maxX - node.w / 2 - 2; x += 18) {
                if (!isClear(x, y, node.w, node.h, 2.5, 2.0, 10.5)) continue;
                const sc = scoreCandidate(node, x, y);
                if (sc < bestScore) {
                  bestScore = sc;
                  best = { x, y };
                }
              }
            }
          }

          const finalPos = best || {
            x: Math.min(maxX - node.w / 2, Math.max(minX + node.w / 2, node.ax + (node.ax > cxMid ? -24 : 24))),
            y: Math.min(maxY - node.h / 2, Math.max(minY + node.h / 2, node.ay + (node.ay > cyMid ? -20 : 20))),
          };
          const rec = { slug: node.slug, ax: node.ax, ay: node.ay, x: finalPos.x, y: finalPos.y, w: node.w, h: node.h };
          placed.push(rec);
          placedMap.set(node.slug, rec);
        }

        return placedMap;
      }

      function renderSimilarityMap(activeTheme, isLightShell) {
        const strip = document.getElementById('map-strip');
        const toggleBtn = document.getElementById('btn-map-toggle');
        toggleBtn.setAttribute('aria-pressed', String(mapEnabled));
        strip.hidden = !mapEnabled;
        if (!mapEnabled) return;

        document.querySelectorAll('.map-mode-btn').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.mapMode === mapMode));
        });
        document.getElementById('map-color-by').value = mapColorBy;

        const metaMode = MDS_META[mapMode];
        const sumVar = (metaMode.v1 + metaMode.v2).toFixed(1);
        document.getElementById('map-variance-note').textContent =
          metaMode.count + ' ' + (mapMode === 'light' ? 'Light' : 'Dark') + ' themes' +
          ' · PC1 (' + metaMode.v1.toFixed(1) + '%) + PC2 (' + metaMode.v2.toFixed(1) + '%) = ' + sumVar + '% variance';

        const legendKeyEl = document.getElementById('mds-legend-key');
        if (legendKeyEl) {
          if (mapColorBy === 'group') {
            legendKeyEl.innerHTML =
              Object.entries(GROUP_COLORS_MAP)
                .map(([name, col]) =>
                  '<span class="mds-legend-item"><span class="mds-legend-dot" style="background:' + col + '"></span>' + escHtml(name) + '</span>'
                )
                .join('') +
              '<span>· dotted links = top-3 siblings</span>';
          } else if (mapColorBy === 'country') {
            legendKeyEl.innerHTML =
              Object.entries(COUNTRY_COLORS_MAP)
                .map(([name, col]) =>
                  '<span class="mds-legend-item"><span class="mds-legend-dot" style="background:' + col + '"></span>' + escHtml(name) + '</span>'
                )
                .join('') +
              '<span>· dotted links = top-3 siblings</span>';
          } else {
            legendKeyEl.textContent =
              'Inner dot = editor bg · outer ring = signature keyword accent · dotted links = top-3 nearest siblings to active theme';
          }
        }

        const svg = document.getElementById('mds-svg');
        const NS = 'http://www.w3.org/2000/svg';
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const el = (tag, attrs, text) => {
          const node = document.createElementNS(NS, tag);
          for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
          if (text !== undefined) node.textContent = text;
          return node;
        };

        const W = 920, H = 520;
        const padL = 48, padR = 48, padT = 36, padB = 34;
        const pw = W - padL - padR, ph = H - padT - padB;
        const gridStroke = isLightShell ? '#E6E3DA' : '#262B36';
        const zeroStroke = isLightShell ? '#C8C4B8' : '#3A4254';
        const poleFill = isLightShell ? '#757E8D' : '#6E788C';
        const lblBgFill = isLightShell ? 'rgba(255,255,255,0.92)' : 'rgba(16,20,26,0.90)';
        const lblTextFill = isLightShell ? '#171B22' : '#EBF0F7';

        const zx = padL + ((0 - metaMode.minX) / ((metaMode.maxX - metaMode.minX) || 1)) * pw;
        const zy = padT + ph - ((0 - metaMode.minY) / ((metaMode.maxY - metaMode.minY) || 1)) * ph;

        for (let f = 0.2; f <= 0.81; f += 0.2) {
          svg.appendChild(el('line', { x1: (padL + f * pw).toFixed(1), y1: padT, x2: (padL + f * pw).toFixed(1), y2: padT + ph, stroke: gridStroke, 'stroke-width': 1 }));
          svg.appendChild(el('line', { x1: padL, y1: (padT + f * ph).toFixed(1), x2: padL + pw, y2: (padT + f * ph).toFixed(1), stroke: gridStroke, 'stroke-width': 1 }));
        }
        if (zx > padL && zx < padL + pw) {
          svg.appendChild(el('line', { x1: zx.toFixed(1), y1: padT, x2: zx.toFixed(1), y2: padT + ph, stroke: zeroStroke, 'stroke-width': 1.2, 'stroke-dasharray': '4,4' }));
        }
        if (zy > padT && zy < padT + ph) {
          svg.appendChild(el('line', { x1: padL, y1: zy.toFixed(1), x2: padL + pw, y2: zy.toFixed(1), stroke: zeroStroke, 'stroke-width': 1.2, 'stroke-dasharray': '4,4' }));
        }

        // Compass pole labels kept outside the data frame
        const poleAttrs = { fill: poleFill, 'font-family': 'var(--font-mono)', 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': '0.06em' };
        svg.appendChild(el('text', { ...poleAttrs, x: padL + pw / 2, y: 20, 'text-anchor': 'middle' }, '↑ VIOLET / ROYAL BLUE'));
        svg.appendChild(el('text', { ...poleAttrs, x: padL + pw / 2, y: H - 11, 'text-anchor': 'middle' }, '↓ EVERGREEN / AMBER'));
        svg.appendChild(el('text', { ...poleAttrs, x: 14, y: 20, 'text-anchor': 'start' }, '← PINE / GOLD / NAVY'));
        svg.appendChild(el('text', { ...poleAttrs, x: W - 14, y: 20, 'text-anchor': 'end' }, 'CRIMSON / SCARLET →'));

        const modeThemes = THEMES.filter((t) => t.mode === mapMode);
        const posBySlug = new Map();
        modeThemes.forEach((t) => {
          const px = padL + 18 + t.mds.nx * (pw - 36);
          const py = padT + ph - 18 - t.mds.ny * (ph - 36);
          posBySlug.set(t.slug, [px, py]);
        });

        // Dotted proximity tethers from active theme to top-3 nearest siblings (when active is in current map mode)
        const actPos = posBySlug.get(activeTheme.slug);
        if (actPos && activeTheme.neighbors) {
          activeTheme.neighbors.slice(0, 3).forEach((nb, ni) => {
            const np = posBySlug.get(nb.slug);
            if (!np) return;
            svg.appendChild(el('line', {
              x1: actPos[0].toFixed(1),
              y1: actPos[1].toFixed(1),
              x2: np[0].toFixed(1),
              y2: np[1].toFixed(1),
              stroke: simHex(activeTheme.tokens.accentCursor, activeCvd),
              'stroke-width': ni === 0 ? 1.8 : 1.2,
              'stroke-opacity': ni === 0 ? 0.85 : 0.45,
              'stroke-dasharray': '3,3',
              'pointer-events': 'none',
            }));
          });
        }

        const poleBoxes = [
          { cx: 88, cy: 18, hw: 80, hh: 12 },
          { cx: padL + pw / 2, cy: 18, hw: 84, hh: 12 },
          { cx: W - 88, cy: 18, hw: 80, hh: 12 },
          { cx: padL + pw / 2, cy: H - 13, hw: 82, hh: 12 },
        ];
        const lblBySlug = computeCollisionFreeLabels(modeThemes, posBySlug, W, H, padL, padR, padT, padB, poleBoxes);

        // Render leader lines in a dedicated background layer behind all dots & labels
        const filterActive = Boolean(searchQuery.trim() || activeGroup !== 'All');
        const orderedThemes = modeThemes.slice().sort((a, b) => (a.slug === activeTheme.slug ? 1 : b.slug === activeTheme.slug ? -1 : 0));
        const leaderLayer = el('g', { class: 'mds-leaders', 'pointer-events': 'none' });
        orderedThemes.forEach((t) => {
          const [px, py] = posBySlug.get(t.slug);
          const ln = lblBySlug.get(t.slug);
          const matched = !filterActive || matchesCampusFilter(t);
          if (Math.hypot(ln.x - px, ln.y - py) > 15) {
            leaderLayer.appendChild(el('line', {
              x1: px.toFixed(1),
              y1: py.toFixed(1),
              x2: ln.x.toFixed(1),
              y2: ln.y.toFixed(1),
              stroke: zeroStroke,
              'stroke-width': 0.85,
              'stroke-opacity': matched ? 0.85 : 0.22,
            }));
          }
        });
        svg.appendChild(leaderLayer);

        // Render clickable campus nodes (active node LAST in SVG DOM so it is never occluded)
        orderedThemes.forEach((t) => {
          const [px, py] = posBySlug.get(t.slug);
          const ln = lblBySlug.get(t.slug);
          const isAct = t.slug === activeTheme.slug;
          const isCmp = compareEnabled && t.slug === compareSlug;
          const matched = !filterActive || matchesCampusFilter(t);

          const g = el('g', {
            class: 'mds-node' + (isAct ? ' is-active' : '') + (!matched ? ' is-dimmed' : ''),
            'data-slug': t.slug,
            tabindex: 0,
            role: 'button',
            'aria-label': t.label + ' (' + t.city + ' · ' + t.year + ')',
          });

          let ringCol = simHex(t.tokens.accentKeyword, activeCvd);
          let fillCol = simHex(t.tokens.bg, activeCvd);
          if (mapColorBy === 'group') {
            ringCol = GROUP_COLORS_MAP[t.group] || ringCol;
            fillCol = isLightShell ? '#FFFFFF' : '#151820';
          } else if (mapColorBy === 'country') {
            ringCol = COUNTRY_COLORS_MAP[t.country] || ringCol;
            fillCol = isLightShell ? '#FFFFFF' : '#151820';
          }

          if (isAct || isCmp) {
            g.appendChild(el('circle', {
              cx: px.toFixed(1),
              cy: py.toFixed(1),
              r: isAct ? 13.5 : 12,
              fill: 'none',
              stroke: isAct ? simHex(t.tokens.accentCursor, activeCvd) : 'var(--shell-accent)',
              'stroke-width': isAct ? 2.2 : 1.6,
              'stroke-dasharray': isCmp && !isAct ? '3,2' : '',
            }));
          }

          g.appendChild(el('circle', {
            class: 'mds-dot-ring',
            cx: px.toFixed(1),
            cy: py.toFixed(1),
            r: isAct ? 8.2 : 6.6,
            fill: ringCol,
            stroke: isLightShell ? '#1E222B' : '#F2F5FA',
            'stroke-width': isAct ? 1.5 : 0.9,
          }));
          g.appendChild(el('circle', {
            class: 'mds-dot-core',
            cx: px.toFixed(1),
            cy: py.toFixed(1),
            r: isAct ? 4.0 : 3.2,
            fill: fillCol,
          }));

          const lblText = t.shortName;
          g.appendChild(el('rect', {
            class: 'mds-label-bg',
            x: (ln.x - ln.w / 2).toFixed(1),
            y: (ln.y - ln.h / 2).toFixed(1),
            width: ln.w.toFixed(1),
            height: ln.h.toFixed(1),
            rx: 3,
            fill: lblBgFill,
            stroke: isAct ? ringCol : 'transparent',
            'stroke-width': isAct ? 1.2 : 0,
          }));
          g.appendChild(el('text', {
            x: ln.x.toFixed(1),
            y: (ln.y + 3.1).toFixed(1),
            'text-anchor': 'middle',
            fill: lblTextFill,
            'font-family': 'var(--font-sans)',
            'font-size': isAct ? 9.5 : 8.8,
            'font-weight': isAct ? 700 : 550,
          }, lblText));

          g.addEventListener('mouseenter', () => {
            mapHoverSlug = t.slug;
            renderMapInspector(t, activeTheme);
          });
          g.addEventListener('focus', () => {
            mapHoverSlug = t.slug;
            renderMapInspector(t, activeTheme);
          });
          g.addEventListener('click', (e) => {
            if (e.shiftKey) openCompareWith(t.slug);
            else selectSlug(t.slug, true);
          });
          g.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (e.shiftKey) openCompareWith(t.slug);
              else selectSlug(t.slug, true);
            }
          });
          svg.appendChild(g);
        });

        const initialInsp = (mapHoverSlug && modeThemes.find((t) => t.slug === mapHoverSlug)) ||
          (activeTheme.mode === mapMode ? activeTheme : modeThemes[0]);
        renderMapInspector(initialInsp, activeTheme);
      }

      function render() {
        const th = getActiveTheme();
        const sib = findSibling(th);
        const cmpTheme = compareEnabled ? getCompareTheme(th) : sib;
        const isLightShell = th.mode === 'light';
        document.documentElement.dataset.shellMode = th.mode;
        document.body.dataset.shellMode = th.mode;

        // Collegiate crest reflects active university pair's Light/Dark accents
        const lightPair = th.mode === 'light' ? th : (sib || th);
        const darkPair = th.mode === 'dark' ? th : (sib || th);
        document.getElementById('crest-left').setAttribute('fill', lightPair.tokens.bg);
        document.getElementById('crest-right').setAttribute('fill', darkPair.tokens.bg);
        document.getElementById('crest-chevron').setAttribute('fill', th.tokens.accentKeyword);
        document.getElementById('crest-star').setAttribute('fill', th.tokens.accentCursor);
        document.getElementById('crest-rim').setAttribute('stroke', th.tokens.accentFocus);

        document.getElementById('toggle-mode-label').textContent =
          th.mode === 'light' ? 'Switch to Dark' : 'Switch to Light';

        const applyBtn = document.getElementById('btn-apply-vscode');
        if (applyBtn) {
          const isApplied = workbenchActiveLabel === th.label;
          applyBtn.textContent = isApplied ? '✓ Active in Workbench' : 'Apply to Workbench';
        }

        renderCampusRail(th);

        document.getElementById('active-theme-heading').textContent = th.label + ' — ' + th.university;
        document.getElementById('active-theme-meta').textContent = th.city + ' · est. ' + th.year + ' · ' + th.group;
        document.getElementById('active-theme-subtitle').textContent = th.subtitle;
        document.getElementById('active-theme-story').innerHTML = escHtml(th.story).replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
        renderNeighborBar(th);

        document.querySelectorAll('.cvd-btn').forEach((btn) => {
          btn.setAttribute('aria-selected', String(btn.dataset.cvd === activeCvd));
        });

        // Simulate tokens under active CVD vision mode
        const c = simulateTokens(th.tokens, activeCvd);
        const simCmp = cmpTheme ? simulateTokens(cmpTheme.tokens, activeCvd) : null;
        const cvdTitle = {
          normal: 'Normal Trichromacy',
          protan: 'Simulated Protanopia',
          deutan: 'Simulated Deuteranopia',
          tritan: 'Simulated Tritanopia',
        }[activeCvd];

        renderSimilarityMap(th, isLightShell);
        renderCompareStrip(th, c, cmpTheme, simCmp, cvdTitle);

        // Workbench styling
        const wb = document.getElementById('workbench');
        wb.style.backgroundColor = c.bg;
        wb.style.color = c.fg;

        const titlebar = document.getElementById('wb-titlebar');
        titlebar.style.backgroundColor = c.bgActivity;
        titlebar.style.borderBottomColor = c.borderSubtle;
        document.getElementById('dot-close').style.backgroundColor = c.accentString;
        document.getElementById('dot-min').style.backgroundColor = c.accentNumber;
        document.getElementById('dot-max').style.backgroundColor = c.accentKeyword;

        document.querySelectorAll('.lang-tab').forEach((tab) => {
          const isAct = tab.dataset.lang === activeLang;
          tab.style.backgroundColor = isAct ? c.bg : 'transparent';
          tab.style.color = isAct ? c.fg : c.fgMuted;
          tab.style.borderTopColor = isAct ? c.accentFocus : 'transparent';
          tab.style.fontWeight = isAct ? '600' : '400';
        });

        const pill = document.getElementById('wb-vision-pill');
        pill.textContent = cvdTitle;
        pill.style.backgroundColor = c.bgLine;
        pill.style.color = c.fgSecondary;

        const actBar = document.getElementById('wb-activity');
        actBar.style.backgroundColor = c.bgActivity;
        actBar.style.borderRightColor = c.borderSubtle;
        actBar.style.color = c.fgMuted;
        const actIcon = document.getElementById('act-icon-active');
        actIcon.style.color = c.fg;
        actIcon.style.borderLeftColor = c.accentFocus;

        const sidebar = document.getElementById('wb-sidebar');
        sidebar.style.backgroundColor = c.bgSidebar;
        sidebar.style.borderRightColor = c.borderSubtle;
        sidebar.style.borderBottomColor = c.borderSubtle;
        document.getElementById('wb-exp-head').style.color = c.fgMuted;
        document.getElementById('wb-var-head').style.color = c.fgMuted;
        document.getElementById('wb-positron-pane').style.borderTopColor = c.borderSubtle;

        const files = [
          ['campus_study.py', 'py', 'PY'],
          ['enrollment_model.R', 'r', 'R'],
          ['workbench.ts', 'ts', 'TS'],
          ['campus_metrics.sql', 'sql', 'SQL'],
          ['seminar_report.qmd', 'qmd', 'QMD'],
        ];
        const fileList = document.getElementById('wb-file-list');
        fileList.innerHTML = '';
        files.forEach(([fname, code, tag]) => {
          const row = document.createElement('div');
          row.className = 'wb-file-item';
          const isCur = activeLang === code;
          row.style.backgroundColor = isCur ? c.tintSelect : 'transparent';
          row.style.color = isCur ? c.fg : c.fgSecondary;
          row.innerHTML = '<span>' + fname + '</span><span style="font-size:10px;color:' + c.accentType + '">' + tag + '</span>';
          row.addEventListener('click', () => { activeLang = code; render(); });
          fileList.appendChild(row);
        });

        // Compute minimum critical pair DeltaE76 under current vision mode
        const { minCritDe, minPairNames } = computeMinCritDe(c);

        document.getElementById('wb-var-list').innerHTML = [
          '<div class="wb-var-row"><span style="color:' + c.fgVariable + '">campus_slug</span><span style="color:' + c.accentString + '">"' + escHtml(th.slug) + '"</span></div>',
          '<div class="wb-var-row"><span style="color:' + c.fgVariable + '">founded_yr</span><span style="color:' + c.accentNumber + '">' + th.year + '</span></div>',
          '<div class="wb-var-row"><span style="color:' + c.fgVariable + '">min_de76</span><span style="color:' + c.accentFunction + '">' + minCritDe.toFixed(1) + '</span></div>',
          '<div class="wb-var-row"><span style="color:' + c.fgVariable + '">wcag_gate</span><span style="color:' + c.accentKeyword + ';font-weight:700">PASS</span></div>',
        ].join('');

        // Editor code lines
        const codeLines = buildCodeSample(c, activeLang, th);
        const ed = document.getElementById('wb-editor');
        ed.style.backgroundColor = c.bg;
        ed.innerHTML = codeLines.map((ln, idx) => {
          const hi = idx === 5;
          return '<div class="code-line" style="background:' + (hi ? c.bgLine : 'transparent') + '">' +
            '<span class="line-num" style="color:' + (hi ? c.fgSecondary : c.fgMuted) + '">' + (idx + 1) + '</span>' +
            '<span>' + (ln || ' ') + '</span></div>';
        }).join('');

        // Console + 16 ANSI strip
        const con = document.getElementById('wb-console');
        con.style.backgroundColor = c.bgPanel;
        con.style.borderTopColor = c.borderSubtle;
        document.getElementById('wb-ansi-head').style.color = c.fgMuted;

        const fgWNum = wcag(c.fg, c.bg);
        const fgW = fgWNum.toFixed(2);
        const fgLcNum = Math.abs(apcaLc(c.fg, c.bg));
        const fgLc = fgLcNum.toFixed(1);
        document.getElementById('wb-console-lines').innerHTML =
          '<div><span style="color:' + c.accentKeyword + ';font-weight:700">&gt;</span> <span style="color:' + c.accentFunction + '">audit_campus_palette</span><span style="color:' + c.fgPunct + '">(</span><span style="color:' + c.accentString + '">"' + escHtml(th.slug) + '"</span><span style="color:' + c.fgPunct + '">)</span></div>' +
          '<div style="color:' + c.fgSecondary + ';margin-top:2px">✔ fg/bg = <span style="color:' + c.accentNumber + '">' + fgW + ':1</span> (APCA |Lc| <span style="color:' + c.accentNumber + '">' + fgLc + '</span>) · min critical pair ΔE*ab = <span style="color:' + c.accentType + '">' + minCritDe.toFixed(1) + '</span> (' + escHtml(minPairNames) + ')</div>';

        const ansiOrder = [
          'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
          'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
        ];
        const ansiStrip = document.getElementById('ansi-strip');
        ansiStrip.innerHTML = '';
        ansiOrder.forEach((slot) => {
          const rawHex = th.tokens.ansi[slot];
          const sHex = simHex(rawHex, activeCvd);
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'ansi-cell';
          cell.style.backgroundColor = sHex;
          cell.title = 'ansi.' + slot + ': ' + sHex + ' (WCAG ' + wcag(sHex, c.bgPanel).toFixed(2) + ':1) — click to copy';
          cell.addEventListener('click', () => copyText(sHex, 'Copied ansi.' + slot + ' (' + sHex + ')'));
          ansiStrip.appendChild(cell);
        });

        // Status Bar
        const sb = document.getElementById('wb-statusbar');
        sb.style.backgroundColor = c.accentStatusBar;
        sb.style.color = relLum(c.accentStatusBar) > 0.24 ? '#11161C' : '#F6F7FA';
        document.getElementById('sb-cvd-gate').textContent = 'Critical CVD min ΔE*ab: ' + minCritDe.toFixed(1);
        document.getElementById('sb-contrast').textContent = 'WCAG ' + fgW + ':1 · |Lc| ' + fgLc;
        document.getElementById('sb-label').textContent = th.label;

        // Audit Table + Metrics Drawer KPIs
        const tbody = document.getElementById('audit-tbody');
        tbody.innerHTML = '';
        let minRoleW = Infinity;
        let minRoleName = '';
        let passCount = 0;
        AUDIT_ROLES.forEach(([roleLabel, key]) => {
          const hex = c[key];
          const ok = hexToOklch(hex);
          const wBg = wcag(hex, c.bg);
          const wLine = wcag(hex, c.bgLine);
          const lc = Math.abs(apcaLc(hex, c.bg));
          if (wBg < minRoleW) {
            minRoleW = wBg;
            minRoleName = roleLabel;
          }
          if (wBg >= 4.5) passCount++;

          const tr = document.createElement('tr');
          tr.className = 'token-row';
          tr.title = 'Click to copy ' + hex;
          tr.innerHTML =
            '<td class="role-cell">' + escHtml(roleLabel) + '</td>' +
            '<td><span class="swatch-chip"><span class="swatch-box" style="background:' + hex + '"></span>' + hex + '</span></td>' +
            '<td>' + (ok.L * 100).toFixed(1) + '% · ' + ok.C.toFixed(3) + ' · ' + ok.H.toFixed(0) + '°</td>' +
            '<td><strong>' + wBg.toFixed(2) + ':1</strong></td>' +
            '<td>' + wLine.toFixed(2) + ':1</td>' +
            '<td>' + lc.toFixed(1) + '</td>';
          tr.addEventListener('click', () => copyText(hex, 'Copied ' + roleLabel + ' (' + hex + ')'));
          tbody.appendChild(tr);
        });

        document.getElementById('kpi-wcag').textContent = fgW + ':1';
        document.getElementById('kpi-wcag-sub').textContent =
          (fgWNum >= 7.0 ? 'WCAG AAA (≥ 7:1)' : 'WCAG AA (≥ 4.5:1)') + ' · Comment ' + wcag(c.fgComment, c.bg).toFixed(2) + ':1';
        document.getElementById('kpi-apca').textContent = '|Lc| ' + fgLc;
        document.getElementById('kpi-apca-sub').textContent =
          (fgLcNum >= 75 ? 'Body-copy fluent (≥ 75)' : 'Readable (≥ 60)') + ' · ' + (isLightShell ? 'Dark-on-Light' : 'Light-on-Dark');
        document.getElementById('kpi-floor').textContent = minRoleW.toFixed(2) + ':1';
        document.getElementById('kpi-floor-sub').textContent = passCount + '/' + AUDIT_ROLES.length + ' roles ≥ 4.5:1 · Tightest: ' + minRoleName;
        document.getElementById('kpi-cvd').textContent = 'ΔE*ab ' + minCritDe.toFixed(1);
        document.getElementById('kpi-cvd-sub').textContent = cvdTitle + ' · Closest pair: ' + minPairNames;

        document.getElementById('audit-summary-badge').textContent =
          passCount + '/' + AUDIT_ROLES.length + ' roles >= 4.5:1 · Floor: ' + minRoleW.toFixed(2) + ':1';
        document.getElementById('cvd-min-readout').textContent =
          'Min critical ΔE*ab (' + activeCvd + '): ' + minCritDe.toFixed(1) + ' (' + minPairNames + ')';

        // Chromaticity legend & pair comparison box
        document.getElementById('chroma-meta').textContent = (compareEnabled && cmpTheme)
          ? 'Solid = ' + th.label + ' · Dashed = ' + cmpTheme.label
          : 'Solid = active · Dashed = Light/Dark sibling';

        const pairBox = document.getElementById('pair-compare-box');
        if (cmpTheme && simCmp) {
          const relationLabel = compareEnabled ? 'Compare target:' : 'Paired variant:';
          pairBox.innerHTML =
            '<span>' + relationLabel + ' <strong>' + escHtml(cmpTheme.label) + '</strong></span>' +
            '<span class="swatch-chip">Identity cursor: <span class="swatch-box" style="background:' + c.accentCursor + '"></span><code>' + c.accentCursor + '</code> ↔ <span class="swatch-box" style="background:' + simCmp.accentCursor + '"></span><code>' + simCmp.accentCursor + '</code></span>';
        }

        drawChromaCanvas(c, simCmp, isLightShell, compareEnabled);
        drawLightnessCanvas(c, isLightShell);
      }

      // Controls & Keyboard Shortcuts
      const searchInput = document.getElementById('campus-search');
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        const cur = getActiveTheme();
        renderCampusRail(cur);
        if (mapEnabled) renderSimilarityMap(cur, cur.mode === 'light');
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          searchQuery = '';
          searchInput.value = '';
          searchInput.blur();
          const cur = getActiveTheme();
          renderCampusRail(cur);
          if (mapEnabled) renderSimilarityMap(cur, cur.mode === 'light');
        }
      });

      document.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          activeGroup = chip.dataset.group || 'All';
          const cur = getActiveTheme();
          renderCampusRail(cur);
          if (mapEnabled) renderSimilarityMap(cur, cur.mode === 'light');
        });
      });

      document.getElementById('btn-reset-filters').addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        activeGroup = 'All';
        const cur = getActiveTheme();
        renderCampusRail(cur);
        if (mapEnabled) renderSimilarityMap(cur, cur.mode === 'light');
      });

      document.getElementById('btn-copy-export').addEventListener('click', () => {
        const cur = getActiveTheme();
        const fmt = document.getElementById('export-format').value || 'vscode';
        const out = formatPaletteExport(cur, fmt);
        copyText(out.text, out.label);
      });

      document.getElementById('btn-download-export').addEventListener('click', () => {
        const cur = getActiveTheme();
        const fmt = document.getElementById('export-format').value || 'vscode';
        const out = formatPaletteExport(cur, fmt);
        downloadFile(out.filename, out.text, out.mime, 'Downloaded ' + out.filename);
      });

      document.getElementById('btn-compare-toggle').addEventListener('click', () => {
        compareEnabled = !compareEnabled;
        syncUrlHash();
        render();
      });

      document.getElementById('btn-map-toggle').addEventListener('click', () => {
        mapEnabled = !mapEnabled;
        if (mapEnabled && !mapModePinned) {
          mapMode = getActiveTheme().mode;
        }
        mapHoverSlug = null;
        syncUrlHash();
        render();
      });

      document.querySelectorAll('.map-mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          mapMode = btn.dataset.mapMode || 'dark';
          mapModePinned = mapMode;
          mapHoverSlug = null;
          syncUrlHash();
          render();
        });
      });

      document.getElementById('map-color-by').addEventListener('change', (e) => {
        mapColorBy = e.target.value || 'swatch';
        render();
      });

      compareSelect.addEventListener('change', (e) => {
        compareSlug = e.target.value;
        compareUserPinned = true;
        syncUrlHash();
        render();
      });

      document.getElementById('btn-compare-swap').addEventListener('click', () => {
        const cur = getActiveTheme();
        const target = getCompareTheme(cur);
        if (!target || target.slug === cur.slug) return;
        compareSlug = cur.slug;
        compareUserPinned = true;
        selectSlug(target.slug, true);
      });

      document.getElementById('btn-toggle-mode').addEventListener('click', () => {
        const cur = getActiveTheme();
        const sib = findSibling(cur);
        if (sib) selectSlug(sib.slug, true);
      });

      document.getElementById('btn-prev-theme').addEventListener('click', () => {
        const pool = getNavigableThemes();
        const idx = pool.findIndex((x) => x.slug === activeSlug);
        const nextIdx = idx === -1 ? pool.length - 1 : (idx - 1 + pool.length) % pool.length;
        selectSlug(pool[nextIdx].slug, true);
      });

      document.getElementById('btn-next-theme').addEventListener('click', () => {
        const pool = getNavigableThemes();
        const idx = pool.findIndex((x) => x.slug === activeSlug);
        const nextIdx = idx === -1 ? 0 : (idx + 1) % pool.length;
        selectSlug(pool[nextIdx].slug, true);
      });

      document.getElementById('btn-random-theme').addEventListener('click', () => {
        const navPool = getNavigableThemes();
        const base = navPool.length > 1 ? navPool : THEMES;
        const pool = base.filter((x) => x.slug !== activeSlug);
        selectSlug(pool[Math.floor(Math.random() * pool.length)].slug, true);
      });

      document.querySelectorAll('.lang-tab').forEach((tab) => {
        tab.addEventListener('click', () => { activeLang = tab.dataset.lang; render(); });
      });

      document.querySelectorAll('.cvd-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeCvd = btn.dataset.cvd;
          syncUrlHash();
          render();
        });
      });

      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (e.key === '/') {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        } else if (k === 'c') {
          document.getElementById('btn-compare-toggle').click();
        } else if (k === 'm') {
          document.getElementById('btn-map-toggle').click();
        } else if (k === 't') {
          document.getElementById('btn-toggle-mode').click();
        } else if (k === 'r') {
          document.getElementById('btn-random-theme').click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          document.getElementById('btn-prev-theme').click();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          document.getElementById('btn-next-theme').click();
        } else if (k === '1') { activeCvd = 'normal'; syncUrlHash(); render(); }
        else if (k === '2') { activeCvd = 'protan'; syncUrlHash(); render(); }
        else if (k === '3') { activeCvd = 'deutan'; syncUrlHash(); render(); }
        else if (k === '4') { activeCvd = 'tritan'; syncUrlHash(); render(); }
      });

      window.addEventListener('hashchange', () => {
        if (!IS_WEB) return;
        if (applyHashState(window.location.hash)) {
          render();
        }
      });

      window.addEventListener('resize', () => render());
      if (!mapModePinned) mapMode = getActiveTheme().mode;
      render();
    })();
  </script>
</body>
</html>
`;
}

function main() {
  const { dataset, campusGroups } = loadThemeDataset();
  const mdsMeta = enrichDatasetWithSimilarity(dataset);
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.mkdirSync(WEBVIEW_DIR, { recursive: true });

  const webHtml = buildHtml({ dataset, campusGroups, mdsMeta, target: 'web' });
  const webviewHtml = buildHtml({ dataset, campusGroups, mdsMeta, target: 'webview' });

  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), webHtml);
  fs.writeFileSync(path.join(SITE_DIR, '.nojekyll'), '');
  fs.writeFileSync(path.join(WEBVIEW_DIR, 'explorer.html'), webviewHtml);

  const webKb = (Buffer.byteLength(webHtml) / 1024).toFixed(1);
  const wvKb = (Buffer.byteLength(webviewHtml) / 1024).toFixed(1);
  console.log(
    `Generated site/index.html (${webKb} KB), site/.nojekyll, and assets/explorer/explorer.html (${wvKb} KB) across ${dataset.length} themes (${campusGroups.length} groupings).`
  );
  for (const mode of ['light', 'dark']) {
    const m = mdsMeta[mode];
    console.log(
      `  MDS ${mode} (${m.count}): PC1=${m.v1.toFixed(1)}% + PC2=${m.v2.toFixed(1)}% = ${(m.v1 + m.v2).toFixed(1)}% | closest: ${m.closestPair.a} <-> ${m.closestPair.b} (dE00=${m.closestPair.de}) | farthest: ${m.farthestPair.a} <-> ${m.farthestPair.b} (dE00=${m.farthestPair.de})`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  GROUP_ORDER,
  loadThemeDataset,
  jacobiEigenSymmetric,
  computeClassicalMds2d,
  enrichDatasetWithSimilarity,
  buildHtml,
};
