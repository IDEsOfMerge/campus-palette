#!/usr/bin/env node
'use strict';

// Dev-only tool: renders compact 7-chip multi-color PNG palette strips (zero
// dependencies, pure Node + zlib) for all 80 Campus Palette themes into
// assets/swatches/<slug>.png for use in README.md catalog tables (VS Code
// Marketplace / vsce restricts local SVGs in README.md, so PNG strips ensure
// crisp rendering across GitHub, VS Code Marketplace, and Open VSX).
// Cleans stale swatch files first so renamed or removed themes never linger.
// Run with: node scripts/generate-swatches.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PALETTES_DIR = path.join(__dirname, '..', 'palettes');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'swatches');

const CHIP_KEYS = [
  'bg',
  'accentKeyword',
  'accentString',
  'accentFunction',
  'accentType',
  'accentNumber',
  'accentStatusBar',
];
const CHIP_WIDTH = 22;
const WIDTH = CHIP_KEYS.length * CHIP_WIDTH; // 154
const HEIGHT = 20;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function makeSwatchPng(palette) {
  const t = palette.tokens;
  const rgbs = CHIP_KEYS.map((k) => parseHex(t[k]));

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(WIDTH, 0);
  ihdrData.writeUInt32BE(HEIGHT, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const rowBytes = 1 + WIDTH * 4;
  const raw = Buffer.alloc(rowBytes * HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0;
    for (let x = 0; x < WIDTH; x++) {
      const px = rowStart + 1 + x * 4;
      // 3px rounded corner cutout for crisp pill edges
      const dx = Math.min(x, WIDTH - 1 - x);
      const dy = Math.min(y, HEIGHT - 1 - y);
      if ((dx === 0 && dy <= 1) || (dy === 0 && dx <= 1)) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      const chipIdx = Math.min(rgbs.length - 1, Math.floor(x / CHIP_WIDTH));
      let [r, g, b] = rgbs[chipIdx];

      // Subtle 1px neutral frame on outer perimeter so Light canvases stay crisp on white pages
      const isBorder =
        x === 0 || x === WIDTH - 1 || y === 0 || y === HEIGHT - 1 || (dx === 1 && dy === 1);
      if (isBorder) {
        const a = 0.34;
        r = Math.round(r * (1 - a) + 128 * a);
        g = Math.round(g * (1 - a) + 128 * a);
        b = Math.round(b * (1 - a) + 128 * a);
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const idat = chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function main() {
  const files = fs.readdirSync(PALETTES_DIR).filter((f) => f.endsWith('.js')).sort();
  const palettes = files.map((f) => require(path.join(PALETTES_DIR, f)));

  if (fs.existsSync(OUT_DIR)) {
    for (const existing of fs.readdirSync(OUT_DIR)) {
      if (existing.endsWith('.svg') || existing.endsWith('.png')) {
        fs.unlinkSync(path.join(OUT_DIR, existing));
      }
    }
  } else {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  let count = 0;
  for (const p of palettes) {
    fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.png`), makeSwatchPng(p));
    count++;
  }
  console.log(`Generated ${count} palette swatch PNGs in ${path.relative(process.cwd(), OUT_DIR)}`);
}

if (require.main === module) {
  main();
}

module.exports = { makeSwatchPng, CHIP_KEYS, main };
