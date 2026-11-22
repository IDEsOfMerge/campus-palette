#!/usr/bin/env node
'use strict';

// Validates every palette, generated theme JSON, metadata file, package.json
// manifest, and asset reference before packaging or CI passes:
//   1. Strict JSON parsing of package.json, theme-metadata.json, and themes/*.json
//   2. Exact 120-theme count across palettes/, themes/, package.json, and theme-metadata.json
//   3. Schema validation of contributes.commands, contributes.configuration,
//      keywords <= 30, zero runtime dependencies, theme-metadata.json (incl. brandUrl), and palettes/*.js
//   4. Valid #RRGGBB / #RRGGBBAA hex syntax on every theme color key
//   5. Every `positron*` color key drawn strictly from Positron's 152 confirmed keys
//      (src/vs/workbench/common/theme.ts on posit-dev/positron)
//   6. Multi-gate colorimetric audit (WCAG 2.1, APCA, CIEDE2000, CVD) with 0 errors AND 0 warnings
//   7. Existence of icon.png, assets/walkthrough/*.md, zero-CDN Explorer bundles,
//      and non-empty site/og-preview.png
// Run with: node scripts/validate.js

const fs = require('fs');
const path = require('path');
const cs = require('./color-science');

const ROOT_DIR = path.join(__dirname, '..');
const PALETTES_DIR = path.join(ROOT_DIR, 'palettes');
const THEMES_DIR = path.join(ROOT_DIR, 'themes');
const PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');
const META_JSON = path.join(ROOT_DIR, 'theme-metadata.json');

const EXPECTED_THEME_COUNT = 120;
const EXPECTED_NEIGHBOR_COUNT = 6;
const MAX_KEYWORDS = 30;
const HTTPS_URL_RE = /^https:\/\/[^\s]+$/;

const VALID_GROUPS = new Set([
  'Ivy League',
  'Canadian Universities',
  'US Public Flagships',
  'US Private Research & STEM',
  'Liberal Arts & Independent',
  'Global Universities',
]);

const VALID_COUNTRIES = new Set([
  'USA', 'Canada', 'UK', 'Switzerland', 'Japan', 'Singapore', 'Australia',
]);

