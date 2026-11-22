'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..');
const themeMetadata = require(path.join(ROOT_DIR, 'theme-metadata.json'));

const EXPECTED_GROUPS = [
  'Ivy League',
  'Canadian Universities',
  'US Public Flagships',
  'US Private Research & STEM',
  'Liberal Arts & Regional Gems',
  'Global Classics',
];

const EXPORT_OPTIONS = [
  'vscode',
  'ghostty',
  'wezterm',
  'alacritty',
  'windowsterminal',
  'kitty',
  'iterm2',
  'css',
];

function extractInlineScript(html) {
  const match = html.match(/<script(?:\s+nonce="\{\{CSP_NONCE\}\}")?>([\s\S]*?)<\/script>/);
  assert.ok(match && match[1].length > 1000, 'Expected embedded inline <script> bundle');
  return match[1];
}

function tryLoadExplorerGenerator() {
  const genPath = path.join(ROOT_DIR, 'scripts', 'generate-explorer.js');
  if (!fs.existsSync(genPath)) return null;
  return require(genPath);
}

describe('explorer: built site/index.html & assets/explorer/explorer.html bundles', () => {
  it('site/index.html embeds all 120 themes, brand guidelines links, 6 collegiate groupings, zero-CDN CSP, 8 export formats, MDS map, OG metadata, and valid JS', () => {
    const sitePath = path.join(ROOT_DIR, 'site', 'index.html');
    assert.ok(fs.existsSync(sitePath), 'Expected site/index.html to exist (run node scripts/generate-explorer.js)');

    const html = fs.readFileSync(sitePath, 'utf8');
    const inlineScript = extractInlineScript(html);
    assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: 'site/index.html' }));

    // Zero-CDN strict CSP & web deployment metadata
    assert.ok(html.includes('data-target="web"'));
    assert.ok(html.includes('<meta http-equiv="Content-Security-Policy"'));
    assert.ok(html.includes("default-src 'none'"));
    assert.equal(/<(?:script|link|img)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html), false);
    assert.equal(html.includes('{{CSP_META}}'), false);
    assert.equal(html.includes('{{CSP_NONCE}}'), false);

    // Social preview & OpenGraph card
    assert.ok(html.includes('property="og:title"'));
    assert.ok(html.includes('property="og:image"'));
    assert.ok(html.includes('name="twitter:card"'));
    assert.ok(html.includes('og-preview.png'));

    const ogPath = path.join(ROOT_DIR, 'site', 'og-preview.png');
    assert.ok(fs.existsSync(ogPath) && fs.statSync(ogPath).size > 0, 'Expected non-empty site/og-preview.png');

    // All 120 themes, brandUrl links & all 6 collegiate groupings embedded
    assert.equal(themeMetadata.length, 120);
    for (const entry of themeMetadata) {
      assert.ok(html.includes(`"slug":"${entry.slug}"`), `site/index.html missing theme slug "${entry.slug}"`);
      assert.ok(
        typeof entry.brandUrl === 'string' && /^https:\/\/[^\s]+$/i.test(entry.brandUrl),
        `theme-metadata.json missing valid https:// brandUrl for "${entry.slug}"`
      );
      assert.ok(html.includes(entry.brandUrl), `site/index.html missing brandUrl for "${entry.slug}"`);
    }
    for (const group of EXPECTED_GROUPS) {
      assert.ok(html.includes(group), `site/index.html missing collegiate grouping "${group}"`);
    }

    // Core Explorer UI hooks (MDS map, neighbor bar, compare strip, brand guidelines link)
    for (const hook of ['id="map-strip"', 'id="mds-svg"', 'id="neighbor-bar"', 'id="compare-strip"', 'id="active-theme-brand-link"']) {
      assert.ok(html.includes(hook), `site/index.html missing DOM hook ${hook}`);
    }
    assert.ok(html.includes('Official Brand Guidelines'));
    assert.ok(inlineScript.includes('id="mds-brand-link"'));
    assert.ok(html.includes('const MDS_META = '));

    // All 8 export formats
    for (const opt of EXPORT_OPTIONS) {
      assert.ok(html.includes(`value="${opt}"`), `site/index.html missing export option "${opt}"`);
    }
    assert.ok(inlineScript.includes("if (fmt === 'iterm2')") && inlineScript.includes('<plist version="1.0">'));
    assert.ok(
      inlineScript.includes("if (fmt === 'windowsterminal')") &&
        inlineScript.includes('purple:') &&
        inlineScript.includes('brightPurple:')
    );

    // Hash state synchronization & compare reset hygiene
    assert.ok(
      inlineScript.includes('location.hash') || inlineScript.includes('hashchange'),
      'site/index.html should handle URL hash state'
    );
    assert.ok(
      inlineScript.includes('compareUserPinned') && inlineScript.includes('compareSlug'),
      'site/index.html should track & reset compare pin state cleanly'
    );
  });

  it('assets/explorer/explorer.html embeds all 120 themes, brand guidelines links, 6 groupings, CSP3 nonce placeholders, 8 exports, MDS map & webview sync', () => {
    const webviewPath = path.join(ROOT_DIR, 'assets', 'explorer', 'explorer.html');
    assert.ok(
      fs.existsSync(webviewPath),
      'Expected assets/explorer/explorer.html to exist (run node scripts/generate-explorer.js)'
    );

    const html = fs.readFileSync(webviewPath, 'utf8');
    const inlineScript = extractInlineScript(html);
    assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: 'assets/explorer/explorer.html' }));

    // Strict zero-CDN webview CSP placeholders
    assert.ok(html.includes('data-target="webview"'));
    assert.equal(/<(?:script|link|img)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html), false);
    assert.equal((html.match(/\{\{CSP_META\}\}/g) || []).length, 1);
    assert.equal((html.match(/\{\{CSP_NONCE\}\}/g) || []).length, 1);
    assert.equal((html.match(/data-initial-theme=""/g) || []).length, 1);
    assert.ok(html.includes('<script nonce="{{CSP_NONCE}}">'));
    assert.equal(html.includes('property="og:'), false);
    assert.equal(html.includes('name="twitter:'), false);

    // All 120 themes, brandUrl links & all 6 collegiate groupings embedded
    for (const entry of themeMetadata) {
      assert.ok(
        html.includes(`"slug":"${entry.slug}"`),
        `assets/explorer/explorer.html missing theme slug "${entry.slug}"`
      );
      assert.ok(html.includes(entry.brandUrl), `assets/explorer/explorer.html missing brandUrl for "${entry.slug}"`);
    }
    for (const group of EXPECTED_GROUPS) {
      assert.ok(html.includes(group), `assets/explorer/explorer.html missing collegiate grouping "${group}"`);
    }

    // Core UI hooks & all 8 export formats
    for (const hook of ['id="map-strip"', 'id="mds-svg"', 'id="neighbor-bar"', 'id="compare-strip"', 'id="active-theme-brand-link"']) {
      assert.ok(html.includes(hook), `assets/explorer/explorer.html missing DOM hook ${hook}`);
    }
    assert.ok(html.includes('Official Brand Guidelines'));
    assert.ok(inlineScript.includes('id="mds-brand-link"'));
    assert.ok(html.includes('const MDS_META = '));
    for (const opt of EXPORT_OPTIONS) {
      assert.ok(html.includes(`value="${opt}"`), `assets/explorer/explorer.html missing export option "${opt}"`);
    }

    // Webview activeThemeChanged message handling
    assert.ok(
      inlineScript.includes("msg.type === 'activeThemeChanged'"),
      'assets/explorer/explorer.html should handle activeThemeChanged webview messages'
    );
  });
});

