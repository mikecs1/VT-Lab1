import json, numpy as np, scanpy as sc
from contract import OUT

adata = sc.read_h5ad("out/03_clustered.h5ad")
markers = json.load(open("out/markers.json"))
top = []
for ms in markers["markers"].values():
    top += [m["gene"] for m in ms[:6]]                   # 6 markers per cluster
top = [g for g in dict.fromkeys(top) if g in adata.raw.var_names]

codes = adata.obs["cluster"].cat.codes.to_numpy()
C = len(adata.obs["cluster"].cat.categories)
Xg = adata.raw[:, top].X
Xg = Xg.toarray() if hasattr(Xg, "toarray") else np.asarray(Xg)
mean = np.vstack([Xg[codes == k].mean(axis=0) for k in range(C)])
frac = np.vstack([(Xg[codes == k] > 0).mean(axis=0) for k in range(C)])
json.dump({"genes": top, "mean": mean.tolist(), "frac": frac.tolist(),
           "counts": np.bincount(codes, minlength=C).tolist()},
          open(f"{OUT}/dotplot.json", "w"))