import numpy as np, scanpy as sc
from sklearn.neighbors import NearestNeighbors
from contract import OUT, load_manifest, save_manifest, write_u8

adata = sc.read_h5ad("out/03_clustered.h5ad")
Xp = adata.obsm["X_pca"][:, :30]
y = adata.obs["cluster"].cat.codes.to_numpy()

k = 15
idx = NearestNeighbors(n_neighbors=k + 1).fit(Xp).kneighbors(Xp, return_distance=False)
u = 1 - (y[idx[:, 1:]] == y[:, None]).mean(axis=1)      # 0 = all neighbours agree, 1 = none do

write_u8("uncertainty.u8", np.round(u * 255).astype(np.uint8))
m = load_manifest()
m["uncertainty"] = {"file": "uncertainty.u8", "method": f"1 - neighbour purity, k={k}, PCA 30 comps"}
save_manifest(m)