describe('explorer: Classical MDS math & 120-theme dataset invariants (generator exports)', () => {
  const gen = tryLoadExplorerGenerator();

  it('recovers exact eigenvalues, orthonormal eigenvectors, and Euclidean MDS distances when exported', () => {
    if (!gen || typeof gen.jacobiEigenSymmetric !== 'function' || typeof gen.computeClassicalMds2d !== 'function') {
      return;
    }

    const A = [
      [4, 1, 1],
      [1, 3, 0],
      [1, 0, 2],
    ];
    const eigs = gen.jacobiEigenSymmetric(A);
    assert.equal(eigs.length, 3);
    assert.ok(eigs[0].val >= eigs[1].val && eigs[1].val >= eigs[2].val);
    const trace = eigs.reduce((s, e) => s + e.val, 0);
    assert.ok(Math.abs(trace - 9) < 1e-8, `Expected trace 9, got ${trace}`);

    for (let p = 0; p < 3; p++) {
      const { val, vec } = eigs[p];
      for (let i = 0; i < 3; i++) {
        const av = A[i][0] * vec[0] + A[i][1] * vec[1] + A[i][2] * vec[2];
        assert.ok(Math.abs(av - val * vec[i]) < 1e-7);
      }
      for (let q = 0; q < 3; q++) {
        const dot = vec[0] * eigs[q].vec[0] + vec[1] * eigs[q].vec[1] + vec[2] * eigs[q].vec[2];
        assert.ok(Math.abs(dot - (p === q ? 1 : 0)) < 1e-7);
      }
    }

    const pts = [
      [0, 0],
      [3, 0],
      [3, 4],
      [0, 4],
    ];
    const D = pts.map((a) => pts.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const { coords, v1, v2 } = gen.computeClassicalMds2d(D);
    assert.ok(Math.abs(v1 + v2 - 100) < 0.2, `2D rectangle should explain ~100% variance, got ${v1 + v2}`);
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const dRec = Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]);
        assert.ok(Math.abs(dRec - D[i][j]) < 1e-5);
      }
    }
  });

  it('computes valid 60-Light / 60-Dark MDS coordinates, valid brandUrl, and same-mode neighbors with deterministic HTML build parity', () => {
    if (!gen || typeof gen.loadThemeDataset !== 'function' || typeof gen.enrichDatasetWithSimilarity !== 'function') {
      return;
    }

    const loaded = gen.loadThemeDataset();
    const dataset = Array.isArray(loaded) ? loaded : loaded.dataset;
    const campusGroups = Array.isArray(loaded) ? undefined : loaded.campusGroups;
    const mdsMeta = gen.enrichDatasetWithSimilarity(dataset);

    assert.equal(dataset.length, 120);
    if (campusGroups) {
      assert.equal(campusGroups.length, 6);
    }
    const lightThemes = dataset.filter((t) => t.mode === 'light');
    const darkThemes = dataset.filter((t) => t.mode === 'dark');
    assert.equal(lightThemes.length, 60);
    assert.equal(darkThemes.length, 60);

    assert.ok(mdsMeta.light.v1 > 10 && mdsMeta.light.v2 > 5 && mdsMeta.light.v1 + mdsMeta.light.v2 <= 100);
    assert.ok(mdsMeta.dark.v1 > 10 && mdsMeta.dark.v2 > 5 && mdsMeta.dark.v1 + mdsMeta.dark.v2 <= 100);

    const bySlug = new Map(dataset.map((t) => [t.slug, t]));
    for (const t of dataset) {
      assert.ok(
        typeof t.brandUrl === 'string' && /^https:\/\/[^\s]+$/i.test(t.brandUrl),
        `Missing valid https:// brandUrl on dataset entry ${t.slug}`
      );
      assert.ok(t.mds, `Missing mds metadata on ${t.slug}`);
      assert.ok(Number.isFinite(t.mds.x) && Number.isFinite(t.mds.y));
      assert.ok(t.mds.nx >= 0 && t.mds.nx <= 1);
      assert.ok(t.mds.ny >= 0 && t.mds.ny <= 1);

      assert.ok(Array.isArray(t.neighbors) && t.neighbors.length >= 4);
      for (let i = 0; i < t.neighbors.length; i++) {
        const nb = t.neighbors[i];
        const de = nb.de00 !== undefined ? nb.de00 : nb.de;
        assert.notEqual(nb.slug, t.slug);
        assert.equal(bySlug.get(nb.slug).mode, t.mode);
        assert.ok(de > 0);
        if (i > 0) {
          const prevDe = t.neighbors[i - 1].de00 !== undefined ? t.neighbors[i - 1].de00 : t.neighbors[i - 1].de;
          assert.ok(de >= prevDe);
        }
      }
    }

    if (typeof gen.buildHtml === 'function') {
      const webDisk = fs.readFileSync(path.join(ROOT_DIR, 'site', 'index.html'), 'utf8');
      const webviewDisk = fs.readFileSync(path.join(ROOT_DIR, 'assets', 'explorer', 'explorer.html'), 'utf8');
      assert.equal(gen.buildHtml({ dataset, campusGroups, mdsMeta, target: 'web' }), webDisk);
      assert.equal(gen.buildHtml({ dataset, campusGroups, mdsMeta, target: 'webview' }), webviewDisk);
    }
  });
});
