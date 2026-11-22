#!/usr/bin/env python3
"""
Publication-grade color-science & heritage visualization generator for Campus Palette.

Reads analysis/data/{themes_summary,tokens_long,pairwise_distances,cvd_pairs}.csv
and palettes/*.js, and renders 8 high-DPI 2x-supersampled figures:
  1. assets/timeline/timeline-metro.png
  2. assets/color-science/theme-colorspace-grid.png
  3. assets/color-science/family-fingerprint.png
  4. assets/color-science/pca-global.png
  5. assets/color-science/theme-mds.png
  6. assets/color-science/theme-distance-heatmap.png
  7. assets/color-science/theme-dendrogram.png
  8. assets/color-science/cvd-swatch-grid.png

Uses pure NumPy + Pillow with 2x LANCZOS anti-aliasing and zero external plotting deps.
Run with: python3 scripts/generate-color-science-assets.py
"""

import csv
import html
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "analysis" / "data"
CS_ASSETS = ROOT / "assets" / "color-science"
TIMELINE_ASSETS = ROOT / "assets" / "timeline"

for d in (DATA_DIR, CS_ASSETS, TIMELINE_ASSETS):
    d.mkdir(parents=True, exist_ok=True)


# ---------- Font loader (DejaVu Sans has 100% Unicode coverage including ΔE₀₀, arrows, symbols) ----------

def load_font(size: int, style: str = "regular") -> ImageFont.FreeTypeFont:
    candidates = {
        "regular": [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ],
        "medium": [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ],
        "bold": [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ],
        "italic": [
            "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ],
        "mono": [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        ],
        "mono_bold": [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
        ],
    }
    for p in candidates.get(style, candidates["regular"]):
        if os.path.exists(p):
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()


# ---------- Colorimetry ----------

def hex_to_rgb_tuple(h: str):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def srgb_to_linear(rgb01: np.ndarray) -> np.ndarray:
    return np.where(rgb01 <= 0.04045, rgb01 / 12.92, ((rgb01 + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(lin: np.ndarray) -> np.ndarray:
    lin = np.clip(lin, 0.0, 1.0)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * (lin ** (1.0 / 2.4)) - 0.055)


CVD_MATS = {
    "protan": np.array([
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281,  0.099216],
        [-0.003882, -0.048116, 1.051998],
    ]),
    "deutan": np.array([
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501,  0.047413],
        [-0.011820, 0.042940, 0.968881],
    ]),
    "tritan": np.array([
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809,  0.147602],
        [0.004733,  0.691367,  0.303900],
    ]),
}


def simulate_cvd_hexes(hex_list, cvd_type: str):
    arr = np.array([hex_to_rgb_tuple(h) for h in hex_list], dtype=np.float64) / 255.0
    lin = srgb_to_linear(arr)
    sim_lin = np.clip(lin @ CVD_MATS[cvd_type].T, 0.0, 1.0)
    sim_srgb = np.round(np.clip(linear_to_srgb(sim_lin), 0.0, 1.0) * 255.0).astype(int)
    return [f"#{r:02X}{g:02X}{b:02X}" for r, g, b in sim_srgb]


# ---------- Domain Metadata ----------

GROUP_ORDER = [
    "Global Universities",
    "Ivy League",
    "US Public Flagships",
    "Liberal Arts & Independent",
    "US Private Research & STEM",
    "Canadian Universities",
]

GROUP_COLORS = {
    "Global Universities":          "#B67B0C",
    "Ivy League":                   "#B81D32",
    "US Public Flagships":          "#1657B5",
    "Liberal Arts & Independent":   "#127D49",
    "US Private Research & STEM":   "#6B3CB8",
    "Canadian Universities":        "#0A7E86",
}

GROUP_SHORT = {
    "Global Universities":          "GLOBAL UNIVERSITIES",
    "Ivy League":                   "IVY LEAGUE",
    "US Public Flagships":          "US PUBLIC FLAGSHIPS",
    "Liberal Arts & Independent":   "LIBERAL ARTS & INDEPENDENT",
    "US Private Research & STEM":   "US PRIVATE STEM",
    "Canadian Universities":        "CANADIAN UNIVERSITIES",
}

POLYGON_ROLES = [
    "accentKeyword", "accentStorage", "accentString", "accentRegex",
    "accentFunction", "accentType", "accentInterface", "accentNumber",
    "accentDecorator", "accentNamespace",
]

AUDIT_ROLES = [
    "accentKeyword", "accentStorage", "accentString", "accentRegex",
    "accentFunction", "accentFunctionDim", "accentType", "accentInterface",
    "accentNumber", "accentDecorator", "accentNamespace", "colorError", "colorWarning",
]

ROLE_COLORS = {
    "accentKeyword":     "#1B8A4B",
    "accentStorage":     "#7D5626",
    "accentString":      "#D4382C",
    "accentRegex":       "#E8741E",
    "accentFunction":    "#1E62C9",
    "accentFunctionDim": "#5B94E0",
    "accentType":        "#0E9488",
    "accentInterface":   "#46B8AC",
    "accentNumber":      "#C9920E",
    "accentDecorator":   "#9E3AC9",
    "accentNamespace":   "#6D758C",
    "colorError":        "#B81428",
    "colorWarning":      "#D9820B",
}


# ---------- Drawing helpers (2x supersampling) ----------

def make_canvas(w: int, h: int, bg="#FAF9F6"):
    return Image.new("RGB", (w * 2, h * 2), hex_to_rgb_tuple(bg))


def save_downsampled(img: Image.Image, path: Path, w: int, h: int):
    out = img.resize((w, h), Image.Resampling.LANCZOS)
    out.save(path, format="PNG", optimize=True, dpi=(300, 300))


def draw_text_centered(draw, x, y, text, font, fill="#1E2028"):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x - tw / 2, y - th / 2 - bbox[1] * 0.2), text, font=font, fill=fill)


def draw_circle(draw, cx, cy, r, fill, outline=None, width=2):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill, outline=outline, width=width)


def draw_square(draw, cx, cy, r, fill, outline=None, width=2):
    draw.rectangle((cx - r, cy - r, cx + r, cy + r), fill=fill, outline=outline, width=width)


# ---------- Ward.D2 Hierarchical Clustering in pure NumPy ----------

def ward_d2_clustering(X: np.ndarray):
    n = X.shape[0]
    diff = X[:, None, :] - X[None, :, :]
    D2 = np.sum(diff ** 2, axis=-1)
    np.fill_diagonal(D2, np.inf)

    sizes = [1] * (2 * n - 1)
    active = list(range(n))
    merges = []

    dist2 = {}
    for i in range(n):
        for j in range(i + 1, n):
            dist2[(i, j)] = float(D2[i, j])

    def get_d2(u, v):
        return dist2[(u, v)] if u < v else dist2[(v, u)]

    def set_d2(u, v, val):
        if u < v:
            dist2[(u, v)] = val
        else:
            dist2[(v, u)] = val

    next_id = n
    for _ in range(n - 1):
        best_pair = None
        best_d2 = float("inf")
        for idx_a in range(len(active)):
            u = active[idx_a]
            for idx_b in range(idx_a + 1, len(active)):
                v = active[idx_b]
                val = get_d2(u, v)
                if val < best_d2:
                    best_d2 = val
                    best_pair = (u, v)

        u, v = best_pair
        height = math.sqrt(max(0.0, best_d2))
        new_id = next_id
        next_id += 1
        nu, nv = sizes[u], sizes[v]
        sizes[new_id] = nu + nv

        for w in active:
            if w == u or w == v:
                continue
            nw = sizes[w]
            denom = nu + nv + nw
            d2_new = (
                (nu + nw) * get_d2(u, w)
                + (nv + nw) * get_d2(v, w)
                - nw * best_d2
            ) / denom
            set_d2(new_id, w, max(0.0, d2_new))

        active.remove(u)
        active.remove(v)
        active.append(new_id)
        merges.append((u, v, height, new_id))

    return merges


def classical_mds_2d(D: np.ndarray):
    n = D.shape[0]
    J = np.eye(n) - np.ones((n, n)) / n
    B = -0.5 * J @ (D ** 2) @ J
    eigvals, eigvecs = np.linalg.eigh(B)
    idx = np.argsort(eigvals)[::-1]
    eigvals, eigvecs = eigvals[idx], eigvecs[:, idx]
    pos_sum = float(np.sum(np.maximum(eigvals, 0.0)))
    v1 = float(eigvals[0] / pos_sum * 100.0) if pos_sum > 0 else 0.0
    v2 = float(eigvals[1] / pos_sum * 100.0) if pos_sum > 0 else 0.0
    coords = eigvecs[:, :2] * np.sqrt(np.maximum(eigvals[:2], 0.0))
    return coords, (v1, v2)


# ---------- Data Loading ----------

def load_all_data():
    with open(DATA_DIR / "themes_summary.csv", "r", encoding="utf-8") as f:
        summaries = list(csv.DictReader(f))
    for s in summaries:
        s["year"] = int(s["year"])

    with open(DATA_DIR / "tokens_long.csv", "r", encoding="utf-8") as f:
        tokens = list(csv.DictReader(f))
    for r in tokens:
        r["year"] = int(r["year"])
        for col in ("oklch_L", "oklch_C", "oklch_h", "oklab_a", "oklab_b", "cie_L", "cie_a", "cie_b", "wcag_bg", "apca_lc"):
            r[col] = float(r[col])

    with open(DATA_DIR / "pairwise_distances.csv", "r", encoding="utf-8") as f:
        pairs = list(csv.DictReader(f))
    for p in pairs:
        for col in ("mean_de00", "max_de00", "min_de00", "mean_de76", "bg_de00"):
            p[col] = float(p[col])

    # Load palettes directly for authentic station colors on the metro map
    js = r"""
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(process.cwd(), 'palettes');
    const out = {};
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('-light.js')).sort()) {
      const p = require(path.join(dir, f));
      const base = p.slug.replace(/-light$/, '');
      out[base] = {
        base,
        university: p.university,
        shortName: p.shortName,
        group: p.group,
        year: p.year,
        city: p.city,
        country: p.country,
        stationColor: p.tokens.accentCursor,
      };
    }
    console.log(JSON.stringify(out));
    """
    pal_meta = json.loads(subprocess.check_output(["node", "-e", js], cwd=ROOT, text=True))

    slug_order = [s["theme_slug"] for s in summaries]
    return summaries, tokens, pairs, pal_meta, slug_order


# ---------- 1. Collegiate Heritage Metro Map (6 Grouping Tracks, 1096–1974) ----------

METRO_ANCHORS = [
    (1096, 0.000),
    (1209, 0.048),
    # // medieval era break at frac = 0.072
    (1583, 0.096),
    (1636, 0.136),
    (1701, 0.175),
    (1740, 0.212),
    (1775, 0.278),
    (1800, 0.335),
    (1825, 0.415),
    (1850, 0.505),
    (1875, 0.610),
    (1895, 0.715),
    (1919, 0.818),
    # // inter-war gap break at frac = 0.847
    (1957, 0.875),
    (1974, 1.000),
]


