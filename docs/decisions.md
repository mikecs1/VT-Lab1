## D1: How the browser gets genes
- Task(s) served: T2, T4
- Options considered: one static file; one file per gene; a service
- Choice: one static file (expr.u8), markers + first 200 variable genes
- Why: one request, simple. Every marker is included, so T2 and T4 work for the genes I annotate with.
- How I checked it: [e.g. loaded GNLY in the browser, it appears; GNLY is in genes.json]

## D2: Scaling of expression
- Task(s) served: T2
- Options considered: per-gene max; percentile clip; common scale; "not detected" class; float32
- Choice: 99th percentile of expressing cells, byte 0 = not detected, 1..255 = 0..hi
- Why: expression is zero in most cells and long-tailed. A max-scale would let a single extreme cell squash everyone else into dark colours. A separate zero class stops "no counts" from looking like "a little".
- Cost: values above the clip look equal, so the legend shows "≥ hi".
- How I checked it: [compare GNLY with max-scaling vs. your choice, screenshot in docs/img/]

## D4: How categories (clusters, cell types) are shown
- Task(s) served: T1 (counts), T8 (annotation), T2/T9 (identity underneath)
- Options considered: CVD-safe palette, fewer categories, shape as a redundant channel, direct labels
- Choice: legend with name, colour, cell count, click-to-pin; unsure clusters marked "(?)"
- Why: counts in the legend answer T1, since the cloud can't show cluster sizes. Names come from marker evidence in annotation.json.
- Limits: the palette is still the original 12 colours, which is not CVD-safe (see accessibility step).
- How I checked it: [write after you did it: counts add to 2638; MS4A1/IL7R/LYZ/PPBP lit the expected clusters; screenshot in docs/img/]

## D6: Linked 2D view
- Task(s) served: T4 (compare), T5 (partly)
- Options considered: dot plot, heat map, cluster-size bar chart, histograms, gene-vs-gene scatter
- Choice: dot plot (genes × clusters), showing the 14 genes with the largest mean difference between two chosen clusters; dot area = fraction of cells expressing, colour = mean (cividis, scaled per gene)
- Why: the 3D cloud cannot support compare: position in 3D is not aligned and cannot be read accurately. In the dot plot, position along an aligned axis carries the comparison, which is the most accurate channel. Area (fraction) and colour (mean) add two more attributes per mark.
- Linking: shared state. Cluster header → highlight in 3D and legend; gene name → colour the cloud.
- Limits: colour is per gene, so colours are not comparable between rows; only 6 markers per cluster are in the data, so a gene outside the file can't appear.
- How I checked it: [fill in: NK vs CD8 T, NKG7 shows up as non-separating; peer test result]

## D8: Accessibility
- Task(s) served: all three (T2, T4, T9)
- Measures: (a) CVD-safe palette (Okabe-Ito) for clusters, cividis for expression; (b) redundant shape: ring for cluster 8; (c) keyboard operation of all controls, visible focus; (d) text table with cluster, cell type, count, markers
- Why Okabe-Ito: designed to be distinguishable under the common CVD types. It only has 8 colours for my 9 clusters, so cluster 8 shares cluster 0's blue and is told apart by shape. Cluster 8 is tiny and far from cluster 0, so confusion is unlikely.
- Costs: the 8th colour is grey, which is also the colour that uncertain cells fade towards. [say how bad that was in practice]
- How I checked it: [fill in with what you really saw: screenshots under deuteranopia/protanopia/tritanopia/greyscale in docs/img/; which pairs were hard; keyboard run-through of T2/T4/T9 and what was unreachable; table read by VoiceOver or the accessibility tree; contrast numbers]