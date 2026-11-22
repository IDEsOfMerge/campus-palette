# Campus Palette -- Per-Mode CIEDE2000 Classical MDS, 60x60 Split-Triangle
# Distance Heatmap, and 120-Leaf Ward.D2 Chromatic Dendrogram
#
# Run from the repo root with: Rscript --vanilla analysis/theme_similarity.R
# (2x-supersampled production PNGs are rendered by scripts/generate-color-science-assets.py)

source("analysis/color_math.R")
library(dplyr)
library(tidyr)
library(ggplot2)
library(ggrepel)

dir.create("assets/color-science", showWarnings = FALSE, recursive = TRUE)

GROUP_ORDER <- c(
  "Global Universities",
  "Ivy League",
  "US Public Flagships",
  "Liberal Arts & Independent",
  "US Private Research & STEM",
  "Canadian Universities"
)

GROUP_COLORS <- c(
  "Global Universities"          = "#B67B0C",
  "Ivy League"                   = "#B81D32",
  "US Public Flagships"          = "#1657B5",
  "Liberal Arts & Independent"   = "#127D49",
  "US Private Research & STEM"   = "#6B3CB8",
  "Canadian Universities"        = "#0A7E86"
)

AUDIT_ROLES <- c(
  "accentKeyword", "accentStorage", "accentString", "accentRegex",
  "accentFunction", "accentFunctionDim", "accentType", "accentInterface",
  "accentNumber", "accentDecorator", "accentNamespace", "colorError", "colorWarning"
)

tokens <- read.csv("analysis/data/tokens_long.csv", stringsAsFactors = FALSE) %>%
  filter(role %in% AUDIT_ROLES)
pairs <- read.csv("analysis/data/pairwise_distances.csv", stringsAsFactors = FALSE)

wide <- tokens %>%
  select(theme_slug, university, short_name, group, mode, year, role, oklch_L, oklab_a, oklab_b) %>%
  pivot_wider(
    names_from = role,
    values_from = c(oklch_L, oklab_a, oklab_b),
    names_glue = "{role}_{.value}"
  )

feature_cols <- as.vector(t(outer(AUDIT_ROLES, c("oklch_L", "oklab_a", "oklab_b"), paste, sep = "_")))
stopifnot(all(feature_cols %in% names(wide)))
feature_matrix <- as.matrix(wide[, feature_cols])
rownames(feature_matrix) <- wide$theme_slug

meta <- wide %>%
  select(theme_slug, university, short_name, group, mode, year) %>%
  mutate(group = factor(group, levels = GROUP_ORDER))

build_dist_matrix <- function(mode_name, slugs) {
  n <- length(slugs)
  D <- matrix(0, nrow = n, ncol = n, dimnames = list(slugs, slugs))
  sub <- pairs %>% filter(mode == mode_name)
  for (k in seq_len(nrow(sub))) {
    a <- sub$slug_a[k]; b <- sub$slug_b[k]; d <- sub$mean_de00[k]
    D[a, b] <- d
    D[b, a] <- d
  }
  D
}

# --- 1. Per-Mode CIEDE2000 Classical MDS (60 Light + 60 Dark, zero outliers) ---
n_univ <- length(unique(meta$university))
mds_results <- list()
for (mode_name in c("light", "dark")) {
  mode_meta <- meta %>% filter(mode == mode_name)
  slugs <- mode_meta$theme_slug
  D_mat <- build_dist_matrix(mode_name, slugs)
  fit <- cmdscale(D_mat, k = 2, eig = TRUE)
  pos_sum <- sum(pmax(fit$eig, 0))
  v1 <- round(100 * fit$eig[1] / pos_sum, 1)
  v2 <- round(100 * fit$eig[2] / pos_sum, 1)
  pts <- fit$points
  if (pts[paste0("oxford-", mode_name), 1] < 0) pts[, 1] <- -pts[, 1]
  if (pts[paste0("northwestern-", mode_name), 2] < 0) pts[, 2] <- -pts[, 2]

  cat(sprintf("%s MDS (%d universities): Dim 1 = %.1f%%, Dim 2 = %.1f%% (sum = %.1f%%)\n",
              tools::toTitleCase(mode_name), n_univ, v1, v2, v1 + v2))

  mds_df <- mode_meta %>%
    mutate(
      mds1 = pts[match(theme_slug, rownames(pts)), 1],
      mds2 = pts[match(theme_slug, rownames(pts)), 2],
      panel_label = sprintf("%s Themes (%d Universities · %.1f%% + %.1f%% = %.1f%%)",
                            tools::toTitleCase(mode_name), n_univ, v1, v2, v1 + v2)
    )
  mds_results[[mode_name]] <- list(df = mds_df, D = D_mat, v1 = v1, v2 = v2)
}