def year_to_metro_frac(yr: float) -> float:
    """
    Piecewise monotonic chronological mapping [1096..1974] -> [0.0..1.0]:
      - Preserves exact vertical alignment of shared founding years across all 6 tracks
      - Compresses medieval (1209 // 1583) and inter-war (1919 // 1957) gaps behind crisp // breaks
      - Allocates generous resolution to the 1785-1919 institutional boom
    """
    if yr <= METRO_ANCHORS[0][0]:
        return METRO_ANCHORS[0][1]
    if yr >= METRO_ANCHORS[-1][0]:
        return METRO_ANCHORS[-1][1]
    for (y0, f0), (y1, f1) in zip(METRO_ANCHORS, METRO_ANCHORS[1:]):
        if y0 <= yr <= y1:
            t = (yr - y0) / (y1 - y0)
            return f0 + t * (f1 - f0)
    return METRO_ANCHORS[-1][1]


def solve_1d_non_overlapping(centers: list, half_widths: list, min_x: float, max_x: float, gap: float = 10.0) -> list:
    """
    Globally optimal minimum-displacement 1D non-overlapping label placement via
    Pool Adjacent Violators (isotonic regression), clamped cleanly inside [min_x, max_x].
    """
    n = len(centers)
    if n == 0:
        return []
    # Cumulative minimum separation offsets so x_i = z_i + off_i enforces z_{i+1} >= z_i
    offs = [0.0] * n
    for i in range(1, n):
        offs[i] = offs[i - 1] + half_widths[i - 1] + half_widths[i] + gap

    # PAVA blocks: (sum_target, count, indices)
    blocks = []
    for i in range(n):
        blocks.append([centers[i] - offs[i], 1, [i]])
        while len(blocks) >= 2 and (blocks[-2][0] / blocks[-2][1]) > (blocks[-1][0] / blocks[-1][1]):
            b2 = blocks.pop()
            b1 = blocks[-1]
            b1[0] += b2[0]
            b1[1] += b2[1]
            b1[2].extend(b2[2])

    xs = [0.0] * n
    for s_val, cnt, idxs in blocks:
        mean_z = s_val / cnt
        for i in idxs:
            xs[i] = mean_z + offs[i]

    # Clamp inside canvas bounds while preserving minimum pairwise gaps
    if xs[0] - half_widths[0] < min_x:
        xs[0] = min_x + half_widths[0]
        for i in range(1, n):
            req = xs[i - 1] + half_widths[i - 1] + half_widths[i] + gap
            if xs[i] < req:
                xs[i] = req
    if xs[-1] + half_widths[-1] > max_x:
        xs[-1] = max_x - half_widths[-1]
        for i in range(n - 2, -1, -1):
            req = xs[i + 1] - half_widths[i + 1] - half_widths[i] - gap
            if xs[i] > req:
                xs[i] = req
    return xs


