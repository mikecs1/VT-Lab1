# Lab notes, Part 3: encoding expression, uncertainty and accessibility

## 1. Task abstraction (R1)

### Task 1 (T2): Where are the cells that express GNLY?
- Domain question: where in the embedding are the cells that express GNLY?
- Action: locate (target known, location unknown)
- Target: extremes of one quantitative attribute
- Data: log-normalised expression of one gene, per cell
- View that answers it: the 3D cloud coloured by gene expression (gene box, cividis, legend)

### Task 2 (T4): Which genes distinguish cluster 4 from cluster 5?
- Domain question: which genes separate NK cells (cluster 4) from CD8 T cells (cluster 5)?
- Action: compare
- Target: dependency between attributes (gene x cluster)
- Data: mean expression and fraction of expressing cells, per cluster and gene
- View that answers it: the linked 2D dot plot. The 3D cloud answers this badly, because it has no aligned marks to compare.

### Task 3 (T9): Which cells are we unsure about?
- Domain question: which cells might be in the wrong cluster?
- Action: derive, then locate
- Target: extremes of a derived attribute
- Data: neighbourhood-purity uncertainty per cell, computed in Python
- View that answers it: the 3D cloud with the uncertainty slider (uncertain cells fade towards grey)

## 2. What I built, in order

**Python (all outputs go to `web/public/data/`):**
1. `09_expression.py`: exports log-normalised expression for the marker genes and the first 200 variable genes as `expr.u8` (uint8, G x N). Scaling: 99th percentile of expressing cells, byte 0 = not detected. `genes.json` holds symbol and `hi` per gene.
2. `10_lut_annotation.py`: exports the cividis colormap as `lut_cividis.u8` (256 x 4 RGBA) and registers `lut`, `annotation` and `dotplot` in the manifest.
3. `annotation.json`, written by hand from `markers.json`: a name, a confident flag and evidence genes per cluster.
4. `11_uncertainty.py`: neighbourhood purity (k = 15, first 30 PCA components), stored as `uncertainty.u8`.
5. `12_aggregates.py`: mean expression and fraction expressing per cluster for the top markers, plus cluster counts, stored as `dotplot.json`.

**Browser (`web/src/main.js` and two shaders):**
1. Rewrote both point shaders. The vertex shader passes cluster, expression and uncertainty on. The fragment shader has a cluster mode and an expression mode (lookup texture, dark grey for "not detected"), a fade for uncertain cells, and a ring for cluster 8.
2. Section 9: gene box with suggestions, setGene, colour bar legend built from the same lookup table as the shader.
3. Section 10: uncertainty slider with a note saying what the number measures.
4. Section 11: categorical legend with colour, cell type, count, evidence on hover and click-to-pin. Clusters 0 and 5 are marked "(?)".
5. Section 12: dot plot in SVG with two cluster selectors (A and B), dot area = fraction, colour = mean. The dot plot and legend are linked to the cloud through one `setPinned` function.
6. Section 13: Okabe-Ito palette, visible focus outline, collapsible text table.

## 3. Problems I met and how I solved them

- **Blank cloud after the uncertainty step:** replaced both shaders completely with a known-good version.
- **Slider did nothing:** the console showed the data was on the GPU (max 238) and the uniform changed (0.96). The cause was a temporary debug line (`gl_FragColor = vec4(vec3(vUnc), 1.0);`) that I had left in the fragment shader. It overwrote the colour that the fade had computed. Removing it fixed it.
- **Fade too faint:** purity values are mostly small, so I multiply the uncertainty by 3 in the shader.
- **9 clusters, 8 Okabe-Ito colours:** cluster 8 reuses cluster 0's blue and is drawn as a ring.
- **Text table was empty:** it was built before its data had loaded. It is now rebuilt every time it is opened.

## 4. Things I observed

- GNLY lights up a small group of cells and the rest is dark grey ("not detected").
- 5.4% of the cells have uncertainty above 0.5.
- Marker genes lit up the clusters I expected from the annotation.
- The ring for cluster 8 appears in the cloud, the legend and the dot plot.
- The text table opens and lists the clusters.

## 5. Still to do

- [ ] CVD screenshots under four vision types, in cluster and gene mode (R6)
- [ ] Keyboard-only run of T2, T4, T9 (R6)
- [ ] Table with VoiceOver or the accessibility tree (R6)
- [ ] Contrast numbers confirmed in the console (R6)
- [ ] Peer test (R7)
- [ ] Fill every **[TO FILL]** in `decisions.md`
- [ ] Data contract change log
- [ ] Commit and tag `lab3`

## 6. Questions from the manual (draft answers)

**1. Which visual channel did you use for expression, and why?**
Colour, as a sequential colormap (cividis). Position is already used by the embedding. Among the channels that remain, colour luminance is the strongest for ordered quantities, while size has a small usable range and adds occlusion, and hue is not ordered. In the perceptual ranking, position and length are read more accurately than area and colour, so colour is not precise: users can find where expression is high (T2) but cannot read exact values from the cloud.

**2. Why this scaling and colormap? What would a rainbow map or a different scaling have hidden or invented?**
I clip at the 99th percentile of expressing cells and keep "not detected" as its own class. With a per-gene maximum, one extreme cell would compress everything else into the dark end. A rainbow map has no natural order, adds false boundaries where hue changes, and is not safe for colour vision deficiency. Cividis is ordered by luminance and designed for CVD. Cost of my choice: values above the clip look equal, which the legend states with "≥".

**3. Which uncertainty measure and encoding, what does it measure, what does it cost?**
Neighbourhood purity with k = 15, shown by fading cells towards grey. It measures how much a cell's neighbourhood disagrees with my own clustering, not biological truth. Cost: grey can be confused with a category colour, and cells inside a continuum (not just wrongly placed cells) also score as uncertain.

**4. Which problems did the peer test reveal?**
**[TO FILL after the peer test]**

**5. Compare two views for one task.**
For T4 (which genes separate clusters 4 and 5), the cloud and the dot plot could both be used. The dot plot supports the task better. It puts each gene on an aligned row and each cluster on an aligned column, so the comparison uses position, the most accurate channel, plus area for the fraction of cells and colour for the mean. In the cloud I would have to switch gene by gene and compare colour patterns across a 3D point cloud with overlap. The cloud is the better view for T2 and T9, where a pattern in space is what is searched for.