#!/usr/bin/env python3
"""
Programmatically generates the animated VS Code / Positron IDE showcase GIF
(`assets/showcase/campus-palette-demo.gif`, 960x588) directly from the source
palettes (`palettes/*.js`).

Showcases 14 themes (7 Light <-> Dark collegiate pairs):
  1. Columbia University (Dark -> Light)            [1754 · New York, NY]
  2. Harvard University (Light -> Dark)             [1636 · Cambridge, MA]
  3. MIT (Dark -> Light)                            [1861 · Cambridge, MA]
  4. University of Oxford (Light -> Dark)           [1096 · Oxford, UK]
  5. University of British Columbia (Dark -> Light) [1908 · Vancouver, BC]
  6. University of Victoria (Light -> Dark)         [1963 · Victoria, BC]
  7. St. Edward's University (Dark -> Light)        [1885 · Austin, TX]

Run with: python3 scripts/generate-showcase-gif.py
"""

import html
import json
import os
import subprocess
import tempfile
from PIL import Image, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "showcase")
OUT_GIF = os.path.join(OUT_DIR, "campus-palette-demo.gif")

FONT_SANS = "'DejaVu Sans', 'Liberation Sans', sans-serif"
FONT_MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace"

W, H = 960, 588

SHOWCASE = [
    ("columbia-dark",   0, True),
    ("columbia-light",  0, False),
    ("harvard-light",   1, True),
    ("harvard-dark",    1, False),
    ("mit-dark",        2, True),
    ("mit-light",       2, False),
    ("oxford-light",    3, True),
    ("oxford-dark",     3, False),
    ("ubc-dark",        4, True),
    ("ubc-light",       4, False),
    ("uvic-light",      5, True),
    ("uvic-dark",       5, False),
    ("stedwards-dark",  6, True),
    ("stedwards-light", 6, False),
]


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def hex_to_rgb(h: str):
    h = h.lstrip("#")[:6]
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rel_lum(h: str) -> float:
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex_to_rgb(h)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def wcag_ratio(fg: str, bg: str) -> float:
    l1, l2 = rel_lum(fg), rel_lum(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def blend_hex(fg_hex: str, bg_hex: str, alpha: float) -> str:
    r1, g1, b1 = hex_to_rgb(fg_hex)
    r2, g2, b2 = hex_to_rgb(bg_hex)
    r = round(r1 * alpha + r2 * (1 - alpha))
    g = round(g1 * alpha + g2 * (1 - alpha))
    b = round(b1 * alpha + b2 * (1 - alpha))
    return f"#{r:02X}{g:02X}{b:02X}"


def contrast_text(bg_hex: str) -> str:
    return "#FFFFFF" if wcag_ratio("#FFFFFF", bg_hex) >= wcag_ratio("#111318", bg_hex) else "#111318"


def measure_title_px(text: str, font_size: float = 15.0) -> float:
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if os.path.exists(p):
            f = ImageFont.truetype(p, int(round(font_size * 10)))
            bb = f.getbbox(text)
            return (bb[2] - bb[0]) / 10.0
    return len(text) * font_size * 0.62


def load_showcase_bundles(slugs: list) -> list:
    """Load exact palette objects directly from palettes/*.js via Node (zero dependency on build artifacts)."""
    js = r"""
    const path = require('path');
    const slugs = JSON.parse(process.argv[1]);
    const out = slugs.map(slug => require(path.join(process.cwd(), 'palettes', `${slug}.js`)));
    console.log(JSON.stringify(out));
    """
    raw = subprocess.check_output(["node", "-e", js, json.dumps(slugs)], cwd=ROOT, text=True)
    return json.loads(raw)


def render_code_line(x: float, y: float, spans: list) -> str:
    parts = [f'  <text x="{x:.1f}" y="{y:.1f}" font-family="{FONT_MONO}" font-size="10.8" xml:space="preserve">']
    for text, color, style in spans:
        attrs = f'fill="{color}"'
        if style == "italic":
            attrs += ' font-style="italic"'
        elif style == "bold":
            attrs += ' font-weight="700"'
        parts.append(f'<tspan {attrs}>{esc(text)}</tspan>')
    parts.append("</text>")
    return "".join(parts)


def build_frame_svg(pal: dict, idx: int, total: int, toggle_target: str = "") -> str:
    tk = pal["tokens"]
    ansi = tk["ansi"]
    mode = tk["mode"]

    ed_bg      = tk["bg"]
    ed_fg      = tk["fg"]
    ed_line_hl = tk["bgLine"]
    ed_sel     = blend_hex(tk["accentCursor"], ed_bg, 0.24)
    ln_fg      = tk["fgMuted"]
    ln_act     = ed_fg
    cursor_c   = tk["accentCursor"]
    border_c   = tk["borderSubtle"]

    title_bg   = tk["bgActivity"]
    title_fg   = ed_fg
    act_bg     = tk["bgActivity"]
    act_fg     = cursor_c
    act_inact  = tk["fgSecondary"]
    badge_bg   = tk["accentBadge"]
    badge_fg   = contrast_text(badge_bg)

    sb_bg      = tk["bgSidebar"]
    sb_fg      = ed_fg
    sb_sec_bg  = tk["bgPanel"]
    list_sel   = tk["tintSelect"]
    list_fg    = ed_fg

    tabs_bg    = tk["bgActivity"]
    tab_act_bg = ed_bg
    tab_act_fg = ed_fg
    tab_in_fg  = tk["fgSecondary"]
    tab_top    = cursor_c

    panel_bg   = tk["bgPanel"]
    var_bg     = sb_bg
    stat_bg    = tk["accentStatusBar"]
    stat_fg    = contrast_text(stat_bg)
    rem_bg     = tk["accentButton"]
    rem_fg     = contrast_text(rem_bg)

    kw   = tk["accentKeyword"]
    st   = tk["accentStorage"]
    stri = tk["accentString"]
    fn   = tk["accentFunction"]
    ty   = tk["accentType"]
    num  = tk["accentNumber"]
    dec  = tk["accentDecorator"]
    cm   = tk["fgComment"]
    var  = tk["fgVariable"]
    prop = tk["fgProperty"]
    par  = tk["fgParameter"]
    pun  = tk["fgPunct"]
    sec  = tk["fgSecondary"]
    git_add = tk["gitAdd"]
    git_mod = fn

    a_green   = ansi["green"]
    a_cyan    = ansi["cyan"]
    a_blue    = ansi["blue"]
    a_magenta = ansi["magenta"]
    a_yellow  = ansi["yellow"]
    a_red     = ansi["red"]

    r_fg  = wcag_ratio(ed_fg, ed_bg)
    r_cm  = wcag_ratio(cm, ed_bg)
    r_kw  = wcag_ratio(kw, ed_bg)
    r_str = wcag_ratio(stri, ed_bg)
    r_fn  = wcag_ratio(fn, ed_bg)

    header_title = pal["university"]
    title_w = measure_title_px(header_title, 14.5)
    pill_x = 18.0 + title_w + 11.0

    # 14 progress dots grouped into 7 Light/Dark campus pairs
    dots = []
    dx = 720.0
    for i in range(total):
        if i > 0 and i % 2 == 0:
            dx += 6.0
        active = (i == idx)
        r = 4.2 if active else 2.8
        fill = cursor_c if active else blend_hex(title_fg, title_bg, 0.30)
        dots.append(f'  <circle cx="{dx:.1f}" cy="19" r="{r:.1f}" fill="{fill}"/>')
        dx += 13.0

    mode_label = "DARK" if mode == "dark" else "LIGHT"
    mode_pill_bg = blend_hex(cursor_c, sb_bg, 0.22)
    role_swatches = [("BG", ed_bg), ("KW", kw), ("STR", stri), ("FN", fn), ("CUR", cursor_c)]
    sw_svg = []
    for i, (rlbl, rcol) in enumerate(role_swatches):
        sx = 602.0 + i * 38.0
        sw_svg.append(
            f'  <rect x="{sx:.1f}" y="47" width="28" height="16" rx="4" fill="{rcol}" stroke="{border_c}" stroke-width="1"/>\n'
            f'  <text x="{sx + 14:.1f}" y="75" text-anchor="middle" font-family="{FONT_MONO}" font-size="8.0" font-weight="700" fill="{sec}">{rlbl}</text>'
        )

    tog_lit = bool(toggle_target)
    tog_bg = cursor_c if tog_lit else blend_hex(ed_fg, sb_bg, 0.08)
    tog_fg = contrast_text(cursor_c) if tog_lit else sec
    tog_bd = cursor_c if tog_lit else border_c

    # Syntax-highlighted data science / colorimetry code sample
    code_lines = [
        [("# Campus Palette — OKLCH perceptual theme engine", cm, "italic")],
        [("from ", kw, "bold"), ("dataclasses ", var, ""), ("import ", kw, "bold"), ("dataclass", ty, "")],
        [("from ", kw, "bold"), ("color_science ", var, ""), ("import ", kw, "bold"), ("wcag_ratio", fn, ""), (", ", pun, ""), ("apca_lc", fn, ""), (", ", pun, ""), ("cvd_audit", fn, "")],
        [],
        [("@dataclass", dec, ""), ("(", pun, ""), ("frozen", par, ""), ("=", pun, ""), ("True", st, "bold"), (")", pun, "")],
        [("class ", kw, "bold"), ("CampusAudit", ty, "bold"), (":", pun, "")],
        [("    campus", prop, ""), (": ", pun, ""), ("str", ty, ""), (" = ", pun, ""), (f'"{pal["shortName"]}"', stri, ""), ("  ", pun, ""), (f"# {pal['city']}", cm, "italic")],
        [("    mode", prop, ""), (": ", pun, ""), ("str", ty, ""), (" = ", pun, ""), (f'"{mode}"', stri, ""), ("  ", pun, ""), (f"# est. {pal['year']}", cm, "italic")],
        [("    min_wcag", prop, ""), (": ", pun, ""), ("float", ty, ""), (" = ", pun, ""), ("4.5", num, "")],
        [],
        [("    def ", kw, "bold"), ("verify", fn, "bold"), ("(", pun, ""), ("self", st, "italic"), (", ", pun, ""), ("fg", par, ""), (": ", pun, ""), ("str", ty, ""), (", ", pun, ""), ("bg", par, ""), (": ", pun, ""), ("str", ty, ""), (") -> ", pun, ""), ("bool", ty, ""), (":", pun, "")],
        [("        ratio ", var, ""), ("= ", pun, ""), ("wcag_ratio", fn, ""), ("(", pun, ""), ("fg", par, ""), (", ", pun, ""), ("bg", par, ""), (")", pun, "")],
        [("        hits ", var, ""), ("= ", pun, ""), ("cvd_audit", fn, ""), ("(", pun, ""), ("self", st, "italic"), (".", pun, ""), ("campus", prop, ""), (", ", pun, ""), ("min_de", par, ""), ("=", pun, ""), ("10.0", num, ""), (")", pun, "")],
        [("        return ", kw, "bold"), ("ratio ", var, ""), (">= ", pun, ""), ("self", st, "italic"), (".", pun, ""), ("min_wcag ", prop, ""), ("and ", kw, "bold"), ("hits ", var, ""), ("== ", pun, ""), ("0", num, "")],
        [],
        [("audit ", var, ""), ("= ", pun, ""), ("CampusAudit", ty, ""), ("()", pun, "")],
        [("assert ", kw, "bold"), ("audit", var, ""), (".", pun, ""), ("verify", fn, ""), ("(", pun, ""), (f'"{ed_fg}"', stri, ""), (", ", pun, ""), (f'"{ed_bg}"', stri, ""), (")  ", pun, ""), (f"# {r_fg:.2f}:1", cm, "italic")],
    ]

    sb_right = 220
    ed_left = 220
    ed_right = 672
    code_x = 262.0
    char_w = 6.50

    code_svg = []
    line_y0 = 138.0
    pitch = 23.8
    act_line_idx = 11
    hl_y = line_y0 + act_line_idx * pitch - 15.5
    code_svg.append(f'  <rect x="{ed_left + 1}" y="{hl_y:.1f}" width="{ed_right - ed_left - 2}" height="{pitch:.1f}" fill="{ed_line_hl}"/>')
    sel_x = code_x + 16 * char_w - 1.5
    sel_w = 10 * char_w + 3.0
    code_svg.append(f'  <rect x="{sel_x:.1f}" y="{hl_y + 2:.1f}" width="{sel_w:.1f}" height="{pitch - 4:.1f}" rx="2" fill="{ed_sel}"/>')
    cur_x = code_x + 34 * char_w + 2.5
    code_svg.append(f'  <rect x="{cur_x:.1f}" y="{hl_y + 2.5:.1f}" width="2.2" height="{pitch - 5:.1f}" fill="{cursor_c}"/>')

    code_svg.append(f'  <rect x="{ed_left + 6}" y="{line_y0 + 5 * pitch - 14:.1f}" width="3" height="{pitch * 3.8:.1f}" rx="1" fill="{git_mod}"/>')
    code_svg.append(f'  <rect x="{ed_left + 6}" y="{line_y0 + 10 * pitch - 14:.1f}" width="3" height="{pitch * 3.8:.1f}" rx="1" fill="{git_add}"/>')

    for i, spans in enumerate(code_lines):
        ly = line_y0 + i * pitch
        num_c = ln_act if i == act_line_idx else ln_fg
        num_w = "700" if i == act_line_idx else "400"
        code_svg.append(
            f'  <text x="{ed_left + 32}" y="{ly:.1f}" text-anchor="end" font-family="{FONT_MONO}" font-size="10.0" font-weight="{num_w}" fill="{num_c}">{i + 1}</text>'
        )
        if spans:
            code_svg.append(render_code_line(code_x, ly, spans))

    tree_items = [
        (0, "▾", "palettes",            sb_fg,   "",   False),
        (1, "·", f"{pal['slug']}.js",   sec,     "",   False),
        (0, "▾", "scripts",             sb_fg,   "",   False),
        (1, "·", "color-science.js",    git_mod, "M",  False),
        (1, "·", "generate-themes.js",  sec,     "",   False),
        (0, "▾", "analysis",            sb_fg,   "",   False),
        (1, "·", "campus_audit.py",     list_fg, "",   True),
        (1, "·", "theme_similarity.R",  git_add, "U",  False),
        (0, "·", "README.md",           sec,     "",   False),
    ]
    tree_svg = []
    for idx_t, (indent, icon, fname, col, git_flag, is_sel) in enumerate(tree_items):
        ry = 136.0 + idx_t * 21.5
        if is_sel:
            tree_svg.append(f'  <rect x="43" y="{ry - 14:.1f}" width="{sb_right - 44}" height="20" fill="{list_sel}"/>')
            tree_svg.append(f'  <rect x="43" y="{ry - 14:.1f}" width="2.5" height="20" fill="{cursor_c}"/>')
        ix = 52 + indent * 11
        tree_svg.append(
            f'  <text x="{ix}" y="{ry:.1f}" font-family="{FONT_MONO}" font-size="9.3" font-weight="{"700" if is_sel else "400"}" fill="{col}">{icon} {esc(fname)}</text>'
        )
        if git_flag:
            tree_svg.append(
                f'  <text x="{sb_right - 9}" y="{ry:.1f}" text-anchor="end" font-family="{FONT_MONO}" font-size="9.0" font-weight="700" fill="{col}">{git_flag}</text>'
            )

    vars_rows = [
        ("themes",    "int[80]",       num),
        ("wcag_aa",   "1600 / 1600",   a_green),
        ("editor_cr", f"{r_fg:.2f}:1", a_cyan),
        ("cvd_warns", "0",             a_green),
        ("cursor",    cursor_c,        cursor_c),
    ]
    vars_svg = []
    for vi, (vn, vv, vc) in enumerate(vars_rows):
        vy = 402.0 + vi * 26.0
        if vi > 0:
            vars_svg.append(f'  <line x1="50" y1="{vy - 16:.1f}" x2="{sb_right - 8}" y2="{vy - 16:.1f}" stroke="{border_c}" stroke-width="0.7"/>')
        vars_svg.append(f'  <text x="52" y="{vy:.1f}" font-family="{FONT_MONO}" font-size="9.5" fill="{sb_fg}">{vn}</text>')
        vars_svg.append(f'  <text x="{sb_right - 9}" y="{vy:.1f}" text-anchor="end" font-family="{FONT_MONO}" font-size="9.5" font-weight="700" fill="{vc}">{vv}</text>')

    console_lines = [
        [("$ ", a_cyan, "bold"), ("node scripts/validate.js", ed_fg, "")],
        [],
        [("✓ ", a_green, "bold"), ("80 themes ", ed_fg, "bold"), ("(40 campuses)", sec, "")],
        [("✓ ", a_green, "bold"), ("WCAG AA   ", a_cyan, "bold"), ("1,600 / 1,600", ed_fg, "")],
        [("✓ ", a_green, "bold"), ("ANSI      ", a_blue, "bold"), ("1,280 / 1,280", ed_fg, "")],
        [("✓ ", a_green, "bold"), ("Positron  ", a_magenta, "bold"), ("12,160 keys OK", ed_fg, "")],
        [("✓ ", a_green, "bold"), ("CVD safe  ", a_yellow, "bold"), ("0 warnings", ed_fg, "")],
        [],
        [("● ", cursor_c, "bold"), ("Identity: ", sec, ""), (cursor_c, cursor_c, "bold")],
        [("› ", a_cyan, "bold"), ("ready", sec, "italic")],
    ]
    console_svg = []
    for ci, spans in enumerate(console_lines):
        cy = 140.0 + ci * 20.5
        if spans:
            console_svg.append(render_code_line(686.0, cy, spans))

    audit_rows = [
        ("Editor fg / bg",  f"{r_fg:.2f}:1",  "AAA" if r_fg >= 7.0 else "AA",  a_green),
        ("Keywords / bg",   f"{r_kw:.2f}:1",  "AAA" if r_kw >= 7.0 else "AA",  kw),
        ("Strings / bg",    f"{r_str:.2f}:1", "AAA" if r_str >= 7.0 else "AA", stri),
        ("Functions / bg",  f"{r_fn:.2f}:1",  "AAA" if r_fn >= 7.0 else "AA",  fn),
        ("Comments / bg",   f"{r_cm:.2f}:1",  "AA",                            cm),
    ]
    audit_svg = []
    for ai, (albl, aval, agrade, acol) in enumerate(audit_rows):
        ay = 398.0 + ai * 24.5
        audit_svg.append(f'  <circle cx="690" cy="{ay - 3.5:.1f}" r="4" fill="{acol}"/>')
        audit_svg.append(f'  <text x="701" y="{ay:.1f}" font-family="{FONT_SANS}" font-size="10.2" fill="{sb_fg}">{albl}</text>')
        audit_svg.append(f'  <text x="894" y="{ay:.1f}" text-anchor="end" font-family="{FONT_MONO}" font-size="10.2" font-weight="700" fill="{ed_fg}">{aval}</text>')
        pill_bg = blend_hex(a_green, var_bg, 0.22)
        audit_svg.append(f'  <rect x="902" y="{ay - 11:.1f}" width="38" height="15" rx="3.5" fill="{pill_bg}"/>')
        audit_svg.append(f'  <text x="921" y="{ay - 0.5:.1f}" text-anchor="middle" font-family="{FONT_MONO}" font-size="8.4" font-weight="700" fill="{a_green}">{agrade}</text>')

    ansi_strip_cols = [a_red, a_green, a_yellow, a_blue, a_magenta, a_cyan, cursor_c, ed_fg]
    ansi_strip_svg = [
        f'  <rect x="{686.0 + asi * 32.2:.1f}" y="532" width="26.5" height="12" rx="2.5" fill="{ac}" stroke="{border_c}" stroke-width="0.6"/>'
        for asi, ac in enumerate(ansi_strip_cols)
    ]

    toast_svg = ""
    if toggle_target:
        toast_bg = tk["bgWidget"]
        toast_fg = ed_fg
        toast_svg = f'''
  <rect x="278" y="252" width="404" height="58" rx="10" fill="{toast_bg}" stroke="{cursor_c}" stroke-width="2.2"/>
  <rect x="294" y="268" width="66" height="26" rx="5" fill="{cursor_c}"/>
  <text x="327" y="285.5" text-anchor="middle" font-family="{FONT_MONO}" font-size="11.2" font-weight="700" fill="{contrast_text(cursor_c)}">⌘K ⌘U</text>
  <text x="374" y="277" font-family="{FONT_MONO}" font-size="9.2" font-weight="700" letter-spacing="0.5" fill="{cursor_c}">TOGGLE CAMPUS LIGHT ↔ DARK</text>
  <text x="374" y="296" font-family="{FONT_SANS}" font-size="12.2" font-weight="700" fill="{toast_fg}">→  {esc(toggle_target)}</text>'''

    # Status bar displays university name + city + founding year cleanly without crowding
    status_left = f"⎇ main   ✓ 0  ⚠ 0   |   {pal['university']} · {pal['city']} ({pal['year']})"
    status_right = f"Python 3.12   Ln 12, Col 34   ◐ {pal['label']}"

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect x="0" y="0" width="{W}" height="{H}" fill="{ed_bg}"/>

  <rect x="0" y="0" width="{W}" height="38" fill="{title_bg}"/>
  <line x1="0" y1="38" x2="{W}" y2="38" stroke="{border_c}" stroke-width="1"/>
  <circle cx="20" cy="19" r="5.5" fill="#FF5F56"/>
  <circle cx="38" cy="19" r="5.5" fill="#FFBD2E"/>
  <circle cx="56" cy="19" r="5.5" fill="#27C93F"/>
  <text x="82" y="23" font-family="{FONT_SANS}" font-size="12.2" font-weight="700" fill="{title_fg}">Campus Palette</text>
  <text x="196" y="23" font-family="{FONT_MONO}" font-size="10.8" fill="{sec}">—  VS Code / Positron  ·  80 OKLCH Themes</text>
{chr(10).join(dots)}

  <rect x="0" y="38" width="{W}" height="48" fill="{sb_bg}"/>
  <rect x="0" y="38" width="{W}" height="2.2" fill="{cursor_c}"/>
  <line x1="0" y1="86" x2="{W}" y2="86" stroke="{border_c}" stroke-width="1"/>
  <text x="18" y="60" font-family="{FONT_SANS}" font-size="14.5" font-weight="700" fill="{ed_fg}">{esc(header_title)}</text>
  <rect x="{pill_x:.1f}" y="46.5" width="46" height="17" rx="4" fill="{mode_pill_bg}" stroke="{cursor_c}" stroke-width="0.9"/>
  <text x="{pill_x + 23:.1f}" y="58.2" text-anchor="middle" font-family="{FONT_MONO}" font-size="9.0" font-weight="700" fill="{cursor_c}">{mode_label}</text>
  <text x="{pill_x + 55:.1f}" y="59" font-family="{FONT_MONO}" font-size="10.5" font-weight="700" fill="{sec}">{pal["year"]} · {esc(pal["city"])}</text>
  <text x="18" y="77.5" font-family="{FONT_SANS}" font-size="9.8" fill="{sec}">{esc(pal["subtitle"])}</text>
{chr(10).join(sw_svg)}
  <rect x="808" y="48" width="136" height="28" rx="6" fill="{tog_bg}" stroke="{tog_bd}" stroke-width="1.2"/>
  <text x="876" y="65.8" text-anchor="middle" font-family="{FONT_MONO}" font-size="10.0" font-weight="700" fill="{tog_fg}">⌘K ⌘U  Toggle</text>

  <rect x="0" y="86" width="42" height="472" fill="{act_bg}"/>
  <line x1="42" y1="86" x2="42" y2="558" stroke="{border_c}" stroke-width="1"/>
  <rect x="0" y="96" width="3" height="30" fill="{act_fg}"/>
  <rect x="13" y="101" width="14" height="17" rx="2" fill="none" stroke="{act_fg}" stroke-width="1.7"/>
  <line x1="17" y1="106" x2="23" y2="106" stroke="{act_fg}" stroke-width="1.4"/>
  <line x1="17" y1="111" x2="23" y2="111" stroke="{act_fg}" stroke-width="1.4"/>
  <circle cx="19" cy="153" r="6" fill="none" stroke="{act_inact}" stroke-width="1.6"/>
  <line x1="23.5" y1="157.5" x2="28" y2="162" stroke="{act_inact}" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="16" cy="195" r="2.5" fill="none" stroke="{act_inact}" stroke-width="1.6"/>
  <circle cx="16" cy="209" r="2.5" fill="none" stroke="{act_inact}" stroke-width="1.6"/>
  <circle cx="26" cy="202" r="2.5" fill="none" stroke="{act_inact}" stroke-width="1.6"/>
  <line x1="16" y1="197.5" x2="16" y2="206.5" stroke="{act_inact}" stroke-width="1.5"/>
  <circle cx="30" cy="208" r="6.5" fill="{badge_bg}"/>
  <text x="30" y="211.2" text-anchor="middle" font-family="{FONT_MONO}" font-size="8.5" font-weight="700" fill="{badge_fg}">2</text>
  <rect x="12" y="242" width="7" height="7" rx="1" fill="none" stroke="{act_inact}" stroke-width="1.4"/>
  <rect x="21" y="242" width="7" height="7" rx="1" fill="none" stroke="{act_inact}" stroke-width="1.4"/>
  <rect x="12" y="251" width="7" height="7" rx="1" fill="none" stroke="{act_inact}" stroke-width="1.4"/>
  <rect x="22" y="250" width="7" height="7" rx="1" fill="{cursor_c}"/>

  <rect x="42" y="86" width="{sb_right - 42}" height="472" fill="{sb_bg}"/>
  <line x1="{sb_right}" y1="86" x2="{sb_right}" y2="558" stroke="{border_c}" stroke-width="1"/>
  <rect x="43" y="87" width="{sb_right - 44}" height="28" fill="{sb_sec_bg}"/>
  <text x="52" y="105" font-family="{FONT_MONO}" font-size="9.3" font-weight="700" letter-spacing="0.9" fill="{sec}">EXPLORER</text>
{chr(10).join(tree_svg)}

  <rect x="43" y="354" width="{sb_right - 44}" height="204" fill="{var_bg}"/>
  <line x1="42" y1="354" x2="{sb_right}" y2="354" stroke="{border_c}" stroke-width="1"/>
  <rect x="43" y="355" width="{sb_right - 44}" height="24" fill="{sb_sec_bg}"/>
  <text x="52" y="370.5" font-family="{FONT_MONO}" font-size="8.8" font-weight="700" letter-spacing="0.7" fill="{sec}">POSITRON VARIABLES</text>
{chr(10).join(vars_svg)}

  <rect x="{ed_left}" y="86" width="{ed_right - ed_left}" height="30" fill="{tabs_bg}"/>
  <line x1="{ed_left}" y1="116" x2="{ed_right}" y2="116" stroke="{border_c}" stroke-width="1"/>
  <rect x="{ed_left + 1}" y="86" width="150" height="31" fill="{tab_act_bg}"/>
  <rect x="{ed_left + 1}" y="86" width="150" height="2.4" fill="{tab_top}"/>
  <line x1="{ed_left + 151}" y1="86" x2="{ed_left + 151}" y2="116" stroke="{border_c}" stroke-width="1"/>
  <circle cx="{ed_left + 15}" cy="101.5" r="3.5" fill="{fn}"/>
  <text x="{ed_left + 25}" y="105" font-family="{FONT_MONO}" font-size="10.2" font-weight="700" fill="{tab_act_fg}">campus_audit.py</text>
  <circle cx="{ed_left + 166}" cy="101.5" r="3.5" fill="{num}"/>
  <text x="{ed_left + 176}" y="105" font-family="{FONT_MONO}" font-size="10.2" fill="{tab_in_fg}">color-science.js</text>

{chr(10).join(code_svg)}

  <rect x="{ed_right}" y="86" width="{W - ed_right}" height="472" fill="{panel_bg}"/>
  <line x1="{ed_right}" y1="86" x2="{ed_right}" y2="558" stroke="{border_c}" stroke-width="1"/>
  <rect x="{ed_right + 1}" y="86" width="{W - ed_right - 1}" height="30" fill="{tabs_bg}"/>
  <line x1="{ed_right}" y1="116" x2="{W}" y2="116" stroke="{border_c}" stroke-width="1"/>
  <text x="688" y="105" font-family="{FONT_MONO}" font-size="9.5" font-weight="700" letter-spacing="0.8" fill="{tab_act_fg}">CONSOLE</text>
  <rect x="684" y="113.5" width="58" height="2.5" fill="{cursor_c}"/>
  <text x="760" y="105" font-family="{FONT_MONO}" font-size="9.5" font-weight="600" letter-spacing="0.8" fill="{tab_in_fg}">TERMINAL</text>
  <text x="840" y="105" font-family="{FONT_MONO}" font-size="9.5" font-weight="600" letter-spacing="0.8" fill="{tab_in_fg}">PLOTS</text>
{chr(10).join(console_svg)}

  <rect x="{ed_right + 1}" y="346" width="{W - ed_right - 1}" height="212" fill="{var_bg}"/>
  <line x1="{ed_right}" y1="346" x2="{W}" y2="346" stroke="{border_c}" stroke-width="1"/>
  <rect x="{ed_right + 1}" y="347" width="{W - ed_right - 1}" height="26" fill="{sb_sec_bg}"/>
  <text x="686" y="363.5" font-family="{FONT_MONO}" font-size="9.0" font-weight="700" letter-spacing="0.8" fill="{sec}">LIVE CONTRAST &amp; ANSI PALETTE</text>
{chr(10).join(audit_svg)}
  <text x="686" y="525" font-family="{FONT_MONO}" font-size="8.3" font-weight="600" fill="{sec}">ANSI TERMINAL BANDS</text>
{chr(10).join(ansi_strip_svg)}

  <rect x="0" y="558" width="{W}" height="30" fill="{stat_bg}"/>
  <rect x="0" y="558" width="34" height="30" fill="{rem_bg}"/>
  <path d="M 10.5,568 L 15.5,573 L 10.5,578 M 23.5,568 L 18.5,573 L 23.5,578" fill="none" stroke="{rem_fg}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="46" y="577" font-family="{FONT_MONO}" font-size="9.8" font-weight="700" fill="{stat_fg}">{esc(status_left)}</text>
  <text x="946" y="577" text-anchor="end" font-family="{FONT_MONO}" font-size="9.8" font-weight="700" fill="{stat_fg}">{esc(status_right)}</text>
{toast_svg}
</svg>
'''


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    slugs = [slug for slug, _, _ in SHOWCASE]
    palettes = load_showcase_bundles(slugs)

    frames_pil = []
    durations_ms = []

    with tempfile.TemporaryDirectory() as tmpdir:
        frame_no = 0
        for i, (slug, _, flips_next) in enumerate(SHOWCASE):
            pal = palettes[i]
            svg_main = build_frame_svg(pal, i, len(SHOWCASE), toggle_target="")
            svg_path = os.path.join(tmpdir, f"f{frame_no:02d}.svg")
            png_path = os.path.join(tmpdir, f"f{frame_no:02d}.png")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg_main)
            subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), svg_path, "-o", png_path], check=True)
            im = Image.open(png_path).convert("RGB").quantize(
                colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
            )
            frames_pil.append(im)
            durations_ms.append(1800)
            frame_no += 1

            if flips_next and i + 1 < len(SHOWCASE):
                next_label = palettes[i + 1]["label"]
                svg_tog = build_frame_svg(pal, i, len(SHOWCASE), toggle_target=next_label)
                svg_path_t = os.path.join(tmpdir, f"f{frame_no:02d}.svg")
                png_path_t = os.path.join(tmpdir, f"f{frame_no:02d}.png")
                with open(svg_path_t, "w", encoding="utf-8") as f:
                    f.write(svg_tog)
                subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), svg_path_t, "-o", png_path_t], check=True)
                im_t = Image.open(png_path_t).convert("RGB").quantize(
                    colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
                )
                frames_pil.append(im_t)
                durations_ms.append(520)
                frame_no += 1

    frames_pil[0].save(
        OUT_GIF,
        save_all=True,
        append_images=frames_pil[1:],
        duration=durations_ms,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_kb = os.path.getsize(OUT_GIF) / 1024.0
    total_sec = sum(durations_ms) / 1000.0
    print(f"Generated {os.path.relpath(OUT_GIF, ROOT)} ({size_kb:.1f} KB, {len(frames_pil)} frames, {total_sec:.1f}s loop, {W}x{H})")


if __name__ == "__main__":
    main()
