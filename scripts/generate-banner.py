#!/usr/bin/env python3
"""
Programmatically renders the Campus Palette README architectural banners and
Open Graph preview card from pure geometric SVG vectors:
  - assets/banner/banner-dark.png   (1920x616 @ 2x Retina)
  - assets/banner/banner-light.png  (1920x616 @ 2x Retina)
  - site/og-preview.png             (1200x630 Open Graph social preview)

100% original geometric vector art & live OKLCH collegiate spectral swatch
ribbons derived directly from palettes/*.js — zero university logos or crests.

Run with: python3 scripts/generate-banner.py
"""

import json
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "banner")
SITE_DIR = os.path.join(ROOT, "site")

FONT_MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace"
FONT_SANS = "'DejaVu Sans', 'Liberation Sans', sans-serif"

BLOCK_FONT = {
    "C": ["01111", "10000", "10000", "10000", "01111"],
    "A": ["01110", "10001", "11111", "10001", "10001"],
    "M": ["10001", "11011", "10101", "10001", "10001"],
    "P": ["11110", "10001", "11110", "10000", "10000"],
    "U": ["10001", "10001", "10001", "10001", "01110"],
    "S": ["01111", "10000", "01110", "00001", "11110"],
    "L": ["10000", "10000", "10000", "10000", "11111"],
    "E": ["11111", "10000", "11110", "10000", "11111"],
    "T": ["11111", "00100", "00100", "00100", "00100"],
}


def load_spectral_ribbons():
    """Load all 40 university signature accents sorted by OKLCH hue for Light & Dark."""
    js = r"""
    const fs = require('fs');
    const path = require('path');
    const cs = require('./scripts/color-science');
    const dir = path.join(process.cwd(), 'palettes');
    const out = { dark: [], light: [] };
    for (const mode of ['dark', 'light']) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith(`-${mode}.js`)).sort();
      const items = files.map(f => {
        const p = require(path.join(dir, f));
        // Prefer cursor accent when chromatic, else keyword accent
        const cCur = cs.hexToOklch(p.tokens.accentCursor);
        const cKw = cs.hexToOklch(p.tokens.accentKeyword);
        const hex = (cCur.C >= 0.05 ? p.tokens.accentCursor : p.tokens.accentKeyword).toUpperCase();
        const lch = cs.hexToOklch(hex);
        return { slug: p.slug, shortName: p.shortName, hex, h: lch.h, C: lch.C, L: lch.L };
      });
      items.sort((a, b) => a.h - b.h);
      out[mode] = items;
    }
    console.log(JSON.stringify(out));
    """
    raw = subprocess.check_output(["node", "-e", js], cwd=ROOT, text=True)
    return json.loads(raw)


def render_ansi_word(word, x_center, y_top, cell_w, cell_h, fill, shadow_stroke, gap=1.55):
    """Render architectural pixel-slab lettering with geometric right/bottom shadow edges."""
    widths = [len(BLOCK_FONT[ch][0]) for ch in word]
    total_units = sum(widths) + gap * (len(word) - 1)
    start_x = x_center - (total_units * cell_w) / 2.0

    rects = []
    shadows = []
    cursor_u = 0.0
    for ch in word:
        grid = BLOCK_FONT[ch]
        rows, cols = len(grid), len(grid[0])
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1":
                    rx = start_x + (cursor_u + c) * cell_w
                    ry = y_top + r * cell_h
                    rects.append(
                        f'    <rect x="{rx:.1f}" y="{ry:.1f}" '
                        f'width="{cell_w + 0.45:.2f}" height="{cell_h + 0.45:.2f}" fill="{fill}"/>'
                    )
                    right_empty = (c + 1 == cols) or (grid[r][c + 1] == "0")
                    bot_empty = (r + 1 == rows) or (grid[r + 1][c] == "0")
                    if right_empty:
                        shadows.append(
                            f'    <line x1="{rx + cell_w + 2.5:.1f}" y1="{ry + 1.5:.1f}" '
                            f'x2="{rx + cell_w + 2.5:.1f}" y2="{ry + cell_h + 2.5:.1f}" '
                            f'stroke="{shadow_stroke}" stroke-width="1.6"/>'
                        )
                    if bot_empty:
                        shadows.append(
                            f'    <line x1="{rx + 1.5:.1f}" y1="{ry + cell_h + 2.5:.1f}" '
                            f'x2="{rx + cell_w + 2.5:.1f}" y2="{ry + cell_h + 2.5:.1f}" '
                            f'stroke="{shadow_stroke}" stroke-width="1.6"/>'
                        )
        cursor_u += cols + gap
    return "\n".join(shadows + rects)


