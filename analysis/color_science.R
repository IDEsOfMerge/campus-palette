# Campus Palette -- color science analysis across 60 universities (120 themes)
#
# Reproduces the global OKLab PCA, 10x12 OKLCH hue-chroma small-multiples grid,
# 6-grouping chromatic fingerprint, and Machado (2009) CVD audit summary from
# analysis/data/tokens_long.csv and analysis/data/cvd_pairs.csv.
#
# Run from the repo root with: Rscript --vanilla analysis/color_science.R
# (2x-supersampled production PNGs are rendered by scripts/generate-color-science-assets.py)

source("analysis/color_math.R")
library(dplyr)
library(tidyr)
library(ggplot2)

dir.create("assets/color-science", showWarnings = FALSE, recursive = TRUE)

GROUP_ORDER <- c(
  "Global Classics",
  "Ivy League",
  "US Public Flagships",
  "Liberal Arts & Regional Gems",
  "US Private Research & STEM",
  "Canadian Universities"
)

GROUP_COLORS <- c(
  "Global Classics"              = "#B67B0C",
  "Ivy League"                   = "#B81D32",
  "US Public Flagships"          = "#1657B5",
  "Liberal Arts & Regional Gems" = "#127D49",
  "US Private Research & STEM"   = "#6B3CB8",
  "Canadian Universities"        = "#0A7E86"
)

POLYGON_ROLES <- c(
  "accentKeyword", "accentStorage", "accentString", "accentRegex",
  "accentFunction", "accentType", "accentInterface", "accentNumber",
  "accentDecorator", "accentNamespace"
)

tokens <- read.csv("analysis/data/tokens_long.csv", stringsAsFactors = FALSE) %>%
  mutate(group = factor(group, levels = GROUP_ORDER))

n_themes <- length(unique(tokens$theme_slug))
cat(sprintf("Loaded %d token rows across %d themes.\n", nrow(tokens), n_themes))

# --- 1. Global OKLab (L, a, b) PCA across all 1,560 syntax tokens ---
pca_input <- tokens %>% filter(role_kind == "syntax")
pca <- prcomp(pca_input[, c("oklch_L", "oklab_a", "oklab_b")], center = TRUE, scale. = FALSE)
pca_df <- bind_cols(pca_input, as.data.frame(pca$x[, 1:2]))
var_exp <- round(100 * pca$sdev^2 / sum(pca$sdev^2), 1)

cat(sprintf("Global OKLab PCA: PC1 = %.1f%%, PC2 = %.1f%% (sum = %.1f%%)\n",
            var_exp[1], var_exp[2], var_exp[1] + var_exp[2]))

p_pca <- ggplot(pca_df, aes(PC1, PC2, color = role, shape = mode)) +
  geom_point(size = 2.0, alpha = 0.78) +
  scale_shape_manual(values = c(light = 21, dark = 19)) +
  labs(
    title = sprintf("Global OKLCH / OKLab PCA Across All %d Themes (%d Syntax Tokens)", n_themes, nrow(pca_input)),
    subtitle = sprintf("PC1 = %.1f%%, PC2 = %.1f%% (%.1f%% total) in perceptual OKLab (L, a, b)",
                       var_exp[1], var_exp[2], var_exp[1] + var_exp[2]),
    x = sprintf("PC1 (%.1f%%)", var_exp[1]),
    y = sprintf("PC2 (%.1f%%)", var_exp[2]),
    color = "Syntax Role",
    shape = "Mode"
  ) +
  theme_minimal(base_size = 12) +
  theme(legend.position = "right")

ggsave("assets/color-science/pca-global.png", p_pca, width = 11, height = 7.5, dpi = 150)

# --- 2. 6-Grouping Faceted OKLCH Chromatic Fingerprint ---
poly_df <- tokens %>%
  filter(role %in% POLYGON_ROLES) %>%
  mutate(role = factor(role, levels = POLYGON_ROLES)) %>%
  arrange(theme_slug, role)

p_fp <- ggplot(poly_df, aes(oklab_a, oklab_b, group = theme_slug, color = group, alpha = mode)) +
  geom_hline(yintercept = 0, color = "grey85") +
  geom_vline(xintercept = 0, color = "grey85") +
  geom_polygon(fill = NA, linewidth = 0.45) +
  scale_color_manual(values = GROUP_COLORS, guide = "none") +
  scale_alpha_manual(values = c(light = 0.45, dark = 0.85)) +
  coord_equal(xlim = c(-0.215, 0.215), ylim = c(-0.215, 0.215)) +
  facet_wrap(~group, ncol = 3) +
  labs(
    title = "Collegiate Chromatic Fingerprint — Six Groupings in OKLCH Hue-Chroma Space",
    x = "OKLab a (-green to +red)",
    y = "OKLab b (-blue to +yellow)",
    alpha = "Mode"
  ) +
  theme_minimal(base_size = 11)

ggsave("assets/color-science/family-fingerprint.png", p_fp, width = 14, height = 9, dpi = 150)

# --- 3. CVD Audit Summary ---
cvd <- read.csv("analysis/data/cvd_pairs.csv", stringsAsFactors = FALSE)
cat(sprintf("CVD audit: %d pairs checked across %d themes -> %d warnings, %d severe.\n",
            nrow(cvd), n_themes,
            sum(cvd$flagged_warning == "true"),
            sum(cvd$flagged_severe == "true")))