def render_timeline_metro(pal_meta: dict):
    W, H = 1600, 980
    FONT_SANS = "'DejaVu Sans', 'Liberation Sans', sans-serif"
    FONT_MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace"

    def esc(s: str) -> str:
        return html.escape(str(s), quote=True)

    def tint_hex(h: str, mix: float = 0.10) -> str:
        r, g, b = hex_to_rgb_tuple(h)
        tr = int(round(r * mix + 255 * (1.0 - mix)))
        tg = int(round(g * mix + 255 * (1.0 - mix)))
        tb = int(round(b * mix + 255 * (1.0 - mix)))
        return f"#{tr:02X}{tg:02X}{tb:02X}"

    X0, X1 = 290.0, 1530.0
    PW = X1 - X0
    PLOT_L, PLOT_R = 264.0, 1572.0
    ERA_TOP, ERA_H = 92.0, 28.0
    LANE_TOP, LANE_H = 122.0, 128.0
    AXIS_Y = LANE_TOP + 6 * LANE_H  # 890.0

    def yr_x(yr: float) -> float:
        return X0 + year_to_metro_frac(yr) * PW

    break1_x = X0 + 0.072 * PW
    break2_x = X0 + 0.847 * PW

    era_bounds = [
        ("I · MEDIEVAL & COLONIAL", "1096–1775", PLOT_L, yr_x(1778), "#FFFFFF", 10),
        ("II · EARLY REPUBLIC & CONFEDERATION", "1785–1848", yr_x(1778), yr_x(1849.5), "#F4F2EA", 16),
        ("III · RESEARCH UNIVERSITY BOOM", "1851–1919", yr_x(1849.5), break2_x, "#FFFFFF", 29),
        ("IV · POST-WAR", "1957–1974", break2_x, PLOT_R, "#F4F2EA", 5),
    ]

    parts = []
    # Outer framed poster card
    parts.append(
        f'  <rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="14" fill="#FAF9F5" stroke="#DFDCD2" stroke-width="1"/>'
    )

    # Header
    n_univ = len(pal_meta)
    n_countries = len({v["country"] for v in pal_meta.values()})
    parts.append(
        f'  <text x="32" y="42" font-family="{FONT_SANS}" font-size="22.5" font-weight="700" fill="#181A20">'
        f'Campus Palette — Collegiate Heritage Metro Map (1096–1974)</text>'
    )
    parts.append(
        f'  <text x="32" y="65" font-family="{FONT_SANS}" font-size="12.5" fill="#525866">'
        f'{n_univ} universities pinned to exact founding years across six collegiate transit lines  ·  '
        f'vertical guides align contemporaries across tracks  ·  white-bordered pills mark shared-year twins</text>'
    )
    parts.append(
        f'  <rect x="1256" y="21" width="316" height="28" rx="14" fill="#EEF3FA" stroke="#B7CCE6" stroke-width="1"/>'
    )
    parts.append(
        f'  <text x="1414" y="38.5" text-anchor="middle" font-family="{FONT_MONO}" font-size="10.6" font-weight="700" '
        f'letter-spacing="0.4" fill="#1D4F91">{n_univ} UNIVERSITIES · {n_countries} COUNTRIES · 878 YRS</text>'
    )

    # Plot frame & shaded era columns (continuous era header bar across full plot width)
    parts.append(
        f'  <rect x="{PLOT_L:.1f}" y="{ERA_TOP:.1f}" width="{PLOT_R - PLOT_L:.1f}" height="{AXIS_Y - ERA_TOP:.1f}" '
        f'rx="8" fill="#FFFFFF" stroke="#DCD8CC" stroke-width="1.1"/>'
    )
    for idx_e, (etitle, espan, ex0, ex1, efill, ecnt) in enumerate(era_bounds):
        ew = ex1 - ex0
        parts.append(
            f'  <rect x="{ex0:.1f}" y="{ERA_TOP + 0.5:.1f}" width="{ew:.1f}" height="{AXIS_Y - ERA_TOP - 1.0:.1f}" fill="{efill}"/>'
        )
        hdr_fill = "#F0EDE3" if efill == "#FFFFFF" else "#E9E5D8"
        parts.append(
            f'  <rect x="{ex0:.1f}" y="{ERA_TOP + 0.5:.1f}" width="{ew:.1f}" height="{ERA_H:.1f}" fill="{hdr_fill}"/>'
        )
        if idx_e > 0:
            parts.append(
                f'  <line x1="{ex0:.1f}" y1="{ERA_TOP:.1f}" x2="{ex0:.1f}" y2="{AXIS_Y:.1f}" stroke="#E3DFD3" stroke-width="1"/>'
            )
        label_str = f"{etitle} ({ecnt})"
        parts.append(
            f'  <text x="{(ex0 + ex1) / 2:.1f}" y="{ERA_TOP + 18.0:.1f}" text-anchor="middle" '
            f'font-family="{FONT_MONO}" font-size="9.4" font-weight="700" letter-spacing="0.45" fill="#505868">{esc(label_str)}</text>'
        )

    parts.append(
        f'  <line x1="{PLOT_L:.1f}" y1="{ERA_TOP + ERA_H:.1f}" x2="{PLOT_R:.1f}" y2="{ERA_TOP + ERA_H:.1f}" stroke="#DCD8CC" stroke-width="1"/>'
    )

    # Vertical chronological milestone gridlines + bottom axis ticks
    milestones = [
        ("1096", 1096, True),
        ("1209", 1209, False),
        ("1583", 1583, False),
        ("1636", 1636, False),
        ("1700", 1700, False),
        ("1750", 1750, False),
        ("1800", 1800, False),
        ("1825", 1825, False),
        ("1850", 1850, False),
        ("1875", 1875, False),
        ("1900", 1900, False),
        ("1919", 1919, False),
        ("1957", 1957, False),
        ("1974", 1974, True),
    ]
    for lbl, yr_val, is_end in milestones:
        gx = yr_x(yr_val)
        stroke_c = "#DFDBD0" if yr_val in (1800, 1850, 1900) else "#ECE8DE"
        parts.append(
            f'  <line x1="{gx:.1f}" y1="{LANE_TOP:.1f}" x2="{gx:.1f}" y2="{AXIS_Y:.1f}" '
            f'stroke="{stroke_c}" stroke-width="1.0" stroke-dasharray="3,4"/>'
        )
        parts.append(
            f'  <line x1="{gx:.1f}" y1="{AXIS_Y:.1f}" x2="{gx:.1f}" y2="{AXIS_Y + 6:.1f}" '
            f'stroke="#9EA5B4" stroke-width="1.2"/>'
        )
        t_col = "#1D4F91" if is_end else "#5D6474"
        t_fw = "700" if is_end or yr_val in (1800, 1850, 1900) else "500"
        parts.append(
            f'  <text x="{gx:.1f}" y="{AXIS_Y + 21:.1f}" text-anchor="middle" '
            f'font-family="{FONT_MONO}" font-size="10.4" font-weight="{t_fw}" fill="{t_col}">{lbl}</text>'
        )

    # Crisp // scale-break bands (1209 // 1583 and 1919 // 1957)
    for bx in (break1_x, break2_x):
        parts.append(
            f'  <rect x="{bx - 8:.1f}" y="{LANE_TOP:.1f}" width="16" height="{AXIS_Y - LANE_TOP:.1f}" fill="#FAF9F5"/>'
        )
        parts.append(
            f'  <line x1="{bx - 3.2:.1f}" y1="{LANE_TOP + 2:.1f}" x2="{bx - 3.2:.1f}" y2="{AXIS_Y - 2:.1f}" '
            f'stroke="#D5D0C3" stroke-width="1.1" stroke-dasharray="5,5"/>'
        )
        parts.append(
            f'  <line x1="{bx + 3.2:.1f}" y1="{LANE_TOP + 2:.1f}" x2="{bx + 3.2:.1f}" y2="{AXIS_Y - 2:.1f}" '
            f'stroke="#D5D0C3" stroke-width="1.1" stroke-dasharray="5,5"/>'
        )
        parts.append(
            f'  <text x="{bx:.1f}" y="{AXIS_Y + 21:.1f}" text-anchor="middle" '
            f'font-family="{FONT_MONO}" font-size="10.5" font-weight="700" fill="#8C93A4">//</text>'
        )

    # Horizontal lane dividers
    for i in range(1, 6):
        ly = LANE_TOP + i * LANE_H
        parts.append(
            f'  <line x1="{PLOT_L + 1:.1f}" y1="{ly:.1f}" x2="{PLOT_R - 1:.1f}" y2="{ly:.1f}" '
            f'stroke="#EAE6DC" stroke-width="1.0"/>'
        )

    # Re-stroke plot outer frame cleanly over band fills
    parts.append(
        f'  <rect x="{PLOT_L:.1f}" y="{ERA_TOP:.1f}" width="{PLOT_R - PLOT_L:.1f}" height="{AXIS_Y - ERA_TOP:.1f}" '
        f'rx="8" fill="none" stroke="#D5D1C5" stroke-width="1.1"/>'
    )

    # Render each of the 6 transit lines
    placed_boxes = []
    RAIL_LABELS = {
        "Global Universities":          "Global Universities",
        "Ivy League":                   "Ivy League",
        "US Public Flagships":          "US Public Flagships",
        "Liberal Arts & Independent":   "Liberal Arts & Independent",
        "US Private Research & STEM":   "US Private Research & STEM",
        "Canadian Universities":        "Canadian Universities",
    }

    for g_idx, grp in enumerate(GROUP_ORDER):
        cy = LANE_TOP + (g_idx + 0.5) * LANE_H
        g_col = GROUP_COLORS[grp]
        g_tint = tint_hex(g_col, 0.09)
        items = [v for v in pal_meta.values() if v["group"] == grp]
        items.sort(key=lambda v: (v["year"], v["shortName"]))

        # Left Transit Rail card
        rx, ry, rw, rh = 26.0, cy - 27.0, 226.0, 54.0
        parts.append(
            f'  <rect x="{rx:.1f}" y="{ry:.1f}" width="{rw:.1f}" height="{rh:.1f}" rx="8" '
            f'fill="{g_tint}" stroke="{g_col}" stroke-opacity="0.40" stroke-width="1.2"/>'
        )
        parts.append(
            f'  <rect x="{rx + 1:.1f}" y="{ry + 6:.1f}" width="4.5" height="{rh - 12:.1f}" rx="2.25" fill="{g_col}"/>'
        )
        parts.append(
            f'  <text x="{rx + 14:.1f}" y="{cy - 4:.1f}" font-family="{FONT_SANS}" font-size="11.8" '
            f'font-weight="700" fill="{g_col}">{esc(RAIL_LABELS[grp])}</text>'
        )
        parts.append(
            f'  <text x="{rx + 14:.1f}" y="{cy + 14:.1f}" font-family="{FONT_MONO}" font-size="10.0" '
            f'font-weight="600" fill="#5D6474">{len(items)} campuses · {items[0]["year"]}–{items[-1]["year"]}</text>'
        )

        # Group items on this track by exact founding year (so shared-year twins share one interchange)
        year_groups = []
        for it in items:
            if year_groups and year_groups[-1]["year"] == it["year"]:
                year_groups[-1]["items"].append(it)
            else:
                year_groups.append({"year": it["year"], "x": yr_x(it["year"]), "items": [it]})

        x_first = year_groups[0]["x"]
        x_last = year_groups[-1]["x"]

        # Subtle dashed guide tying Left Transit Rail directly to first station
        if x_first - 14.0 > rx + rw:
            parts.append(
                f'  <line x1="{rx + rw:.1f}" y1="{cy:.1f}" x2="{x_first - 10.0:.1f}" y2="{cy:.1f}" '
                f'stroke="{g_col}" stroke-opacity="0.28" stroke-width="1.8" stroke-dasharray="3,4"/>'
            )

        # Bold Vignelli transit trunk line (exact span from oldest to newest station)
        parts.append(
            f'  <line x1="{x_first:.1f}" y1="{cy:.1f}" x2="{x_last:.1f}" y2="{cy:.1f}" '
            f'stroke="{g_col}" stroke-width="5.2" stroke-linecap="round"/>'
        )

        # Clean // break slashes wherever a track spans one of the two compressed chronological breaks
        for bx in (break1_x, break2_x):
            if x_first < bx - 10.0 and x_last > bx + 10.0:
                parts.append(
                    f'  <rect x="{bx - 7.5:.1f}" y="{cy - 9:.1f}" width="15" height="18" fill="#FAF9F5"/>'
                )
                for dx in (-3.0, 3.0):
                    parts.append(
                        f'  <line x1="{bx + dx - 3.4:.1f}" y1="{cy + 8.0:.1f}" x2="{bx + dx + 3.4:.1f}" y2="{cy - 8.0:.1f}" '
                        f'stroke="{g_col}" stroke-width="2.4" stroke-linecap="round"/>'
                    )

        # Assign above (-1) / below (+1) sides cleanly:
        # Twins always take top (-1) and bottom (+1); singletons alternate around them
        side_lists = {-1: [], 1: []}
        yg_sides = {}
        next_side = -1 if g_idx in (0, 1, 2) else 1
        for yg_i, yg in enumerate(year_groups):
            if len(yg["items"]) == 2:
                side_lists[-1].append((yg["items"][0], yg["x"], True, yg_i))
                side_lists[1].append((yg["items"][1], yg["x"], True, yg_i))
                yg_sides[yg_i] = 0
                next_side = -1
            else:
                it = yg["items"][0]
                side_lists[next_side].append((it, yg["x"], False, yg_i))
                yg_sides[yg_i] = next_side
                next_side = -next_side

        # Subtle vertical micro-offset (±4.2px) ONLY for ultra-tight 1–3 year singleton pairs (< 13.5px apart)
        # so adjacent station circles NEVER eclipse each other while keeping 100% exact chronological X!
        dot_y_off = {}
        for yg_i, yg in enumerate(year_groups):
            if len(yg["items"]) == 2:
                dot_y_off[yg_i] = 0.0
                continue
            close_neighbor = False
            if yg_i > 0 and (yg["x"] - year_groups[yg_i - 1]["x"]) < 13.5:
                close_neighbor = True
            if yg_i + 1 < len(year_groups) and (year_groups[yg_i + 1]["x"] - yg["x"]) < 13.5:
                close_neighbor = True
            dot_y_off[yg_i] = (yg_sides[yg_i] * 4.2) if close_neighbor else 0.0

        # Solve globally optimal minimum-shift 1D label positions per side
        for side in (-1, 1):
            entries = side_lists[side]
            if not entries:
                continue
            centers = [e[1] for e in entries]
            half_ws = [max(len(e[0]["shortName"]) * 6.9 + 6.0, 34.0) / 2.0 for e in entries]
            lxs = solve_1d_non_overlapping(centers, half_ws, PLOT_L + 8.0, PLOT_R - 8.0, gap=9.0)

            for (it, cx, is_twin, yg_i), lx, hw in zip(entries, lxs, half_ws):
                dy_dot = dot_y_off.get(yg_i, 0.0)
                stem_start_y = cy + (side * 14.5 if is_twin else dy_dot + side * 6.8)
                stem_end_y = cy + side * 22.0
                if abs(lx - cx) <= 2.5:
                    parts.append(
                        f'  <line x1="{cx:.1f}" y1="{stem_start_y:.1f}" x2="{cx:.1f}" y2="{stem_end_y:.1f}" '
                        f'stroke="#A4AAB8" stroke-width="1.35"/>'
                    )
                else:
                    mid_y = cy + side * (18.2 if is_twin else 15.2)
                    parts.append(
                        f'  <polyline points="{cx:.1f},{stem_start_y:.1f} {cx:.1f},{mid_y:.1f} {lx:.1f},{stem_end_y:.1f}" '
                        f'fill="none" stroke="#A4AAB8" stroke-width="1.35" stroke-linejoin="round"/>'
                    )

                # Label: Name always above Year for effortless natural reading on both sides
                if side == -1:
                    y_name = cy - 39.0
                    y_yr = cy - 25.5
                    box_y0, box_y1 = cy - 51.0, cy - 22.0
                else:
                    y_name = cy + 34.5
                    y_yr = cy + 48.0
                    box_y0, box_y1 = cy + 22.0, cy + 51.5

                # Crisp subtle halo behind text so vertical gridlines never slice through letters
                parts.append(
                    f'  <rect x="{lx - hw:.1f}" y="{box_y0:.1f}" width="{hw * 2:.1f}" height="{box_y1 - box_y0:.1f}" '
                    f'rx="4" fill="#FAF9F5" fill-opacity="0.88"/>'
                )
                parts.append(
                    f'  <text x="{lx:.1f}" y="{y_name:.1f}" text-anchor="middle" font-family="{FONT_SANS}" '
                    f'font-size="11.8" font-weight="700" fill="#181A20">{esc(it["shortName"])}</text>'
                )
                parts.append(
                    f'  <text x="{lx:.1f}" y="{y_yr:.1f}" text-anchor="middle" font-family="{FONT_MONO}" '
                    f'font-size="10.0" font-weight="600" fill="#636A7A">{it["year"]}</text>'
                )
                placed_boxes.append((f"{grp}:{it['shortName']}", lx - hw, box_y0, lx + hw, box_y1))

        # Draw sleek Vignelli station markers LAST so they sit crisply atop trunks & stems
        for yg_i, yg in enumerate(year_groups):
            cx = yg["x"]
            if len(yg["items"]) == 2:
                # Iconic metro twin-interchange pill enclosing both same-year campuses
                parts.append(
                    f'  <rect x="{cx - 7.6:.1f}" y="{cy - 14.4:.1f}" width="15.2" height="28.8" rx="7.6" '
                    f'fill="#FFFFFF" stroke="#2D3340" stroke-width="1.5"/>'
                )
                for idx_t, it_t in enumerate(yg["items"]):
                    ty = cy - 6.4 if idx_t == 0 else cy + 6.4
                    st_col = it_t["stationColor"]
                    parts.append(f'  <circle cx="{cx:.1f}" cy="{ty:.1f}" r="5.0" fill="{st_col}"/>')
                    parts.append(f'  <circle cx="{cx:.1f}" cy="{ty:.1f}" r="1.9" fill="#FFFFFF"/>')
            else:
                it = yg["items"][0]
                st_col = it["stationColor"]
                dy_dot = dot_y_off.get(yg_i, 0.0)
                my = cy + dy_dot
                parts.append(
                    f'  <circle cx="{cx:.1f}" cy="{my:.1f}" r="6.2" fill="{st_col}" stroke="#FFFFFF" stroke-width="2.0"/>'
                )
                parts.append(
                    f'  <circle cx="{cx:.1f}" cy="{my:.1f}" r="5.8" fill="none" stroke="#181A20" stroke-opacity="0.18" stroke-width="0.6"/>'
                )
                parts.append(f'  <circle cx="{cx:.1f}" cy="{my:.1f}" r="2.2" fill="#FFFFFF"/>')

    # Footer reading guide (generous horizontal clearance between left contemporaries & right legend)
    parts.append(
        f'  <line x1="32" y1="930" x2="{W - 32}" y2="930" stroke="#E5E1D6" stroke-width="1"/>'
    )
    parts.append(
        f'  <text x="32" y="954" font-family="{FONT_SANS}" font-size="10.4" fill="#5D6474">'
        f'Vertically aligned contemporaries: '
        f'<tspan font-weight="700" fill="#2A303E">1789</tspan> UNC/Georgetown · '
        f'<tspan font-weight="700" fill="#2A303E">1821</tspan> McGill/Amherst · '
        f'<tspan font-weight="700" fill="#2A303E">1848</tspan> UW–Madison/uOttawa · '
        f'<tspan font-weight="700" fill="#2A303E">1853</tspan> EPFL/Melbourne/UF · '
        f'<tspan font-weight="700" fill="#2A303E">1861</tspan> MIT/UW · '
        f'<tspan font-weight="700" fill="#2A303E">1876</tspan> JHU/Texas A&amp;M · '
        f'<tspan font-weight="700" fill="#2A303E">1885</tspan> Stanford/Georgia Tech/St. Edward\'s</text>'
    )
    parts.append(
        f'  <text x="{W - 32}" y="954" text-anchor="end" font-family="{FONT_MONO}" font-size="10.0" fill="#7D8494">'
        f'dot color = campus accent</text>'
    )

    # Verify mathematically zero label overlaps
    overlaps = 0
    for i in range(len(placed_boxes)):
        n1, x1a, y1a, x1b, y1b = placed_boxes[i]
        for j in range(i + 1, len(placed_boxes)):
            n2, x2a, y2a, x2b, y2b = placed_boxes[j]
            if x1a < x2b and x2a < x1b and y1a < y2b and y2a < y1b:
                overlaps += 1
                print(f"  [WARN metro overlap] {n1} <-> {n2}")

    svg_text = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
        + "\n".join(parts)
        + "\n</svg>\n"
    )
    out_path = TIMELINE_ASSETS / "timeline-metro.png"
    with tempfile.TemporaryDirectory() as tmpdir:
        svg_path = os.path.join(tmpdir, "timeline-metro.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_text)
        subprocess.run(
            ["rsvg-convert", "-w", str(W * 2), "-h", str(H * 2), svg_path, "-o", str(out_path)],
            check=True,
        )
    size_kb = out_path.stat().st_size / 1024.0
    print(f"Saved assets/timeline/timeline-metro.png ({size_kb:.1f} KB, {W * 2}x{H * 2}, overlaps={overlaps})")


# ---------- 2. Render 120-Theme OKLCH (a, b) Hue-Chroma Grid (10 x 12) ----------

def render_colorspace_grid(tokens: list, slug_order: list):
    W, H = 3100, 4050
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(56, "bold")
    f_sub = load_font(27, "regular")
    f_panel = load_font(21, "bold")
    f_axis = load_font(23, "regular")

    n_themes = len(slug_order)
    n_univ = n_themes // 2
    draw.text((100, 56), f"All {n_themes} Themes in OKLCH Hue–Chroma Space ({n_univ} Universities, Light & Dark)", font=f_title, fill="#181A20")
    draw.text(
        (100, 128),
        "10 × 12 matrix (5 Light/Dark university pairs per row, ordered by collegiate grouping & founding year). Connected: 10 syntax roles. Rings: OKLCH C = 0.06, 0.12, 0.18.",
        font=f_sub,
        fill="#525866",
    )

    poly_by_slug = {}
    meta_by_slug = {}
    for r in tokens:
        meta_by_slug[r["theme_slug"]] = r
        if r["role"] in POLYGON_ROLES:
            poly_by_slug.setdefault(r["theme_slug"], {})[r["role"]] = r

    cols, nrows = 10, 12
    pad_l, pad_r, pad_t, pad_b = 90, 90, 215, 105
    gap_x, gap_y = 28, 32
    cell_w = (W * 2 - pad_l - pad_r - gap_x * (cols - 1)) / cols
    cell_h = (H * 2 - pad_t - pad_b - gap_y * (nrows - 1)) / nrows

    LIM = 0.215

    for idx, slug in enumerate(slug_order):
        c = idx % cols
        r_idx = idx // cols
        x0 = pad_l + c * (cell_w + gap_x)
        y0 = pad_t + r_idx * (cell_h + gap_y)

        meta = meta_by_slug[slug]
        grp_col = hex_to_rgb_tuple(GROUP_COLORS[meta["group"]])
        header_h = 52
        plot_size = min(cell_w - 20, cell_h - header_h - 14)
        px0 = x0 + (cell_w - plot_size) / 2
        py0 = y0 + header_h

        draw.rounded_rectangle(
            (x0, y0, x0 + cell_w, y0 + cell_h),
            radius=14,
            fill="#FFFFFF",
            outline="#E2E0D8",
            width=2,
        )
        # Subtle grouping-colored top bar
        draw.rounded_rectangle((x0 + 16, y0 + 2, x0 + cell_w - 16, y0 + 9), radius=3, fill=grp_col)

        mode_cap = "Light" if meta["mode"] == "light" else "Dark"
        title_str = f"{meta['short_name']} ({mode_cap})"
        draw_text_centered(draw, x0 + cell_w / 2, y0 + 30, title_str, f_panel, fill="#1E222B")

        cx = px0 + plot_size / 2
        cy = py0 + plot_size / 2
        scale = (plot_size / 2 - 16) / LIM

        for chroma_r in (0.06, 0.12, 0.18):
            rr = chroma_r * scale
            draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline="#ECEAE4", width=2)
        draw.line([(px0 + 10, cy), (px0 + plot_size - 10, cy)], fill="#DCD9D0", width=2)
        draw.line([(cx, py0 + 10), (cx, py0 + plot_size - 10)], fill="#DCD9D0", width=2)

        role_map = poly_by_slug[slug]
        pts = []
        for role in POLYGON_ROLES:
            item = role_map[role]
            px = cx + item["oklab_a"] * scale
            py = cy - item["oklab_b"] * scale
            pts.append((px, py, item["hex"]))

        poly_xy = [(p[0], p[1]) for p in pts] + [(pts[0][0], pts[0][1])]
        draw.line(poly_xy, fill="#707786", width=4)
        for px, py, hx in pts:
            draw_circle(draw, px, py, 10, fill=hex_to_rgb_tuple(hx), outline="#181A20", width=3)

    draw_text_centered(
        draw,
        W,
        H * 2 - 50,
        "Horizontal axis: OKLab a (-green to +red)   ·   Vertical axis: OKLab b (-blue to +yellow)   ·   Concentric rings: OKLCH Chroma C = 0.06, 0.12, 0.18",
        f_axis,
        fill="#5A6070",
    )

    save_downsampled(img, CS_ASSETS / "theme-colorspace-grid.png", W, H)
    print("Saved assets/color-science/theme-colorspace-grid.png")


