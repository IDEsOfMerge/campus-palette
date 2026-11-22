#!/usr/bin/env python3
"""
Programmatically renders the Campus Palette README architecture and founding-timeline
diagrams as 2x Retina Dark and Light PNGs from pure geometric SVG vectors:
  - assets/diagrams/founding-timeline-dark.png  &  founding-timeline-light.png (1920x1288)
  - assets/diagrams/build-pipeline-dark.png     &  build-pipeline-light.png    (1920x936)

Loads all 40 universities and exact Light/Dark swatches directly from palettes/*.js.
Run with: python3 scripts/generate-diagrams.py
"""

import html
import json
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "diagrams")

FONT_SANS = "'DejaVu Sans', 'Liberation Sans', sans-serif"
FONT_MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace"

GROUPS = [
    {
        "key": "Ivy League",
        "title": "IVY LEAGUE",
        "legend": "Ivy League",
        "accent": "ruby",
    },
    {
        "key": "Canadian Universities",
        "title": "CANADIAN UNIVERSITIES",
        "legend": "Canadian",
        "accent": "teal",
    },
    {
        "key": "US Public Flagships",
        "title": "US PUBLIC FLAGSHIPS",
        "legend": "US Public",
        "accent": "sapphire",
    },
    {
        "key": "US Private Research & STEM",
        "title": "US PRIVATE RESEARCH & STEM",
        "legend": "Private STEM",
        "accent": "violet",
    },
    {
        "key": "Liberal Arts & Regional Gems",
        "title": "LIBERAL ARTS & GEMS",
        "legend": "Liberal Arts",
        "accent": "emerald",
    },
    {
        "key": "Global Classics",
        "title": "GLOBAL CLASSICS",
        "legend": "Global",
        "accent": "gold",
    },
]


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def region_code(city: str, country: str) -> str:
    if country == "UK":
        return "UK"
    if country == "Switzerland":
        return "CH"
    if country == "Japan":
        return "JP"
    if "," in city:
        return city.split(",")[-1].strip()
    return country[:3].upper()


def load_campus_data():
    """Load all 40 universities with Light & Dark swatches directly from palettes/*.js."""
    js = r"""
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(process.cwd(), 'palettes');
    const byBase = {};
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) {
      const p = require(path.join(dir, f));
      const base = p.slug.replace(/-(light|dark)$/, '');
      if (!byBase[base]) {
        byBase[base] = {
          base,
          university: p.university,
          shortName: p.shortName,
          group: p.group,
          country: p.country,
          city: p.city,
          year: p.year,
          modes: {},
        };
      }
      byBase[base].modes[p.tokens.mode] = {
        bg: p.tokens.bg,
        cursor: p.tokens.accentCursor,
        keyword: p.tokens.accentKeyword,
      };
    }
    console.log(JSON.stringify(Object.values(byBase)));
    """
    raw = subprocess.check_output(["node", "-e", js], cwd=ROOT, text=True)
    return json.loads(raw)


def get_theme(mode: str) -> dict:
    if mode == "dark":
        return {
            "bg": "#0D1117",
            "surface": "#161B22",
            "surface_alt": "#131922",
            "pill_bg": "#1F2631",
            "border": "#30363D",
            "border_soft": "#242B35",
            "text": "#E6EDF3",
            "text_sub": "#9BA6B2",
            "text_muted": "#7D8590",
            "line": "#6E7B8F",
            "swatch_stroke": "#444C56",
            "accents": {
                "gold":     {"fg": "#EAB938", "bg": "#241E11", "bd": "#7A601C"},
                "emerald":  {"fg": "#56D39A", "bg": "#11241D", "bd": "#246B4F"},
                "sapphire": {"fg": "#58A6FF", "bg": "#111E30", "bd": "#285B94"},
                "teal":     {"fg": "#39D2C0", "bg": "#102424", "bd": "#216D66"},
                "violet":   {"fg": "#B495F8", "bg": "#1D1730", "bd": "#5C4799"},
                "ruby":     {"fg": "#F47067", "bg": "#291518", "bd": "#8A3633"},
            },
        }
    return {
        "bg": "#F6F8FA",
        "surface": "#FFFFFF",
        "surface_alt": "#F1F4F8",
        "pill_bg": "#EAEEF2",
        "border": "#D0D7DE",
        "border_soft": "#E1E6EC",
        "text": "#1F2328",
        "text_sub": "#4B535D",
        "text_muted": "#656D76",
        "line": "#6E7781",
        "swatch_stroke": "#B8C0C8",
        "accents": {
            "gold":     {"fg": "#9A6700", "bg": "#FFF8E3", "bd": "#D4A72C"},
            "emerald":  {"fg": "#116329", "bg": "#E9F9EE", "bd": "#4AC26B"},
            "sapphire": {"fg": "#0969DA", "bg": "#EAF4FF", "bd": "#54AEFF"},
            "teal":     {"fg": "#0B6B68", "bg": "#E5F9F7", "bd": "#38B5AE"},
            "violet":   {"fg": "#6639BA", "bg": "#F4EEFF", "bd": "#A475F9"},
            "ruby":     {"fg": "#CF222E", "bg": "#FFEFEF", "bd": "#FF8182"},
        },
    }


