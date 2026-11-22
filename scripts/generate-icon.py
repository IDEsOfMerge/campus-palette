#!/usr/bin/env python3
"""
Programmatically renders the original Campus Palette extension icon (`icon.png`,
512x512 RGBA, 4x supersampled from 2048x2048) and copies it to `site/icon.png`.

Design (100% original algorithmic SDF geometry — zero university marks/logos):
  - 3D-beveled classical heater shield with brushed champagne-brass rim
  - Diagonal Light/Dark split face: warm campus limestone (left) vs deep
    Sorin/Oxford midnight navy (right) with a sculpted center groove
  - Upper chief band: five jewel-enameled collegiate color ribbon bars
    (Crimson, Sun Gold, Forest Emerald, Columbia Sky, Ocean Sapphire)
  - Lower center: 3D-beveled open book straddling the Light/Dark horizon
    (navy-slate left page on limestone, warm parchment right page on navy)
    with incised typography rules and a crimson-gold bookmark ribbon tail

Run with: python3 scripts/generate-icon.py
"""

import math
import os
import shutil
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, "icon.png")
SITE_ICON_PATH = os.path.join(ROOT, "site", "icon.png")

SIZE = 2048
FINAL_SIZE = 512


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1.0 - h) + a * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def sd_rounded_box(xs, ys, cx, cy, hx, hy, r):
    px = np.abs(xs - cx) - (hx - r)
    py = np.abs(ys - cy) - (hy - r)
    qx = np.maximum(px, 0.0)
    qy = np.maximum(py, 0.0)
    return np.hypot(qx, qy) + np.minimum(np.maximum(px, py), 0.0) - r


def sd_shield(xs, ys):
    """
    Exact C1-continuous classical architectural heater shield SDF:
      - Gently crowned top arch
      - Straight upper flanks transitioning tangentially into symmetric Gothic arcs
      - Smoothly rounded corners and lower apex
    """
    cx = SIZE * 0.5
    half_w = 720.0
    y_top = 200.0
    y_mid = 880.0
    y_bot = 1855.0

    # Gentle convex top crown arch (peaks 26px higher at center)
    dx_norm = np.clip((xs - cx) / half_w, -1.3, 1.3)
    d_top = (y_top - 24.0 * (1.0 - dx_norm * dx_norm)) - ys

    # Vertical flanks
    d_sides = np.abs(xs - cx) - half_w

    # Lower symmetric Gothic arcs tangent to x = cx +/- half_w at y = y_mid
    h_lo = y_bot - y_mid
    R = (half_w * half_w + h_lo * h_lo) / (2.0 * half_w)
    # Left boundary is right side of circle centered at (cx + R - half_w, y_mid)
    # Right boundary is right side of circle centered at (cx - R + half_w, y_mid)
    d_arc_r = np.hypot(xs - (cx - R + half_w), ys - y_mid) - R
    d_arc_l = np.hypot(xs - (cx + R - half_w), ys - y_mid) - R

    # Only enforce arcs below y_mid; above y_mid use vertical flanks
    d_lower = smax(d_arc_r, d_arc_l, 48.0)
    d_flanks = np.where(ys >= y_mid, d_lower, d_sides)
    # Smoothly blend near y_mid to avoid any subtle gradient crease
    w_blend = np.clip((ys - (y_mid - 40.0)) / 80.0, 0.0, 1.0)
    w_blend = w_blend * w_blend * (3.0 - 2.0 * w_blend)
    d_body = d_sides * (1.0 - w_blend) + d_lower * w_blend

    return smax(d_top, d_body, 64.0)


def sd_oriented_quad_page(xs, ys, side, cx, cy, pw, ph, tilt, curve_amp, r=26.0):
    """
    Signed distance to one gently arched page of an open book.
    side = -1 for left page, +1 for right page.
    """
    # Local coordinate u along page width [0..pw] moving outward from spine
    u = (xs - cx) * side
    u_frac = np.clip(u / pw, 0.0, 1.0)
    # Classical open-book page arch: rises gently from spine, levels toward outer edge
    arch = curve_amp * np.sin(u_frac * math.pi * 0.86) + tilt * u
    local_y = ys - (cy - arch)
    return sd_rounded_box(u, local_y, pw * 0.52, 0.0, pw * 0.46, ph * 0.5, r)


