# Contributing to Campus Palette

Thank you for your interest in **Campus Palette**! Whether you are proposing a new university theme pair, refining institutional color fidelity, expanding VS Code / Positron workbench coverage, or strengthening our perceptual color-science tooling and test suite, this guide explains how the repository is structured and verified.

Want to propose a university or palette refinement without writing code? Open a **[Request a University](.github/ISSUE_TEMPLATE/university-request.yml)** issue (you can preview all 80 Light & Dark themes first in the **[Live Interactive Workbench & Colorimetry Explorer](https://idesofmerge.github.io/campus-palette/)**).

---

## Architecture & Source of Truth

Campus Palette ships with **zero runtime `npm` dependencies** and generates all extension themes, metadata, swatches, and interactive Explorer bundles deterministically from compact per-university palette modules covering **40 universities across 6 collegiate groupings (80 Light & Dark themes)**:

```text
palettes/<slug>-{light,dark}.js   (~42 named tokens + 16 ANSI colors + campus metadata)
scripts/color-science.js          (OKLCH synthesis, WCAG 2.1, APCA-W3, CIEDE2000, Machado 2009 CVD)
        │
        ▼   npm run build
        ├── themes/<slug>.json                (447 workbench & Positron colors + TextMate/semantic rules)
        ├── package.json                      (contributes.themes catalog)
        ├── theme-metadata.json               (groupings, metrics & top-6 ΔE₀₀ neighbors for extension.js)
        ├── site/                             (GitHub Pages Interactive Explorer + og-preview.png)
        └── assets/explorer/explorer.html     (offline VS Code / Positron Webview Explorer)
```

> **Important:** Never hand-edit `themes/*.json`, `theme-metadata.json`, `site/index.html`, `site/og-preview.png`, or `assets/explorer/explorer.html`. Edit the source modules in `palettes/` or generator scripts in `scripts/` and run `npm run build`. CI enforces a clean `git diff` across all generated outputs on every pull request.

---

## Official Brand Guidelines Requirement

Every university palette in Campus Palette must be grounded in the institution's **official published brand, communications, or visual identity guidelines**:

- Cite the university's official published primary and secondary hex/Pantone specifications in your palette header comment and pull request description.
- Preserve each institution's recognizable primary hue (anchored on prominent roles such as `accentStatusBar`, `accentBadge`, `accentKeyword`, or `accentFunction`) while tuning lightness (`L`) and chroma (`C`) in **OKLCH** so that every foreground and syntax token clears all accessibility and colorblind safety gates.
- Pair official institutional colors with campus architectural materials — limestone, red brick, slate, granite, library parchment, or twilight courtyard surfaces — so Light and Dark modes feel like two lighting conditions of the same campus rather than two unrelated themes.

---

## Perceptual Quality Gates

Every palette is synthesized in **OKLCH** perceptual color space and must pass automated multi-gate auditing in `scripts/color-science.js` and `scripts/validate.js` with **0 errors and 0 warnings** before a build or pull request can pass:

- **WCAG 2.1 AA contrast (`≥ 4.5:1`)** — all **20 foreground & syntax roles** (`1,600 / 1,600` across 80 themes) must achieve `≥ 4.5:1` on `editor.background` (`bg`) and `≥ 3.8:1` on `editor.lineHighlightBackground` (`bgLine`). Primary body text (`fg` on `bg`) requires `≥ 7.0:1`, `fg` on `bgSidebar` requires `≥ 4.5:1`, and `fgSecondary` on `bgActivity` requires `≥ 3.5:1`.
- **ANSI terminal contrast & hue fidelity** — all **16 ANSI terminal colors** (`1,280 / 1,280` tokens) are verified for contrast (`≥ 4.2:1`, `brightBlack ≥ 3.5:1`) while remaining inside canonical OKLCH hue bands so red errors, green diffs, and cyan/blue diagnostics remain semantically recognizable.
- **APCA-W3 spatial contrast & figure–ground hierarchy** — primary body text (`fg` on `bg`) clears `|Lc| ≥ 70`, while comments (`fgComment`) clear WCAG AA (`≥ 4.5:1`) yet stay perceptually subordinate (`commentBg ≤ fgBg − 2.0`) so documentation never competes with active code.
- **CIEDE2000 distinctness (`ΔE₀₀ ≥ 8.5`)** — adjacent semantic syntax pairs must stay `≥ 8.5 ΔE₀₀` apart in normal vision with zero duplicate hexes across paired roles.
- **Machado et al. (2009) CVD resilience (`≥ 10 ΔE*ab`)** — all 80 themes are fully polychromatic with **zero exemptions**. Critical adjacent syntax pairs (`keyword`, `storage`, `string`, `function`, `type`, `number`, `error`) are simulated under protanopia, deuteranopia, and tritanopia; both severe collisions (`< 5 ΔE*ab`) and moderate compression warnings (`< 10 ΔE*ab`) fail the build.
- **Verified `positron*` key provenance** — all **152 confirmed upstream `positron*` workbench color keys** (`12,160` usages across 80 themes) are validated against Positron's source registry (`src/vs/workbench/common/theme.ts` in `posit-dev/positron`). Unrecognized `positron*` keys fail validation.
- **Zero-CDN Content Security Policy** — both `site/index.html` and `assets/explorer/explorer.html` must be 100% self-contained with zero external HTTP(S) scripts, stylesheets, or images, and `assets/explorer/explorer.html` must preserve the `{{CSP_META}}` and `{{CSP_NONCE}}` placeholders injected by `extension.js`.

---

## Development Commands

Requires **Node.js 22+** (no `npm install` needed — zero runtime or dev `npm` dependencies):

```sh
npm run build        # Regenerate themes/*.json, package.json, theme-metadata.json & Explorer bundles
npm run validate     # Audit all 80 themes, perceptual gates (0 errors / 0 warnings), Explorer CSP & 152 positron* keys
npm test             # Run zero-dependency node:test suite (node --test test/*.test.js)
npm run swatches     # Regenerate 80 SVG palette swatches in assets/swatches/
npm run catalog      # Print collegiate-grouping markdown catalog tables for README.md
npm run export-data  # Export OKLCH + WCAG + APCA CSV to analysis/data/colors.csv
npm run package      # Build a local .vsix package via @vscode/vsce
```

To test your changes interactively in an Extension Development Host without packaging:

```sh
code --extensionDevelopmentPath="$PWD"
# or in Positron:
positron --extensionDevelopmentPath="$PWD"
```

### Optional Visual & Analytical Scripts (Python 3 / R)

When tuning palettes, adding a university, or refreshing analytical figures and README media:

```sh
python3 scripts/generate-color-science-assets.py  # Regenerate color-science plots, MDS CSV & diagrams
python3 scripts/generate-icon.py                  # Regenerate extension icon (icon.png)
python3 scripts/generate-banner.py                # Regenerate Dark/Light README banners
python3 scripts/generate-diagrams.py              # Regenerate Dark/Light grouping & pipeline diagrams
python3 scripts/generate-showcase-gif.py          # Regenerate animated IDE showcase GIF
```

---

## Tuning or Adding a University Palette

1. **Edit or author** a matched Light and Dark pair in `palettes/<slug>-light.js` and `palettes/<slug>-dark.js` (use `palettes/harvard-light.js` and `palettes/harvard-dark.js` as a reference for metadata fields and token keys). Each module defines ~42 tokens + 16 ANSI colors, which `scripts/generate-themes.js` expands deterministically into all **447** VS Code & Positron workbench color keys.
2. If you are adding a **new university**, register it in `UNIVERSITY_ORDER` in `scripts/generate-themes.js`, update `EXPECTED_THEME_COUNT` (and `VALID_GROUPS` / `VALID_COUNTRIES` if introducing a new region) in `scripts/validate.js`, update `package.json` keywords if desired (keeping `keywords.length <= 30`), and refresh swatches and README catalog tables via `npm run swatches` and `node scripts/generate-readme-catalog.js --write`.
3. Run `npm run build`, `npm run swatches`, `npm run validate`, and `npm test`, verifying **0 errors**, **0 CVD warnings**, and 100% passing unit tests.
4. Preview both themes in the Extension Development Host and inside the Interactive Explorer across Light, Dark, and Protanopia / Deuteranopia / Tritanopia views.
5. Open a pull request citing the university's official brand guidelines URL, describing the campus surface palette, and summarizing any perceptual contrast adjustments.

---

## IP & Trademark Hygiene

Campus Palette is an **independent, unofficial tribute** to institutional color traditions and campus architecture and is not affiliated with, sponsored by, or endorsed by any university.

- Draw inspiration **strictly from published institutional color palettes and campus atmosphere** — official color hex/Pantone specifications, architectural materials, and seasonal light.
- **Never** include, trace, embed, or link copyrighted marks or imagery: **zero** university seals, crests, coats of arms, logos, athletic wordmarks, mascots, or campus photographs anywhere in code, themes, documentation, assets, issues, or pull requests.
- Every visual asset in this repository (icon, banners, SVG swatches, diagrams, showcase GIF, and color-science plots) must remain algorithmically generated from hex coordinates and clean geometric primitives.
