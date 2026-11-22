Every one of the 80 themes across all 40 universities passes an automated multi-stage perceptual colorimetry pipeline before it ships:

- **OKLCH perceptual architecture** — official institutional hues, campus stone/slate surfaces, and subtle UI elevation steps are harmonized in Björn Ottosson's OKLCH space so brand chroma never disrupts reading hierarchy.
- **100% WCAG 2.1 AA + APCA contrast** — all 20 foreground, syntax, comment, and diagnostic roles in every theme clear **4.5:1** on the editor canvas (`1,600 / 1,600` tokens passing), primary text clears **≥ 7.0:1** and **|Lc| ≥ 70**, and all 16 ANSI terminal colors pass full contrast and hue-band checks (`1,280 / 1,280` tokens).
- **CIEDE2000 & dichromacy resilience** — all 80 themes are fully polychromatic with **zero errors and zero warnings**, staggering OKLCH lightness alongside hue so every critical syntax-role pair clears **≥ 10 ΔE*ab** under simulated protanopia, deuteranopia, and tritanopia.

Click **Open Interactive Theme Explorer** on the left to compare all 80 themes with live OKLCH/WCAG/APCA metrics, CIEDE2000 similarity maps, terminal exports, and color-vision simulations right inside your editor, or <a href="https://idesofmerge.github.io/campus-palette/">open the web explorer on GitHub Pages</a>.
