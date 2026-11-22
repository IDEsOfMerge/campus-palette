# Changelog

All notable changes to **Campus Palette** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-11-22

### Changed
- **Direct Official Brand-Guideline Alignment (All 40 Universities)**: Audited every university's primary, secondary, accent, and neutral hex specifications directly against published institutional visual identity guides and updated palettes accordingly while preserving **0 WCAG errors** and **0 CVD warnings** across all 80 themes:
  - **Georgia Tech**: Migrated to the current official Core Navy (`#051E39`), Core Gold (`#B39051` / `#8F713D`), Diploma parchment (`#F9F6E5`), Buzz (`#EAAA00`), Campanile (`#048A81`), Tech Lawn (`#066034`), Whistle (`#660064`), Azalea (`#D90368`), Bright Blue (`#004C97`), and Burdell (`#BBE6F2`).
  - **University of Tokyo**: Migrated to the June 2024 Visual Identity Guidelines (`#0B8BEE` UTokyo Blue, `#FFCD00` UTokyo Yellow, `#D71131` UTokyo Red, `#35CA00` UTokyo Green, `#8F07AA` UTokyo Purple, `#5BDEFF` UTokyo Light Blue, and their official 15-step tonal ramps).
  - **UT Austin**: Aligned syntax accents with UT Austin's official brand rule avoiding red and purple alongside Burnt Orange (`#BF5700`), using Charcoal (`#333F48`), Dark Teal (`#005F86`), Turquoise (`#00A9B7`), Forest Green (`#579D42`), Bright Green (`#A6CD57`), Yellow (`#FFD600`), and Light Orange (`#F8971F`).
  - **Notre Dame & Brown & Princeton**: Updated Notre Dame to official Bright Gold (`#D39F10`), Green (`#0A843D`), Bright Blue (`#1C4F8F`), and Light Warm White (`#F8F4EC`); Brown to digital Brown Red (`#C00404`) and Gray (`#98A4AE`); and Princeton Dark to official on-dark orange (`#F58025`).
  - **Expanded Official Secondary & Accent Palettes**: Wired exact published secondary/accent hex tables into Harvard, Yale, UPenn, Columbia (`#C75000`, `#6CACE4`, `#228848`, `#DC2A2A`), Cornell, McGill, U of T, Western, Waterloo (all 6 Level-4 faculty hexes), UNC, UMich, UVA, UW, UC Berkeley, UCLA, NYU, Duke, Northwestern, MIT, Stanford, UChicago, Caltech, Georgetown, Williams, Rice, Oxford, and Cambridge — widening the inter-campus chromatic spread from `1.89–19.43` to `4.08–24.14 ΔE₀₀`.
- **Animated Showcase Sequence (`assets/showcase/campus-palette-demo.gif`)**: Reordered the 7-campus Light ↔ Dark demo loop to lead with Columbia University, followed by Harvard University, MIT, and University of Oxford before University of British Columbia, University of Victoria, and St. Edward's University.
- **Dynamic MDS Sibling Links & Label Clearance**: `scripts/generate-color-science-assets.py` now dynamically connects the top 3 closest chromatic sibling pairs per polarity, computes the MDS footer citation directly from pairwise distances, and enforces marker clearance in the final label sweep.

## [1.0.0] — 2026-11-22

### Added
- **40 universities · 80 Light & Dark OKLCH themes** across six collegiate groupings:
  - **Ivy League (8):** Harvard, Yale, UPenn, Princeton, Columbia, Brown, Dartmouth, Cornell
  - **Canadian Universities (8):** McGill, U of T, Queen's, Western, UAlberta, UBC, Waterloo, UVic
  - **US Public Flagships (8):** UNC, UMich, UVA, UW, UC Berkeley, UT Austin, Georgia Tech, UCLA
  - **US Private Research & STEM (7):** NYU, Duke, Northwestern, MIT, Stanford, UChicago, Caltech
  - **Liberal Arts & Regional Gems (5):** Georgetown, Williams, Notre Dame, St. Edward's, Rice
  - **Global Classics (4):** Oxford, Cambridge, ETH Zurich, UTokyo