const CONFIRMED_POSITRON_KEYS = new Set([
  'positronError.foreground', 'positronScrollBar.border',
  'positronSplitterExpandCollapseButton.background', 'positronSplitterExpandCollapseButton.foreground',
  'positronToolTip.background', 'positronToolTip.border',
  'positronContextMenu.background', 'positronContextMenu.foreground', 'positronContextMenu.hoverBackground', 'positronContextMenu.hoverForeground', 'positronContextMenu.actionHoverBackground', 'positronContextMenu.separatorBackground',
  'positronActionBar.border', 'positronActionBar.background', 'positronActionBar.foreground', 'positronActionBar.disabledForeground', 'positronActionBar.separator', 'positronActionBar.hoverBackground', 'positronActionBar.checkboxBorder', 'positronActionBar.toggleButtonHighlightedBorder', 'positronActionBar.textInputBackground', 'positronActionBar.textInputBorder', 'positronActionBar.textInputSelectionForeground', 'positronActionBar.textInputSelectionBackground', 'positronActionBar.selectBorder', 'positronActionBar.selectBoxBackground',
  'positronModalDialog.background', 'positronModalDialog.foreground', 'positronModalDialog.contrastBackground', 'positronModalDialog.border', 'positronModalDialog.separator', 'positronModalDialog.preformattedTextForeground', 'positronModalDialog.titleBarBackground', 'positronModalDialog.titleBarForeground', 'positronModalDialog.buttonBackground', 'positronModalDialog.buttonHoverBackground', 'positronModalDialog.defaultButtonBackground', 'positronModalDialog.defaultButtonHoverBackground', 'positronModalDialog.buttonActiveBackground', 'positronModalDialog.buttonDisabledBackground', 'positronModalDialog.buttonForeground', 'positronModalDialog.defaultButtonForeground', 'positronModalDialog.buttonDestructiveBackground', 'positronModalDialog.buttonDestructiveHoverBackground', 'positronModalDialog.buttonDestructiveForeground', 'positronModalDialog.buttonDisabledForeground', 'positronModalDialog.buttonBorder', 'positronModalDialog.buttonDisabledBorder', 'positronModalDialog.textInputBackground', 'positronModalDialog.textInputBorder', 'positronModalDialog.textInputSelectionForeground', 'positronModalDialog.textInputSelectionBackground', 'positronModalDialog.radioButtonBackground', 'positronModalDialog.radioButtonForeground', 'positronModalDialog.radioButtonBorder', 'positronModalDialog.projectTypeBackground', 'positronModalDialog.projectTypeBackgroundHover', 'positronModalDialog.projectTypeBackgroundSelected', 'positronModalDialog.projectTypeForeground', 'positronModalDialog.projectTypeForegroundHover', 'positronModalDialog.projectTypeForegroundSelected', 'positronModalDialog.projectTypeBorder', 'positronModalDialog.projectTypeBorderHover', 'positronModalDialog.projectTypeBorderSelected',
  'positronIconButton.border', 'positronIconButton.background',
  'positronDropDownListBox.border', 'positronDropDownListBox.background', 'positronDropDownListBox.foreground', 'positronDropDownListBox.hoverBackground', 'positronDropDownListBox.hoverForeground', 'positronDropDownListBox.actionHoverBackground', 'positronDropDownListBox.separatorBackground',
  'positronCheckbox.background', 'positronCheckbox.foreground', 'positronCheckbox.border',
  'positronConsole.background', 'positronConsole.foreground', 'positronConsole.errorBackground', 'positronConsole.errorForeground', 'positronConsole.traceBackground',
  'positronConsole.ansiBlack', 'positronConsole.ansiRed', 'positronConsole.ansiGreen', 'positronConsole.ansiYellow', 'positronConsole.ansiBlue', 'positronConsole.ansiMagenta', 'positronConsole.ansiCyan', 'positronConsole.ansiWhite',
  'positronConsole.ansiBrightBlack', 'positronConsole.ansiBrightRed', 'positronConsole.ansiBrightGreen', 'positronConsole.ansiBrightYellow', 'positronConsole.ansiBrightBlue', 'positronConsole.ansiBrightMagenta', 'positronConsole.ansiBrightCyan', 'positronConsole.ansiBrightWhite',
  'positronRuntime.stateIconActive', 'positronRuntime.stateIconDisconnected', 'positronRuntime.stateIconIdle',
  'positronDataGrid.contrastBackground', 'positronDataGrid.foreground', 'positronDataGrid.border', 'positronDataGrid.cursorBorder', 'positronDataGrid.selectionBorder', 'positronDataGrid.selectionInnerBorder', 'positronDataGrid.selectionBackground', 'positronDataGrid.sortIndexForeground',
  'positronDataExplorer.background', 'positronDataExplorer.contrastBackground', 'positronDataExplorer.invalidFilterBackground', 'positronDataExplorer.statusIndicatorComputing', 'positronDataExplorer.statusIndicatorDisconnected', 'positronDataExplorer.selectionBackground', 'positronDataExplorer.foreground', 'positronDataExplorer.border', 'positronDataExplorer.columnNullPercentGraphBackgroundFill', 'positronDataExplorer.columnNullPercentGraphBackgroundStroke', 'positronDataExplorer.columnNullPercentGraphIndicatorFill', 'positronDataExplorer.sparklineAxis', 'positronDataExplorer.sparklineFill', 'positronDataExplorer.sparklineHover', 'positronDataExplorer.sparklineStroke',
  'positronVariables.background', 'positronVariables.foreground', 'positronVariables.border', 'positronVariables.headerBackground', 'positronVariables.rowHoverBackground', 'positronVariables.rowHoverForeground', 'positronVariables.activeSelectionBackground', 'positronVariables.activeSelectionForeground', 'positronVariables.inactiveSelectionBackground', 'positronVariables.inactiveSelectionForeground',
  'positronPackages.background', 'positronPackages.foreground', 'positronPackages.border', 'positronPackages.recentlyChangedBackground',
  'positronPlots.background',
  'positronNotebook.cellFooterForeground', 'positronNotebook.foreground', 'positronNotebook.errorForeground', 'positronNotebook.imgPlaceholderBackground', 'positronNotebook.cellBorder', 'positronNotebook.cellHoverBorder', 'positronNotebook.cellFocusedBorder', 'positronNotebook.cellInactiveFocusedBorder', 'positronNotebook.actionBarBackground', 'positronNotebook.actionBarBorder', 'positronNotebook.cellTagBorder', 'positronNotebook.cellTagHoverForeground',
  'positronMemoryUsageBar.overheadForeground', 'positronMemoryUsageBar.otherForeground',
]);

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
}