def compute_normal(dist_field):
    gy, gx = np.gradient(dist_field)
    mag = np.hypot(gx, gy) + 1e-6
    return gx / mag, gy / mag


def shade_surface(xs, ys, dist, palette, noise, light_dir=(-0.56, -0.83), bevel_w=64.0):
    nx, ny = compute_normal(dist)
    lx, ly = light_dir
    cx, cy = SIZE * 0.5, SIZE * 0.5

    proj = ((xs - cx) * lx + (ys - cy) * ly) / 1360.0
    proj = np.clip(proj * 0.5 + 0.5, 0.0, 1.0)

    c_shadow = np.array(palette["shadow"], dtype=np.float32)
    c_mid = np.array(palette["mid"], dtype=np.float32)
    c_high = np.array(palette["high"], dtype=np.float32)
    c_spec = np.array(palette["spec"], dtype=np.float32)
    c_rim = np.array(palette["rim_dark"], dtype=np.float32)

    t_low = np.clip(proj * 2.0, 0.0, 1.0)[..., None]
    t_hi = np.clip((proj - 0.5) * 2.0, 0.0, 1.0)[..., None]
    face_rgb = np.where(
        proj[..., None] < 0.5,
        c_shadow * (1.0 - t_low) + c_mid * t_low,
        c_mid * (1.0 - t_hi) + c_high * t_hi,
    )
    face_rgb = face_rgb + (noise[..., None] - 0.5) * palette["grain"]

    edge_dot = nx * lx + ny * ly
    bevel_t = np.clip(edge_dot * 0.5 + 0.5, 0.0, 1.0)[..., None]
    bevel_rgb = np.where(
        bevel_t > 0.55,
        c_high * (1.0 - (bevel_t - 0.55) / 0.45) + c_spec * ((bevel_t - 0.55) / 0.45),
        c_rim * (1.0 - bevel_t / 0.55) + c_mid * (bevel_t / 0.55),
    )
    bevel_rgb = bevel_rgb + (noise[..., None] - 0.5) * (palette["grain"] * 0.5)

    in_dist = np.maximum(-dist, 0.0)
    in_bevel = in_dist < bevel_w
    ridge = np.exp(-((in_dist - bevel_w) / (bevel_w * 0.24)) ** 2) * 0.14

    rgb = np.where(in_bevel[..., None], bevel_rgb, face_rgb)
    rgb = rgb + ridge[..., None] * (bevel_t - 0.35)

    outer_rim = in_dist < 14.0
    rim_mix = np.where((edge_dot > 0.05)[..., None], c_spec * 0.85 + c_high * 0.15, c_rim * 0.90)
    rgb = np.where(outer_rim[..., None], rgb * 0.25 + rim_mix * 0.75, rgb)
    return np.clip(rgb, 0.0, 1.0)


def draw_enamel_bar(canvas, xs, ys, cx, cy, hx, hy, r, base_rgb, light_dir=(-0.56, -0.83)):
    d = sd_rounded_box(xs, ys, cx, cy, hx, hy, r)
    mask = d <= 3.0
    if not np.any(mask):
        return

    # Cylindrical/pillow dome normal inside the enamel bar
    nx = np.clip((xs - cx) / max(hx * 1.15, 1.0), -0.95, 0.95)
    ny = np.clip((ys - cy) / max(hy * 1.15, 1.0), -0.95, 0.95)
    nz = np.sqrt(np.maximum(0.05, 1.0 - 0.45 * nx * nx - 0.65 * ny * ny))

    lx, ly, lz = light_dir[0] * 0.60, light_dir[1] * 0.60, 0.78
    ln = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / ln, ly / ln, lz / ln

    ndotl = np.clip(nx * lx + ny * ly + nz * lz, 0.0, 1.0)
    hx_v, hy_v, hz_v = lx, ly, lz + 1.0
    hn = math.sqrt(hx_v * hx_v + hy_v * hy_v + hz_v * hz_v)
    spec = np.power(np.clip((nx * hx_v + ny * hy_v + nz * hz_v) / hn, 0.0, 1.0), 22.0)

    col = np.array(base_rgb, dtype=np.float32)
    shaded = col * (0.48 + 0.64 * ndotl[..., None]) + np.array([1.0, 1.0, 1.0], dtype=np.float32) * (0.46 * spec[..., None])
    in_edge = np.clip(-d / 20.0, 0.0, 1.0)[..., None]
    shaded = shaded * (0.76 + 0.24 * in_edge)
    shaded = np.clip(shaded, 0.0, 1.0)

    aa = np.clip(-d * 0.55 + 0.5, 0.0, 1.0)[..., None]
    canvas[mask, :3] = canvas[mask, :3] * (1.0 - aa[mask]) + shaded[mask] * aa[mask]