- **Full VS Code & Positron Workbench Coverage**: 447 color keys per theme, including 42+ modern VS Code UI tokens (`commandCenter.*`, `chat.*`, `inlineChat.*`, `testing.*`, `terminalStickyScroll.*`) and all 152 confirmed upstream `positron*` tokens (`12,160` verified usages across 80 themes).
- **Multi-Gate Perceptual Colorimetry Engine (`scripts/color-science.js` & `scripts/validate.js`)**:
  - `1,600 / 1,600` foreground and syntax tokens passing WCAG 2.1 AA (`≥ 4.5:1` on `bg`, `≥ 3.8:1` on `bgLine`; primary `fg/bg` `13.77:1`–`16.12:1` AAA, APCA-W3 `|Lc| = 89.0`–`97.9`).
  - `1,280 / 1,280` ANSI terminal slots verified for contrast and canonical hue fidelity.
  - **0 severe and 0 moderate CVD collisions** across all 80 themes (`≥ 11.21 ΔE*ab` on all 5,040 critical adjacent pair checks under Machado 2009 Protanopia, Deuteranopia, and Tritanopia).
- **Zero-Dependency Extension Runtime (`extension.js`)** with 7 commands:
  - `campusPalette.toggleTheme` (`Ctrl+K Ctrl+U` / `Cmd+K Cmd+U`) — smart per-university Light ↔ Dark toggle
  - `campusPalette.pickTheme` — grouping-organized live-preview QuickPick with `Esc` rollback
  - `campusPalette.pickSimilarTheme` — live-preview CIEDE2000 chromatic neighbor picker
  - `campusPalette.randomTheme` & `campusPalette.randomThemeSameMode`
  - `campusPalette.syncOsThemePair` — one-click OS appearance Light/Dark pair sync
  - `campusPalette.openExplorer` — 100% offline CSP3-hardened Interactive Theme & Colorimetry Explorer webview
  - Configurable status bar picker (`campusPalette.showStatusBarItem`) and Welcome Walkthrough
- **Static & Offline Interactive Workbench Explorer (`site/index.html` & `assets/explorer/explorer.html`)**:
  - Zero-CDN strict CSP, live search (`/`), 6 collegiate grouping filters, 5-language preview (Python, R, TypeScript, SQL, Quarto), Interactive 2D CIEDE2000 MDS Similarity Map (`M`) with Theme Swatch / Grouping / Country coloring, Nearest Chromatic Neighbors chips, Side-by-Side Compare (`C`), Protanopia / Deuteranopia / Tritanopia simulation, stateful URL hash permalinks, and 8 copy/download export formats (VS Code, Ghostty, WezTerm, Alacritty, Windows Terminal, Kitty, iTerm2, CSS).
- **Algorithmic Visuals, Color-Science Suite & Pure-R Companion Analysis**:
  - 4× supersampled geometric academic crest icon, Dark/Light banners + `site/og-preview.png`, founding-timeline & build-pipeline diagrams, animated VS Code / Positron showcase GIF, 80 local PNG palette strips, Collegiate Heritage Metro Map (`1096–1963`), OKLab `8×10` grid & 6-grouping fingerprint, Global PCA, Per-Mode CIEDE2000 MDS, Ward-ordered 40×40 split-triangle heatmap, 80-leaf Ward dendrogram, CVD swatch grid, and companion pure-R scripts (`analysis/*.R`).
- **Automated Testing, Slim VSIX Packaging & CI/CD**:
  - 42 zero-dependency `node:test` unit tests (`test/{color-science,explorer,extension}.test.js`), slim `.vscodeignore` packaging, and Node 22 GitHub Actions workflows for build/validation, GitHub Pages, GitHub Releases, and Marketplace publishing.