function main() {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  } catch (err) {
    fail(`package.json is not valid JSON: ${err.message}`);
    return;
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(META_JSON, 'utf8'));
  } catch (err) {
    fail(`theme-metadata.json is not valid JSON: ${err.message}`);
    return;
  }

  const paletteFiles = fs.readdirSync(PALETTES_DIR).filter((f) => f.endsWith('.js')).sort();
  const themeFiles = fs.existsSync(THEMES_DIR)
    ? fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.json')).sort()
    : [];

  if (paletteFiles.length !== EXPECTED_THEME_COUNT) {
    fail(`expected ${EXPECTED_THEME_COUNT} palette files in palettes/, found ${paletteFiles.length}`);
  }
  if (themeFiles.length !== EXPECTED_THEME_COUNT) {
    fail(`expected ${EXPECTED_THEME_COUNT} theme files in themes/, found ${themeFiles.length}`);
  }
  if (!pkg.contributes || !Array.isArray(pkg.contributes.themes) || pkg.contributes.themes.length !== EXPECTED_THEME_COUNT) {
    fail(`package.json contributes.themes has ${pkg.contributes?.themes?.length} entries, expected ${EXPECTED_THEME_COUNT}`);
  }
  if (!Array.isArray(meta) || meta.length !== EXPECTED_THEME_COUNT) {
    fail(`theme-metadata.json has ${meta?.length} entries, expected ${EXPECTED_THEME_COUNT}`);
  }

  // Verify package.json keywords limit (vsce enforces <= 30) and zero runtime dependencies
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    fail('package.json keywords must be a non-empty array');
  } else if (pkg.keywords.length > MAX_KEYWORDS) {
    fail(`package.json keywords has ${pkg.keywords.length} entries, exceeds VSCE max of ${MAX_KEYWORDS}`);
  }
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    fail(`package.json must have zero runtime dependencies, found: ${Object.keys(pkg.dependencies).join(', ')}`);
  }

  // Verify every contributes.themes path exists on disk
  for (const [idx, themeEntry] of (pkg.contributes?.themes || []).entries()) {
    if (!themeEntry || typeof themeEntry.label !== 'string' || !themeEntry.label.trim()) {
      fail(`package.json contributes.themes[${idx}] missing valid "label"`);
    }
    if (themeEntry.uiTheme !== 'vs' && themeEntry.uiTheme !== 'vs-dark') {
      fail(`package.json contributes.themes[${idx}] ("${themeEntry?.label || ''}") has invalid uiTheme "${themeEntry?.uiTheme}"`);
    }
    if (!themeEntry || typeof themeEntry.path !== 'string' || !fs.existsSync(path.join(ROOT_DIR, themeEntry.path))) {
      fail(`package.json contributes.themes[${idx}] references missing file: ${themeEntry?.path}`);
    }
  }

  // Verify contributes.commands and contributes.configuration schemas
  if (!Array.isArray(pkg.contributes?.commands) || pkg.contributes.commands.length === 0) {
    fail('package.json contributes.commands must be a non-empty array');
  } else {
    const seenCommands = new Set();
    for (const [idx, cmd] of pkg.contributes.commands.entries()) {
      if (!cmd || typeof cmd.command !== 'string' || !cmd.command.trim()) {
        fail(`package.json contributes.commands[${idx}] has missing or empty "command"`);
      } else if (seenCommands.has(cmd.command)) {
        fail(`package.json contributes.commands contains duplicate command "${cmd.command}"`);
      } else {
        seenCommands.add(cmd.command);
      }
      if (!cmd || typeof cmd.title !== 'string' || !cmd.title.trim()) {
        fail(`package.json contributes.commands[${idx}] ("${cmd?.command || ''}") has missing or empty "title"`);
      }
    }
  }

  if (pkg.contributes?.configuration === undefined) {
    fail('package.json contributes.configuration must be defined');
  } else {
    const configs = Array.isArray(pkg.contributes.configuration)
      ? pkg.contributes.configuration
      : [pkg.contributes.configuration];
    if (configs.length === 0) {
      fail('package.json contributes.configuration is an empty array');
    }
    for (const [idx, cfg] of configs.entries()) {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        fail(`package.json contributes.configuration[${idx}] must be an object`);
        continue;
      }
      const props = cfg.properties;
      if (!props || typeof props !== 'object' || Array.isArray(props) || Object.keys(props).length === 0) {
        fail(`package.json contributes.configuration[${idx}] must define a non-empty "properties" object`);
        continue;
      }
      for (const [propKey, propSchema] of Object.entries(props)) {
        if (!propKey.trim()) {
          fail(`package.json contributes.configuration[${idx}].properties contains an empty property key`);
        }
        if (!propSchema || typeof propSchema !== 'object' || Array.isArray(propSchema)) {
          fail(`package.json contributes.configuration[${idx}].properties["${propKey}"] must be an object`);
          continue;
        }
        const validType =
          (typeof propSchema.type === 'string' && propSchema.type.trim().length > 0) ||
          (Array.isArray(propSchema.type) &&
            propSchema.type.length > 0 &&
            propSchema.type.every((t) => typeof t === 'string' && t.trim().length > 0));
        if (!validType) {
          fail(`package.json contributes.configuration[${idx}].properties["${propKey}"] must specify a valid "type"`);
        }
      }
    }
  }

  // Verify theme-metadata.json schema (university, group, country, pairSlug, hex previews, metrics, neighbors, farthest)
  const metaBySlug = new Map();
  const previewHexFields = [
    'bg', 'fg', 'accentKeyword', 'accentFunction',
    'accentString', 'accentType', 'accentNumber', 'accentStatusBar',
  ];
  if (Array.isArray(meta)) {
    for (const [idx, entry] of meta.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        fail(`theme-metadata.json[${idx}] must be an object`);
        continue;
      }
      if (typeof entry.slug !== 'string' || !entry.slug.trim()) {
        fail(`theme-metadata.json[${idx}] missing valid "slug"`);
      } else if (metaBySlug.has(entry.slug)) {
        fail(`theme-metadata.json contains duplicate slug "${entry.slug}"`);
      } else {
        metaBySlug.set(entry.slug, entry);
      }
      for (const field of ['label', 'university', 'shortName', 'city', 'subtitle', 'pairSlug']) {
        if (typeof entry[field] !== 'string' || !entry[field].trim()) {
          fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") missing non-empty string "${field}"`);
        }
      }
      if (typeof entry.brandUrl !== 'string' || !HTTPS_URL_RE.test(entry.brandUrl)) {
        fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") missing valid https:// "brandUrl": ${entry.brandUrl}`);
      }
      if (!Number.isInteger(entry.year)) {
        fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") has invalid integer "year": ${entry.year}`);
      }
      if (entry.mode !== 'light' && entry.mode !== 'dark') {
        fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") has invalid "mode": ${entry.mode}`);
      }
      if (!VALID_GROUPS.has(entry.group)) {
        fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") has invalid "group": ${entry.group}`);
      }
      if (!VALID_COUNTRIES.has(entry.country)) {
        fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") has invalid "country": ${entry.country}`);
      }
      for (const hexField of previewHexFields) {
        if (typeof entry[hexField] !== 'string' || !HEX_COLOR_RE.test(entry[hexField])) {
          fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") has invalid hex "${entry[hexField]}" for "${hexField}"`);
        }
      }
      if (!entry.metrics || typeof entry.metrics !== 'object' || Array.isArray(entry.metrics)) {
        fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") missing object "metrics"`);
      } else {
        for (const numField of ['fgBg', 'fgLc', 'commentBg', 'sidebarFgBg', 'minSyntaxCr', 'severeCvdCount']) {
          if (typeof entry.metrics[numField] !== 'number' || !Number.isFinite(entry.metrics[numField])) {
            fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") metrics.${numField} must be a finite number`);
          }
        }
        if (entry.metrics.severeCvdCount !== 0) {
          fail(`theme-metadata.json[${idx}] ("${entry.slug || ''}") metrics.severeCvdCount must be 0`);
        }
      }
    }

    for (const entry of metaBySlug.values()) {
      const pairTarget = typeof entry.pairSlug === 'string' ? metaBySlug.get(entry.pairSlug) : undefined;
      if (!pairTarget) {
        fail(`theme-metadata.json ("${entry.slug}"): pairSlug "${entry.pairSlug}" does not exist`);
      } else {
        if (pairTarget.university !== entry.university) {
          fail(`theme-metadata.json ("${entry.slug}"): pairSlug "${entry.pairSlug}" belongs to "${pairTarget.university}", not "${entry.university}"`);
        }
        if (pairTarget.mode === entry.mode) {
          fail(`theme-metadata.json ("${entry.slug}"): pairSlug "${entry.pairSlug}" has same mode "${entry.mode}"`);
        }
        if (pairTarget.pairSlug !== entry.slug) {
          fail(`theme-metadata.json ("${entry.slug}"): asymmetric pairSlug reference on "${entry.pairSlug}"`);
        }
      }

      if (!Array.isArray(entry.neighbors) || entry.neighbors.length !== EXPECTED_NEIGHBOR_COUNT) {
        fail(`theme-metadata.json ("${entry.slug}"): expected ${EXPECTED_NEIGHBOR_COUNT} neighbors, found ${entry.neighbors?.length}`);
      } else {
        const seenNb = new Set();
        for (let i = 0; i < entry.neighbors.length; i++) {
          const nb = entry.neighbors[i];
          if (!nb || typeof nb !== 'object' || Array.isArray(nb)) {
            fail(`theme-metadata.json ("${entry.slug}"): neighbors[${i}] must be an object`);
            continue;
          }
          const target = typeof nb.slug === 'string' ? metaBySlug.get(nb.slug) : undefined;
          if (!target) {
            fail(`theme-metadata.json ("${entry.slug}"): neighbors[${i}] references unknown slug "${nb.slug}"`);
          } else {
            if (nb.slug === entry.slug) {
              fail(`theme-metadata.json ("${entry.slug}"): neighbors[${i}] cannot reference itself`);
            }
            if (target.mode !== entry.mode) {
              fail(`theme-metadata.json ("${entry.slug}"): neighbors[${i}] ("${nb.slug}") mode "${target.mode}" !== "${entry.mode}"`);
            }
            if (nb.label !== target.label || nb.shortName !== target.shortName || nb.group !== target.group) {
              fail(`theme-metadata.json ("${entry.slug}"): neighbors[${i}] ("${nb.slug}") metadata does not match target entry`);
            }
          }
          if (seenNb.has(nb.slug)) {
            fail(`theme-metadata.json ("${entry.slug}"): duplicate neighbor slug "${nb.slug}"`);
          }
          seenNb.add(nb.slug);
          if (typeof nb.de00 !== 'number' || !Number.isFinite(nb.de00) || nb.de00 <= 0) {
            fail(`theme-metadata.json ("${entry.slug}"): neighbors[${i}] has invalid positive "de00": ${nb.de00}`);
          } else if (i > 0 && typeof entry.neighbors[i - 1]?.de00 === 'number' && nb.de00 < entry.neighbors[i - 1].de00) {
            fail(`theme-metadata.json ("${entry.slug}"): neighbors not sorted ascending at index ${i} (${nb.de00} < ${entry.neighbors[i - 1].de00})`);
          }
        }
      }

      const far = entry.farthest;
      if (!far || typeof far !== 'object' || Array.isArray(far)) {
        fail(`theme-metadata.json ("${entry.slug}"): missing required object "farthest"`);
      } else {
        const farTarget = typeof far.slug === 'string' ? metaBySlug.get(far.slug) : undefined;
        if (!farTarget) {
          fail(`theme-metadata.json ("${entry.slug}"): farthest references unknown slug "${far.slug}"`);
        } else {
          if (far.slug === entry.slug) {
            fail(`theme-metadata.json ("${entry.slug}"): farthest cannot reference itself`);
          }
          if (farTarget.mode !== entry.mode) {
            fail(`theme-metadata.json ("${entry.slug}"): farthest ("${far.slug}") mode "${farTarget.mode}" !== "${entry.mode}"`);
          }
          if (far.label !== farTarget.label || far.shortName !== farTarget.shortName || far.group !== farTarget.group) {
            fail(`theme-metadata.json ("${entry.slug}"): farthest ("${far.slug}") metadata does not match target entry`);
          }
        }
        if (typeof far.de00 !== 'number' || !Number.isFinite(far.de00) || far.de00 <= 0) {
          fail(`theme-metadata.json ("${entry.slug}"): farthest has invalid positive "de00": ${far.de00}`);
        } else if (Array.isArray(entry.neighbors) && entry.neighbors.length > 0) {
          const lastNbDe = entry.neighbors[entry.neighbors.length - 1]?.de00;
          if (typeof lastNbDe === 'number' && far.de00 < lastNbDe) {
            fail(`theme-metadata.json ("${entry.slug}"): farthest de00 (${far.de00}) < last neighbor de00 (${lastNbDe})`);
          }
        }
      }
    }
  }

  // Verify icon.png and walkthrough media files exist on disk
  const iconRel = pkg.icon || 'icon.png';
  const iconAbs = path.join(ROOT_DIR, iconRel);
  if (!fs.existsSync(iconAbs) || fs.statSync(iconAbs).size <= 0) {
    fail(`extension icon missing or empty on disk: ${iconRel}`);
  }
  for (const requiredWalkthrough of ['assets/walkthrough/toggle.md', 'assets/walkthrough/color-science.md']) {
    const wtAbs = path.join(ROOT_DIR, requiredWalkthrough);
    if (!fs.existsSync(wtAbs) || fs.statSync(wtAbs).size <= 0) {
      fail(`required walkthrough file missing or empty: ${requiredWalkthrough}`);
    }
  }
  for (const wt of pkg.contributes?.walkthroughs || []) {
    for (const step of wt.steps || []) {
      const mediaPath = step.media?.image || step.media?.markdown;
      if (mediaPath && !fs.existsSync(path.join(ROOT_DIR, mediaPath))) {
        fail(`walkthrough step "${step.id}" references missing media file: ${mediaPath}`);
      }
    }
  }

  // Run multi-gate colorimetric audit across all 120 palette modules (0 errors AND 0 warnings)
  const paletteSlugs = new Set();
  for (const pf of paletteFiles) {
    const p = require(path.join(PALETTES_DIR, pf));
    if (!p.slug || typeof p.slug !== 'string' || !p.slug.trim()) {
      fail(`${pf}: missing required string property "slug"`);
    } else if (paletteSlugs.has(p.slug)) {
      fail(`${pf}: duplicate palette slug "${p.slug}"`);
    } else {
      paletteSlugs.add(p.slug);
      if (metaBySlug.size > 0 && !metaBySlug.has(p.slug)) {
        fail(`${pf}: palette slug "${p.slug}" missing from theme-metadata.json`);
      }
    }
    for (const field of ['label', 'university', 'shortName', 'city', 'subtitle']) {
      if (!p[field] || typeof p[field] !== 'string' || !p[field].trim()) {
        fail(`${pf}: missing required string property "${field}"`);
      }
    }
    if (typeof p.brandUrl !== 'string' || !HTTPS_URL_RE.test(p.brandUrl)) {
      fail(`${pf}: missing valid https:// property "brandUrl"`);
    }
    if (!VALID_GROUPS.has(p.group)) {
      fail(`${pf}: invalid collegiate group "${p.group}"`);
    }
    if (!VALID_COUNTRIES.has(p.country)) {
      fail(`${pf}: invalid country "${p.country}"`);
    }
    if (!Number.isInteger(p.year)) {
      fail(`${pf}: missing required integer property "year"`);
    }
    const res = cs.auditPalette(p);
    for (const err of res.errors) {
      fail(err);
    }
    for (const warn of res.warnings) {
      fail(`warning (zero-warning policy): ${warn}`);
    }
  }

  // Validate generated theme JSON files
  let totalPositronKeys = 0;
  for (const file of themeFiles) {
    const filePath = path.join(THEMES_DIR, file);
    let theme;
    try {
      theme = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      fail(`${file} is not valid JSON: ${err.message}`);
      continue;
    }

    if (!theme.colors || typeof theme.colors !== 'object') {
      fail(`${file}: missing or malformed "colors" block`);
      continue;
    }

    for (const [key, val] of Object.entries(theme.colors)) {
      if (typeof val !== 'string' || !HEX_COLOR_RE.test(val)) {
        fail(`${file}: invalid hex color "${val}" on key "${key}"`);
      }
    }

    const positronKeys = Object.keys(theme.colors).filter((k) => k.startsWith('positron'));
    totalPositronKeys += positronKeys.length;
    const unknown = positronKeys.filter((k) => !CONFIRMED_POSITRON_KEYS.has(k));
    if (unknown.length) {
      fail(`${file}: unrecognized positron* key(s) not in the 152 confirmed keys: ${unknown.join(', ')}`);
    }
    if (positronKeys.length !== CONFIRMED_POSITRON_KEYS.size) {
      fail(`${file}: expected ${CONFIRMED_POSITRON_KEYS.size} positron* keys, found ${positronKeys.length}`);
    }
  }

  // Verify generated interactive Explorer bundles (GitHub Pages + VS Code Webview)
  const explorerTargets = [
    { rel: 'site/index.html', requirePlaceholders: false },
    { rel: 'assets/explorer/explorer.html', requirePlaceholders: true },
  ];
  for (const target of explorerTargets) {
    const abs = path.join(ROOT_DIR, target.rel);
    if (!fs.existsSync(abs)) {
      fail(`missing generated Explorer bundle: ${target.rel} (run node scripts/generate-explorer.js)`);
      continue;
    }
    const html = fs.readFileSync(abs, 'utf8');
    // Strict zero-CDN compliance (no external script, stylesheet, or image URLs)
    if (/<(?:script|link|img)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html)) {
      fail(`${target.rel}: contains external HTTP(S) script/stylesheet/image URL; Explorer must be 100% self-contained`);
    }
    if (target.requirePlaceholders) {
      if (!html.includes('{{CSP_META}}') || !html.includes('{{CSP_NONCE}}')) {
        fail(`${target.rel}: missing {{CSP_META}} or {{CSP_NONCE}} placeholder required by extension.js`);
      }
    } else {
      if (!html.includes('<meta http-equiv="Content-Security-Policy"') || !html.includes("default-src 'none'")) {
        fail(`${target.rel}: missing strict zero-CDN Content-Security-Policy meta tag`);
      }
      if (html.includes('{{CSP_META}}') || html.includes('{{CSP_NONCE}}')) {
        fail(`${target.rel}: contains unresolved CSP template placeholder`);
      }
    }
    for (const entry of Array.isArray(meta) ? meta : []) {
      if (!html.includes(`"slug":"${entry.slug}"`)) {
        fail(`${target.rel}: missing embedded palette data for slug "${entry.slug}"`);
      }
    }
  }

  const ogPreviewPath = path.join(ROOT_DIR, 'site', 'og-preview.png');
  if (!fs.existsSync(ogPreviewPath)) {
    fail('missing OpenGraph social preview image: site/og-preview.png (run node scripts/generate-explorer.js)');
  } else {
    const ogStat = fs.statSync(ogPreviewPath);
    if (!ogStat.isFile() || ogStat.size <= 0) {
      fail('OpenGraph social preview image is empty or not a regular file: site/og-preview.png');
    }
  }

  if (process.exitCode !== 1) {
    console.log(
      `OK: ${themeFiles.length} theme files valid, ${totalPositronKeys} positron* key usages verified, Explorer bundles verified, all WCAG/APCA/CIEDE2000/CVD gates clear (0 errors, 0 warnings).`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_THEME_COUNT,
  EXPECTED_NEIGHBOR_COUNT,
  VALID_GROUPS,
  VALID_COUNTRIES,
  CONFIRMED_POSITRON_KEYS,
  main,
};
