import json, numpy as np, scanpy as sc
from contract import OUT, load_manifest, save_manifest, write_u8, sync_provenance
from provenance import record

adata = sc.read_h5ad("out/03_clustered.h5ad")
markers = json.load(open("out/markers.json"))
genes = {m["gene"] for ms in markers["markers"].values() for m in ms}
genes |= set(adata.var_names[:200])
genes = sorted(g for g in genes if g in adata.raw.var_names)

X = adata.raw[:, genes].X
X = X.toarray() if hasattr(X, "toarray") else np.asarray(X)    # (N, G)

Q = 99
rows, meta = [], []
for j, g in enumerate(genes):
    x = X[:, j]
    nz = x[x > 0]
    hi = float(np.percentile(nz, Q)) if nz.size else 1.0
    v = np.clip(x / hi, 0, 1)
    b = np.zeros(x.shape, dtype=np.uint8)
    e = x > 0
    b[e] = 1 + np.round(v[e] * 254).astype(np.uint8)         # 0 = not detected
    rows.append(b)
    meta.append({"symbol": g, "hi": hi})

write_u8("expr.u8", np.concatenate(rows))                    # G x N, row-major
manifest = load_manifest()
manifest["expression"] = {"file": "expr.u8", "genes": "genes.json", "shape": [len(genes), int(adata.n_obs)]}
json.dump({"scaling": f"percentile {Q} of expressing cells, byte 0 = not detected, 1..255 -> 0..hi",
           "unit": "log-normalised expression", "genes": meta},
          open(f"{OUT}/genes.json", "w"))
save_manifest(manifest)
record("export_expression", n_genes=len(genes), clip_percentile=Q)
sync_provenance()


