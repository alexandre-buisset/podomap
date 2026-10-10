"""Enrich zones.geojson with data completeness and reliability flags."""

import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 1. Identify communes without official INSEE Filosofi income
raw_income_path = ROOT / "data" / "raw" / "revenu_communes.csv"
missing_insee_codes = set()

if raw_income_path.exists():
    df_raw = pd.read_csv(raw_income_path, sep=";", low_memory=False)
    df_raw["code"] = df_raw["Code géographique"].astype(str).str.strip().str.zfill(5)
    df_raw["dept"] = df_raw["code"].str[:2]
    idf_raw = df_raw[df_raw["dept"].isin(["75", "77", "78", "91", "92", "93", "94", "95"])].copy()
    med_col = idf_raw.columns[7]
    idf_raw["rev"] = pd.to_numeric(idf_raw[med_col], errors="coerce")
    missing_insee_codes = set(idf_raw[idf_raw["rev"].isna()]["code"].tolist())

print(f"Identified {len(missing_insee_codes)} communes with undisclosed INSEE income (statistical secrecy).")

# 2. Update zones.geojson
for geojson_path in [
    ROOT / "public" / "data" / "zones.geojson",
    ROOT / "dist" / "data" / "zones.geojson",
]:
    if not geojson_path.exists():
        continue

    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for feat in data["features"]:
        p = feat["properties"]
        code = p["code_insee"]
        
        # Check if income is official
        if code in missing_insee_codes or p.get("pop_totale", 0) < 150 and code in missing_insee_codes:
            p["has_insee_income"] = False
            p["fiabilite_revenu"] = "Non diffusé par l'INSEE (secret statistique < 150 hab)"
            # Set explicit indicator that this is an estimation for scoring only
            p["revenu_source"] = "Estimation départementale (Insee secret fiscal)"
        else:
            p["has_insee_income"] = True
            p["fiabilite_revenu"] = "Certifié INSEE Filosofi (Officiel)"
            p["revenu_source"] = "INSEE Filosofi 2021 communal"

        # Ratio habitant / podologue local
        pop = p.get("pop_totale", 1)
        podos = p.get("nb_podologues", 0)
        p["ratio_hab_commune"] = pop if podos == 0 else round(pop / podos)

        # Global data reliability status
        p["qualite_donnees"] = "Certifiée (INSEE + RPPS + IDFM)" if p["has_insee_income"] else "Partielle (Revenu Insee non diffusé)"

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Enriched {len(data['features'])} zones in {geojson_path.name}")

print("Done.")