def render_ribbon_strip(items, x0, y0, total_w, h, gap=1.6, radius=1.5):
    n = len(items)
    w = (total_w - gap * (n - 1)) / n
    parts = []
    for i, it in enumerate(items):
        rx = x0 + i * (w + gap)
        parts.append(
            f'    <rect x="{rx:.2f}" y="{y0:.1f}" width="{w:.2f}" height="{h:.1f}" '
            f'rx="{radius}" fill="{it["hex"]}"/>'
        )
    return "\n".join(parts)


def build_architectural_grid(w, h, step, color, opacity):
    lines = []
    for x in range(step, w, step):
        lines.append(f'    <line x1="{x}" y1="0" x2="{x}" y2="{h}"/>')
    for y in range(step, h, step):
        lines.append(f'    <line x1="0" y1="{y}" x2="{w}" y2="{y}"/>')
    return (
        f'  <g stroke="{color}" stroke-width="0.7" opacity="{opacity:.2f}">\n'
        + "\n".join(lines)
        + "\n  </g>"
    )


def build_banner_svg(mode: str, ribbons: dict) -> str:
    is_dark = mode == "dark"
    bg         = "#0B1220" if is_dark else "#F6F4EF"
    grid_c     = "#334466" if is_dark else "#B8B2A6"
    frame_c    = "#5A6B88" if is_dark else "#6B675E"
    inner_c    = "#354460" if is_dark else "#A09A8E"
    brass_c    = "#D8B362" if is_dark else "#9A6B16"

    top_accent = "#7EC6EA" if is_dark else "#1D4F91"
    bot_accent = "#EAB938" if is_dark else "#9A6700"
    shield_l   = "#EBE4D6" if is_dark else "#EFEAE0"
    shield_r   = "#172B4F" if is_dark else "#192E56"

    word_top   = "#F3EFE6" if is_dark else "#162136"
    word_sh1   = "#5AA9E6" if is_dark else "#1D4F91"
    word_bot   = "#F0DFB8" if is_dark else "#2B2218"
    word_sh2   = "#C99A2E" if is_dark else "#A86F10"
    text_c     = "#D8E1EE" if is_dark else "#1F2633"
    muted_c    = "#8B99B0" if is_dark else "#555D6B"

    L, T, R, B = 16, 14, 944, 294
    DIV_X = 216
    MID_Y = 132
    BOT_Y = 238
    D = 4
    cx = (L + DIV_X) / 2.0  # 116.0

    # Upper-left emblem: Crisp geometric split heater shield with 5 collegiate ribbon bars
    scx, scy = cx, 84.0
    sh_path = (
        f"M {scx - 32:.1f},{scy - 35:.1f} Q {scx:.1f},{scy - 39:.1f} {scx + 32:.1f},{scy - 35:.1f} "
        f"L {scx + 32:.1f},{scy - 4:.1f} Q {scx + 30:.1f},{scy + 24:.1f} {scx:.1f},{scy + 38:.1f} "
        f"Q {scx - 30:.1f},{scy + 24:.1f} {scx - 32:.1f},{scy - 4:.1f} Z"
    )
    clip_l = f"{scx - 36:.1f},{scy - 42:.1f} {scx + 3:.1f},{scy - 42:.1f} {scx - 4:.1f},{scy + 42:.1f} {scx - 36:.1f},{scy + 42:.1f}"
    clip_r = f"{scx + 3:.1f},{scy - 42:.1f} {scx + 36:.1f},{scy - 42:.1f} {scx + 36:.1f},{scy + 42:.1f} {scx - 4:.1f},{scy + 42:.1f}"
    mini_bars = [
        ("#C81E38", -21.5),
        ("#F2B41A", -12.5),
        ("#169454",  -3.5),
        ("#7EC6EA",   5.5),
        ("#1D63B8",  14.5),
    ]
    bars_svg = "\n".join(
        f'    <rect x="{scx + dx:.1f}" y="{scy - 22:.1f}" width="7.0" height="12.5" rx="1.6" fill="{col}"/>'
        for col, dx in mini_bars
    )
    shield_svg = f'''    <clipPath id="sh-clip-{mode}"><path d="{sh_path}"/></clipPath>
    <g clip-path="url(#sh-clip-{mode})">
      <polygon points="{clip_l}" fill="{shield_l}"/>
      <polygon points="{clip_r}" fill="{shield_r}"/>
      <line x1="{scx + 3:.1f}" y1="{scy - 42:.1f}" x2="{scx - 4:.1f}" y2="{scy + 42:.1f}" stroke="{brass_c}" stroke-width="1.2"/>
    </g>
    <rect x="{scx - 24.5:.1f}" y="{scy - 24.5:.1f}" width="49.0" height="17.5" rx="3" fill="#101828" stroke="{brass_c}" stroke-width="0.9"/>
{bars_svg}
    <path d="M {scx - 19:.1f},{scy + 3:.1f} Q {scx - 10:.1f},{scy - 2:.1f} {scx - 1:.1f},{scy + 3:.1f} L {scx - 1:.1f},{scy + 21:.1f} Q {scx - 10:.1f},{scy + 16:.1f} {scx - 19:.1f},{scy + 21:.1f} Z" fill="{shield_r}" stroke="{brass_c}" stroke-width="0.9"/>
    <path d="M {scx + 1:.1f},{scy + 3:.1f} Q {scx + 10:.1f},{scy - 2:.1f} {scx + 19:.1f},{scy + 3:.1f} L {scx + 19:.1f},{scy + 21:.1f} Q {scx + 10:.1f},{scy + 16:.1f} {scx + 1:.1f},{scy + 21:.1f} Z" fill="{shield_l}" stroke="{brass_c}" stroke-width="0.9"/>
    <path d="{sh_path}" fill="none" stroke="{brass_c}" stroke-width="2.0" stroke-linejoin="round"/>'''

    # Lower-left emblem: Geometric OKLCH chromatic rosette + open academic folio
    bcy = 179.0
    sw_cols = ["#E03C4C", "#F5B82E", "#2CC57C", "#57B7E7", "#8B7DF8"]
    dots_svg = []
    for i, col in enumerate(sw_cols):
        dx = (i - 2) * 24.0
        dy = -16.0 + abs(i - 2) * 6.0
        dots_svg.append(
            f'    <line x1="{cx + dx:.1f}" y1="{bcy + dy:.1f}" x2="{cx:.1f}" y2="{bcy + 16:.1f}" stroke="{inner_c}" stroke-width="1.2"/>'
        )
    for i, col in enumerate(sw_cols):
        dx = (i - 2) * 24.0
        dy = -16.0 + abs(i - 2) * 6.0
        dots_svg.append(
            f'    <circle cx="{cx + dx:.1f}" cy="{bcy + dy:.1f}" r="8.2" fill="{col}" stroke="{bg}" stroke-width="2.0"/>'
        )
    dots_svg.append(
        f'    <polygon points="{cx:.1f},{bcy + 6:.1f} {cx + 12:.1f},{bcy + 16:.1f} {cx:.1f},{bcy + 26:.1f} {cx - 12:.1f},{bcy + 16:.1f}" fill="{brass_c}" stroke="{bg}" stroke-width="1.8"/>'
    )
    lower_svg = "\n".join(dots_svg)

    right_cx = (DIV_X + R) / 2.0
    word_campus = render_ansi_word("CAMPUS", right_cx, 50, 14.5, 11.4, word_top, word_sh1)
    word_palette = render_ansi_word("PALETTE", right_cx, 148, 13.8, 11.2, word_bot, word_sh2)

    ribbon_svg = render_ribbon_strip(
        ribbons[mode],
        x0=DIV_X + 20,
        y0=221.0,
        total_w=(R - D) - (DIV_X + 20) - 16,
        h=7.5,
        gap=1.8,
        radius=1.5,
    )

    grid_svg = build_architectural_grid(960, 308, 32, grid_c, 0.22 if is_dark else 0.16)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 308" width="960" height="308">
  <rect width="960" height="308" rx="10" fill="{bg}"/>
{grid_svg}

  <g fill="none">
    <rect x="{L}" y="{T}" width="{R - L}" height="{B - T}" stroke="{frame_c}" stroke-width="1.6"/>
    <rect x="{L + D}" y="{T + D}" width="{R - L - 2*D}" height="{B - T - 2*D}" stroke="{frame_c}" stroke-width="1.5"/>
    <line x1="{DIV_X}" y1="{T + D}" x2="{DIV_X}" y2="{BOT_Y}" stroke="{inner_c}" stroke-width="1.5"/>
    <line x1="{L + D}" y1="{MID_Y}" x2="{R - D}" y2="{MID_Y}" stroke="{inner_c}" stroke-width="1.4"/>
    <line x1="{L + D}" y1="{BOT_Y}" x2="{R - D}" y2="{BOT_Y}" stroke="{frame_c}" stroke-width="1.6"/>
    <line x1="{L + D}" y1="{BOT_Y + D}" x2="{R - D}" y2="{BOT_Y + D}" stroke="{frame_c}" stroke-width="1.5"/>
    <!-- Subtle architectural corner registration brackets -->
    <path d="M {L+12},{T+12} H {L+24} M {L+12},{T+12} V {T+24}" stroke="{brass_c}" stroke-width="1.4"/>
    <path d="M {R-12},{T+12} H {R-24} M {R-12},{T+12} V {T+24}" stroke="{brass_c}" stroke-width="1.4"/>
  </g>

  <text x="{cx}" y="35" text-anchor="middle" font-family="{FONT_MONO}" font-size="11.5" font-weight="700" letter-spacing="1.6" fill="{top_accent}">── SHIELD ──</text>
  <g>
{shield_svg}
  </g>
  <g>
{lower_svg}
  </g>
  <text x="{cx}" y="229" text-anchor="middle" font-family="{FONT_MONO}" font-size="11.5" font-weight="700" letter-spacing="1.6" fill="{bot_accent}">── OKLCH ──</text>

  <text x="{right_cx}" y="35" text-anchor="middle" font-family="{FONT_MONO}" font-size="12.2" font-weight="700" letter-spacing="1.8" fill="{top_accent}">──── COLLEGIATE COLORIMETRY · 1096–1963 ────</text>
  <g>
{word_campus}
  </g>
  <g>
{word_palette}
  </g>
  <g>
{ribbon_svg}
  </g>

  <text x="480" y="262" text-anchor="middle" font-family="{FONT_MONO}" font-size="12.5" font-weight="700" letter-spacing="1.2" fill="{text_c}">40 UNIVERSITIES  ·  80 LIGHT &amp; DARK THEMES  ·  VS CODE / POSITRON</text>
  <text x="480" y="280" text-anchor="middle" font-family="{FONT_MONO}" font-size="11.8" font-weight="500" letter-spacing="1.15" fill="{muted_c}">OKLCH COLORIMETRY  ·  100% WCAG AA  ·  APCA-W3  ·  CIEDE2000  ·  CVD SAFE</text>
