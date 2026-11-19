# Lab 3 notes

## Tasks (R1)

### T2: locate cells expressing a gene
- Domain question: Where are the cells that express GNLY?
- Action: locate (target known: GNLY; location unknown)
- Target: extremes of one quantitative attribute
- Data: log-normalised expression of one gene, per cell
- View that answers it: 3D cloud in expression mode, with a legend

### T4: compare two clusters
- Domain question: Which gene separates cluster X from cluster Y?
- Action: compare
- Target: dependency between attributes (gene × cluster)
- Data: mean expression and fraction expressing, per cluster and gene
- View that answers it: 2D dot plot, linked to the 3D view

### T9: find uncertain cells
- Domain question: Which cells are we unsure about?
- Action: derive → locate
- Target: extremes of a derived attribute
- Data: uncertainty score per cell (neighbourhood purity)
- View that answers it: 3D cloud in uncertainty mode

- expr.u8: uint8, G × N row-major, byte 0 = not detected, 1..255 -> 0..hi per gene
- genes.json: gene symbols, per-gene `hi` (clip value), scaling description
- manifest.json: new `expression` entry (file, genes, shape)