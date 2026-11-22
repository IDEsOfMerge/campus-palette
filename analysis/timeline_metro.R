# Campus Palette -- Collegiate Heritage Metro Map (60 Universities, 1096-1974)
#
# Six clean horizontal collegiate grouping lines with piecewise chronological
# spacing so medieval European universities (1096, 1209) sit harmoniously alongside
# modern global & North American universities (1583-1974) with zero cross-grouping edges.
#
# Run from the repo root with: Rscript --vanilla analysis/timeline_metro.R
# (2x-supersampled production PNG is rendered by scripts/generate-color-science-assets.py)

library(ggplot2)
library(dplyr)

dir.create("assets/timeline", showWarnings = FALSE, recursive = TRUE)

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

TRACK_Y <- c(
  "Global Universities"          =  2.55,
  "Ivy League"                   =  1.53,
  "US Public Flagships"          =  0.51,
  "Liberal Arts & Independent"   = -0.51,
  "US Private Research & STEM"   = -1.53,
  "Canadian Universities"        = -2.55
)

year_to_metro_x <- function(yr) {
  anchors_y <- c(1096, 1209, 1583, 1636, 1701, 1740, 1775, 1800, 1825, 1850, 1875, 1895, 1919, 1957, 1974)
  anchors_x <- c(0.000, 0.048, 0.096, 0.136, 0.175, 0.212, 0.278, 0.335, 0.415, 0.505, 0.610, 0.715, 0.818, 0.875, 1.000) * 30
  approx(anchors_y, anchors_x, xout = yr, rule = 2)$y
}

summary_df <- read.csv("analysis/data/themes_summary.csv", stringsAsFactors = FALSE) %>%
  filter(mode == "light") %>%
  mutate(
    group = factor(group, levels = GROUP_ORDER),
    y = unname(TRACK_Y[as.character(group)]),
    x = year_to_metro_x(year),
    line_color = unname(GROUP_COLORS[as.character(group)])
  ) %>%
  arrange(group, year, short_name)

# Keep exact chronological x per station; alternate label side cleanly above/below track
nodes <- summary_df %>%
  group_by(group) %>%
  group_modify(function(df, key) {
    n <- nrow(df)
    dys <- numeric(n)
    base_dir <- ifelse(df$y[1] >= 0, 0.36, -0.36)
    dys[1] <- base_dir
    if (n > 1) {
      for (i in 2:n) {
        dys[i] <- -dys[i - 1]
      }
    }
    df$label_dy <- dys
    df
  }) %>%
  ungroup()

edges <- nodes %>%
  group_by(group) %>%
  mutate(xend = lead(x), yend = lead(y)) %>%
  filter(!is.na(xend)) %>%
  ungroup()

p <- ggplot() +
  geom_segment(
    data = edges,
    aes(x = x, y = y, xend = xend, yend = yend, color = line_color),
    linewidth = 1.6, lineend = "round"
  ) +
  scale_color_identity() +
  geom_point(
    data = nodes,
    aes(x, y, fill = accent_cursor),
    size = 4.2, shape = 21, color = "white", stroke = 1.0
  ) +
  scale_fill_identity() +
  geom_text(
    data = nodes,
    aes(x, y + label_dy, label = paste0(short_name, "\n", year)),
    size = 2.6, fontface = "bold", lineheight = 0.9, hjust = 0.5
  ) +
  labs(
    title = "Campus Palette — Collegiate Heritage Metro Map (1096–1974)",
    subtitle = sprintf("%d universities across six collegiate groupings with piecewise chronological spacing.", nrow(nodes))
  ) +
  theme_void(base_size = 12) +
  theme(
    plot.title = element_text(face = "bold", size = 16),
    plot.margin = margin(18, 30, 18, 30)
  )

ggsave("assets/timeline/timeline-metro.png", p, width = 22, height = 11.5, dpi = 150)
cat("Saved assets/timeline/timeline-metro.png\n")
