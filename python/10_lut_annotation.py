import json, numpy as np, matplotlib
from contract import OUT

cm = matplotlib.colormaps["cividis"]
lut = np.round(cm(np.linspace(0, 1, 256)) * 255).astype(np.uint8)
lut.tofile(f"{OUT}/lut_cividis.u8")

from contract import load_manifest, save_manifest
m = load_manifest()
m["lut"] = {"file": "lut_cividis.u8", "name": "cividis", "size": 256}
m["dotplot"] = {"file": "dotplot.json"}
m["annotation"] = {"file": "annotation.json"}
save_manifest(m)