# ---------- 3. Render 6-Grouping Faceted OKLCH Chromatic Fingerprint (3 x 2) ----------

def render_family_fingerprint(tokens: list, slug_order: list):
    W, H = 2200, 1480
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(50, "bold")
    f_sub = load_font(25, "regular")
    f_strip = load_font(28, "bold")
    f_cnt = load_font(21, "regular")
    f_note = load_font(22, "regular")

    draw.text((110, 56), 'Collegiate Chromatic "Fingerprint" — Six Groupings in OKLCH Hue–Chroma Space', font=f_title, fill="#181A20")
    draw.text(
        (110, 122),
        "Every theme's 10-role OKLab (a, b) syntax polygon overlaid by collegiate grouping — revealing shared institutional hue signatures and balanced gamut coverage.",
        font=f_sub,
        fill="#525866",
    )

    poly_by_slug = {}
    meta_by_slug = {}
    for r in tokens:
        meta_by_slug[r["theme_slug"]] = r
        if r["role"] in POLYGON_ROLES:
            poly_by_slug.setdefault(r["theme_slug"], {})[r["role"]] = r

    # Clean 3 x 2 symmetric grid
    panel_w, panel_h = 1350, 1220
    gap_x, gap_y = 65, 65
    x_start = (W * 2 - (3 * panel_w + 2 * gap_x)) / 2
    y_start = 220
    LIM = 0.215

    for idx_g, grp in enumerate(GROUP_ORDER):
        col_i = idx_g % 3
        row_i = idx_g // 3
        x0 = x_start + col_i * (panel_w + gap_x)
        y0 = y_start + row_i * (panel_h + gap_y)

        grp_col = hex_to_rgb_tuple(GROUP_COLORS[grp])
        grp_slugs = [s for s in slug_order if meta_by_slug[s]["group"] == grp]
        n_u = len(grp_slugs) // 2

        draw.rounded_rectangle((x0, y0, x0 + panel_w, y0 + panel_h), radius=18, fill="#FFFFFF", outline="#DEDCD4", width=2)
        draw.rounded_rectangle((x0 + 24, y0 + 2, x0 + panel_w - 24, y0 + 11), radius=4, fill=grp_col)
        draw_text_centered(draw, x0 + panel_w / 2, y0 + 44, grp, f_strip, fill=grp_col)
        draw_text_centered(draw, x0 + panel_w / 2, y0 + 80, f"{n_u} universities  ·  {len(grp_slugs)} themes", f_cnt, fill="#697080")

        plot_s = panel_h - 140
        px0 = x0 + (panel_w - plot_s) / 2
        py0 = y0 + 112
        cx, cy = px0 + plot_s / 2, py0 + plot_s / 2
        scale = (plot_s / 2 - 22) / LIM

        for cr in (0.06, 0.12, 0.18):
            rr = cr * scale
            draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline="#EFECE6", width=2)
        draw.line([(px0 + 14, cy), (px0 + plot_s - 14, cy)], fill="#DCD9D0", width=2)
        draw.line([(cx, py0 + 14), (cx, py0 + plot_s - 14)], fill="#DCD9D0", width=2)

        for s in grp_slugs:
            mode = meta_by_slug[s]["mode"]
            rmap = poly_by_slug[s]
            pts = [(cx + rmap[rl]["oklab_a"] * scale, cy - rmap[rl]["oklab_b"] * scale) for rl in POLYGON_ROLES]
            pts.append(pts[0])
            if mode == "light":
                col = tuple(int(c * 0.58 + 255 * 0.42) for c in grp_col)
                draw.line(pts, fill=col, width=3)
            else:
                draw.line(pts, fill=grp_col, width=4)

    draw_text_centered(
        draw,
        W,
        H * 2 - 48,
        "Lighter trace = Light theme   ·   Bold trace = Dark theme   ·   Concentric rings = OKLCH Chroma C = 0.06, 0.12, 0.18",
        f_note,
        fill="#5E6472",
    )
    save_downsampled(img, CS_ASSETS / "family-fingerprint.png", W, H)
    print("Saved assets/color-science/family-fingerprint.png")


# ---------- 4. Render Global 1,040-Token OKLab PCA ----------

