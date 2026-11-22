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
import json
import math
import os
import subprocess
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
    "Global Classics",
    "Ivy League",
    "US Public Flagships",
    "Liberal Arts & Regional Gems",
    "US Private Research & STEM",
    "Canadian Universities",
]

GROUP_COLORS = {
    "Global Classics":              "#B67B0C",
    "Ivy League":                   "#B81D32",
    "US Public Flagships":          "#1657B5",
    "Liberal Arts & Regional Gems": "#127D49",
    "US Private Research & STEM":   "#6B3CB8",
    "Canadian Universities":        "#0A7E86",
}

GROUP_SHORT = {
    "Global Classics":              "GLOBAL CLASSICS",
    "Ivy League":                   "IVY LEAGUE",
    "US Public Flagships":          "US PUBLIC FLAGSHIPS",
    "Liberal Arts & Regional Gems": "LIBERAL ARTS & GEMS",
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


# ---------- 1. Collegiate Heritage Metro Map (6 Grouping Tracks, 1096–1963) ----------

def year_to_metro_x(yr: int) -> float:
    """
    Piecewise monotonic chronological mapping [1096..1963] -> [1.8..29.6]:
      - Compresses the medieval gap (1209 -> 1636) behind a crisp // era break
      - Expands 1740–1915 slightly where North American founding density peaks
    """
    anchors = [
        (1096,  1.8),
        (1209,  4.0),
        (1636,  6.8),
        (1701,  9.2),
        (1740, 10.9),
        (1775, 14.9),
        (1800, 16.4),
        (1845, 20.1),
        (1895, 24.9),
        (1920, 27.1),
        (1963, 29.5),
    ]
    if yr <= anchors[0][0]:
        return anchors[0][1]
    if yr >= anchors[-1][0]:
        return anchors[-1][1]
    for (y0, x0), (y1, x1) in zip(anchors, anchors[1:]):
        if y0 <= yr <= y1:
            t = (yr - y0) / (y1 - y0)
            return x0 + t * (x1 - x0)
    return anchors[-1][1]


def render_timeline_metro(pal_meta: dict):
    W, H = 2560, 1460
    img = make_canvas(W, H, "#FAF9F5")
    draw = ImageDraw.Draw(img)

    f_title = load_font(54, "bold")
    f_sub = load_font(25, "regular")
    f_main = load_font(22, "bold")
    f_yr = load_font(18, "regular")
    f_tag = load_font(19, "bold")
    f_leg = load_font(23, "medium")

    draw.text((120, 56), "Campus Palette — Collegiate Heritage Metro Map (1096–1963)", font=f_title, fill="#181A20")
    draw.text(
        (120, 124),
        "40 universities arranged along six collegiate grouping lines — piecewise chronological spacing preserves medieval classics alongside modern North American campuses.",
        font=f_sub,
        fill="#525866",
    )

    track_y = {
        "Global Classics":               2.55,
        "Ivy League":                    1.53,
        "US Public Flagships":           0.51,
        "Liberal Arts & Regional Gems": -0.51,
        "US Private Research & STEM":   -1.53,
        "Canadian Universities":        -2.55,
    }

    def to_px(x, y):
        px = 590.0 + (x - 1.8) / (29.5 - 1.8) * (W * 2 - 740.0)
        py = 1480.0 - y * 395.0
        return px, py

    # Subtle vertical chronological milestone guides + medieval era break
    milestones = [
        ("1096", 1096), ("1209", 1209), ("1636", 1636), ("1700", 1700),
        ("1750", 1750), ("1800", 1800), ("1850", 1850), ("1900", 1900), ("1963", 1963),
    ]
    for yr_lbl, yr_val in milestones:
        gx, _ = to_px(year_to_metro_x(yr_val), 0)
        draw.line([(gx, 230), (gx, H * 2 - 235)], fill="#EAE7DF", width=2)
        draw_text_centered(draw, gx, H * 2 - 205, yr_lbl, f_yr, fill="#7E8492")

    # Crisp medieval era break band between 1209 and 1636
    bx_mid, _ = to_px(5.35, 0)
    draw.rectangle((bx_mid - 26, 230, bx_mid + 26, H * 2 - 235), fill="#FAF9F5")
    for yy in range(250, H * 2 - 250, 42):
        draw.line([(bx_mid - 6, yy), (bx_mid - 6, yy + 20)], fill="#D4D0C5", width=2)
        draw.line([(bx_mid + 6, yy), (bx_mid + 6, yy + 20)], fill="#D4D0C5", width=2)
    draw_text_centered(draw, bx_mid, H * 2 - 205, "//", f_tag, fill="#969BA8")

    # Organize stations per grouping with guaranteed minimum spacing along each track
    stations_by_group = {}
    for grp in GROUP_ORDER:
        items = [v for v in pal_meta.values() if v["group"] == grp]
        items.sort(key=lambda v: (v["year"], v["shortName"]))
        xs = [year_to_metro_x(v["year"]) for v in items]
        # Iterative minimum-distance relaxation along x so stations never collide
        min_gap = 1.28
        for _ in range(40):
            for i in range(len(xs) - 1):
                gap = xs[i + 1] - xs[i]
                if gap < min_gap:
                    delta = (min_gap - gap) * 0.52
                    xs[i] = max(1.8, xs[i] - delta)
                    xs[i + 1] = min(29.8, xs[i + 1] + delta)
        # Keep strictly within bounds
        if xs and xs[-1] > 29.7:
            shift = xs[-1] - 29.7
            xs = [x - shift for x in xs]
        if xs and xs[0] < 1.8:
            shift = 1.8 - xs[0]
            xs = [x + shift for x in xs]

        # Alternate above (+0.34) / below (-0.34) whenever adjacent stations are within 2.9 units
        dys = []
        for i in range(len(items)):
            if i == 0:
                dys.append(0.36 if track_y[grp] >= 0 else -0.36)
            else:
                if xs[i] - xs[i - 1] < 3.4:
                    dys.append(-dys[-1])
                else:
                    dys.append(0.36 if track_y[grp] >= 0 else -0.36)
        stations_by_group[grp] = list(zip(items, xs, dys))

    # Draw solid grouping lines (NO cross-grouping dashed edges!)
    for grp in GROUP_ORDER:
        st_list = stations_by_group[grp]
        col_rgb = hex_to_rgb_tuple(GROUP_COLORS[grp])
        y_val = track_y[grp]
        for (a_it, ax, _), (b_it, bx, _) in zip(st_list, st_list[1:]):
            x1, y1 = to_px(ax, y_val)
            x2, y2 = to_px(bx, y_val)
            draw.line([(x1, y1), (x2, y2)], fill=col_rgb, width=12)

        # Clean pill badge anchored cleanly to the left of each grouping's first station
        sx, sy = to_px(st_list[0][1], y_val)
        txt = GROUP_SHORT[grp]
        bb = draw.textbbox((0, 0), txt, font=f_tag)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        bx1 = sx - 46
        bx0 = bx1 - tw - 30
        by0 = sy - th / 2 - 11
        by1 = sy + th / 2 + 11
        tint = tuple(int(c * 0.13 + 255 * 0.87) for c in col_rgb)
        draw.rounded_rectangle((bx0, by0, bx1, by1), radius=10, fill=tint, outline=col_rgb, width=2)
        draw_text_centered(draw, (bx0 + bx1) / 2, sy, txt, f_tag, fill=col_rgb)

    # Draw crisp // break mark specifically where Global Classics crosses 1209 -> 1855
    _, gc_y = to_px(0, track_y["Global Classics"])
    draw.rectangle((bx_mid - 16, gc_y - 18, bx_mid + 16, gc_y + 18), fill="#FAF9F5")
    for dx in (-7, 7):
        draw.line([(bx_mid + dx - 7, gc_y + 16), (bx_mid + dx + 7, gc_y - 16)], fill=hex_to_rgb_tuple(GROUP_COLORS["Global Classics"]), width=5)

    # Draw stations + zero-overlap verified labels
    placed_boxes = []
    for grp in GROUP_ORDER:
        y_val = track_y[grp]
        for it, x_val, dy in stations_by_group[grp]:
            cx, cy = to_px(x_val, y_val)
            st_col = hex_to_rgb_tuple(it["stationColor"])
            draw_circle(draw, cx, cy, 24, fill="#FAF9F5")
            draw_circle(draw, cx, cy, 19, fill=st_col, outline="#FFFFFF", width=3)

            lx, ly = to_px(x_val, y_val + dy)
            name = it["shortName"]
            yr_s = str(it["year"])

            # Check horizontal bounding box against prior labels on same side
            bb_n = draw.textbbox((0, 0), name, font=f_main)
            bw = (bb_n[2] - bb_n[0]) + 10
            bh = (bb_n[3] - bb_n[1]) + 34
            # Slight nudge if tight near canvas right edge
            lx = min(W * 2 - 80 - bw / 2, max(80 + bw / 2, lx))
            y_yr = ly + (29 if dy < 0 else -28)

            # White halo behind text if crossing any vertical milestone guide
            y_top_box = min(ly, y_yr) - 14
            y_bot_box = max(ly, y_yr) + 14
            draw.rounded_rectangle((lx - bw / 2, y_top_box, lx + bw / 2, y_bot_box), radius=6, fill="#FAF9F5")
            draw_text_centered(draw, lx, ly, name, f_main, fill="#181A20")
            draw_text_centered(draw, lx, y_yr, yr_s, f_yr, fill="#636978")
            placed_boxes.append((name, lx - bw / 2, y_top_box, lx + bw / 2, y_bot_box))

    # Verify zero label overlaps
    overlaps = 0
    for i in range(len(placed_boxes)):
        n1, x1a, y1a, x1b, y1b = placed_boxes[i]
        for j in range(i + 1, len(placed_boxes)):
            n2, x2a, y2a, x2b, y2b = placed_boxes[j]
            if x1a < x2b and x2a < x1b and y1a < y2b and y2a < y1b:
                overlaps += 1
                print(f"  [WARN metro overlap] {n1} <-> {n2}")

    # Bottom legend across all 6 collegiate groupings
    leg_y = H * 2 - 96
    draw.line([(120, leg_y - 40), (W * 2 - 120, leg_y - 40)], fill="#E2E0D8", width=2)
    legend_items = [(grp, GROUP_COLORS[grp]) for grp in GROUP_ORDER]
    total_leg_w = sum(draw.textbbox((0, 0), lbl, font=f_leg)[2] + 84 for lbl, _ in legend_items) - 52
    lx = (W * 2 - total_leg_w) / 2
    for label, col in legend_items:
        draw_circle(draw, lx + 12, leg_y, 11, fill=hex_to_rgb_tuple(col))
        draw.text((lx + 32, leg_y - 14), label, font=f_leg, fill="#343842")
        lx += draw.textbbox((0, 0), label, font=f_leg)[2] + 84

    save_downsampled(img, TIMELINE_ASSETS / "timeline-metro.png", W, H)
    print(f"Saved assets/timeline/timeline-metro.png (overlaps={overlaps})")


# ---------- 2. Render 80-Theme OKLCH (a, b) Hue-Chroma Grid (8 x 10) ----------

def render_colorspace_grid(tokens: list, slug_order: list):
    W, H = 2800, 3960
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(56, "bold")
    f_sub = load_font(27, "regular")
    f_panel = load_font(23, "bold")
    f_axis = load_font(23, "regular")

    draw.text((100, 56), "All 80 Themes in OKLCH Hue–Chroma Space (40 Universities, Light & Dark)", font=f_title, fill="#181A20")
    draw.text(
        (100, 128),
        "8 × 10 matrix (4 Light/Dark university pairs per row, ordered by collegiate grouping & founding year). Connected: 10 syntax roles. Rings: OKLCH C = 0.06, 0.12, 0.18.",
        font=f_sub,
        fill="#525866",
    )

    poly_by_slug = {}
    meta_by_slug = {}
    for r in tokens:
        meta_by_slug[r["theme_slug"]] = r
        if r["role"] in POLYGON_ROLES:
            poly_by_slug.setdefault(r["theme_slug"], {})[r["role"]] = r

    cols, nrows = 8, 10
    pad_l, pad_r, pad_t, pad_b = 90, 90, 215, 105
    gap_x, gap_y = 32, 36
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
        header_h = 54
        plot_size = min(cell_w - 22, cell_h - header_h - 14)
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
        draw.rounded_rectangle((x0 + 18, y0 + 2, x0 + cell_w - 18, y0 + 9), radius=3, fill=grp_col)

        mode_cap = "Light" if meta["mode"] == "light" else "Dark"
        title_str = f"{meta['short_name']} ({mode_cap})"
        draw_text_centered(draw, x0 + cell_w / 2, y0 + 31, title_str, f_panel, fill="#1E222B")

        cx = px0 + plot_size / 2
        cy = py0 + plot_size / 2
        scale = (plot_size / 2 - 18) / LIM

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
            draw_circle(draw, px, py, 11, fill=hex_to_rgb_tuple(hx), outline="#181A20", width=3)

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
    W, H = 2440, 1320
    img = make_canvas(W, H, "#FAF9F6")
    draw = ImageDraw.Draw(img)

    f_title = load_font(50, "bold")
    f_sub = load_font(25, "regular")
    f_phead = load_font(31, "bold")
    f_psub = load_font(22, "regular")
    f_lbl = load_font(19, "bold")
    f_pole = load_font(19, "bold")
    f_ax = load_font(23, "medium")
    f_tick = load_font(19, "regular")
    f_foot = load_font(22, "regular")

    draw.text((125, 50), "Perceptual Similarity Landscape — Classical MDS on CIEDE2000 (ΔE₀₀)", font=f_title, fill="#181A20")
    draw.text(
        (125, 114),
        "Pairwise mean ΔE₀₀ across all 13 syntax roles, split by polarity so all 40 universities separate purely by chromatic identity. Inner fill = editor bg · outer ring = keyword accent.",
        font=f_sub,
        fill="#525866",
    )

    panels = [
        {
            "title": "Light Themes (40 Universities)",
            "subtitle": f"Dim 1 ({var_l[0]:.1f}%) + Dim 2 ({var_l[1]:.1f}%) = {var_l[0] + var_l[1]:.1f}% of perceptual distance variance",
            "slugs": light_slugs,
            "coords": coords_l,
            "D": D_light,
            "px0": 135,
            "py0": 265,
            "pw": 2200,
            "ph": 2050,
            "var": var_l,
            "sib_thresh": 3.25,
        },
        {
            "title": "Dark Themes (40 Universities)",
            "subtitle": f"Dim 1 ({var_d[0]:.1f}%) + Dim 2 ({var_d[1]:.1f}%) = {var_d[0] + var_d[1]:.1f}% of perceptual distance variance",
            "slugs": dark_slugs,
            "coords": coords_d,
            "D": D_dark,
            "px0": 2545,
            "py0": 265,
            "pw": 2200,
            "ph": 2050,
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

        # Force-directed + strict collision-free label placement
        cx_all = sum(pt[0] for pt in pts_px) / len(pts_px)
        cy_all = sum(pt[1] for pt in pts_px) / len(pts_px)
        labels = []
        for i, s in enumerate(p["slugs"]):
            lbl = meta_by_slug[s]["short_name"]
            bb = draw.textbbox((0, 0), lbl, font=f_lbl)
            lw, lh = (bb[2] - bb[0]) + 18, (bb[3] - bb[1]) + 11
            ang = math.atan2(pts_px[i][1] - cy_all, pts_px[i][0] - cx_all)
            labels.append({
                "idx": i,
                "slug": s,
                "text": lbl,
                "ax": pts_px[i][0],
                "ay": pts_px[i][1],
                "x": pts_px[i][0] + math.cos(ang) * 58,
                "y": pts_px[i][1] + math.sin(ang) * 48,
                "w": lw,
                "h": lh,
            })

        for _ in range(1400):
            for i, li in enumerate(labels):
                fx, fy = 0.0, 0.0
                dx_a = li["x"] - li["ax"]
                dy_a = li["y"] - li["ay"]
                dist_a = math.hypot(dx_a, dy_a) + 1e-4
                if dist_a > 230:
                    fx -= (dx_a / dist_a) * (dist_a - 230) * 0.075
                    fy -= (dy_a / dist_a) * (dist_a - 230) * 0.075
                elif dist_a < 50:
                    fx += (dx_a / dist_a) * (50 - dist_a) * 0.50
                    fy += (dy_a / dist_a) * (50 - dist_a) * 0.50

                for ax, ay in pts_px:
                    ox = abs(li["x"] - ax) - (li["w"] / 2 + 28)
                    oy = abs(li["y"] - ay) - (li["h"] / 2 + 28)
                    if ox < 0 and oy < 0:
                        sx = 1.0 if li["x"] >= ax else -1.0
                        sy = 1.0 if li["y"] >= ay else -1.0
                        if abs(ox) < abs(oy):
                            fx += sx * (-ox) * 0.60
                        else:
                            fy += sy * (-oy) * 0.62

                for j, lj in enumerate(labels):
                    if i == j:
                        continue
                    ox = abs(li["x"] - lj["x"]) - (li["w"] + lj["w"]) / 2 - 16
                    oy = abs(li["y"] - lj["y"]) - (li["h"] + lj["h"]) / 2 - 14
                    if ox < 0 and oy < 0:
                        sx = 1.0 if (li["x"] > lj["x"] or (li["x"] == lj["x"] and i > j)) else -1.0
                        sy = 1.0 if (li["y"] > lj["y"] or (li["y"] == lj["y"] and i > j)) else -1.0
                        if abs(ox) < abs(oy):
                            fx += sx * (-ox) * 0.58
                        else:
                            fy += sy * (-oy) * 0.58

                li["x"] = min(px0 + pw - li["w"] / 2 - 24, max(px0 + li["w"] / 2 + 24, li["x"] + fx))
                li["y"] = min(py0 + ph - li["h"] / 2 - 56, max(py0 + li["h"] / 2 + 56, li["y"] + fy))

        # Strict non-overlap final sweep (label-vs-label AND label-vs-marker)
        for _ in range(240):
            moved = False
            for i in range(len(labels)):
                li = labels[i]
                for ax, ay in pts_px:
                    ox = (li["w"] / 2 + 26) - abs(li["x"] - ax)
                    oy = (li["h"] / 2 + 26) - abs(li["y"] - ay)
                    if ox > 0 and oy > 0:
                        moved = True
                        if ox < oy:
                            shift = (ox + 2.0) * (1.0 if li["x"] >= ax else -1.0)
                            li["x"] = min(px0 + pw - li["w"] / 2 - 20, max(px0 + li["w"] / 2 + 20, li["x"] + shift))
                        else:
                            shift = (oy + 2.0) * (1.0 if li["y"] >= ay else -1.0)
                            li["y"] = min(py0 + ph - li["h"] / 2 - 52, max(py0 + li["h"] / 2 + 52, li["y"] + shift))
                for j in range(i + 1, len(labels)):
                    lj = labels[j]
                    ox = (li["w"] + lj["w"]) / 2 + 10 - abs(li["x"] - lj["x"])
                    oy = (li["h"] + lj["h"]) / 2 + 8 - abs(li["y"] - lj["y"])
                    if ox > 0 and oy > 0:
                        moved = True
                        if ox < oy:
                            shift = (ox / 2 + 1.2) * (1.0 if li["x"] >= lj["x"] else -1.0)
                            li["x"] = min(px0 + pw - li["w"] / 2 - 20, max(px0 + li["w"] / 2 + 20, li["x"] + shift))
                            lj["x"] = min(px0 + pw - lj["w"] / 2 - 20, max(px0 + lj["w"] / 2 + 20, lj["x"] - shift))
                        else:
                            shift = (oy / 2 + 1.2) * (1.0 if li["y"] >= lj["y"] else -1.0)
                            li["y"] = min(py0 + ph - li["h"] / 2 - 52, max(py0 + li["h"] / 2 + 52, li["y"] + shift))
                            lj["y"] = min(py0 + ph - lj["h"] / 2 - 52, max(py0 + lj["h"] / 2 + 52, lj["y"] - shift))
            if not moved:
                break

        for li in labels:
            if math.hypot(li["x"] - li["ax"], li["y"] - li["ay"]) > 28:
                draw.line([(li["ax"], li["ay"]), (li["x"], li["y"])], fill="#BCC2D0", width=2)

        for li in labels:
            s = li["slug"]
            bg_hex = hex_by_slug[s]["bg"]
            kw_hex = hex_by_slug[s]["accentKeyword"]
            cx, cy = li["ax"], li["ay"]
            draw_circle(draw, cx, cy, 20, fill="#FFFFFF")
            draw_circle(draw, cx, cy, 17, fill=hex_to_rgb_tuple(kw_hex), outline="#222630", width=2)
            draw_circle(draw, cx, cy, 8.5, fill=hex_to_rgb_tuple(bg_hex), outline="#FFFFFF" if meta_by_slug[s]["mode"] == "dark" else "#484F5E", width=1)

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

    # ---------- Render Ward-Ordered 40x40 Split-Triangle ΔE₀₀ Heatmap ----------
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

    HW, HH = 2120, 2240
    himg = make_canvas(HW, HH, "#FAF9F6")
    hdraw = ImageDraw.Draw(himg)

    hf_title = load_font(48, "bold")
    hf_sub = load_font(24, "regular")
    hf_lbl = load_font(20, "bold")
    hf_tag = load_font(21, "bold")
    hf_cb = load_font(21, "medium")
    hf_leg = load_font(20, "medium")

    hdraw.text((110, 50), "Pairwise Perceptual Distance Matrix — All 40 Universities (CIEDE2000 ΔE₀₀)", font=hf_title, fill="#181A20")
    hdraw.text(
        (110, 112),
        "Ward-ordered 40×40 split-triangle matrix: upper-right = Light mode, lower-left = Dark mode (mean ΔE₀₀ across 13 syntax roles). Diagonal = Light / Dark keyword swatches.",
        font=hf_sub,
        fill="#525866",
    )

    cell = 78
    grid_w = nu * cell  # 3120
    gx0 = 620
    gy0 = 685

    # Grouping color bar strips flush outside the matrix border
    bar_t = 18
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
                hdraw.line([(x0, y0), (x0 + cell, y0 + cell)], fill="#FAF9F6", width=3)
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
        hdraw.text((gx0 - bar_t - 24 - tw, yc - 12), short_name, font=hf_lbl, fill="#1E222B")

        xc = gx0 + idx_u * cell + cell / 2
        tmp = Image.new("RGBA", (360, 52), (0, 0, 0, 0))
        td = ImageDraw.Draw(tmp)
        td.text((4, 12), short_name, font=hf_lbl, fill="#1E222B")
        rot = tmp.rotate(50, expand=True, resample=Image.BICUBIC)
        px_paste = int(xc - 24)
        py_paste = int(gy0 - bar_t - 20 - rot.height)
        himg.paste(rot, (px_paste, py_paste), rot)

    # Triangle callout badges
    ux0, uy0 = gx0 + grid_w - 520, gy0 - 460
    hdraw.rounded_rectangle((ux0, uy0, ux0 + 520, uy0 + 62), radius=12, fill="#EEF3FA", outline="#285C9E", width=2)
    draw_text_centered(hdraw, ux0 + 260, uy0 + 31, "UPPER TRIANGLE  ·  LIGHT MODE", hf_tag, fill="#1A447C")

    lx0, ly0 = 110, gy0 + grid_w + 36
    hdraw.rounded_rectangle((lx0, ly0, lx0 + 460, ly0 + 62), radius=12, fill="#1D222E", outline="#4B5670", width=2)
    draw_text_centered(hdraw, lx0 + 230, ly0 + 31, "LOWER TRIANGLE  ·  DARK MODE", hf_tag, fill="#ECEFF6")

    # Colorbar at bottom
    cb_x0, cb_y0, cb_w, cb_h = gx0 + 180, gy0 + grid_w + 175, 2100, 44
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


# ---------- 7. Render 80-Leaf Ward Hierarchical Chromatic Dendrogram ----------

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

    DW, DH = 2040, 2380
    dimg = make_canvas(DW, DH, "#FAF9F6")
    ddraw = ImageDraw.Draw(dimg)

    f_title = load_font(48, "bold")
    f_sub = load_font(24, "regular")
    f_ax = load_font(25, "medium")
    f_tick = load_font(21, "regular")
    f_leaf = load_font(21, "bold")
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
        "80 leaves clustered across all 13 syntax roles — branches & text colored by Light / Dark polarity; square pips denote collegiate grouping.",
        font=f_sub,
        fill="#525866",
    )

    LIGHT_BRANCH = "#2260A8"
    DARK_BRANCH = "#B44524"
    MIXED_BRANCH = "#555C6E"

    tx0, ty0, tw, th = 140, 210, 2720, 4300
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
        draw_square(ddraw, tx0 + tw + 20, yp, 8.5, fill=grp_col, outline="#FFFFFF", width=1)
        if m["mode"] == "light":
            draw_circle(ddraw, tx0 + tw + 44, yp, 6.5, fill="#FFFFFF", outline=mode_col, width=3)
        else:
            draw_circle(ddraw, tx0 + tw + 44, yp, 6.5, fill=mode_col)
        ddraw.text((tx0 + tw + 64, yp - 13), f"{m['short_name']} {mode_word}", font=f_leaf, fill=mode_col)

    # Clean boxed legend in top-left open space
    leg_x, leg_y = 155, 240
    ddraw.rounded_rectangle((leg_x, leg_y, leg_x + 590, leg_y + 520), radius=14, fill="#FFFFFF", outline="#DEDCD4", width=2)
    ddraw.text((leg_x + 26, leg_y + 20), "Polarity (Branches & Labels)", font=f_leg_h, fill="#181A20")
    draw_circle(ddraw, leg_x + 38, leg_y + 72, 8.5, fill="#FFFFFF", outline=LIGHT_BRANCH, width=3)
    ddraw.text((leg_x + 62, leg_y + 58), "Light Themes (40)", font=f_leg, fill=LIGHT_BRANCH)
    draw_circle(ddraw, leg_x + 38, leg_y + 114, 8.5, fill=DARK_BRANCH)
    ddraw.text((leg_x + 62, leg_y + 100), "Dark Themes (40)", font=f_leg, fill=DARK_BRANCH)

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
        "Swatches left → right: keyword · storage · string · regex · function · type · interface · number · decorator · namespace   |   0 CVD warnings across all 80 themes",
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