def build_icon():
    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)

    # Deterministic subtle architectural limestone/enamel micro-grain
    rng = np.random.default_rng(1096)
    coarse = rng.random((SIZE // 4, SIZE // 4), dtype=np.float32)
    fine = rng.random((SIZE, SIZE), dtype=np.float32)
    coarse_up = np.array(
        Image.fromarray((coarse * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.Resampling.BILINEAR),
        dtype=np.float32,
    ) / 255.0
    noise = coarse_up * 0.65 + fine * 0.35

    shield_sdf = sd_shield(xs, ys)

    # Outer brushed champagne-brass architectural shield frame
    brass_rim = {
        "spec": (1.00, 0.96, 0.84),
        "high": (0.89, 0.78, 0.54),
        "mid": (0.72, 0.60, 0.38),
        "shadow": (0.48, 0.39, 0.23),
        "rim_dark": (0.28, 0.22, 0.13),
        "grain": 0.035,
    }

    # Left half: warm collegiate limestone / parchment (Butler / Cotswold / Hilltop)
    light_stone = {
        "spec": (1.00, 0.99, 0.96),
        "high": (0.96, 0.94, 0.89),
        "mid": (0.89, 0.86, 0.80),
        "shadow": (0.75, 0.71, 0.65),
        "rim_dark": (0.50, 0.47, 0.43),
        "grain": 0.042,
    }

    # Right half: deep Sorin / Oxford midnight navy
    dark_navy = {
        "spec": (0.46, 0.62, 0.88),
        "high": (0.16, 0.26, 0.46),
        "mid": (0.09, 0.16, 0.30),
        "shadow": (0.04, 0.08, 0.17),
        "rim_dark": (0.02, 0.04, 0.10),
        "grain": 0.048,
    }

    # Subtle diagonal Light/Dark split (tilted 6 degrees) across shield center
    seam_x = SIZE * 0.5 + (ys - SIZE * 0.52) * 0.105
    is_left = xs < seam_x
    seam_dist = np.abs(xs - seam_x)

    inner_sdf = shield_sdf + 54.0  # 54px metallic brass architectural border
    rgb_brass = shade_surface(xs, ys, shield_sdf, brass_rim, noise, bevel_w=52.0)
    rgb_light = shade_surface(xs, ys, inner_sdf, light_stone, noise, bevel_w=30.0)
    rgb_dark = shade_surface(xs, ys, inner_sdf, dark_navy, noise, bevel_w=30.0)

    face_rgb = np.where(is_left[..., None], rgb_light, rgb_dark)

    # Crisp beveled split-horizon groove along the Light/Dark seam
    seam_groove = (seam_dist < 10.0) & (inner_sdf < -4.0)
    seam_hi_l = (xs >= seam_x - 20.0) & (xs < seam_x - 9.0) & (inner_sdf < -14.0)
    seam_hi_r = (xs > seam_x + 9.0) & (xs <= seam_x + 20.0) & (inner_sdf < -14.0)
    face_rgb[seam_groove] *= 0.34
    face_rgb[seam_hi_l] = np.clip(face_rgb[seam_hi_l] * 0.88, 0.0, 1.0)
    face_rgb[seam_hi_r] = np.clip(face_rgb[seam_hi_r] + 0.11, 0.0, 1.0)

    # Composite inner split field inside outer brass bezel with smooth AA
    inner_aa = np.clip(-inner_sdf * 0.55 + 0.5, 0.0, 1.0)[..., None]
    # Thin recessed shadow fillet right inside brass frame
    fillet_shadow = (inner_sdf >= -14.0) & (inner_sdf < 6.0)
    body_rgb = rgb_brass * (1.0 - inner_aa) + face_rgb * inner_aa
    body_rgb[fillet_shadow] *= 0.72

    body_alpha = np.clip(-shield_sdf * 0.55 + 0.5, 0.0, 1.0)
    canvas = np.zeros((SIZE, SIZE, 4), dtype=np.float32)
    canvas[..., :3] = body_rgb
    canvas[..., 3] = body_alpha

    # --- Upper Chief: Recessed collegiate color ribbon tray + 5 jewel-enameled bars ---
    tray_cx, tray_cy = SIZE * 0.5, 510.0
    tray_hx, tray_hy = 520.0, 114.0
    d_tray = sd_rounded_box(xs, ys, tray_cx, tray_cy, tray_hx, tray_hy, 38.0)

    # Dark anodized recessed trough with fine brass inner bevel
    tray_rim = (d_tray >= -10.0) & (d_tray < 14.0)
    tray_in = d_tray < 0.0
    tray_aa = np.clip(-d_tray * 0.55 + 0.5, 0.0, 1.0)[..., None]
    tray_bg = np.array([0.08, 0.11, 0.17], dtype=np.float32)
    tmask = d_tray < 3.0
    canvas[tmask, :3] = canvas[tmask, :3] * (1.0 - tray_aa[tmask]) + tray_bg * tray_aa[tmask]
    canvas[tray_rim, :3] = canvas[tray_rim, :3] * 0.55 + np.array([0.74, 0.63, 0.42], dtype=np.float32) * 0.45

    # Five iconic collegiate brand hues (strictly chromatic — zero logos!)
    ribbon_colors = [
        (0.82, 0.13, 0.23),  # Harvard / MIT / McGill Crimson
        (0.95, 0.71, 0.11),  # UVic / St. Edward's / Berkeley Sun Gold
        (0.10, 0.60, 0.36),  # Dartmouth / UAlberta Forest Emerald
        (0.49, 0.78, 0.92),  # Columbia / UNC / Cambridge Sky Blue
        (0.11, 0.40, 0.76),  # UBC / UVic / Oxford / Sorin Ocean Sapphire
    ]
    n_bars = len(ribbon_colors)
    bar_gap = 22.0
    inner_w = (tray_hx - 24.0) * 2.0
    bar_w = (inner_w - bar_gap * (n_bars - 1)) / n_bars
    bar_hx = bar_w * 0.5
    bar_hy = tray_hy - 26.0
    start_x = tray_cx - inner_w * 0.5 + bar_hx
    for i, col in enumerate(ribbon_colors):
        bx = start_x + i * (bar_w + bar_gap)
        draw_enamel_bar(canvas, xs, ys, bx, tray_cy, bar_hx, bar_hy, 20.0, col)

    # --- Subtle horizontal architectural molding bar separating chief and lower field ---
    d_rule = sd_rounded_box(xs, ys, SIZE * 0.5, 695.0, 540.0, 11.0, 11.0)
    rmask = d_rule < 3.0
    raa = np.clip(-d_rule * 0.55 + 0.5, 0.0, 1.0)[..., None]
    rule_rgb = shade_surface(xs, ys, d_rule, brass_rim, noise, bevel_w=10.0)
    canvas[rmask, :3] = canvas[rmask, :3] * (1.0 - raa[rmask]) + rule_rgb[rmask] * raa[rmask]

    # --- Lower Center: 3D-Beveled Open Book straddling the Light/Dark horizon ---
    book_cx = SIZE * 0.5
    book_cy = 1135.0
    page_w = 450.0
    page_h = 465.0

    # Crimson-gold academic bookmark ribbon tail descending from book spine toward shield apex
    rib_cx = book_cx + 8.0
    rib_y0, rib_y1 = book_cy + 180.0, 1595.0
    rib_hw = 54.0
    # Swallowtail notch at bottom of bookmark ribbon
    notch_y = rib_y1 - (rib_hw - np.abs(xs - rib_cx)) * 0.95
    d_rib_box = sd_rounded_box(xs, ys, rib_cx, (rib_y0 + rib_y1) * 0.5, rib_hw, (rib_y1 - rib_y0) * 0.5, 8.0)
    d_rib = np.maximum(d_rib_box, ys - notch_y)
    rib_mask = d_rib < 3.0
    rib_aa = np.clip(-d_rib * 0.55 + 0.5, 0.0, 1.0)[..., None]
    rib_palette = {
        "spec": (1.00, 0.62, 0.56),
        "high": (0.86, 0.20, 0.28),
        "mid": (0.68, 0.11, 0.20),
        "shadow": (0.44, 0.06, 0.12),
        "rim_dark": (0.28, 0.03, 0.08),
        "grain": 0.03,
    }
    rib_rgb = shade_surface(xs, ys, d_rib, rib_palette, noise, bevel_w=18.0)
    # Subtle gold center stripe down bookmark ribbon
    gold_stripe = (np.abs(xs - rib_cx) < 11.0) & (d_rib < -8.0)
    rib_rgb[gold_stripe] = np.array([0.95, 0.78, 0.30], dtype=np.float32)
    canvas[rib_mask, :3] = canvas[rib_mask, :3] * (1.0 - rib_aa[rib_mask]) + rib_rgb[rib_mask] * rib_aa[rib_mask]

    # Book cover cradle shadow underneath pages
    d_left_cover = sd_oriented_quad_page(xs, ys, -1, book_cx - 8.0, book_cy + 42.0, page_w + 30.0, page_h + 26.0, 0.13, 38.0, r=32.0)
    d_right_cover = sd_oriented_quad_page(xs, ys, 1, book_cx + 8.0, book_cy + 42.0, page_w + 30.0, page_h + 26.0, 0.13, 38.0, r=32.0)
    d_cover = smin(d_left_cover, d_right_cover, 28.0)
    cov_shadow = (d_cover >= 0.0) & (d_cover < 34.0) & (inner_sdf < -12.0)
    canvas[cov_shadow, :3] *= 0.66
    cov_mask = d_cover < 3.0
    cov_aa = np.clip(-d_cover * 0.55 + 0.5, 0.0, 1.0)[..., None]
    cov_rgb = shade_surface(xs, ys, d_cover, brass_rim, noise, bevel_w=24.0)
    canvas[cov_mask, :3] = canvas[cov_mask, :3] * (1.0 - cov_aa[cov_mask]) + cov_rgb[cov_mask] * cov_aa[cov_mask]

    # Left sculpted page (deep Sorin Navy on warm limestone)
    d_lp = sd_oriented_quad_page(xs, ys, -1, book_cx - 10.0, book_cy, page_w, page_h, 0.13, 44.0, r=26.0)
    lp_palette = {
        "spec": (0.48, 0.64, 0.88),
        "high": (0.20, 0.32, 0.54),
        "mid": (0.12, 0.21, 0.39),
        "shadow": (0.06, 0.11, 0.23),
        "rim_dark": (0.03, 0.06, 0.14),
        "grain": 0.03,
    }
    lp_rgb = shade_surface(xs, ys, d_lp, lp_palette, noise, bevel_w=24.0)
    lp_aa = np.clip(-d_lp * 0.55 + 0.5, 0.0, 1.0)[..., None]
    lp_mask = d_lp < 3.0
    canvas[lp_mask, :3] = canvas[lp_mask, :3] * (1.0 - lp_aa[lp_mask]) + lp_rgb[lp_mask] * lp_aa[lp_mask]

    # Right sculpted page (luminous warm parchment on midnight navy)
    d_rp = sd_oriented_quad_page(xs, ys, 1, book_cx + 10.0, book_cy, page_w, page_h, 0.13, 44.0, r=26.0)
    rp_palette = {
        "spec": (1.00, 0.99, 0.97),
        "high": (0.98, 0.95, 0.89),
        "mid": (0.91, 0.87, 0.79),
        "shadow": (0.76, 0.72, 0.64),
        "rim_dark": (0.54, 0.50, 0.44),
        "grain": 0.03,
    }
    rp_rgb = shade_surface(xs, ys, d_rp, rp_palette, noise, bevel_w=24.0)
    rp_aa = np.clip(-d_rp * 0.55 + 0.5, 0.0, 1.0)[..., None]
    rp_mask = d_rp < 3.0
    canvas[rp_mask, :3] = canvas[rp_mask, :3] * (1.0 - rp_aa[rp_mask]) + rp_rgb[rp_mask] * rp_aa[rp_mask]

    # Incised code/typography rules on both open-book pages (following each page's exact curve!)
    for side, line_cols in [
        (-1, [(0.49, 0.78, 0.92), (0.95, 0.76, 0.25), (0.86, 0.90, 0.96), (0.56, 0.84, 0.68)]),
        ( 1, [(0.11, 0.34, 0.66), (0.76, 0.16, 0.25), (0.14, 0.24, 0.42), (0.10, 0.52, 0.34)]),
    ]:
        u = (xs - (book_cx + side * 10.0)) * side
        u_frac = np.clip(u / page_w, 0.0, 1.0)
        arch = 44.0 * np.sin(u_frac * math.pi * 0.86) + 0.13 * u
        local_y = ys - (book_cy - arch)
        line_specs = [
            (-115.0, 0.18, 0.78),
            ( -35.0, 0.18, 0.84),
            (  45.0, 0.18, 0.72),
            ( 125.0, 0.18, 0.60),
        ]
        for (ly_off, u0f, u1f), lcol in zip(line_specs, line_cols):
            u_mid = 0.5 * (u0f + u1f) * page_w
            u_hw = 0.5 * (u1f - u0f) * page_w
            d_ln = sd_rounded_box(u, local_y, u_mid, ly_off, u_hw, 14.0, 13.0)
            lmask = d_ln < 2.0
            laa = np.clip(-d_ln * 0.55 + 0.5, 0.0, 1.0)[..., None]
            canvas[lmask, :3] = canvas[lmask, :3] * (1.0 - laa[lmask]) + np.array(lcol, dtype=np.float32) * laa[lmask]

    # Center spine clasp highlight
    d_spine = sd_rounded_box(xs, ys, book_cx, book_cy + 14.0, 14.0, page_h * 0.48, 12.0)
    sp_mask = d_spine < 3.0
    sp_aa = np.clip(-d_spine * 0.55 + 0.5, 0.0, 1.0)[..., None]
    sp_rgb = shade_surface(xs, ys, d_spine, brass_rim, noise, bevel_w=12.0)
    canvas[sp_mask, :3] = canvas[sp_mask, :3] * (1.0 - sp_aa[sp_mask]) + sp_rgb[sp_mask] * sp_aa[sp_mask]

    fg_img = Image.fromarray((np.clip(canvas, 0.0, 1.0) * 255).astype(np.uint8), mode="RGBA")

    # Subtle ambient contact shadow for crisp readability on both Light & Dark UI surfaces
    alpha_ch = fg_img.split()[3]
    shadow_alpha = alpha_ch.filter(ImageFilter.GaussianBlur(radius=30))
    shadow_arr = np.array(shadow_alpha, dtype=np.float32) * 0.30
    shadow_rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    shadow_rgba[..., 0] = 8
    shadow_rgba[..., 1] = 12
    shadow_rgba[..., 2] = 24
    shadow_rgba[..., 3] = np.clip(shadow_arr, 0, 255).astype(np.uint8)
    shadow_img = Image.fromarray(shadow_rgba, mode="RGBA")

    composed = Image.alpha_composite(shadow_img, fg_img)
    final = composed.resize((FINAL_SIZE, FINAL_SIZE), Image.Resampling.LANCZOS)
    final.save(OUT_PATH, optimize=True)

    os.makedirs(os.path.dirname(SITE_ICON_PATH), exist_ok=True)
    shutil.copyfile(OUT_PATH, SITE_ICON_PATH)
    print(f"Generated {OUT_PATH} ({FINAL_SIZE}x{FINAL_SIZE}, {os.path.getsize(OUT_PATH)} bytes)")
    print(f"Copied    {SITE_ICON_PATH} ({os.path.getsize(SITE_ICON_PATH)} bytes)")


if __name__ == "__main__":
    build_icon()
