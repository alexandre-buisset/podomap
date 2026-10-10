"""Audit of dataset reliability and completeness across all 1,285 IDF zones."""

import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

with open(ROOT / "public" / "data" / "zones.geojson", encoding="utf-8") as f:
    geojson = json.load(f)

zones = geojson["features"]
print(f"==================================================")
print(f"AUDIT COMPLET DE FIABILITÉ - {len(zones)} ZONES IDF")
print(f"==================================================\n")

# 1. Audit des communes et départements
dept_counts = {}
for z in zones:
    d = z["properties"]["departement"]
    dept_counts[d] = dept_counts.get(d, 0) + 1

print("1. RÉPARTITION DES COMMUNES PAR DÉPARTEMENT :")
for d, cnt in sorted(dept_counts.items()):
    print(f"   Dép {d}: {cnt:4d} zones")
print(f"   Total : {sum(dept_counts.values())} zones (1265 communes + 20 arr. Paris = 1285)\n")

# 2. Audit du RPPS (Pédicures-Podologues)
with open(ROOT / "public" / "data" / "podologues.geojson", encoding="utf-8") as f:
    podo_geojson = json.load(f)
podos = podo_geojson["features"]
print(f"2. RECENSEMENT DES PODOLOGUES (RPPS / ANNUAIRE SANTÉ) :")
print(f"   Total praticiens géocodés dans l'outil : {len(podos)}")
print(f"   Référence officielle Ordre (ONPP IDF 2023) : 3 085 praticiens")
print(f"   Taux de couverture RPPS : {(len(podos) / 3085) * 100:.2f} %\n")

# 3. Audit INSEE Filosofi (Revenus)
# Let's inspect raw Filosofi
raw_income_path = ROOT / "data" / "raw" / "revenu_communes.csv"
missing_raw_insee = []
if raw_income_path.exists():
    df_raw = pd.read_csv(raw_income_path, sep=";", low_memory=False)
    df_raw["code"] = df_raw["Code géographique"].astype(str).str.strip().str.zfill(5)
    df_raw["dept"] = df_raw["code"].str[:2]
    idf_raw = df_raw[df_raw["dept"].isin(["75", "77", "78", "91", "92", "93", "94", "95"])].copy()
    med_col = idf_raw.columns[7]
    idf_raw["rev"] = pd.to_numeric(idf_raw[med_col], errors="coerce")
    missing_raw_insee = idf_raw[idf_raw["rev"].isna()]["code"].tolist()

print(f"3. DONNÉES DE REVENUS INSEE FILOSOFI :")
print(f"   Communes avec revenus réels certifiés INSEE : {len(zones) - len(missing_raw_insee)} / {len(zones)} ({(1 - len(missing_raw_insee)/len(zones))*100:.1f}%)")
print(f"   Communes avec secret statistique INSEE (<50-200 hab) : {len(missing_raw_insee)}")
for code in missing_raw_insee:
    match = [z for z in zones if z["properties"]["code_insee"] == code]
    if match:
        p = match[0]["properties"]
        print(f"     - {p['code_insee']} {p['nom']} ({p['departement']}) : {p['pop_totale']} hab.")
print()

# 4. Audit Transports
print("4. AUDIT DES DESSERTES EN TRANSPORTS :")
zero_transit = [z for z in zones if not z["properties"].get("temps_paris_min")]
print(f"   Zones sans estimation de temps : {len(zero_transit)}")
sample_cities = ["Melun", "Fontainebleau", "Provins", "Meaux", "Mantes-la-Jolie", "Rambouillet", "Cergy", "Chartrettes", "Vincennes"]
for name in sample_cities:
    match = [z for z in zones if z["properties"]["nom"] == name]
    if match:
        p = match[0]["properties"]
        print(f"     - {p['nom']:20s} : Gare={p['gare_nom']} ({p['gare_dist_km']} km, {p['gare_mode']}) | Temps={p['temps_paris_min']} min")
print()

# 5. Audit de saturation (Vincennes, Nogent, Le Perreux, Saint-Mandé)
print("5. AUDIT DE SATURATION (PETITE COURONNE VS GRANDE COURONNE) :")
test_check = ["Vincennes", "Nogent-sur-Marne", "Le Perreux-sur-Marne", "Saint-Mandé", "Levallois-Perret", "Chartrettes", "Héricy", "Saint-Nom-la-Bretèche"]
for name in test_check:
    match = [z for z in zones if z["properties"]["nom"] == name]
    if match:
        p = match[0]["properties"]
        podos_loc = p["nb_podologues"]
        podos_2k = p["nb_podologues_2km"]
        pop = p["pop_totale"]
        ratio_str = f"1 pour {pop//podos_loc} hab" if podos_loc > 0 else f"0 podo pour {pop} hab"
        print(f"     - {p['nom']:22s} ({p['departement']}) : Pop={pop:6,d} | Podos={podos_loc:2d} ({ratio_str:20s}) | Podos à 2km={podos_2k:2d}")

print("\nAudit terminé.")