def build_founding_timeline_svg(mode: str, campuses: list) -> str:
    t = get_theme(mode)
    acc = t["accents"]
    W, H = 960, 644

    # Piecewise chronological ruler:
    #   Medieval classics [1096..1209] mapped to x = [56..136]
    #   Subtle era break // at x = 166
    #   Modern founding era [1636..1963] mapped linearly to x = [196..906]
    rx0, rx1, spine_y = 56.0, 906.0, 108.0
    break_x = 166.0

    def year_x(yr: int) -> float:
        if yr <= 1250:
            return 56.0 + (yr - 1096) / (1209 - 1096) * 80.0
        return 198.0 + (yr - 1636) / (1963 - 1636) * (906.0 - 198.0)

    ruler_parts = []
    # Broken spine with crisp medieval-to-colonial gap
    ruler_parts.append(
        f'  <line x1="{rx0:.1f}" y1="{spine_y:.1f}" x2="{break_x - 10:.1f}" y2="{spine_y:.1f}" '
        f'stroke="{t["border"]}" stroke-width="2.5" stroke-linecap="round"/>'
    )
    ruler_parts.append(
        f'  <line x1="{break_x + 10:.1f}" y1="{spine_y:.1f}" x2="{rx1:.1f}" y2="{spine_y:.1f}" '
        f'stroke="{t["border"]}" stroke-width="2.5" stroke-linecap="round"/>'
    )
    # Double-slash era break marker (//)
    for dx in (-4.0, 4.0):
        ruler_parts.append(
            f'  <line x1="{break_x + dx - 3.5:.1f}" y1="{spine_y + 7:.1f}" x2="{break_x + dx + 3.5:.1f}" y2="{spine_y - 7:.1f}" '
            f'stroke="{t["text_muted"]}" stroke-width="1.5" stroke-linecap="round"/>'
        )

    for yr in (1096, 1209, 1636, 1700, 1750, 1800, 1850, 1900, 1963):
        x = year_x(yr)
        ruler_parts.append(
            f'  <line x1="{x:.1f}" y1="{spine_y - 5:.1f}" x2="{x:.1f}" y2="{spine_y + 7:.1f}" '
            f'stroke="{t["border"]}" stroke-width="1.2"/>'
        )
        lbl_col = acc["sapphire"]["fg"] if yr in (1096, 1963) else t["text_muted"]
        fw = "700" if yr in (1096, 1963) else "500"
        ruler_parts.append(
            f'  <text x="{x:.1f}" y="{spine_y + 21:.1f}" text-anchor="middle" '
            f'font-family="{FONT_MONO}" font-size="9.3" font-weight="{fw}" fill="{lbl_col}">{yr}</text>'
        )

    # 6-grouping legend aligned neatly top-right of ruler card
    legend_items = [
        (g["legend"], acc[g["accent"]]["fg"], len(g["legend"]) * 5.2 + 4.0)
        for g in GROUPS
    ]
    total_w = sum(10.0 + tw for _, _, tw in legend_items) + 12.0 * (len(legend_items) - 1)
    lx = 922.0 - total_w + 4.0
    for lbl, col, tw in legend_items:
        ruler_parts.append(f'  <circle cx="{lx:.1f}" cy="84" r="3.6" fill="{col}"/>')
        ruler_parts.append(
            f'  <text x="{lx + 7.0:.1f}" y="87.2" font-family="{FONT_SANS}" '
            f'font-size="8.8" font-weight="600" fill="{t["text_sub"]}">{esc(lbl)}</text>'
        )
        lx += 10.0 + tw + 12.0

    # Cluster dots that land within 7.0px horizontally so adjacent years stack cleanly without eclipsing
    group_accent = {g["key"]: acc[g["accent"]]["fg"] for g in GROUPS}
    sorted_campuses = sorted(campuses, key=lambda x: (x["year"], x["shortName"]))
    clusters = []
    for c in sorted_campuses:
        x = year_x(c["year"])
        col = group_accent[c["group"]]
        if clusters and abs(x - clusters[-1]["x_anchor"]) < 7.0:
            clusters[-1]["cols"].append(col)
            clusters[-1]["xs"].append(x)
        else:
            clusters.append({"x_anchor": x, "xs": [x], "cols": [col]})

    for cl in clusters:
        x = sum(cl["xs"]) / len(cl["xs"])
        cols = cl["cols"]
        n = len(cols)
        for idx, col in enumerate(cols):
            if n == 1:
                cy, r = spine_y, 4.8
            elif n == 2:
                cy = spine_y - 4.9 if idx == 0 else spine_y + 4.9
                r = 4.0
            elif n == 3:
                cy = spine_y + (idx - 1.0) * 7.2
                r = 3.5
            else:
                cy = spine_y + (idx - (n - 1) / 2.0) * 6.2
                r = 3.1
            ruler_parts.append(
                f'  <circle cx="{x:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{col}" '
                f'stroke="{t["surface"]}" stroke-width="1.2"/>'
            )

    def render_card_shell(x: float, y: float, w: float, h: float, title: str, span: str, accent_key: str) -> str:
        a = acc[accent_key]
        pad = 11.0
        return (
            f'  <rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" '
            f'fill="{t["surface"]}" stroke="{t["border"]}" stroke-width="1.2"/>\n'
            f'  <path d="M {x + 8:.1f},{y:.1f} H {x + w - 8:.1f} Q {x + w:.1f},{y:.1f} {x + w:.1f},{y + 4:.1f} '
            f'L {x + w:.1f},{y + 4:.1f} H {x:.1f} Q {x:.1f},{y:.1f} {x + 8:.1f},{y:.1f} Z" fill="{a["fg"]}"/>\n'
            f'  <rect x="{x + 1:.1f}" y="{y + 4:.1f}" width="{w - 2:.1f}" height="26" fill="{a["bg"]}"/>\n'
            f'  <line x1="{x:.1f}" y1="{y + 30:.1f}" x2="{x + w:.1f}" y2="{y + 30:.1f}" stroke="{t["border_soft"]}" stroke-width="1"/>\n'
            f'  <text x="{x + pad:.1f}" y="{y + 20.5:.1f}" font-family="{FONT_MONO}" font-size="9.2" font-weight="700" letter-spacing="0.3" fill="{a["fg"]}">{esc(title)}</text>\n'
            f'  <text x="{x + w - pad:.1f}" y="{y + 20.5:.1f}" text-anchor="end" font-family="{FONT_MONO}" font-size="8.8" font-weight="600" fill="{t["text_muted"]}">{esc(span)}</text>'
        )

    def render_campus_row(x0: float, w: float, y: float, c: dict, grp_fg: str) -> str:
        pad = 11.0
        sw_box, sw_gap = 8.0, 2.2
        sw_w = sw_box * 3 + sw_gap * 2
        sw_x = x0 + w - pad - sw_w
        reg = region_code(c["city"], c["country"])
        pill_w = max(25.0, len(reg) * 5.2 + 9.0)
        pill_x = sw_x - 6.5 - pill_w

        l_bg = c["modes"]["light"]["bg"]
        d_bg = c["modes"]["dark"]["bg"]
        id_col = c["modes"][mode]["cursor"]

        return "\n".join([
            f'  <text x="{x0 + pad:.1f}" y="{y:.1f}" font-family="{FONT_MONO}" font-size="9.6" font-weight="700" fill="{grp_fg}">{c["year"]}</text>',
            f'  <text x="{x0 + 44.0:.1f}" y="{y:.1f}" font-family="{FONT_SANS}" font-size="10.4" font-weight="600" fill="{t["text"]}">{esc(c["shortName"])}</text>',
            f'  <rect x="{pill_x:.1f}" y="{y - 9.4:.1f}" width="{pill_w:.1f}" height="12.6" rx="3.0" fill="{t["pill_bg"]}"/>',
            f'  <text x="{pill_x + pill_w / 2:.1f}" y="{y - 0.6:.1f}" text-anchor="middle" font-family="{FONT_MONO}" font-size="7.6" font-weight="700" fill="{t["text_muted"]}">{esc(reg)}</text>',
            f'  <rect x="{sw_x:.1f}" y="{y - 8.0:.1f}" width="{sw_box:.1f}" height="9.2" rx="1.8" fill="{l_bg}" stroke="{t["swatch_stroke"]}" stroke-width="0.7"/>',
            f'  <rect x="{sw_x + sw_box + sw_gap:.1f}" y="{y - 8.0:.1f}" width="{sw_box:.1f}" height="9.2" rx="1.8" fill="{d_bg}" stroke="{t["swatch_stroke"]}" stroke-width="0.7"/>',
            f'  <rect x="{sw_x + (sw_box + sw_gap) * 2:.1f}" y="{y - 8.0:.1f}" width="{sw_box:.1f}" height="9.2" rx="1.8" fill="{id_col}" stroke="{t["swatch_stroke"]}" stroke-width="0.7"/>',
        ])

    # Organize campuses by group, chronologically
    by_group = {}
    for g in GROUPS:
        items = [c for c in campuses if c["group"] == g["key"]]
        items.sort(key=lambda x: (x["year"], x["shortName"]))
        by_group[g["key"]] = items

    cards_parts = []
    card_w, card_gap = 296.0, 12.0

    # Row 1: 3 equal cards (8 universities each: Ivy League, Canadian Universities, US Public Flagships)
    row1_y, row1_h = 152.0, 240.0
    for i, g in enumerate(GROUPS[:3]):
        cx = 24.0 + i * (card_w + card_gap)
        items = by_group[g["key"]]
        span = f"{items[0]['year']}–{items[-1]['year']}"
        a = acc[g["accent"]]
        cards_parts.append(render_card_shell(cx, row1_y, card_w, row1_h, g["title"], span, g["accent"]))
        start_y = row1_y + 49.0
        pitch = 25.5
        for j, c in enumerate(items):
            ry = start_y + j * pitch
            if j > 0:
                cards_parts.append(
                    f'  <line x1="{cx + 10:.1f}" y1="{ry - pitch * 0.57:.1f}" x2="{cx + card_w - 10:.1f}" y2="{ry - pitch * 0.57:.1f}" '
                    f'stroke="{t["border_soft"]}" stroke-width="0.8"/>'
                )
            cards_parts.append(render_campus_row(cx, card_w, ry, c, a["fg"]))

    # Row 2: 3 equal cards (7, 5, 4 universities: Private STEM, Liberal Arts, Global Classics)
    row2_y, row2_h = 406.0, 218.0
    for i, g in enumerate(GROUPS[3:]):
        cx = 24.0 + i * (card_w + card_gap)
        items = by_group[g["key"]]
        span = f"{items[0]['year']}–{items[-1]['year']}"
        a = acc[g["accent"]]
        cards_parts.append(render_card_shell(cx, row2_y, card_w, row2_h, g["title"], span, g["accent"]))
        n_items = len(items)
        if n_items == 7:
            start_y, pitch = row2_y + 49.5, 25.8
        elif n_items == 5:
            start_y, pitch = row2_y + 53.0, 35.5
        else:
            start_y, pitch = row2_y + 58.0, 44.5
        for j, c in enumerate(items):
            ry = start_y + j * pitch
            if j > 0:
                cards_parts.append(
                    f'  <line x1="{cx + 10:.1f}" y1="{ry - pitch * 0.57:.1f}" x2="{cx + card_w - 10:.1f}" y2="{ry - pitch * 0.57:.1f}" '
                    f'stroke="{t["border_soft"]}" stroke-width="0.8"/>'
                )
            cards_parts.append(render_campus_row(cx, card_w, ry, c, a["fg"]))

    a_sap = acc["sapphire"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="12" fill="{t["bg"]}" stroke="{t["border"]}" stroke-width="1"/>

  <!-- Header -->
  <text x="24" y="34" font-family="{FONT_SANS}" font-size="16.2" font-weight="700" fill="{t["text"]}">Campus Palette — 40 Universities by Founding Year (1096–1963)</text>
  <text x="24" y="53" font-family="{FONT_SANS}" font-size="11.2" fill="{t["text_sub"]}">80 Light &amp; Dark OKLCH themes across six collegiate groupings (930 years)  ·  swatches: Light bg · Dark bg · accent</text>

  <rect x="752" y="18" width="184" height="24" rx="12" fill="{a_sap["bg"]}" stroke="{a_sap["bd"]}" stroke-width="1"/>
  <text x="844" y="33.5" text-anchor="middle" font-family="{FONT_MONO}" font-size="9.8" font-weight="700" letter-spacing="0.4" fill="{a_sap["fg"]}">40 CAMPUSES · 80 THEMES</text>

  <!-- Piecewise Chronological Ruler -->
  <rect x="24" y="66" width="912" height="74" rx="8" fill="{t["surface"]}" stroke="{t["border"]}" stroke-width="1.2"/>
  <text x="38" y="87.2" font-family="{FONT_MONO}" font-size="9.0" font-weight="700" letter-spacing="0.5" fill="{t["text_muted"]}">FOUNDING CADENCE (1096 // 1636 → 1963)</text>
{chr(10).join(ruler_parts)}

  <!-- Six Collegiate Grouping Cards (3 x 2 Grid) -->
{chr(10).join(cards_parts)}
</svg>
'''


def build_pipeline_svg(mode: str) -> str:
    t = get_theme(mode)
    acc = t["accents"]
    W, H = 960, 468

    line_c = t["line"]
    purple_c = acc["violet"]["fg"]
    green_c = acc["emerald"]["fg"]
    gold_c = acc["gold"]["fg"]
    blue_c = acc["sapphire"]["fg"]
    teal_c = acc["teal"]["fg"]

    def stage_header(x: float, w: float, label: str) -> str:
        return (
            f'  <rect x="{x:.1f}" y="66" width="{w:.1f}" height="20" rx="4" fill="{t["surface_alt"]}" stroke="{t["border_soft"]}" stroke-width="1"/>\n'
            f'  <text x="{x + w / 2:.1f}" y="79.5" text-anchor="middle" font-family="{FONT_MONO}" font-size="9.3" font-weight="700" letter-spacing="0.7" fill="{t["text_muted"]}">{esc(label)}</text>'
        )

    def box_card(x: float, y: float, w: float, h: float, title: str, lines: list, accent_key: str, tag: str = "", dashed: bool = False) -> str:
        a = acc[accent_key]
        dash_attr = ' stroke-dasharray="5,4"' if dashed else ""
        parts = [
            f'  <rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" fill="{t["surface"]}" stroke="{a["bd"]}" stroke-width="1.4"{dash_attr}/>',
            f'  <rect x="{x + 1:.1f}" y="{y + 6:.1f}" width="3.5" height="{h - 12:.1f}" rx="1.75" fill="{a["fg"]}"/>',
        ]
        tx = x + 13.0
        ty = y + (23.0 if tag else (20.0 if len(lines) == 1 else 24.0))
        if tag:
            tag_w = len(tag) * 5.6 + 12.0
            parts.append(
                f'  <rect x="{x + w - tag_w - 8:.1f}" y="{y + 7:.1f}" width="{tag_w:.1f}" height="15" rx="3.5" fill="{a["bg"]}" stroke="{a["bd"]}" stroke-width="0.8"/>'
            )
            parts.append(
                f'  <text x="{x + w - tag_w / 2 - 8:.1f}" y="{y + 17.5:.1f}" text-anchor="middle" font-family="{FONT_MONO}" font-size="7.8" font-weight="700" letter-spacing="0.5" fill="{a["fg"]}">{esc(tag)}</text>'
            )
            ty = y + 32.0
        parts.append(
            f'  <text x="{tx:.1f}" y="{ty:.1f}" font-family="{FONT_MONO}" font-size="11.2" font-weight="700" fill="{t["text"]}">{esc(title)}</text>'
        )
        for i, ln in enumerate(lines):
            ly = ty + 16.0 + i * 14.5
            col = t["text_sub"] if i == 0 else t["text_muted"]
            parts.append(
                f'  <text x="{tx:.1f}" y="{ly:.1f}" font-family="{FONT_SANS}" font-size="10.2" fill="{col}">{esc(ln)}</text>'
            )
        return "\n".join(parts)

    def artifact_card(x: float, y: float, w: float, h: float, title: str, subtitle: str, accent_key: str) -> str:
        a = acc[accent_key]
        return (
            f'  <rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="7" fill="{t["surface"]}" stroke="{t["border"]}" stroke-width="1.2"/>\n'
            f'  <rect x="{x + 1:.1f}" y="{y + 6:.1f}" width="3.5" height="{h - 12:.1f}" rx="1.75" fill="{a["fg"]}"/>\n'
            f'  <text x="{x + 13:.1f}" y="{y + 18.5:.1f}" font-family="{FONT_MONO}" font-size="10.8" font-weight="700" fill="{t["text"]}">{esc(title)}</text>\n'
            f'  <text x="{x + 13:.1f}" y="{y + 33.5:.1f}" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_sub"]}">{esc(subtitle)}</text>'
        )

    c1_x, c1_w = 24.0, 168.0
    c2_x, c2_w = 228.0, 184.0
    c3_x, c3_w = 448.0, 222.0
    c4_x, c4_w = 710.0, 226.0

    # Signature collegiate swatch chips
    swatch_colors = ["#C81E38", "#F2B41A", "#169454", "#7EC6EA", "#1D63B8"]
    mini_sw = "\n".join(
        f'  <rect x="{c1_x + 13 + i * 18:.1f}" y="232" width="13" height="9" rx="2" fill="{c}"/>'
        for i, c in enumerate(swatch_colors)
    )

    a_val = acc["violet"]
    val_x, val_y, val_w, val_h = c4_x, 176.0, c4_w, 134.0
    val_card = f'''  <rect x="{val_x:.1f}" y="{val_y:.1f}" width="{val_w:.1f}" height="{val_h:.1f}" rx="8" fill="{t["surface"]}" stroke="{a_val["bd"]}" stroke-width="1.5"/>
  <rect x="{val_x + 1:.1f}" y="{val_y + 6:.1f}" width="3.5" height="{val_h - 12:.1f}" rx="1.75" fill="{a_val["fg"]}"/>
  <rect x="{val_x + val_w - 76:.1f}" y="{val_y + 7:.1f}" width="68" height="15" rx="3.5" fill="{a_val["bg"]}" stroke="{a_val["bd"]}" stroke-width="0.8"/>
  <text x="{val_x + val_w - 42:.1f}" y="{val_y + 17.5:.1f}" text-anchor="middle" font-family="{FONT_MONO}" font-size="7.8" font-weight="700" letter-spacing="0.5" fill="{a_val["fg"]}">AUDIT GATE</text>
  <text x="{val_x + 13:.1f}" y="{val_y + 33:.1f}" font-family="{FONT_MONO}" font-size="11.2" font-weight="700" fill="{t["text"]}">scripts/validate.js</text>
  <line x1="{val_x + 13:.1f}" y1="{val_y + 42:.1f}" x2="{val_x + val_w - 12:.1f}" y2="{val_y + 42:.1f}" stroke="{t["border_soft"]}" stroke-width="1"/>
  <text x="{val_x + 13:.1f}" y="{val_y + 58:.1f}" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_sub"]}"><tspan fill="{green_c}" font-weight="700">✓</tspan> 1,600/1,600 WCAG AA + APCA</text>
  <text x="{val_x + 13:.1f}" y="{val_y + 74:.1f}" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_sub"]}"><tspan fill="{green_c}" font-weight="700">✓</tspan> CIEDE2000 · 0 CVD warnings</text>
  <text x="{val_x + 13:.1f}" y="{val_y + 90:.1f}" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_sub"]}"><tspan fill="{green_c}" font-weight="700">✓</tspan> Zero-CDN Static Explorer CSP</text>
  <text x="{val_x + 13:.1f}" y="{val_y + 106:.1f}" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_sub"]}"><tspan fill="{green_c}" font-weight="700">✓</tspan> 12,160 Positron keys (152×80)</text>
  <text x="{val_x + 13:.1f}" y="{val_y + 122:.1f}" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_sub"]}"><tspan fill="{green_c}" font-weight="700">✓</tspan> Slim VSIX &amp; schema integrity</text>'''

    a_ok = acc["emerald"]
    ok_x, ok_y, ok_w, ok_h = c4_x, 352.0, c4_w, 64.0
    ok_card = f'''  <rect x="{ok_x:.1f}" y="{ok_y:.1f}" width="{ok_w:.1f}" height="{ok_h:.1f}" rx="8" fill="{a_ok["bg"]}" stroke="{a_ok["bd"]}" stroke-width="1.6"/>
  <rect x="{ok_x + 1:.1f}" y="{ok_y + 6:.1f}" width="3.5" height="{ok_h - 12:.1f}" rx="1.75" fill="{a_ok["fg"]}"/>
  <text x="{ok_x + 13:.1f}" y="{ok_y + 24:.1f}" font-family="{FONT_SANS}" font-size="11.6" font-weight="700" fill="{a_ok["fg"]}">✓  Slim VSIX &amp; Static Explorer</text>
  <text x="{ok_x + 13:.1f}" y="{ok_y + 42:.1f}" font-family="{FONT_SANS}" font-size="10.0" fill="{t["text_sub"]}">GitHub Actions green · .vsix built</text>
  <text x="{ok_x + 13:.1f}" y="{ok_y + 56:.1f}" font-family="{FONT_MONO}" font-size="9.0" fill="{t["text_muted"]}">VS Code · Positron · Open VSX</text>'''

    connectors = f'''  <path d="M 192,188 L 206,188 Q 212,188 212,182 L 212,140 Q 212,134 218,134 L 226,134"
        fill="none" stroke="{gold_c}" stroke-width="1.8" marker-end="url(#arr-gold-{mode})"/>
  <path d="M 192,226 L 206,226 Q 212,226 212,232 L 212,337 Q 212,343 218,343 L 226,343"
        fill="none" stroke="{gold_c}" stroke-width="1.8" marker-end="url(#arr-gold-{mode})"/>
  <path d="M 320,202 L 320,174"
        fill="none" stroke="{purple_c}" stroke-width="1.8" marker-end="url(#arr-violet-{mode})"/>
  <path d="M 412,256 L 708,256"
        fill="none" stroke="{purple_c}" stroke-width="2.0" marker-end="url(#arr-violet-{mode})"/>
  <rect x="503" y="246.5" width="112" height="19" rx="9.5" fill="{acc["violet"]["bg"]}" stroke="{acc["violet"]["bd"]}" stroke-width="0.9"/>
  <text x="559" y="259" text-anchor="middle" font-family="{FONT_MONO}" font-size="8.6" font-weight="700" fill="{purple_c}">OKLCH ENGINE</text>
  <path d="M 412,126 L 424,126 Q 430,126 430,120 L 430,120 Q 430,114 436,114 L 446,114"
        fill="none" stroke="{blue_c}" stroke-width="1.7" marker-end="url(#arr-blue-{mode})"/>
  <path d="M 412,142 L 424,142 Q 430,142 430,148 L 430,160 Q 430,166 436,166 L 446,166"
        fill="none" stroke="{blue_c}" stroke-width="1.7" marker-end="url(#arr-blue-{mode})"/>
  <path d="M 412,158 L 422,158 Q 428,158 428,164 L 428,212 Q 428,218 434,218 L 446,218"
        fill="none" stroke="{blue_c}" stroke-width="1.7" marker-end="url(#arr-blue-{mode})"/>
  <path d="M 412,334 L 424,334 Q 430,334 430,328 L 430,300 Q 430,294 436,294 L 446,294"
        fill="none" stroke="{teal_c}" stroke-width="1.7" marker-end="url(#arr-teal-{mode})"/>
  <path d="M 412,350 L 446,350"
        fill="none" stroke="{teal_c}" stroke-width="1.7" marker-end="url(#arr-teal-{mode})"/>
  <path d="M 670,114 L 708,114"
        fill="none" stroke="{gold_c}" stroke-width="1.7" stroke-dasharray="5,4" marker-end="url(#arr-gold-{mode})"/>
  <path d="M 670,166 L 686,166 Q 692,166 692,172 L 692,198 Q 692,204 698,204 L 708,204"
        fill="none" stroke="{line_c}" stroke-width="1.6" marker-end="url(#arr-line-{mode})"/>
  <path d="M 670,218 L 708,218"
        fill="none" stroke="{line_c}" stroke-width="1.6" marker-end="url(#arr-line-{mode})"/>
  <path d="M 670,294 L 684,294 Q 690,294 690,288 L 690,280 Q 690,274 696,274 L 708,274"
        fill="none" stroke="{line_c}" stroke-width="1.6" marker-end="url(#arr-line-{mode})"/>
  <path d="M 670,350 L 690,350 Q 696,350 696,344 L 696,294 Q 696,288 702,288 L 708,288"
        fill="none" stroke="{line_c}" stroke-width="1.6" marker-end="url(#arr-line-{mode})"/>
  <path d="M 823,310 L 823,349"
        fill="none" stroke="{green_c}" stroke-width="2.2" marker-end="url(#arr-green-{mode})"/>
  <rect x="774" y="320" width="98" height="17" rx="8.5" fill="{a_ok["bg"]}" stroke="{a_ok["bd"]}" stroke-width="0.9"/>
  <text x="823" y="331.5" text-anchor="middle" font-family="{FONT_MONO}" font-size="8.3" font-weight="700" fill="{green_c}">ALL GATES PASS</text>'''

    def marker(mid: str, color: str) -> str:
        return (
            f'    <marker id="{mid}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">\n'
            f'      <path d="M 1,1.5 L 8.5,5 L 1,8.5 z" fill="{color}"/>\n'
            f'    </marker>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
{marker(f"arr-gold-{mode}", gold_c)}
{marker(f"arr-violet-{mode}", purple_c)}
{marker(f"arr-blue-{mode}", blue_c)}
{marker(f"arr-teal-{mode}", teal_c)}
{marker(f"arr-line-{mode}", line_c)}
{marker(f"arr-green-{mode}", green_c)}
  </defs>

  <rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="12" fill="{t["bg"]}" stroke="{t["border"]}" stroke-width="1"/>

  <text x="24" y="34" font-family="{FONT_SANS}" font-size="16.5" font-weight="700" fill="{t["text"]}">Campus Palette — Build, Colorimetry &amp; Multi-Gate Validation Pipeline</text>
  <text x="24" y="52" font-family="{FONT_SANS}" font-size="11.2" fill="{t["text_sub"]}">Deterministic OKLCH expansion from 80 collegiate palettes to VS Code / Positron themes, offline Explorers &amp; automated CI gates</text>

{stage_header(c1_x, c1_w, "1 · SOURCE PALETTES")}
{stage_header(c2_x, c2_w, "2 · OKLCH ENGINE")}
{stage_header(c3_x, c3_w, "3 · GENERATED ARTIFACTS")}
{stage_header(c4_x, c4_w, "4 · MULTI-GATE AUDIT & VSIX")}

{connectors}

{box_card(c1_x, 152, c1_w, 102, "palettes/*.js", ["80 collegiate palettes", "~45 brand tokens each"], "gold", tag="INPUT")}
{mini_sw}

{box_card(c2_x, 96, c2_w, 76, "generate-themes.js", ["OKLCH perceptual mixing", "& 152 Positron keys/theme"], "sapphire", tag="SCRIPTS")}
{box_card(c2_x, 202, c2_w, 76, "color-science.js", ["OKLCH · WCAG · APCA", "CIEDE2000 · Machado CVD"], "violet", tag="SHARED")}
{box_card(c2_x, 304, c2_w, 76, "generate-explorer.js", ["Zero-CDN self-contained", "static HTML explorers"], "teal", tag="SCRIPTS")}

{artifact_card(c3_x, 92,  c3_w, 44, "theme-metadata.json", "university · group · city · year", "gold")}
{artifact_card(c3_x, 144, c3_w, 44, "package.json", "contributes.themes (80 entries)", "sapphire")}
{artifact_card(c3_x, 196, c3_w, 44, "themes/*.json", "80 themes · 152 Positron keys", "sapphire")}
{artifact_card(c3_x, 272, c3_w, 44, "site/index.html", "Static GitHub Pages Explorer", "teal")}
{artifact_card(c3_x, 326, c3_w, 44, "assets/explorer/explorer.html", "VS Code Webview Explorer", "teal")}

{box_card(c4_x, 92, c4_w, 72, "extension.js", ["QuickPick · Webview Explorer", "smart toggle · status bar"], "gold", tag="RUNTIME", dashed=True)}
{val_card}
{ok_card}

  <line x1="24" y1="430" x2="936" y2="430" stroke="{t["border_soft"]}" stroke-width="1"/>
  <line x1="28" y1="448" x2="54" y2="448" stroke="{blue_c}" stroke-width="1.8"/>
  <text x="61" y="451.5" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_muted"]}">Build / generation flow</text>

  <line x1="200" y1="448" x2="226" y2="448" stroke="{purple_c}" stroke-width="2.0"/>
  <text x="233" y="451.5" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_muted"]}">Shared OKLCH colorimetry engine</text>

  <line x1="414" y1="448" x2="440" y2="448" stroke="{gold_c}" stroke-width="1.8" stroke-dasharray="5,4"/>
  <text x="447" y="451.5" font-family="{FONT_SANS}" font-size="9.8" fill="{t["text_muted"]}">Runtime read (zero npm deps)</text>

  <text x="936" y="451.5" text-anchor="end" font-family="{FONT_MONO}" font-size="9.2" fill="{t["text_muted"]}">python3 scripts/generate-diagrams.py</text>
</svg>
'''


def render_png(svg_text: str, out_path: str, width: int, height: int):
    with tempfile.TemporaryDirectory() as tmpdir:
        svg_path = os.path.join(tmpdir, "diagram.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_text)
        subprocess.run(
            ["rsvg-convert", "-w", str(width), "-h", str(height), svg_path, "-o", out_path],
            check=True,
        )
    size_kb = os.path.getsize(out_path) / 1024.0
    print(f"Generated {os.path.relpath(out_path, ROOT)} ({size_kb:.1f} KB, {width}x{height})")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    campuses = load_campus_data()
    assert len(campuses) == 40, f"Expected 40 universities from palettes/*.js, found {len(campuses)}"
    for c in campuses:
        assert "light" in c["modes"] and "dark" in c["modes"], f"Missing Light/Dark modes for {c['base']}"

    for mode in ("dark", "light"):
        render_png(
            build_founding_timeline_svg(mode, campuses),
            os.path.join(OUT_DIR, f"founding-timeline-{mode}.png"),
            1920,
            1288,
        )
        render_png(
            build_pipeline_svg(mode),
            os.path.join(OUT_DIR, f"build-pipeline-{mode}.png"),
            1920,
            936,
        )


if __name__ == "__main__":
    main()