mds_all_df <- bind_rows(mds_results$light$df, mds_results$dark$df) %>%
  left_join(tokens %>% filter(role == "accentKeyword") %>% select(theme_slug, kw_hex = hex), by = "theme_slug")

p_mds <- ggplot(mds_all_df, aes(mds1, mds2, label = short_name)) +
  geom_hline(yintercept = 0, color = "grey85", linetype = "dashed") +
  geom_vline(xintercept = 0, color = "grey85", linetype = "dashed") +
  geom_point(aes(color = kw_hex), size = 3.2) +
  scale_color_identity() +
  ggrepel::geom_text_repel(size = 2.4, max.overlaps = 80, seed = 1, segment.color = "grey75") +
  facet_wrap(~panel_label, scales = "free") +
  labs(
    title = "Perceptual Similarity Landscape — Classical MDS on CIEDE2000 (dE00)",
    subtitle = sprintf("Pairwise mean dE00 across 13 syntax roles across all %d Light and %d Dark collegiate themes.", n_univ, n_univ),
    x = "MDS Dim 1",
    y = "MDS Dim 2"
  ) +
  theme_minimal(base_size = 12) +
  theme(strip.text = element_text(face = "bold"))

ggsave("assets/color-science/theme-mds.png", p_mds, width = 16, height = 8.5, dpi = 150)

# --- 2. Ward-Ordered 60x60 Split-Triangle Distance Heatmap ---
univs <- unique(meta$university)
short_map <- setNames(meta$short_name[meta$mode == "light"], meta$university[meta$mode == "light"])
l_map <- setNames(meta$theme_slug[meta$mode == "light"], meta$university[meta$mode == "light"])
d_map <- setNames(meta$theme_slug[meta$mode == "dark"], meta$university[meta$mode == "dark"])

comb_mat <- do.call(rbind, lapply(univs, function(u) {
  c(feature_matrix[l_map[[u]], ], feature_matrix[d_map[[u]], ])
}))
rownames(comb_mat) <- univs
hc_univ <- hclust(dist(scale(comb_mat)), method = "ward.D2")
ord_univ <- univs[hc_univ$order]
ord_short <- unname(short_map[ord_univ])

DL <- mds_results$light$D[l_map[ord_univ], l_map[ord_univ]]
DD <- mds_results$dark$D[d_map[ord_univ], d_map[ord_univ]]
nu <- length(ord_univ)

hm_df <- expand.grid(row_i = seq_len(nu), col_i = seq_len(nu)) %>%
  mutate(
    row_u = factor(ord_short[row_i], levels = rev(ord_short)),
    col_u = factor(ord_short[col_i], levels = ord_short),
    de = ifelse(row_i == col_i, NA_real_, ifelse(row_i < col_i, DL[cbind(row_i, col_i)], DD[cbind(row_i, col_i)]))
  )

p_hm <- ggplot(hm_df, aes(col_u, row_u, fill = pmin(de, 20))) +
  geom_tile(color = "white", linewidth = 0.25) +
  scale_fill_gradientn(
    colors = c("#122258", "#1C4E92", "#3886AC", "#84BABA", "#D6DAC6", "#F8F1E0"),
    na.value = "#D8D6CE",
    name = "Mean dE00"
  ) +
  coord_equal() +
  labs(
    title = sprintf("Pairwise Perceptual Distance Matrix — All %d Universities (CIEDE2000)", nu),
    subtitle = sprintf("Ward-ordered %dx%d split-triangle matrix: upper-right = Light mode, lower-left = Dark mode.", nu, nu),
    x = NULL,
    y = NULL
  ) +
  theme_minimal(base_size = 9) +
  theme(axis.text.x = element_text(angle = 55, hjust = 1, vjust = 1), panel.grid = element_blank())

ggsave("assets/color-science/theme-distance-heatmap.png", p_hm, width = 14.5, height = 14, dpi = 150)

# --- 3. 120-Leaf Ward.D2 Hierarchical Dendrogram ---
hc_all <- hclust(dist(scale(feature_matrix)), method = "ward.D2")
cat(sprintf("Ward.D2 %d-theme clustering complete (max merge height = %.2f).\n", nrow(feature_matrix), max(hc_all$height)))
