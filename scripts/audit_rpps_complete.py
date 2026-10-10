"""Comprehensive audit of all podologists and cabinets in RPPS and GeoJSON."""

import json
import zipfile
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

# 1. Parse raw RPPS
zip_path = ROOT / "data" / "raw" / "rpps.zip"
idf_depts = {"75", "77", "78", "91", "92", "93", "94", "95"}

with zipfile.ZipFile(zip_path, "r") as z:
    for name in z.namelist():
        if "personne_activite" in name.lower() and name.endswith(".txt"):
            target_name = name
            break

    with z.open(target_name) as f:
        header = f.readline().decode("utf-8", errors="ignore").strip().split("|")
        idx_pp = header.index("Identifiant PP")
        idx_code_prof = header.index("Code profession")
        idx_lib_prof = header.index("Libellé profession")
        idx_struct = header.index("Identifiant technique de la structure")
        idx_cp = header.index("Code postal (coord. structure)")
        idx_code_com = header.index("Code commune (coord. structure)")
        idx_num = header.index("Numéro Voie (coord. structure)")
        idx_rep = header.index("Indice répétition voie (coord. structure)")
        idx_typ = header.index("Libellé type de voie (coord. structure)")
        idx_voie = header.index("Libellé Voie (coord. structure)")
        idx_com = header.index("Libellé commune (coord. structure)")
        idx_mode = header.index("Libellé mode exercice") if "Libellé mode exercice" in header else -1

        rows = []
        for line_b in f:
            line = line_b.decode("utf-8", errors="ignore")
            if "|80|" not in line and "pédicure" not in line.lower():
                continue
            parts = line.strip().split("|")
            if len(parts) < len(header):
                continue
            if parts[idx_code_prof] != "80" and "pédicure" not in parts[idx_lib_prof].lower():
                continue
            cp = parts[idx_cp].strip()
            code_com = parts[idx_code_com].strip()
            dept = cp[:2] if len(cp) >= 2 else code_com[:2]
            if dept in idf_depts:
                street_parts = [p for p in [parts[idx_num].strip(), parts[idx_rep].strip(), parts[idx_typ].strip(), parts[idx_voie].strip()] if p]
                street_str = " ".join(street_parts)
                adresse_complete = f"{street_str}, {cp} {parts[idx_com].strip()}".strip(", ")
                rows.append({
                    "pp_id": parts[idx_pp].strip(),
                    "struct_id": parts[idx_struct].strip(),
                    "dept": dept,
                    "adresse_complete": adresse_complete,
                    "code_com": code_com,
                    "cp": cp,
                    "mode": parts[idx_mode].strip() if idx_mode >= 0 else "",
                })

df_raw = pd.DataFrame(rows)
print("=== 1. RPPS RAW EXTRACTION (ÎLE-DE-FRANCE) ===")
print(f"Total lignes d'activité RPPS : {len(df_raw)}")
print(f"Praticiens personnes physiques uniques : {df_raw['pp_id'].nunique()}")

# Distinct practice locations
df_locations = df_raw.drop_duplicates(subset=["pp_id", "adresse_complete"]).copy()
print(f"Total lieux d'exercice distincts (praticien à une adresse) : {len(df_locations)}")

# Distinct physical cabinet addresses
df_cabinets = df_raw.drop_duplicates(subset=["adresse_complete"]).copy()
print(f"Total adresses physiques de cabinets distinctes : {len(df_cabinets)}")

print("\nRépartition par département :")
for d in sorted(idf_depts):
    loc_d = df_locations[df_locations["dept"] == d]
    cab_d = df_cabinets[df_cabinets["dept"] == d]
    pp_d = df_raw[df_raw["dept"] == d]["pp_id"].nunique()
    print(f"  Dép {d} : {len(loc_d):<4} postes d'exercice ({pp_d:<4} praticiens uniques) dans {len(cab_d):<4} cabinets physiques")

# 2. Check current GeoJSON files
podos_json = json.load(open(ROOT / "public" / "data" / "podologues.geojson", encoding="utf-8"))
print(f"\n=== 2. ÉTAT ACTUEL DANS L'APPLICATION ===")
print(f"Points cartographiés dans podologues.geojson : {len(podos_json['features'])}")

# Check difference between RPPS locations (3147) and GeoJSON (3144)
diff = len(df_locations) - len(podos_json['features'])
print(f"Différence résiduelle : {diff} points.")