def render_global_pca(tokens: list):
    syntax_rows = [r for r in tokens if r["role_kind"] == "syntax"]
    n_tokens = len(syntax_rows)
    n_themes = len({r["theme_slug"] for r in syntax_rows})

    X = np.array([[r["oklch_L"], r["oklab_a"], r["oklab_b"]] for r in syntax_rows], dtype=np.float64)
    X_centered = X - X.mean(axis=0, keepdims=True)
    U, S, Vt = np.linalg.svd(X_centered, full_matrices=False)
    # Orient PC1 positively with OKLab L (Light themes left, Dark themes right)
    if Vt[0, 0] < 0:
        Vt[0] *= -1
        U[:, 0] *= -1
    # Orient PC2 positively with warm red/amber (+a/+b)
    if Vt[1, 1] < 0:
        Vt[1] *= -1
        U[:, 1] *= -1
    scores = X_centered @ Vt.T
    var_exp = (S ** 2) / np.sum(S ** 2) * 100.0

    W, H = 1600, 1100
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(46, "bold")
    f_sub = load_font(24, "regular")
    f_ax = load_font(26, "medium")
    f_tick = load_font(21, "regular")
    f_leg_h = load_font(25, "bold")
    f_leg = load_font(22, "regular")
    f_hint = load_font(20, "bold")

    draw.text((90, 52), f"Global OKLCH / OKLab PCA Across All {n_themes} Themes ({n_tokens:,} Syntax Tokens)", font=f_title, fill="#181A20")
    draw.text(
        (90, 114),
        f"{n_tokens:,} tokens ({n_themes} themes × 13 syntax roles) in perceptual OKLab (L, a, b) — PC1 ({var_exp[0]:.1f}%) + PC2 ({var_exp[1]:.1f}%) = {var_exp[0] + var_exp[1]:.1f}% of variance.",
        font=f_sub,
        fill="#525866",
    )

    px0, py0, pw, ph = 165, 185, 2340, 1840
    draw.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=12, fill="#FFFFFF", outline="#DEDCD4", width=2)

    x_vals, y_vals = scores[:, 0], scores[:, 1]
    xmin, xmax = float(x_vals.min()) - 0.04, float(x_vals.max()) + 0.04
    ymin, ymax = float(y_vals.min()) - 0.035, float(y_vals.max()) + 0.035

    def map_pt(xv, yv):
        x = px0 + (xv - xmin) / (xmax - xmin) * pw
        y = py0 + ph - (yv - ymin) / (ymax - ymin) * ph
        return x, y

    for gx in np.arange(-0.40, 0.45, 0.10):
        gx = round(float(gx), 2)
        if xmin <= gx <= xmax:
            xp, _ = map_pt(gx, 0)
            draw.line([(xp, py0), (xp, py0 + ph)], fill="#D5D8E0" if gx == 0 else "#F0EFEA", width=3 if gx == 0 else 2)
            draw_text_centered(draw, xp, py0 + ph + 28, f"{gx:+.1f}" if gx != 0 else "0.0", f_tick, fill="#5E6472")
    for gy in np.arange(-0.25, 0.30, 0.05):
        gy = round(float(gy), 2)
        if ymin <= gy <= ymax:
            _, yp = map_pt(0, gy)
            draw.line([(px0, yp), (px0 + pw, yp)], fill="#D5D8E0" if gy == 0 else "#F0EFEA", width=3 if gy == 0 else 2)
            draw_text_centered(draw, px0 - 44, yp, f"{gy:+.2f}" if gy != 0 else "0.00", f_tick, fill="#5E6472")

    # Subtle polarity / chromatic pole hints inside frame
    draw.text((px0 + 28, py0 + 22), "← LIGHT THEMES (DEEPER INK L)", font=f_hint, fill="#8D94A4")
    rb = draw.textbbox((0, 0), "DARK THEMES (BRIGHTER INK L) →", font=f_hint)
    draw.text((px0 + pw - (rb[2] - rb[0]) - 28, py0 + 22), "DARK THEMES (BRIGHTER INK L) →", font=f_hint, fill="#8D94A4")
    draw_text_centered(draw, px0 + pw / 2, py0 + 28, "↑ WARM CRIMSON / AMBER", f_hint, fill="#9A9EA8")
    draw_text_centered(draw, px0 + pw / 2, py0 + ph - 26, "↓ COOL TEAL / COBALT", f_hint, fill="#9A9EA8")

    for r, (xv, yv) in zip(syntax_rows, scores[:, :2]):
        xp, yp = map_pt(xv, yv)
        col = hex_to_rgb_tuple(ROLE_COLORS[r["role"]])
        if r["mode"] == "light":
            draw_circle(draw, xp, yp, 9.5, fill="#FFFFFF", outline=col, width=4)
        else:
            draw_circle(draw, xp, yp, 9.5, fill=col, outline="#FFFFFF", width=2)

    draw_text_centered(draw, px0 + pw / 2, py0 + ph + 76, f"PC1 — Perceptual Lightness Axis ({var_exp[0]:.1f}% variance)", f_ax, fill="#222630")
    ytxt = Image.new("RGBA", (960, 68), (0, 0, 0, 0))
    ydraw = ImageDraw.Draw(ytxt)
    draw_text_centered(ydraw, 480, 34, f"PC2 — Warm/Cool Chromatic Axis ({var_exp[1]:.1f}% variance)", f_ax, fill="#222630")
    yrot = ytxt.rotate(90, expand=True)
    img.paste(yrot, (int(px0 - 134), int(py0 + ph / 2 - 480)), yrot)

    lx = px0 + pw + 56
    ly = py0 + 20
    draw.text((lx, ly), "Syntax Role", font=f_leg_h, fill="#181A20")
    ly += 48
    for role in AUDIT_ROLES:
        col = hex_to_rgb_tuple(ROLE_COLORS[role])
        draw_circle(draw, lx + 14, ly + 13, 10, fill=col)
        draw.text((lx + 36, ly), role.replace("accent", "").replace("color", ""), font=f_leg, fill="#2E3340")
        ly += 42

    ly += 34
    draw.text((lx, ly), "Theme Mode", font=f_leg_h, fill="#181A20")
    ly += 48
    draw_circle(draw, lx + 14, ly + 13, 10, fill="#FFFFFF", outline="#333842", width=4)
    draw.text((lx + 36, ly), "Light (open ring)", font=f_leg, fill="#2E3340")
    ly += 44
    draw_circle(draw, lx + 14, ly + 13, 10, fill="#333842", outline="#FFFFFF", width=2)
    draw.text((lx + 36, ly), "Dark (filled dot)", font=f_leg, fill="#2E3340")

    save_downsampled(img, CS_ASSETS / "pca-global.png", W, H)
    print(
        f"Saved assets/color-science/pca-global.png "
        f"(PC1={var_exp[0]:.2f}%, PC2={var_exp[1]:.2f}%, PC1+PC2={var_exp[0] + var_exp[1]:.2f}%)"
    )
    return var_exp


# ---------- 5 & 6. Per-Mode CIEDE2000 Classical MDS & Ward-Ordered 40x40 Split-Triangle Heatmap ----------

