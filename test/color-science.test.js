'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cs = require('../scripts/color-science');

const HEX6_RE = /^#[0-9A-F]{6}$/;
const PALETTES_DIR = path.join(__dirname, '..', 'palettes');

let palettesBySlug = null;
function loadAllPalettes() {
  if (!palettesBySlug) {
    palettesBySlug = new Map();
    for (const file of fs.readdirSync(PALETTES_DIR).filter((f) => f.endsWith('.js')).sort()) {
      const mod = require(path.join(PALETTES_DIR, file));
      palettesBySlug.set(mod.slug, mod);
    }
  }
  return palettesBySlug;
}

function loadPalette(slug) {
  const palette = loadAllPalettes().get(slug);
  assert.ok(palette, `Expected palette with slug "${slug}" in palettes/`);
  return palette;
}

function clonePalette(palette) {
  return JSON.parse(JSON.stringify(palette));
}

describe('color-science: hexToRgb & rgbToHex', () => {
  it('converts canonical 6-digit hex strings with exact channels', () => {
    assert.deepEqual(cs.hexToRgb('#000000'), { r: 0, g: 0, b: 0, a: 1 });
    assert.deepEqual(cs.hexToRgb('#FFFFFF'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(cs.hexToRgb('#FF0000'), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(cs.hexToRgb('#00FF00'), { r: 0, g: 255, b: 0, a: 1 });
    assert.deepEqual(cs.hexToRgb('#0000FF'), { r: 0, g: 0, b: 255, a: 1 });
    assert.deepEqual(cs.hexToRgb('#A51C30'), { r: 0xa5, g: 0x1c, b: 0x30, a: 1 });
  });

  it('handles lowercase, uppercase, omitted leading #, whitespace, and 8-digit alpha', () => {
    assert.deepEqual(cs.hexToRgb('#a1b2c3'), { r: 0xa1, g: 0xb2, b: 0xc3, a: 1 });
    assert.deepEqual(cs.hexToRgb('#A1B2C3'), { r: 0xa1, g: 0xb2, b: 0xc3, a: 1 });
    assert.deepEqual(cs.hexToRgb('a1b2c3'), { r: 0xa1, g: 0xb2, b: 0xc3, a: 1 });
    assert.deepEqual(cs.hexToRgb('  #192E56  '), { r: 0x19, g: 0x2e, b: 0x56, a: 1 });

    const withAlpha = cs.hexToRgb('#10203080');
    assert.equal(withAlpha.r, 0x10);
    assert.equal(withAlpha.g, 0x20);
    assert.equal(withAlpha.b, 0x30);
    assert.ok(Math.abs(withAlpha.a - 0x80 / 255) < 1e-12);
    assert.equal(cs.hexToRgb('#AABBCC00').a, 0);
    assert.equal(cs.hexToRgb('#AABBCCFF').a, 1);
  });

  it('formats uppercase #RRGGBB, rounds fractional channels, and clamps out-of-range values', () => {
    assert.equal(cs.rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
    assert.equal(cs.rgbToHex({ r: 255, g: 255, b: 255 }), '#FFFFFF');
    assert.equal(cs.rgbToHex({ r: 10, g: 171, b: 205 }), '#0AABCD');
    assert.equal(cs.rgbToHex({ r: -25, g: 127.6, b: 999 }), '#0080FF');
  });

  it('round-trips hex -> rgb -> hex losslessly and composites alpha correctly', () => {
    const samples = [
      '#000000',
      '#ffffff',
      'a51c30',
      '#00356B',
      '#192E56',
      '#F7F1EE',
      '010203',
      '#7f8081',
    ];
    for (const raw of samples) {
      const normalized = `#${raw.replace('#', '').toUpperCase()}`;
      assert.equal(cs.rgbToHex(cs.hexToRgb(raw)), normalized);
    }

    const halfBlend = cs.compositeOver('#FF000080', '#0000FF');
    assert.match(halfBlend, HEX6_RE);
    const blendRgb = cs.hexToRgb(halfBlend);
    assert.ok(Math.abs(blendRgb.r - 128) <= 1, `Expected r ≈ 128, got ${blendRgb.r}`);
    assert.equal(blendRgb.g, 0);
    assert.ok(Math.abs(blendRgb.b - 127) <= 1, `Expected b ≈ 127, got ${blendRgb.b}`);
    assert.equal(cs.compositeOver('#123456FF', '#FFFFFF'), '#123456');
    assert.equal(cs.compositeOver('#123456', '#FFFFFF'), '#123456');
  });
});

describe('color-science: hexToOklch & oklchToHex', () => {
  it('round-trips primaries, secondaries, neutrals, black, and white accurately', () => {
    const samples = [
      { name: 'red', hex: '#FF0000' },
      { name: 'harvard crimson', hex: '#A51C30' },
      { name: 'green', hex: '#00FF00' },
      { name: 'dartmouth green', hex: '#00693E' },
      { name: 'blue', hex: '#0000FF' },
      { name: 'yale blue', hex: '#00356B' },
      { name: 'burnt orange', hex: '#BF5700' },
      { name: 'nyu violet', hex: '#57068C' },
      { name: 'dark grey', hex: '#404040' },
      { name: 'mid grey', hex: '#808080' },
      { name: 'light grey', hex: '#C0C0C0' },
      { name: 'white', hex: '#FFFFFF' },
      { name: 'black', hex: '#000000' },
    ];

    for (const { name, hex } of samples) {
      const oklch = cs.hexToOklch(hex);
      assert.ok(oklch.L >= 0 && oklch.L <= 1, `${name}: L out of [0,1]: ${oklch.L}`);
      assert.ok(oklch.C >= 0, `${name}: negative chroma: ${oklch.C}`);
      assert.ok(oklch.h >= 0 && oklch.h < 360, `${name}: hue out of [0,360): ${oklch.h}`);

      const roundTripped = cs.oklchToHex(oklch);
      assert.match(roundTripped, HEX6_RE, `${name}: invalid hex ${roundTripped}`);

      const orig = cs.hexToRgb(hex);
      const back = cs.hexToRgb(roundTripped);
      assert.ok(Math.abs(orig.r - back.r) <= 1, `${name}: R mismatch ${orig.r} vs ${back.r}`);
      assert.ok(Math.abs(orig.g - back.g) <= 1, `${name}: G mismatch ${orig.g} vs ${back.g}`);
      assert.ok(Math.abs(orig.b - back.b) <= 1, `${name}: B mismatch ${orig.b} vs ${back.b}`);
      assert.ok(cs.deltaE00Hex(hex, roundTripped) < 0.5, `${name}: dE00 too large`);
    }
  });

  it('produces zero/near-zero chroma for achromatic neutrals and expected lightness bounds', () => {
    const black = cs.hexToOklch('#000000');
    const grey = cs.hexToOklch('#808080');
    const white = cs.hexToOklch('#FFFFFF');

    assert.ok(black.L < 1e-4 && black.C < 1e-4);
    assert.ok(grey.L > 0.5 && grey.L < 0.7 && grey.C < 1e-4);
    assert.ok(white.L > 0.999 && white.C < 1e-4);
  });

  it('gamut-maps out-of-gamut OKLCH inputs and handles oklchShift & oklchMix accurately', () => {
    const extremeInputs = [
      { L: 0.7, C: 0.5, h: 140 },
      { L: 0.5, C: 0.9, h: 25 },
      { L: 0.85, C: 0.45, h: 260 },
      { L: 0.25, C: 0.6, h: 320 },
      { L: 1.5, C: 0.3, h: 90 },
      { L: -0.2, C: 0.3, h: 90 },
      { L: 0.5, C: -0.1, h: 180 },
    ];

    for (const input of extremeInputs) {
      const hex = cs.oklchToHex(input);
      assert.match(hex, HEX6_RE, `Expected valid #RRGGBB for ${JSON.stringify(input)}, got ${hex}`);
    }

    assert.equal(cs.oklchToHex({ L: 0, C: 0.3, h: 120 }), '#000000');
    assert.equal(cs.oklchToHex({ L: 1, C: 0.3, h: 120 }), '#FFFFFF');

    const clamped = cs.oklchToHex({ L: 0.65, C: 0.6, h: 145 });
    const clampedLch = cs.hexToOklch(clamped);
    assert.ok(Math.abs(clampedLch.L - 0.65) < 0.03, `Expected L≈0.65, got ${clampedLch.L}`);

    const baseHex = '#33406E';
    const baseLch = cs.hexToOklch(baseHex);
    const lighterHex = cs.oklchShift(baseHex, { dL: 0.15 });
    const darkerHex = cs.oklchShift(baseHex, { dL: -0.15 });
    const wrappedHex = cs.oklchShift(baseHex, { dh: -300 });
    assert.match(lighterHex, HEX6_RE);
    assert.match(darkerHex, HEX6_RE);
    assert.match(wrappedHex, HEX6_RE);
    assert.ok(cs.hexToOklch(lighterHex).L > baseLch.L + 0.1, 'Expected +dL to lighten');
    assert.ok(cs.hexToOklch(darkerHex).L < baseLch.L - 0.1, 'Expected -dL to darken');
    const wrappedLch = cs.hexToOklch(wrappedHex);
    assert.ok(wrappedLch.h >= 0 && wrappedLch.h < 360, `Expected wrapped hue in [0,360), got ${wrappedLch.h}`);
    const expectedHue = ((baseLch.h - 300) % 360 + 360) % 360;
    const hueDiff = Math.min(Math.abs(wrappedLch.h - expectedHue), 360 - Math.abs(wrappedLch.h - expectedHue));
    assert.ok(hueDiff < 2.0, `Expected hue ≈ ${expectedHue.toFixed(1)}, got ${wrappedLch.h.toFixed(1)}`);

    const mixA = '#192E56';
    const mixB = '#F7F1EE';
    const mix0 = cs.oklchMix(mixA, mixB, 0);
    const mix1 = cs.oklchMix(mixA, mixB, 1);
    const mixMid = cs.oklchMix(mixA, mixB, 0.5);
    assert.ok(cs.deltaE00Hex(mix0, mixA) < 0.5, `Expected oklchMix(t=0) ≈ ${mixA}, got ${mix0}`);
    assert.ok(cs.deltaE00Hex(mix1, mixB) < 0.5, `Expected oklchMix(t=1) ≈ ${mixB}, got ${mix1}`);
    const lA = cs.hexToOklab(mixA).L;
    const lB = cs.hexToOklab(mixB).L;
    const lMid = cs.hexToOklab(mixMid).L;
    assert.ok(lMid > lA && lMid < lB, `Expected intermediate L between ${lA} and ${lB}, got ${lMid}`);
    assert.ok(Math.abs(lMid - 0.5 * (lA + lB)) < 0.02, `Expected L ≈ midpoint, got ${lMid}`);
  });
});

describe('color-science: hexToLab, deltaE76 & deltaE00Hex', () => {
  it('maps black, white, and neutral greys to expected CIE L*a*b* coordinates', () => {
    const black = cs.hexToLab('#000000');
    const white = cs.hexToLab('#FFFFFF');
    const grey = cs.hexToLab('#808080');

    assert.ok(Math.abs(black.L) < 1e-6 && Math.abs(black.a) < 1e-6 && Math.abs(black.b) < 1e-6);
    assert.ok(Math.abs(white.L - 100) < 0.05 && Math.abs(white.a) < 0.05 && Math.abs(white.b) < 0.05);
    assert.ok(grey.L > 50 && grey.L < 56 && Math.abs(grey.a) < 0.05 && Math.abs(grey.b) < 0.05);
  });

  it('satisfies identity (distance === 0 for identical colors)', () => {
    for (const hex of ['#000000', '#FFFFFF', '#A51C30', '#00356B', '#00693E', '#808080']) {
      const lab = cs.hexToLab(hex);
      assert.equal(cs.deltaE76(lab, lab), 0);
      assert.equal(cs.deltaE00Hex(hex, hex), 0);
    }
  });

  it('satisfies symmetry d(a, b) ≈ d(b, a) across hue quadrants and blue rotation zone', () => {
    const pairs = [
      ['#A51C30', '#00356B'],
      ['#BF5700', '#57068C'],
      ['#00693E', '#85642D'],
      ['#192E56', '#4B3A99'],
      ['#F7F1EE', '#1F1414'],
      ['#808080', '#9944AA'],
    ];

    for (const [a, b] of pairs) {
      const labA = cs.hexToLab(a);
      const labB = cs.hexToLab(b);
      assert.ok(Math.abs(cs.deltaE76(labA, labB) - cs.deltaE76(labB, labA)) < 1e-12);
      assert.ok(Math.abs(cs.deltaE00Hex(a, b) - cs.deltaE00Hex(b, a)) < 1e-10);
    }
  });

  it('orders perceptually similar colors closer than opposite colors and matches Sharma (2005) reference', () => {
    const base = '#2050A0';
    const nearby = '#2858A8';
    const opposite = '#E0B020';

    assert.ok(cs.deltaE76(cs.hexToLab(base), cs.hexToLab(nearby)) < cs.deltaE76(cs.hexToLab(base), cs.hexToLab(opposite)));
    assert.ok(cs.deltaE00Hex(base, nearby) < cs.deltaE00Hex(base, opposite));

    const d76BW = cs.deltaE76(cs.hexToLab('#000000'), cs.hexToLab('#FFFFFF'));
    const d00BW = cs.deltaE00Hex('#000000', '#FFFFFF');
    assert.ok(Math.abs(d76BW - 100) < 0.1, `Expected dE76(B,W) ≈ 100, got ${d76BW}`);
    assert.ok(d00BW > 95 && d00BW <= 105, `Expected dE00(B,W) ≈ 100, got ${d00BW}`);

    // Sharma, Wu & Dalal (2005) Table 1, Pair 1: reference dE00 = 2.0425.
    const sharmaPair1 = cs.ciede2000(
      { L: 50.0, a: 2.6772, b: -79.7751 },
      { L: 50.0, a: 0.0, b: -82.7485 }
    );
    assert.ok(Math.abs(sharmaPair1 - 2.0425) < 1e-3, `Expected ~2.0425, got ${sharmaPair1}`);
  });
});

describe('color-science: contrastRatio (WCAG 2.1) & apcaContrast', () => {
  it('returns 21 for pure white vs black, 1 for identical colors, and obeys symmetry & monotonicity', () => {
    assert.equal(cs.contrastRatio('#FFFFFF', '#000000'), 21);
    assert.equal(cs.contrastRatio('#000000', '#FFFFFF'), 21);
    for (const hex of ['#000000', '#FFFFFF', '#A51C30', '#808080', '#192E56']) {
      assert.equal(cs.contrastRatio(hex, hex), 1);
    }

    assert.equal(cs.contrastRatio('#1D1714', '#F7F1EE'), cs.contrastRatio('#F7F1EE', '#1D1714'));

    const ramp = ['#000000', '#262626', '#4D4D4D', '#737373', '#999999', '#BFBFBF', '#E6E6E6', '#FFFFFF'];
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(cs.contrastRatio(ramp[i], '#000000') > cs.contrastRatio(ramp[i - 1], '#000000'));
      assert.ok(cs.contrastRatio(ramp[i], '#FFFFFF') < cs.contrastRatio(ramp[i - 1], '#FFFFFF'));
    }
  });

  it('computes polarity-aware APCA Lc values with 0 for identical colors and |Lc| > 100 for black/white', () => {
    const darkOnLight = cs.apcaContrast('#1D1714', '#F7F1EE');
    const lightOnDark = cs.apcaContrast('#F0E0E0', '#1F1414');
    assert.ok(darkOnLight > 0);
    assert.ok(lightOnDark < 0);

    for (const hex of ['#000000', '#444444', '#808080', '#F7F1EE', '#FFFFFF']) {
      assert.equal(cs.apcaContrast(hex, hex), 0);
    }

    assert.ok(cs.apcaContrast('#000000', '#FFFFFF') > 100);
    assert.ok(cs.apcaContrast('#FFFFFF', '#000000') < -100);
  });

  it('readableTextOn selects accessible text and falls back to #000000/#FFFFFF when custom candidates fail', () => {
    for (const darkBg of ['#000000', '#192E56', '#A51C30', '#1F1414']) {
      assert.equal(cs.readableTextOn(darkBg), '#FAF8F5');
    }
    for (const lightBg of ['#FFFFFF', '#F7F1EE', '#F5E8C8', '#D6E8D0']) {
      assert.equal(cs.readableTextOn(lightBg), '#141418');
    }

    assert.equal(cs.readableTextOn('#101010', '#F0F0F0', '#202020'), '#F0F0F0');
    assert.equal(cs.readableTextOn('#F0F0F0', '#EEEEEE', '#111111'), '#111111');
    assert.equal(cs.readableTextOn('#777777', '#888888', '#666666'), '#000000');
    assert.equal(cs.readableTextOn('#757575', '#888888', '#666666'), '#FFFFFF');
  });
});

describe('color-science: simulateCvd', () => {
  const cvdTypes = ['protan', 'deutan', 'tritan'];

  it('returns valid #RRGGBB hex strings for protan, deutan, tritan and throws on unknown types', () => {
    const samples = ['#FF0000', '#00FF00', '#0000FF', '#A51C30', '#00356B', '#F7F1EE', '#000000', '#FFFFFF'];
    for (const type of cvdTypes) {
      for (const hex of samples) {
        assert.match(cs.simulateCvd(hex, type), HEX6_RE);
      }
    }
    assert.throws(() => cs.simulateCvd('#FF0000', 'unknown'), /Unknown CVD type/);
  });

  it('keeps pure achromatic grays neutral across all dichromacy matrices', () => {
    const grays = ['#000000', '#404040', '#808080', '#BFBFBF', '#FFFFFF'];
    for (const type of cvdTypes) {
      for (const gray of grays) {
        const sim = cs.simulateCvd(gray, type);
        const rgb = cs.hexToRgb(sim);
        const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
        assert.ok(spread <= 1, `${type} shifted neutral ${gray} -> ${sim} (spread ${spread})`);
      }
    }
  });

  it('compresses red/green distance under protan/deutan and blue/teal distance under tritan', () => {
    const red = '#C82820';
    const green = '#288C28';
    const normalDist = cs.deltaE76(cs.hexToLab(red), cs.hexToLab(green));

    for (const type of ['protan', 'deutan']) {
      const cvdDist = cs.deltaE76(
        cs.hexToLab(cs.simulateCvd(red, type)),
        cs.hexToLab(cs.simulateCvd(green, type))
      );
      assert.ok(cvdDist < normalDist * 0.5, `Expected ${type} to compress red/green distance`);
    }

    const blue = '#2868D8';
    const teal = '#209878';
    const normalTritan = cs.deltaE76(cs.hexToLab(blue), cs.hexToLab(teal));
    const tritanDist = cs.deltaE76(
      cs.hexToLab(cs.simulateCvd(blue, 'tritan')),
      cs.hexToLab(cs.simulateCvd(teal, 'tritan'))
    );
    assert.ok(tritanDist < normalTritan * 0.5, 'Expected tritan to compress blue/teal distance');
  });
});

describe('color-science: auditPalette across all 120 shipped palettes', () => {
  it('has zero monochrome exemptions (all 120 themes are fully polychromatic)', () => {
    assert.equal(cs.MONOCHROME_EXEMPT_SLUGS.size, 0);
  });

  it('passes with 0 errors, 0 warnings, valid brandUrl, and severeCvdCount === 0 across all 120 palettes', () => {
    const allPalettes = loadAllPalettes();
    assert.equal(allPalettes.size, 120);

    let lightCount = 0;
    let darkCount = 0;
    for (const [slug, palette] of allPalettes.entries()) {
      if (palette.tokens.mode === 'light') lightCount++;
      if (palette.tokens.mode === 'dark') darkCount++;

      assert.ok(
        typeof palette.brandUrl === 'string' && /^https:\/\/[^\s]+$/i.test(palette.brandUrl),
        `${slug} missing valid https:// brandUrl: ${palette.brandUrl}`
      );

      const result = cs.auditPalette(palette);
      assert.equal(result.slug, slug);
      assert.deepEqual(result.errors, [], `${slug} errors: ${result.errors.join('; ')}`);
      assert.deepEqual(result.warnings, [], `${slug} warnings: ${result.warnings.join('; ')}`);
      assert.ok(result.metrics.fgBg >= 7.0, `${slug} fgBg ${result.metrics.fgBg} < 7.0`);
      assert.ok(result.metrics.fgLc >= 70, `${slug} fgLc ${result.metrics.fgLc} < 70`);
      assert.ok(result.metrics.commentBg >= 4.5, `${slug} commentBg ${result.metrics.commentBg} < 4.5`);
      assert.ok(result.metrics.minSyntaxCr >= 4.5, `${slug} minSyntaxCr ${result.metrics.minSyntaxCr} < 4.5`);
      assert.equal(result.metrics.severeCvdCount, 0, `${slug} severeCvdCount should be 0`);
    }

    assert.equal(lightCount, 60);
    assert.equal(darkCount, 60);
  });

  it('rejects synthetic palettes violating each WCAG, APCA, ANSI, CIEDE2000 & surface gate', () => {
    const lowContrast = clonePalette(loadPalette('harvard-light'));
    lowContrast.slug = 'synthetic-low-contrast';
    lowContrast.tokens.fg = '#E5DFDC';
    const lowRes = cs.auditPalette(lowContrast);
    assert.ok(lowRes.errors.some((m) => m.includes('primary fg/bg contrast') && m.includes('< 7:1')));
    assert.ok(lowRes.errors.some((m) => m.includes('APCA |Lc|')));

    const weakComment = clonePalette(loadPalette('harvard-light'));
    weakComment.slug = 'synthetic-weak-comment';
    weakComment.tokens.fgComment = '#A8A09C';
    assert.ok(
      cs.auditPalette(weakComment).errors.some((m) => m.includes('fgComment/bg contrast') && m.includes('< 4.5:1'))
    );

    const loudComment = clonePalette(loadPalette('harvard-light'));
    loudComment.slug = 'synthetic-loud-comment';
    loudComment.tokens.fgComment = loudComment.tokens.fg;
    assert.ok(cs.auditPalette(loudComment).errors.some((m) => m.includes('too close in salience')));

    const badBgLine = clonePalette(loadPalette('harvard-light'));
    badBgLine.slug = 'synthetic-bad-bgline';
    badBgLine.tokens.bgLine = '#989490';
    assert.ok(cs.auditPalette(badBgLine).errors.some((m) => m.includes('on bgLine') && m.includes('< 3.8:1')));

    const badAnsiCr = clonePalette(loadPalette('harvard-light'));
    badAnsiCr.slug = 'synthetic-bad-ansi-cr';
    badAnsiCr.tokens.ansi.red = '#D89690';
    assert.ok(cs.auditPalette(badAnsiCr).errors.some((m) => m.includes('ansi.red') && m.includes('contrast')));

    const badAnsiHue = clonePalette(loadPalette('harvard-light'));
    badAnsiHue.slug = 'synthetic-bad-ansi-hue';
    badAnsiHue.tokens.ansi.red = '#0055AA';
    assert.ok(
      cs.auditPalette(badAnsiHue).errors.some((m) => m.includes('ansi.red') && m.includes('drifted outside canonical'))
    );

    const dupPair = clonePalette(loadPalette('harvard-light'));
    dupPair.slug = 'synthetic-dup-pair';
    dupPair.tokens.accentStorage = dupPair.tokens.accentKeyword;
    assert.ok(cs.auditPalette(dupPair).errors.some((m) => m.includes('share identical hex')));

    const nearPair = clonePalette(loadPalette('harvard-light'));
    nearPair.slug = 'synthetic-near-pair';
    nearPair.tokens.accentStorage = cs.oklchShift(nearPair.tokens.accentKeyword, { dL: 0.01 });
    assert.ok(
      cs.auditPalette(nearPair).errors.some((m) => m.includes('too close in normal vision') && m.includes('< 8.5'))
    );

    const weakSyntax = clonePalette(loadPalette('harvard-light'));
    weakSyntax.slug = 'synthetic-weak-syntax';
    weakSyntax.tokens.accentString = '#CC6A4B';
    assert.ok(
      cs.auditPalette(weakSyntax).errors.some((m) => m.includes('accentString (#CC6A4B) on bg') && m.includes('< 4.5:1 WCAG AA'))
    );

    const badSidebar = clonePalette(loadPalette('harvard-light'));
    badSidebar.slug = 'synthetic-bad-sidebar';
    badSidebar.tokens.bgSidebar = '#5A5A5E';
    assert.ok(
      cs.auditPalette(badSidebar).errors.some((m) => m.includes('sidebar fg/bgSidebar contrast') && m.includes('< 4.5:1'))
    );

    const badActivity = clonePalette(loadPalette('harvard-light'));
    badActivity.slug = 'synthetic-bad-activity';
    badActivity.tokens.bgActivity = '#78787C';
    assert.ok(
      cs.auditPalette(badActivity).errors.some((m) => m.includes('inactive tab fgSecondary/bgActivity contrast') && m.includes('< 3.5:1'))
    );
  });

  it('rejects severe CVD collisions (< 5.0 dE*ab) and flags moderate CVD compression (< 10.0 dE*ab)', () => {
    const cvdCollision = clonePalette(loadPalette('harvard-light'));
    cvdCollision.slug = 'synthetic-cvd-collision';
    cvdCollision.tokens.accentKeyword = '#8F3214';
    cvdCollision.tokens.accentString = '#465900';

    const sevRes = cs.auditPalette(cvdCollision);
    assert.ok(sevRes.metrics.severeCvdCount >= 1);
    assert.ok(
      sevRes.errors.some(
        (m) => m.includes('severe deutan collision') && m.includes('accentKeyword') && m.includes('accentString')
      ),
      `Expected severe deutan collision error, got: ${sevRes.errors.join(' | ')}`
    );

    // Moderate protan compression boundary on harvard-light: dE76 = 8.4 < 10.0
    const moderate = clonePalette(loadPalette('harvard-light'));
    moderate.slug = 'synthetic-moderate-cvd';
    moderate.tokens.accentString = '#8F2B11';
    const modRes = cs.auditPalette(moderate);
    assert.deepEqual(modRes.errors, [], `Unexpected errors: ${modRes.errors.join(' | ')}`);
    assert.equal(modRes.metrics.severeCvdCount, 0);
    assert.equal(modRes.warnings.length, 1);
    assert.ok(
      modRes.warnings[0].includes('moderate protan compression') &&
        modRes.warnings[0].includes('accentString/accentNumber'),
      `Unexpected warning text: ${modRes.warnings[0]}`
    );

    // Clear boundary control: dE76 >= 10.0
    const clear = clonePalette(loadPalette('harvard-light'));
    clear.slug = 'synthetic-cvd-clear';
    clear.tokens.accentString = '#8C2F0A';
    const clearRes = cs.auditPalette(clear);
    assert.deepEqual(clearRes.errors, []);
    assert.deepEqual(clearRes.warnings, []);
  });
});
