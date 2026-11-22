# Changelog

All notable changes to **Campus Palette** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Neutral Collegiate Grouping Names**: Renamed two collegiate groupings across all palettes, metadata, QuickPick, Interactive Explorer, README catalog, color-science CSVs/R scripts, and visualizations:
  - `Global Classics` → **`Global Universities`**
  - `Liberal Arts & Regional Gems` → **`Liberal Arts & Independent`**
- **Redesigned Collegiate Heritage Metro Map & Founding Timeline Polish**: Rebuilt `assets/timeline/timeline-metro.png` as a 2× Retina vector transit diagram with exact founding-year vertical alignment across all six lines, four shaded historical era bands, a fixed left transit rail, twin-interchange pills for same-year ties, and 1D PAVA zero-overlap labels; expanded top ruler breathing room on `assets/diagrams/founding-timeline-{dark,light}.png`.

## [1.1.0] — 2026-11-22

### Added
- **20 New Iconic Universities (+40 Light & Dark OKLCH Themes → 60 Universities · 120 Themes · 7 Countries · 1096–1974)**, each synthesized directly from published official institutional brand guidelines with **0 WCAG errors** and **0 CVD warnings**:
  - **Canadian Universities (+6 → 14):** Dalhousie University (1818), University of Ottawa (1848), McMaster University (1887), Simon Fraser University (1965), University of Calgary (1966), Concordia University (1974).
  - **US Public Flagships (+4 → 12):** University of Georgia (1785), University of Wisconsin–Madison (1848), University of Florida (1853), Texas A&M University (1876).
  - **US Private Research & STEM (+3 → 10):** Johns Hopkins University (1876), University of Southern California (1880), Carnegie Mellon University (1900).
  - **Liberal Arts & Regional Gems (+1 → 6):** Amherst College (1821).
  - **Global Classics (+6 → 10):** University of Edinburgh (1583, UK), University of Melbourne (1853, Australia), EPFL (1853, Switzerland), Kyoto University (1897, Japan — verified `#00205B` *Nōsei* PMS 281C), National University of Singapore (1905, Singapore), Imperial College London (1907, UK).
- **Verified Official Brand Guidelines Links (`brandUrl`) Across All 60 Universities**:
  - Added verified `https://` `brandUrl` references to all 120 `palettes/*.js` modules, propagated into `theme-metadata.json`, `analysis/data/themes_summary.csv`, the `README.md` catalog table, and strictly audited by `scripts/validate.js` and `test/{color-science,explorer}.test.js`.
  - Added clickable **Official Brand Guidelines ↗** links in the Interactive Explorer (`site/index.html` and `assets/explorer/explorer.html`) — both in the always-visible active theme Story Bar and inside the Interactive CIEDE2000 MDS Similarity Map Inspector Panel — while preserving strict zero-CDN `default-src 'none'` CSP compliance.
- **Expanded Country Filtering & MDS Map Coloring**: Added Singapore and Australia to the Explorer's `COUNTRY_COLORS_MAP`, search aliases, validator country registry, and founding-timeline regional pills (`SG`, `AU`).

### Changed
- **Scaled Build, Validation & Visualization Suite for 60 Universities / 120 Themes**:
  - Verified **`2,400 / 2,400`** foreground & syntax tokens passing WCAG 2.1 AA (`4.76:1`–`16.15:1`; primary body text `13.77:1`–`16.15:1` AAA / APCA `|Lc| = 89.0`–`98.1`), **`1,920 / 1,920`** ANSI terminal tokens, **`18,240`** Positron workbench keys (`152 × 120`), and **0 CVD warnings** across all `7,560` dichromacy pair checks (`≥ 10.70 ΔE*ab`).
  - Regenerated all banners (`assets/banner/banner-{dark,light}.png`, `site/og-preview.png`), founding-timeline & build-pipeline diagrams (`1096–1974`), 60-station Collegiate Heritage Metro Map (`overlaps=0`), `10×12` OKLab chromaticity grid, 6-grouping fingerprint, 1,560-token Global PCA (`89.9%` variance), 60-campus per-mode Classical MDS with deterministic zero-overlap multi-ring label placement, `60×60` split-triangle ΔE₀₀ heatmap, 120-leaf Ward.D2 dendrogram, 120 local PNG swatches, showcase GIF metrics, and pure-R companion scripts (`analysis/*.R`).
  - Dynamic QuickPick title in `extension.js` (`Campus Palette — 60 Iconic Universities · 120 Themes`) computed directly from `theme-metadata.json`.

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
