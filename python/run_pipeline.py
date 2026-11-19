import os, subprocess, sys
 
if os.path.exists("out/provenance.json"):
    os.remove("out/provenance.json")      # start a fresh provenance log
 
for script in ["02_qc.py", "03_reduce.py", "04_export.py",
               "05_cluster.py", "06_markers.py", "07_export_clusters.py", "08_synthetic.py", "09_expression.py", "10_lut_annotation.py", "11_uncertainty.py", "12_aggregates.py"]:
    print("==>", script)
    subprocess.run([sys.executable, script], check=True)