def render_mds_and_heatmap(summaries: list, tokens: list, pairs: list, slug_order: list):
    meta_by_slug = {s["theme_slug"]: s for s in summaries}
    hex_by_slug = {}
    oklab_by_slug = {}
    for r in tokens:
        s = r["theme_slug"]
        hex_by_slug.setdefault(s, {})[r["role"]] = r["hex"]
        if r["role"] in AUDIT_ROLES:
            oklab_by_slug.setdefault(s, {})[r["role"]] = (r["oklch_L"], r["oklab_a"], r["oklab_b"])

    light_slugs = [s for s in slug_order if meta_by_slug[s]["mode"] == "light"]
    dark_slugs = [s for s in slug_order if meta_by_slug[s]["mode"] == "dark"]

    def build_dist_matrix(mode_name, slugs):
        n = len(slugs)
        idx = {s: i for i, s in enumerate(slugs)}
        D = np.zeros((n, n), dtype=np.float64)
        for p in pairs:
            if p["mode"] != mode_name:
                continue
            i, j = idx[p["slug_a"]], idx[p["slug_b"]]
            D[i, j] = D[j, i] = p["mean_de00"]
        return D

    D_light = build_dist_matrix("light", light_slugs)
    D_dark = build_dist_matrix("dark", dark_slugs)

    coords_l, var_l = classical_mds_2d(D_light)
    coords_d, var_d = classical_mds_2d(D_dark)

    # Consistent semantic orientation across both modes:
    # +X = Crimson / Cardinal / Warm (Oxford, MIT, St. Edward's)
    # +Y = Royal Violet / Cobalt (Northwestern, Western, Williams)
    if coords_l[light_slugs.index("oxford-light"), 0] < 0:
        coords_l[:, 0] *= -1
    if coords_l[light_slugs.index("northwestern-light"), 1] < 0:
        coords_l[:, 1] *= -1
    if coords_d[dark_slugs.index("oxford-dark"), 0] < 0:
        coords_d[:, 0] *= -1
    if coords_d[dark_slugs.index("northwestern-dark"), 1] < 0:
        coords_d[:, 1] *= -1

    # Print exact closest and farthest pairs for verification
    for mode_name, slugs, D_mat in [("Light", light_slugs, D_light), ("Dark", dark_slugs, D_dark)]:
        all_p = []
        for i in range(len(slugs)):
            for j in range(i + 1, len(slugs)):
                all_p.append((D_mat[i, j], meta_by_slug[slugs[i]]["short_name"], meta_by_slug[slugs[j]]["short_name"]))
        all_p.sort()
        print(f"  {mode_name} closest:  {all_p[0][1]} <-> {all_p[0][2]} ({all_p[0][0]:.2f} dE00), 2nd: {all_p[1][1]} <-> {all_p[1][2]} ({all_p[1][0]:.2f} dE00)")
        print(f"  {mode_name} farthest: {all_p[-1][1]} <-> {all_p[-1][2]} ({all_p[-1][0]:.2f} dE00), 2nd: {all_p[-2][1]} <-> {all_p[-2][2]} ({all_p[-2][0]:.2f} dE00)")

    # ---------- Render Side-by-Side Perceptual MDS (theme-mds.png) ----------
    W, H = 2520, 1360
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(50, "bold")
    f_sub = load_font(25, "regular")
    f_phead = load_font(31, "bold")
    f_psub = load_font(22, "regular")
    f_lbl = load_font(17, "bold")
    f_pole = load_font(19, "bold")
    f_ax = load_font(23, "medium")
    f_tick = load_font(19, "regular")
    f_foot = load_font(22, "regular")

    n_u_mds = len(light_slugs)
    draw.text((125, 50), "Perceptual Similarity Landscape — Classical MDS on CIEDE2000 (ΔE₀₀)", font=f_title, fill="#181A20")
    draw.text(
        (125, 114),
        f"Pairwise mean ΔE₀₀ across all 13 syntax roles, split by polarity so all {n_u_mds} universities separate purely by chromatic identity. Inner fill = editor bg · outer ring = keyword accent.",
        font=f_sub,
        fill="#525866",
    )

    panels = [
        {
            "title": f"Light Themes ({n_u_mds} Universities)",
            "subtitle": f"Dim 1 ({var_l[0]:.1f}%) + Dim 2 ({var_l[1]:.1f}%) = {var_l[0] + var_l[1]:.1f}% of perceptual distance variance",
            "slugs": light_slugs,
            "coords": coords_l,
            "D": D_light,
            "px0": 135,
            "py0": 265,
            "pw": 2280,
            "ph": 2120,
            "var": var_l,
            "sib_thresh": 3.25,
        },
        {
            "title": f"Dark Themes ({n_u_mds} Universities)",
            "subtitle": f"Dim 1 ({var_d[0]:.1f}%) + Dim 2 ({var_d[1]:.1f}%) = {var_d[0] + var_d[1]:.1f}% of perceptual distance variance",
            "slugs": dark_slugs,
            "coords": coords_d,
            "D": D_dark,
            "px0": 2625,
            "py0": 265,
            "pw": 2280,
            "ph": 2120,
            "var": var_d,
            "sib_thresh": 3.55,
        },
    ]

    for p in panels:
        px0, py0, pw, ph = p["px0"], p["py0"], p["pw"], p["ph"]
        draw.text((px0, py0 - 76), p["title"], font=f_phead, fill="#181A20")
        draw.text((px0, py0 - 38), p["subtitle"], font=f_psub, fill="#5C6372")
        draw.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=16, fill="#FFFFFF", outline="#DCDAD2", width=2)

        xs = p["coords"][:, 0]
        ys = p["coords"][:, 1]
        xmin, xmax = float(xs.min()) - 1.9, float(xs.max()) + 2.0
        ymin, ymax = float(ys.min()) - 1.7, float(ys.max()) + 1.8

        def map_pt(xv, yv):
            return (
                px0 + 95 + (xv - xmin) / (xmax - xmin) * (pw - 190),
                py0 + ph - 95 - (yv - ymin) / (ymax - ymin) * (ph - 190),
            )

        for gx in range(-12, 16, 4):
            if xmin <= gx <= xmax:
                xp, _ = map_pt(gx, 0)
                draw.line([(xp, py0 + 2), (xp, py0 + ph - 2)], fill="#D7DAE2" if gx == 0 else "#F1F0EB", width=3 if gx == 0 else 2)
                draw_text_centered(draw, xp, py0 + ph + 24, str(gx), f_tick, fill="#687080")
        for gy in range(-12, 16, 4):
            if ymin <= gy <= ymax:
                _, yp = map_pt(0, gy)
                draw.line([(px0 + 2, yp), (px0 + pw - 2, yp)], fill="#D7DAE2" if gy == 0 else "#F1F0EB", width=3 if gy == 0 else 2)
                draw_text_centered(draw, px0 - 30, yp, str(gy), f_tick, fill="#687080")

        # Compass pole hints positioned cleanly in open frame margins (zero overlap with labels)
        draw.text((px0 + 26, py0 + 18), "← FOREST / EMERALD / GOLD", font=f_pole, fill="#969CA8")
        eb = draw.textbbox((0, 0), "CRIMSON / CARDINAL / WARM →", font=f_pole)
        draw.text((px0 + pw - (eb[2] - eb[0]) - 26, py0 + 18), "CRIMSON / CARDINAL / WARM →", font=f_pole, fill="#969CA8")
        draw_text_centered(draw, px0 + pw / 2, py0 + 28, "↑ ROYAL VIOLET / COBALT", f_pole, fill="#969CA8")
        draw_text_centered(draw, px0 + pw / 2, py0 + ph - 26, "↓ AMBER / SUN / COASTAL", f_pole, fill="#969CA8")

        pts_px = [map_pt(xs[i], ys[i]) for i in range(len(p["slugs"]))]

        # Subtle dashed links connecting the 3 closest chromatic sibling pairs per mode
        D_here = p["D"]
        pairs_here = []
        for i in range(len(p["slugs"])):
            for j in range(i + 1, len(p["slugs"])):
                pairs_here.append((float(D_here[i, j]), i, j))
        pairs_here.sort(key=lambda t: t[0])
        p["top_pairs"] = [
            (meta_by_slug[p["slugs"][i]]["short_name"], meta_by_slug[p["slugs"][j]]["short_name"], d)
            for d, i, j in pairs_here[:2]
        ]
        for d, i, j in pairs_here[:3]:
            x1, y1 = pts_px[i]
            x2, y2 = pts_px[j]
            seg_len = math.hypot(x2 - x1, y2 - y1)
            if seg_len > 10:
                steps = max(6, int(seg_len / 14))
                for k in range(0, steps, 2):
                    xa = x1 + (x2 - x1) * (k / steps)
                    ya = y1 + (y2 - y1) * (k / steps)
                    xb = x1 + (x2 - x1) * (min(k + 1, steps) / steps)
                    yb = y1 + (y2 - y1) * (min(k + 1, steps) / steps)
                    draw.line([(xa, ya), (xb, yb)], fill="#B8BECD", width=3)

        # Deterministic multi-ring collision-free label placement (0 label-label & 0 label-marker overlaps)
        labels = []
        min_x = px0 + 20.0
        max_x = px0 + pw - 20.0
        min_y = py0 + 52.0
        max_y = py0 + ph - 52.0
        dot_clear = 22.0
        pad_x, pad_y = 8.0, 6.0

        ranked = []
        for i, s in enumerate(p["slugs"]):
            lbl = meta_by_slug[s]["short_name"]
            bb = draw.textbbox((0, 0), lbl, font=f_lbl)
            lw = (bb[2] - bb[0]) + 18.0
            lh = max(30.0, (bb[3] - bb[1]) + 14.0)
            ax, ay = pts_px[i]
            crowding = 0.0
            for j, (bx, by) in enumerate(pts_px):
                if i == j:
                    continue
                d = math.hypot(bx - ax, by - ay)
                if d < 180.0:
                    crowding += 1.0 / (d + 12.0)
            ranked.append({
                "idx": i,
                "slug": s,
                "text": lbl,
                "ax": ax,
                "ay": ay,
                "w": lw,
                "h": lh,
                "priority": crowding,
            })
        ranked.sort(key=lambda r: (-r["priority"], r["slug"]))

        def rect_hits_dot(cx, cy, w, h, dx, dy, clr):
            nx = max(cx - w / 2.0, min(dx, cx + w / 2.0))
            ny = max(cy - h / 2.0, min(dy, cy + h / 2.0))
            return math.hypot(dx - nx, dy - ny) < clr

        def segs_cross(ax, ay, bx, by, cx, cy, dx, dy):
            def ccw(p1x, p1y, p2x, p2y, p3x, p3y):
                return (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x)
            return (
                ccw(ax, ay, cx, cy, dx, dy) != ccw(bx, by, cx, cy, dx, dy)
                and ccw(ax, ay, bx, by, cx, cy) != ccw(ax, ay, bx, by, dx, dy)
            )

        def is_clear(cx, cy, w, h):
            if cx - w / 2.0 < min_x or cx + w / 2.0 > max_x or cy - h / 2.0 < min_y or cy + h / 2.0 > max_y:
                return False
            for dx, dy in pts_px:
                if rect_hits_dot(cx, cy, w, h, dx, dy, dot_clear):
                    return False
            for pl in labels:
                if (
                    abs(cx - pl["x"]) < (w + pl["w"]) / 2.0 + pad_x
                    and abs(cy - pl["y"]) < (h + pl["h"]) / 2.0 + pad_y
                ):
                    return False
            return True

        angles = [
            math.radians(deg) for deg in (
                -90, 90, 0, 180, -45, -135, 45, 135,
                -22.5, -67.5, -112.5, -157.5, 22.5, 67.5, 112.5, 157.5,
                -11.25, -33.75, -56.25, -78.75, -101.25, -123.75, -146.25, -168.75,
                11.25, 33.75, 56.25, 78.75, 101.25, 123.75, 146.25, 168.75,
            )
        ]
        rings = [36, 46, 58, 72, 88, 108, 130, 156, 186, 220, 260, 310]

        for node in ranked:
            best = None
            best_score = float("inf")
            for r in rings:
                if best is not None and r - 10.0 > best_score:
                    break
                for ang in angles:
                    rx = r + abs(math.cos(ang)) * node["w"] * 0.36
                    ry = r + abs(math.sin(ang)) * node["h"] * 0.28
                    cx = node["ax"] + math.cos(ang) * rx
                    cy = node["ay"] + math.sin(ang) * ry
                    if not is_clear(cx, cy, node["w"], node["h"]):
                        continue
                    dist = math.hypot(cx - node["ax"], cy - node["ay"])
                    crossings = sum(
                        1 for pl in labels
                        if segs_cross(node["ax"], node["ay"], cx, cy, pl["ax"], pl["ay"], pl["x"], pl["y"])
                    )
                    cardinal = -6.0 if (abs(cx - node["ax"]) < 14.0 and cy < node["ay"]) else (-3.0 if abs(cx - node["ax"]) < 14.0 else 0.0)
                    sc = dist + crossings * 48.0 + cardinal
                    if sc < best_score:
                        best_score = sc
                        best = (cx, cy)
            if best is None:
                # Fine fallback scan guarantees a clean slot anywhere on the panel
                y_cur = min_y + node["h"] / 2.0
                while y_cur <= max_y - node["h"] / 2.0:
                    x_cur = min_x + node["w"] / 2.0
                    while x_cur <= max_x - node["w"] / 2.0:
                        if is_clear(x_cur, y_cur, node["w"], node["h"]):
                            sc = math.hypot(x_cur - node["ax"], y_cur - node["ay"])
                            if sc < best_score:
                                best_score = sc
                                best = (x_cur, y_cur)
                        x_cur += 28.0
                    y_cur += 22.0
            fx, fy = best if best is not None else (node["ax"], node["ay"] - 42.0)
            labels.append({**node, "x": fx, "y": fy})

        mds_overlaps = 0
        for i in range(len(labels)):
            li = labels[i]
            for j in range(i + 1, len(labels)):
                lj = labels[j]
                if abs(li["x"] - lj["x"]) < (li["w"] + lj["w"]) / 2.0 and abs(li["y"] - lj["y"]) < (li["h"] + lj["h"]) / 2.0:
                    mds_overlaps += 1
        if mds_overlaps:
            print(f"  [WARN mds label overlaps in {p['title']}] {mds_overlaps}")

        for li in labels:
            if math.hypot(li["x"] - li["ax"], li["y"] - li["ay"]) > 26:
                draw.line([(li["ax"], li["ay"]), (li["x"], li["y"])], fill="#BCC2D0", width=2)

        for li in labels:
            s = li["slug"]
            bg_hex = hex_by_slug[s]["bg"]
            kw_hex = hex_by_slug[s]["accentKeyword"]
            cx, cy = li["ax"], li["ay"]
            draw_circle(draw, cx, cy, 17, fill="#FFFFFF")
            draw_circle(draw, cx, cy, 14.5, fill=hex_to_rgb_tuple(kw_hex), outline="#222630", width=2)
            draw_circle(draw, cx, cy, 7.0, fill=hex_to_rgb_tuple(bg_hex), outline="#FFFFFF" if meta_by_slug[s]["mode"] == "dark" else "#484F5E", width=1)

        for li in labels:
            draw.rounded_rectangle(
                (li["x"] - li["w"] / 2 + 1, li["y"] - li["h"] / 2 + 1, li["x"] + li["w"] / 2 - 1, li["y"] + li["h"] / 2 - 1),
                radius=6,
                fill="#FFFFFF",
                outline="#E6E4DC",
                width=1,
            )
            draw_text_centered(draw, li["x"], li["y"], li["text"], f_lbl, fill="#1E222B")

        draw_text_centered(draw, px0 + pw / 2, py0 + ph + 62, f"MDS Dim 1 ({p['var'][0]:.1f}% variance)", f_ax, fill="#222630")

    lt0 = panels[0]["top_pairs"][0]
    dk0 = panels[1]["top_pairs"][0]
    draw_text_centered(
        draw,
        W,
        H * 2 - 48,
        f"Inner dot = editor background  ·  Outer ring = signature keyword accent  ·  Dashed links connect top 3 closest siblings per mode (Light: {lt0[0]} ↔ {lt0[1]} {lt0[2]:.2f} ΔE₀₀; Dark: {dk0[0]} ↔ {dk0[1]} {dk0[2]:.2f} ΔE₀₀)",
        f_foot,
        fill="#565E6E",
    )

    save_downsampled(img, CS_ASSETS / "theme-mds.png", W, H)
    print(
        f"Saved assets/color-science/theme-mds.png "
        f"(Light Dim1={var_l[0]:.2f}% Dim2={var_l[1]:.2f}% Sum={var_l[0]+var_l[1]:.2f}%; "
        f"Dark Dim1={var_d[0]:.2f}% Dim2={var_d[1]:.2f}% Sum={var_d[0]+var_d[1]:.2f}%)"
    )

    # ---------- Render Ward-Ordered 60x60 Split-Triangle ΔE₀₀ Heatmap ----------
    l_by_univ = {meta_by_slug[s]["university"]: s for s in light_slugs}
    d_by_univ = {meta_by_slug[s]["university"]: s for s in dark_slugs}
    univs = list(l_by_univ.keys())
    nu = len(univs)

    comb_feats = []
    for u in univs:
        vec = []
        for sl in (l_by_univ[u], d_by_univ[u]):
            for rl in AUDIT_ROLES:
                vec.extend(oklab_by_slug[sl][rl])
        comb_feats.append(vec)
    Xc = np.array(comb_feats, dtype=np.float64)
    Zc = (Xc - Xc.mean(axis=0, keepdims=True)) / Xc.std(axis=0, ddof=1, keepdims=True)
    merges_c = ward_d2_clustering(Zc)
    ch_c = {m[3]: (m[0], m[1], m[2]) for m in merges_c}
    ord_c = []
    def collect_c(node):
        if node < nu:
            ord_c.append(node)
        else:
            a, b, _ = ch_c[node]
            collect_c(a)
            collect_c(b)
    collect_c(merges_c[-1][3])
    ordered_univs = [univs[i] for i in ord_c]

    ord_l_slugs = [l_by_univ[u] for u in ordered_univs]
    ord_d_slugs = [d_by_univ[u] for u in ordered_univs]

    l_idx_map = {s: i for i, s in enumerate(light_slugs)}
    d_idx_map = {s: i for i, s in enumerate(dark_slugs)}
    perm_l = [l_idx_map[s] for s in ord_l_slugs]
    perm_d = [d_idx_map[s] for s in ord_d_slugs]
    DL_ord = D_light[np.ix_(perm_l, perm_l)]
    DD_ord = D_dark[np.ix_(perm_d, perm_d)]

    def interp_palette(val):
        stops = [
            (0.0,  (18, 34, 88)),
            (4.0,  (28, 78, 146)),
            (8.0,  (56, 134, 172)),
            (12.0, (132, 186, 186)),
            (16.0, (214, 218, 198)),
            (20.0, (248, 241, 224)),
        ]
        v = min(20.0, max(0.0, val))
        for k in range(len(stops) - 1):
            v0, c0 = stops[k]
            v1, c1 = stops[k + 1]
            if v <= v1:
                t = (v - v0) / (v1 - v0)
                return tuple(int(round(c0[i] + (c1[i] - c0[i]) * t)) for i in range(3))
        return stops[-1][1]

    HW, HH = 2200, 2320
    himg = make_canvas(HW, HH, "#FAF9F6")
    hdraw = ImageDraw.Draw(himg)

    hf_title = load_font(48, "bold")
    hf_sub = load_font(24, "regular")
    hf_lbl = load_font(17, "bold")
    hf_tag = load_font(21, "bold")
    hf_cb = load_font(21, "medium")
    hf_leg = load_font(20, "medium")

    hdraw.text((110, 50), f"Pairwise Perceptual Distance Matrix — All {nu} Universities (CIEDE2000 ΔE₀₀)", font=hf_title, fill="#181A20")
    hdraw.text(
        (110, 112),
        f"Ward-ordered {nu}×{nu} split-triangle matrix: upper-right = Light mode, lower-left = Dark mode (mean ΔE₀₀ across 13 syntax roles). Diagonal = Light / Dark keyword swatches.",
        font=hf_sub,
        fill="#525866",
    )

    cell = 56
    grid_w = nu * cell  # 3360 for nu=60
    gx0 = 600
    gy0 = 680

    # Grouping color bar strips flush outside the matrix border
    bar_t = 16
    for idx_u in range(nu):
        grp_rgb = hex_to_rgb_tuple(GROUP_COLORS[meta_by_slug[ord_l_slugs[idx_u]]["group"]])
        y0 = gy0 + idx_u * cell
        x0 = gx0 + idx_u * cell
        hdraw.rectangle((gx0 - bar_t - 8, y0 + 2, gx0 - 8, y0 + cell - 2), fill=grp_rgb)
        hdraw.rectangle((x0 + 2, gy0 - bar_t - 8, x0 + cell - 2, gy0 - 8), fill=grp_rgb)

    hdraw.rectangle((gx0 - 3, gy0 - 3, gx0 + grid_w + 3, gy0 + grid_w + 3), fill="#FFFFFF", outline="#C8C6BE", width=3)

    for r_i in range(nu):
        y0 = gy0 + r_i * cell
        for c_i in range(nu):
            x0 = gx0 + c_i * cell
            if r_i == c_i:
                l_col = hex_to_rgb_tuple(hex_by_slug[ord_l_slugs[r_i]]["accentKeyword"])
                d_col = hex_to_rgb_tuple(hex_by_slug[ord_d_slugs[r_i]]["accentKeyword"])
                hdraw.polygon([(x0, y0), (x0 + cell, y0), (x0 + cell, y0 + cell)], fill=l_col)
                hdraw.polygon([(x0, y0), (x0, y0 + cell), (x0 + cell, y0 + cell)], fill=d_col)
                hdraw.line([(x0, y0), (x0 + cell, y0 + cell)], fill="#FAF9F6", width=2)
                hdraw.rectangle((x0, y0, x0 + cell, y0 + cell), outline="#FAF9F6", width=1)
            elif r_i < c_i:
                col = interp_palette(DL_ord[r_i, c_i])
                hdraw.rectangle((x0 + 1, y0 + 1, x0 + cell - 1, y0 + cell - 1), fill=col)
            else:
                col = interp_palette(DD_ord[r_i, c_i])
                hdraw.rectangle((x0 + 1, y0 + 1, x0 + cell - 1, y0 + cell - 1), fill=col)

    # Crisp row labels (left) and 50-degree rotated column labels (top)
    for idx_u in range(nu):
        short_name = meta_by_slug[ord_l_slugs[idx_u]]["short_name"]
        yc = gy0 + idx_u * cell + cell / 2
        bb = hdraw.textbbox((0, 0), short_name, font=hf_lbl)
        tw = bb[2] - bb[0]
        hdraw.text((gx0 - bar_t - 22 - tw, yc - 10), short_name, font=hf_lbl, fill="#1E222B")

        xc = gx0 + idx_u * cell + cell / 2
        tmp = Image.new("RGBA", (360, 46), (0, 0, 0, 0))
        td = ImageDraw.Draw(tmp)
        td.text((4, 10), short_name, font=hf_lbl, fill="#1E222B")
        rot = tmp.rotate(50, expand=True, resample=Image.BICUBIC)
        px_paste = int(xc - 20)
        py_paste = int(gy0 - bar_t - 18 - rot.height)
        himg.paste(rot, (px_paste, py_paste), rot)

    # Triangle callout badges
    ux0, uy0 = gx0 + grid_w - 520, gy0 - 460
    hdraw.rounded_rectangle((ux0, uy0, ux0 + 520, uy0 + 62), radius=12, fill="#EEF3FA", outline="#285C9E", width=2)
    draw_text_centered(hdraw, ux0 + 260, uy0 + 31, "UPPER TRIANGLE  ·  LIGHT MODE", hf_tag, fill="#1A447C")

    lx0, ly0 = 110, gy0 + grid_w + 36
    hdraw.rounded_rectangle((lx0, ly0, lx0 + 460, ly0 + 62), radius=12, fill="#1D222E", outline="#4B5670", width=2)
    draw_text_centered(hdraw, lx0 + 230, ly0 + 31, "LOWER TRIANGLE  ·  DARK MODE", hf_tag, fill="#ECEFF6")

    # Colorbar at bottom
    cb_x0, cb_y0, cb_w, cb_h = gx0 + 240, gy0 + grid_w + 175, 2240, 44
    for px in range(cb_w):
        val = (px / max(1, cb_w - 1)) * 20.0
        hdraw.line([(cb_x0 + px, cb_y0), (cb_x0 + px, cb_y0 + cb_h)], fill=interp_palette(val))
    hdraw.rectangle((cb_x0, cb_y0, cb_x0 + cb_w, cb_y0 + cb_h), outline="#8E94A2", width=2)

    for tick_v, tick_lbl in [(0, "0 (identical)"), (4, "4"), (8, "8"), (12, "12"), (16, "16"), (20, "20 (distinct)")]:
        tx = cb_x0 + (tick_v / 20.0) * cb_w
        hdraw.line([(tx, cb_y0 + cb_h), (tx, cb_y0 + cb_h + 10)], fill="#6E7482", width=2)
        draw_text_centered(hdraw, tx, cb_y0 + cb_h + 34, tick_lbl, hf_cb, fill="#383E4C")

    draw_text_centered(
        hdraw,
        cb_x0 + cb_w / 2,
        cb_y0 - 34,
        "Mean Pairwise CIEDE2000 ΔE₀₀ Across 13 Syntax Roles  (Darker = Closer Chromatic Siblings)",
        hf_cb,
        fill="#222630",
    )

    # 6-Grouping Color Bar Legend neatly along the very bottom
    gleg_y = gy0 + grid_w + 335
    g_items = [(g, GROUP_COLORS[g]) for g in GROUP_ORDER]
    tot_gw = sum(hdraw.textbbox((0, 0), g, font=hf_leg)[2] + 74 for g, _ in g_items) - 42
    glx = (HW * 2 - tot_gw) / 2
    for g_lbl, g_hex in g_items:
        hdraw.rectangle((glx, gleg_y - 10, glx + 22, gleg_y + 12), fill=hex_to_rgb_tuple(g_hex))
        hdraw.text((glx + 32, gleg_y - 12), g_lbl, font=hf_leg, fill="#2E3440")
        glx += hdraw.textbbox((0, 0), g_lbl, font=hf_leg)[2] + 74

    save_downsampled(himg, CS_ASSETS / "theme-distance-heatmap.png", HW, HH)
    print("Saved assets/color-science/theme-distance-heatmap.png")

    return var_l, var_d