</svg>
'''


def build_og_preview_svg(ribbons: dict) -> str:
    """Dedicated 1200x630 Open Graph preview card for GitHub Pages / social sharing."""
    W, H = 1200, 630
    bg = "#0A111F"
    card_bg = "#0F192D"
    frame_c = "#4E6284"
    inner_c = "#2B3B59"
    brass = "#DFBA68"
    sky = "#7EC6EA"
    text_hi = "#F4F0E7"
    text_mid = "#CBD5E6"
    text_mut = "#8C9BB5"

    grid_svg = build_architectural_grid(W, H, 40, "#31466E", 0.24)

    # Large crisp geometric split shield + open book emblem on left side (cx=226, cy=275)
    scx, scy = 226.0, 275.0
    sh_path = (
        f"M {scx - 102:.1f},{scy - 114:.1f} Q {scx:.1f},{scy - 126:.1f} {scx + 102:.1f},{scy - 114:.1f} "
        f"L {scx + 102:.1f},{scy - 14:.1f} Q {scx + 96:.1f},{scy + 76:.1f} {scx:.1f},{scy + 124:.1f} "
        f"Q {scx - 96:.1f},{scy + 76:.1f} {scx - 102:.1f},{scy - 14:.1f} Z"
    )
    clip_l = f"{scx - 116:.1f},{scy - 135:.1f} {scx + 10:.1f},{scy - 135:.1f} {scx - 14:.1f},{scy + 135:.1f} {scx - 116:.1f},{scy + 135:.1f}"
    clip_r = f"{scx + 10:.1f},{scy - 135:.1f} {scx + 116:.1f},{scy - 135:.1f} {scx + 116:.1f},{scy + 135:.1f} {scx - 14:.1f},{scy + 135:.1f}"

    ribbon5 = [
        ("#C81E38", -72.0),
        ("#F2B41A", -42.0),
        ("#169454", -12.0),
        ("#7EC6EA",  18.0),
        ("#1D63B8",  48.0),
    ]
    bars5_svg = "\n".join(
        f'    <rect x="{scx + dx:.1f}" y="{scy - 76:.1f}" width="24" height="36" rx="4.5" fill="{col}"/>'
        for col, dx in ribbon5
    )

    emblem_svg = f'''  <defs>
    <clipPath id="og-sh-clip"><path d="{sh_path}"/></clipPath>
    <radialGradient id="og-glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#3E6BB3" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#0A111F" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="{scx:.0f}" cy="{scy:.0f}" r="180" fill="url(#og-glow)"/>
  <g clip-path="url(#og-sh-clip)">
    <polygon points="{clip_l}" fill="#EFEAE0"/>
    <polygon points="{clip_r}" fill="#142648"/>
    <line x1="{scx + 10:.1f}" y1="{scy - 135:.1f}" x2="{scx - 14:.1f}" y2="{scy + 135:.1f}" stroke="{brass}" stroke-width="2.5"/>
  </g>
  <rect x="{scx - 79:.1f}" y="{scy - 83:.1f}" width="158" height="50" rx="8" fill="#0E1728" stroke="{brass}" stroke-width="1.8"/>
{bars5_svg}
  <line x1="{scx - 78:.1f}" y1="{scy - 19:.1f}" x2="{scx + 78:.1f}" y2="{scy - 19:.1f}" stroke="{brass}" stroke-width="2.2" stroke-linecap="round"/>
  <!-- Bookmark ribbon tail -->
  <polygon points="{scx - 9:.1f},{scy + 52:.1f} {scx + 9:.1f},{scy + 52:.1f} {scx + 9:.1f},{scy + 96:.1f} {scx:.1f},{scy + 85:.1f} {scx - 9:.1f},{scy + 96:.1f}" fill="#C81E38"/>
  <!-- Open book -->
  <path d="M {scx - 64:.1f},{scy + 4:.1f} Q {scx - 32:.1f},{scy - 12:.1f} {scx - 3:.1f},{scy + 5:.1f} L {scx - 3:.1f},{scy + 68:.1f} Q {scx - 32:.1f},{scy + 52:.1f} {scx - 64:.1f},{scy + 68:.1f} Z" fill="#172B50" stroke="{brass}" stroke-width="2.0"/>
  <path d="M {scx + 3:.1f},{scy + 5:.1f} Q {scx + 32:.1f},{scy - 12:.1f} {scx + 64:.1f},{scy + 4:.1f} L {scx + 64:.1f},{scy + 68:.1f} Q {scx + 32:.1f},{scy + 52:.1f} {scx + 3:.1f},{scy + 68:.1f} Z" fill="#F4EFE6" stroke="{brass}" stroke-width="2.0"/>
  <!-- Book incised lines -->
  <line x1="{scx - 52:.1f}" y1="{scy + 20:.1f}" x2="{scx - 16:.1f}" y2="{scy + 18:.1f}" stroke="#7EC6EA" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="{scx - 52:.1f}" y1="{scy + 34:.1f}" x2="{scx - 14:.1f}" y2="{scy + 32:.1f}" stroke="#F2B41A" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="{scx - 52:.1f}" y1="{scy + 48:.1f}" x2="{scx - 22:.1f}" y2="{scy + 46:.1f}" stroke="#D8E2F0" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="{scx + 16:.1f}" y1="{scy + 18:.1f}" x2="{scx + 52:.1f}" y2="{scy + 20:.1f}" stroke="#1D4F91" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="{scx + 14:.1f}" y1="{scy + 32:.1f}" x2="{scx + 52:.1f}" y2="{scy + 34:.1f}" stroke="#C81E38" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="{scx + 22:.1f}" y1="{scy + 46:.1f}" x2="{scx + 52:.1f}" y2="{scy + 48:.1f}" stroke="#167C47" stroke-width="3.2" stroke-linecap="round"/>
  <path d="{sh_path}" fill="none" stroke="{brass}" stroke-width="5.5" stroke-linejoin="round"/>'''

    rx = 766.0
    word_campus = render_ansi_word("CAMPUS", rx, 146, 16.4, 14.0, text_hi, "#5AA9E6", gap=1.5)
    word_palette = render_ansi_word("PALETTE", rx, 256, 15.2, 13.6, "#F2E2BC", "#C99A2E", gap=1.5)

    # Full-width 40-university OKLCH spectral ribbon across lower band
    ribbon_full = render_ribbon_strip(ribbons["dark"], x0=64, y0=506, total_w=1072, h=28, gap=3.0, radius=3.0)

    pills = [
        ("1,600/1,600 WCAG AA", "#56D39A", "#102821", "#246B4F"),
        ("0 CVD WARNINGS",      "#7EC6EA", "#102133", "#2A5E8C"),
        ("12,160 POSITRON KEYS","#DFBA68", "#261E11", "#785D22"),
    ]
    pill_widths = [len(txt) * 8.4 + 28.0 for txt, _, _, _ in pills]
    total_pills_w = sum(pill_widths) + 16.0 * (len(pills) - 1)
    px = rx - total_pills_w / 2.0
    pill_parts = []
    for (txt, fg_c, bg_c, bd_c), pw in zip(pills, pill_widths):
        pill_parts.append(
            f'  <rect x="{px:.1f}" y="410" width="{pw:.1f}" height="32" rx="16" fill="{bg_c}" stroke="{bd_c}" stroke-width="1.3"/>\n'
            f'  <text x="{px + pw / 2:.1f}" y="430.5" text-anchor="middle" font-family="{FONT_MONO}" font-size="12.5" font-weight="700" fill="{fg_c}">{txt}</text>'
        )
        px += pw + 16.0

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="{bg}"/>
{grid_svg}

  <!-- Double architectural frame -->
  <rect x="24" y="24" width="{W - 48}" height="{H - 48}" rx="16" fill="{card_bg}" fill-opacity="0.72" stroke="{frame_c}" stroke-width="1.8"/>
  <rect x="32" y="32" width="{W - 64}" height="{H - 64}" rx="12" fill="none" stroke="{inner_c}" stroke-width="1.4"/>
  <line x1="396" y1="68" x2="396" y2="462" stroke="{inner_c}" stroke-width="1.4"/>
  <line x1="64" y1="478" x2="1136" y2="478" stroke="{inner_c}" stroke-width="1.4"/>

{emblem_svg}

  <text x="{rx:.0f}" y="108" text-anchor="middle" font-family="{FONT_MONO}" font-size="16" font-weight="700" letter-spacing="2.6" fill="{sky}">──── COLLEGIATE COLORIMETRY · 1096–1963 ────</text>
  <g>
{word_campus}
  </g>
  <g>
{word_palette}
  </g>
  <text x="{rx:.0f}" y="382" text-anchor="middle" font-family="{FONT_MONO}" font-size="16.2" font-weight="700" letter-spacing="1.4" fill="{text_mid}">40 UNIVERSITIES · 80 LIGHT &amp; DARK THEMES · VS CODE / POSITRON</text>
{chr(10).join(pill_parts)}

  <g>
{ribbon_full}
  </g>
  <text x="600" y="564" text-anchor="middle" font-family="{FONT_MONO}" font-size="13.5" font-weight="600" letter-spacing="1.4" fill="{text_mut}">OKLCH SPECTRAL RIBBON · 40 UNIVERSITIES ACROSS 6 COLLEGIATE GROUPINGS · APCA-W3 · CIEDE2000</text>
</svg>
'''


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(SITE_DIR, exist_ok=True)
    ribbons = load_spectral_ribbons()

    with tempfile.TemporaryDirectory() as tmpdir:
        for mode in ("dark", "light"):
            svg_path = os.path.join(tmpdir, f"banner-{mode}.svg")
            png_path = os.path.join(OUT_DIR, f"banner-{mode}.png")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(build_banner_svg(mode, ribbons))
            subprocess.run(
                ["rsvg-convert", "-w", "1920", "-h", "616", svg_path, "-o", png_path],
                check=True,
            )
            size_kb = os.path.getsize(png_path) / 1024.0
            print(f"Generated {os.path.relpath(png_path, ROOT)} ({size_kb:.1f} KB, 1920x616)")

        og_svg = os.path.join(tmpdir, "og-preview.svg")
        og_png = os.path.join(SITE_DIR, "og-preview.png")
        with open(og_svg, "w", encoding="utf-8") as f:
            f.write(build_og_preview_svg(ribbons))
        subprocess.run(
            ["rsvg-convert", "-w", "1200", "-h", "630", og_svg, "-o", og_png],
            check=True,
        )
        size_kb = os.path.getsize(og_png) / 1024.0
        print(f"Generated {os.path.relpath(og_png, ROOT)} ({size_kb:.1f} KB, 1200x630)")


if __name__ == "__main__":
    main()
