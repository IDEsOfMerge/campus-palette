#!/usr/bin/env node
'use strict';

// Dev-only tool: prints (or updates with --write) the collegiate-grouping
// color-swatch catalog tables for README.md, reading directly from palettes/*.js
// so it can never drift from the shipped themes.
// Run with:
//   node scripts/generate-readme-catalog.js
//   node scripts/generate-readme-catalog.js --write

const fs = require('fs');
const path = require('path');
const { GROUP_ORDER, UNIVERSITY_ORDER } = require('./generate-themes');

const ROOT_DIR = path.join(__dirname, '..');
const PALETTES_DIR = path.join(ROOT_DIR, 'palettes');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const START_MARKER = '<!-- CATALOG:START -->';
const END_MARKER = '<!-- CATALOG:END -->';

function loadPalettesByUniversity() {
  const byUniversity = new Map();
  for (const f of fs.readdirSync(PALETTES_DIR).filter((n) => n.endsWith('.js')).sort()) {
    const p = require(path.join(PALETTES_DIR, f));
    let bucket = byUniversity.get(p.university);
    if (!bucket) {
      bucket = {
        university: p.university,
        shortName: p.shortName,
        group: p.group,
        country: p.country,
        city: p.city,
        year: p.year,
        brandUrl: p.brandUrl,
      };
      byUniversity.set(p.university, bucket);
    }
    bucket[p.tokens.mode] = p;
  }
  return byUniversity;
}

function badge(palette) {
  if (!palette) return '—';
  return `![${palette.label}](assets/swatches/${palette.slug}.png)`;
}

function buildCatalogMarkdown() {
  const byUniversity = loadPalettesByUniversity();
  let out = '';

  for (const group of GROUP_ORDER) {
    const universities = UNIVERSITY_ORDER
      .map((name) => byUniversity.get(name))
      .filter((entry) => entry && entry.group === group);

    out += `\n### ${group} (${universities.length} universities · ${universities.length * 2} themes)\n\n`;
    out += '| University (Official Brand Guide) | Location & Founded | Light (bg · kw · str · fn · type · num · bar) | Dark (bg · kw · str · fn · type · num · bar) |\n';
    out += '|---|---|---|---|\n';

    for (const entry of universities) {
      const safeName = entry.university.replace(/\|/g, '\\|');
      const nameCell =
        entry.brandUrl && /^https:\/\//i.test(entry.brandUrl)
          ? `**[${safeName}](${entry.brandUrl})**`
          : `**${safeName}**`;
      const location = `${entry.city} · ${entry.year}`;
      out += `| ${nameCell} | ${location} | ${badge(entry.light)} | ${badge(entry.dark)} |\n`;
    }
  }

  return out;
}

function main() {
  const markdown = buildCatalogMarkdown();
  if (process.argv.includes('--write')) {
    const readme = fs.readFileSync(README_PATH, 'utf8');
    const startIdx = readme.indexOf(START_MARKER);
    const endIdx = readme.indexOf(END_MARKER);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      throw new Error(`README.md is missing ${START_MARKER} / ${END_MARKER} markers`);
    }
    const updated =
      readme.slice(0, startIdx + START_MARKER.length) +
      '\n' +
      markdown.trim() +
      '\n' +
      readme.slice(endIdx);
    fs.writeFileSync(README_PATH, updated);
    console.log('Updated README.md catalog between CATALOG markers.');
  } else {
    process.stdout.write(markdown);
  }
}

if (require.main === module) {
  main();
}

module.exports = { buildCatalogMarkdown, main };