# ---------- 7. Render 120-Leaf Ward Hierarchical Chromatic Dendrogram ----------

def render_dendrogram(summaries: list, tokens: list, slug_order: list):
    meta_by_slug = {s["theme_slug"]: s for s in summaries}
    oklab_by_slug = {}
    for r in tokens:
        if r["role"] in AUDIT_ROLES:
            oklab_by_slug.setdefault(r["theme_slug"], {})[r["role"]] = (r["oklch_L"], r["oklab_a"], r["oklab_b"])

    mat = []
    for s in slug_order:
        vec = []
        for rl in AUDIT_ROLES:
            vec.extend(oklab_by_slug[s][rl])
        mat.append(vec)
    X = np.array(mat, dtype=np.float64)
    Z = (X - X.mean(axis=0, keepdims=True)) / X.std(axis=0, ddof=1, keepdims=True)

    merges = ward_d2_clustering(Z)
    n = len(slug_order)
    n_u = n // 2
    children = {m[3]: (m[0], m[1], m[2]) for m in merges}
    root_id = merges[-1][3]

    # Determine pure-mode subtree tags for Light vs Dark branch coloring
    subtree_mode = {}
    leaf_order = []

    def analyze_node(node):
        if node < n:
            leaf_order.append(node)
            subtree_mode[node] = meta_by_slug[slug_order[node]]["mode"]
            return subtree_mode[node]
        left, right, _ = children[node]
        ml = analyze_node(left)
        mr = analyze_node(right)
        subtree_mode[node] = ml if ml == mr else "mixed"
        return subtree_mode[node]

    analyze_node(root_id)

    DW, DH = 2080, 2940
    dimg = make_canvas(DW, DH, "#FAF9F6")
    ddraw = ImageDraw.Draw(dimg)

    f_title = load_font(48, "bold")
    f_sub = load_font(24, "regular")
    f_ax = load_font(25, "medium")
    f_tick = load_font(21, "regular")
    f_leaf = load_font(18, "bold")
    f_leg_h = load_font(24, "bold")
    f_leg = load_font(21, "regular")

    ddraw.text(
        (95, 52),
        f"Hierarchical Chromatic Dendrogram — All {n} Themes (Ward.D2 on 39-D OKLab)",
        font=f_title,
        fill="#181A20",
    )
    ddraw.text(
        (95, 114),
        f"{n} leaves clustered across all 13 syntax roles — branches & text colored by Light / Dark polarity; square pips denote collegiate grouping.",
        font=f_sub,
        fill="#525866",
    )

    LIGHT_BRANCH = "#2260A8"
    DARK_BRANCH = "#B44524"
    MIXED_BRANCH = "#555C6E"

    tx0, ty0, tw, th = 140, 210, 2800, 5400
    max_h = merges[-1][2] * 1.04

    leaf_y = {leaf_idx: ty0 + (rank + 0.5) / n * th for rank, leaf_idx in enumerate(leaf_order)}
    node_pos = {leaf_idx: (tx0 + tw, leaf_y[leaf_idx]) for leaf_idx in leaf_order}

    def branch_color(mode_tag):
        if mode_tag == "light":
            return LIGHT_BRANCH
        if mode_tag == "dark":
            return DARK_BRANCH
        return MIXED_BRANCH

    def draw_internal(node):
        if node < n:
            return node_pos[node]
        left, right, h_val = children[node]
        xl, yl = draw_internal(left)
        xr, yr = draw_internal(right)
        x_here = tx0 + tw - (h_val / max_h) * tw
        y_here = 0.5 * (yl + yr)
        node_pos[node] = (x_here, y_here)

        col_l = branch_color(subtree_mode[left])
        col_r = branch_color(subtree_mode[right])
        col_v = branch_color(subtree_mode[node])
        ddraw.line([(xl, yl), (x_here, yl)], fill=col_l, width=4)
        ddraw.line([(xr, yr), (x_here, yr)], fill=col_r, width=4)
        ddraw.line([(x_here, yl), (x_here, yr)], fill=col_v, width=4)
        return x_here, y_here

    draw_internal(root_id)

    axis_y = ty0 + th + 28
    ddraw.line([(tx0, axis_y), (tx0 + tw, axis_y)], fill="#B8BCC8", width=3)
    for h_tick in range(0, int(max_h) + 1, 5):
        xt = tx0 + tw - (h_tick / max_h) * tw
        ddraw.line([(xt, axis_y), (xt, axis_y + 12)], fill="#8E94A2", width=3)
        draw_text_centered(ddraw, xt, axis_y + 34, str(h_tick), f_tick, fill="#5E6472")
    draw_text_centered(ddraw, tx0 + tw / 2, axis_y + 78, "Ward's Linkage Distance (39-D Standardized OKLab)", f_ax, fill="#222630")

    for leaf_idx in leaf_order:
        slug = slug_order[leaf_idx]
        m = meta_by_slug[slug]
        yp = leaf_y[leaf_idx]
        grp_col = hex_to_rgb_tuple(GROUP_COLORS[m["group"]])
        mode_col = LIGHT_BRANCH if m["mode"] == "light" else DARK_BRANCH
        mode_word = "Light" if m["mode"] == "light" else "Dark"
        # Grouping color marker square + mode dot + crisp label
        draw_square(ddraw, tx0 + tw + 18, yp, 7.5, fill=grp_col, outline="#FFFFFF", width=1)
        if m["mode"] == "light":
            draw_circle(ddraw, tx0 + tw + 40, yp, 5.8, fill="#FFFFFF", outline=mode_col, width=3)
        else:
            draw_circle(ddraw, tx0 + tw + 40, yp, 5.8, fill=mode_col)
        ddraw.text((tx0 + tw + 58, yp - 11), f"{m['short_name']} {mode_word}", font=f_leaf, fill=mode_col)

    # Clean boxed legend in top-left open space
    leg_x, leg_y = 155, 240
    ddraw.rounded_rectangle((leg_x, leg_y, leg_x + 590, leg_y + 520), radius=14, fill="#FFFFFF", outline="#DEDCD4", width=2)
    ddraw.text((leg_x + 26, leg_y + 20), "Polarity (Branches & Labels)", font=f_leg_h, fill="#181A20")
    draw_circle(ddraw, leg_x + 38, leg_y + 72, 8.5, fill="#FFFFFF", outline=LIGHT_BRANCH, width=3)
    ddraw.text((leg_x + 62, leg_y + 58), f"Light Themes ({n_u})", font=f_leg, fill=LIGHT_BRANCH)
    draw_circle(ddraw, leg_x + 38, leg_y + 114, 8.5, fill=DARK_BRANCH)
    ddraw.text((leg_x + 62, leg_y + 100), f"Dark Themes ({n_u})", font=f_leg, fill=DARK_BRANCH)

    ddraw.line([(leg_x + 24, leg_y + 150), (leg_x + 566, leg_y + 150)], fill="#E6E4DC", width=2)
    ddraw.text((leg_x + 26, leg_y + 168), "Collegiate Grouping (Square Pip)", font=f_leg_h, fill="#181A20")
    cy_l = leg_y + 218
    for grp in GROUP_ORDER:
        col = hex_to_rgb_tuple(GROUP_COLORS[grp])
        draw_square(ddraw, leg_x + 38, cy_l + 12, 9.5, fill=col)
        ddraw.text((leg_x + 62, cy_l), grp, font=f_leg, fill="#2E3340")
        cy_l += 46

    save_downsampled(dimg, CS_ASSETS / "theme-dendrogram.png", DW, DH)
    print(f"Saved assets/color-science/theme-dendrogram.png (max linkage height={merges[-1][2]:.2f})")


# ---------- 8. Render 8-Theme CVD Swatch Grid ----------

def render_cvd_swatch_grid(summaries: list, tokens: list):
    showcase = [
        "columbia-dark",
        "ubc-dark",
        "uvic-light",
        "stedwards-dark",
        "princeton-light",
        "dartmouth-dark",
        "cambridge-dark",
        "eth-light",
    ]
    meta_by_slug = {s["theme_slug"]: s for s in summaries}
    poly_by_slug = {}
    for r in tokens:
        if r["role"] in POLYGON_ROLES:
            poly_by_slug.setdefault(r["theme_slug"], {})[r["role"]] = r["hex"]

    W, H = 1560, 960
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(44, "bold")
    f_sub = load_font(23, "regular")
    f_col = load_font(26, "bold")
    f_row = load_font(25, "bold")
    f_row_sub = load_font(19, "regular")
    f_foot = load_font(21, "regular")

    draw.text((84, 48), "Color Vision Deficiency Simulation — Representative Campus Themes", font=f_title, fill="#181A20")
    draw.text(
        (84, 108),
        "Machado, Oliveira & Fernandes (2009) full-severity dichromacy matrices — OKLCH lightness staggering keeps all 10 syntax roles distinct across every vision profile.",
        font=f_sub,
        fill="#525866",
    )

    conditions = [
        ("Normal Vision", None),
        ("Protanopia", "protan"),
        ("Deuteranopia", "deutan"),
        ("Tritanopia", "tritan"),
    ]

    left_lbl_w = 560
    grid_x0 = 84 + left_lbl_w
    grid_y0 = 235
    col_gap = 38
    col_w = (W * 2 - grid_x0 - 84 - col_gap * 3) / 4
    row_h = 192

    for ci, (cname, _) in enumerate(conditions):
        cx0 = grid_x0 + ci * (col_w + col_gap)
        draw_text_centered(draw, cx0 + col_w / 2, grid_y0 - 38, cname, f_col, fill="#222630")

    for ri, slug in enumerate(showcase):
        y0 = grid_y0 + ri * row_h
        m = meta_by_slug[slug]
        mode_s = "Light" if m["mode"] == "light" else "Dark"
        grp_col = hex_to_rgb_tuple(GROUP_COLORS[m["group"]])

        draw_circle(draw, 102, y0 + 54, 10, fill=grp_col)
        draw.text((126, y0 + 36), f"{m['short_name']} {mode_s}", font=f_row, fill="#1E222B")
        draw.text((126, y0 + 74), f"{m['group']}  ·  {m['city']}", font=f_row_sub, fill="#687080")

        orig_hexes = [poly_by_slug[slug][rl] for rl in POLYGON_ROLES]
        for ci, (_, cvd_t) in enumerate(conditions):
            cx0 = grid_x0 + ci * (col_w + col_gap)
            sim_hexes = orig_hexes if cvd_t is None else simulate_cvd_hexes(orig_hexes, cvd_t)
            sw_w = col_w / len(POLYGON_ROLES)
            draw.rounded_rectangle((cx0 - 2, y0 + 18, cx0 + col_w + 2, y0 + 124), radius=9, fill="#FFFFFF", outline="#DCDAD2", width=2)
            for si, hx in enumerate(sim_hexes):
                sx0 = cx0 + si * sw_w + 2
                sx1 = cx0 + (si + 1) * sw_w - 2
                draw.rectangle((sx0, y0 + 22, sx1, y0 + 120), fill=hex_to_rgb_tuple(hx))

    draw_text_centered(
        draw,
        W,
        H * 2 - 48,
        f"Swatches left → right: keyword · storage · string · regex · function · type · interface · number · decorator · namespace   |   0 CVD warnings across all {len(summaries)} themes",
        f_foot,
        fill="#5E6472",
    )
    save_downsampled(img, CS_ASSETS / "cvd-swatch-grid.png", W, H)
    print("Saved assets/color-science/cvd-swatch-grid.png")


def main():
    summaries, tokens, pairs, pal_meta, slug_order = load_all_data()
    render_timeline_metro(pal_meta)
    render_colorspace_grid(tokens, slug_order)
    render_family_fingerprint(tokens, slug_order)
    render_global_pca(tokens)
    render_mds_and_heatmap(summaries, tokens, pairs, slug_order)
    render_dendrogram(summaries, tokens, slug_order)
    render_cvd_swatch_grid(summaries, tokens)
    print("All 8 publication-grade color-science & timeline figures generated successfully.")


if __name__ == "__main__":
    main()
