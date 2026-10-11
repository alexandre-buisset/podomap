import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
data = json.load(open(ROOT / "public" / "data" / "zones.geojson", encoding="utf-8"))
print(f"Loaded {len(data['features'])} zones from zones.geojson.")

stg = [f['properties'] for f in data['features'] if 'Saint-Germain-en-Laye' in f['properties']['nom']][0]
print("Saint-Germain-en-Laye:")
print(f"  Pop totale: {stg['pop_totale']} hab.")
print(f"  Enfants 0-14 ans: {stg['pop_0_14']} ({stg['part_0_14']*100:.1f}%)")
print(f"  Jeunes 0-19 ans: {stg['pop_0_19']} ({stg['part_0_19']*100:.1f}%)")
print(f"  Familles 30-44 ans: {stg['pop_30_44']}")
print(f"  Ratio Jeunes / Seniors: {stg['ratio_jeunes_seniors']}")
print(f"  Licenciés sportifs: {stg['nb_licencies_sport']} ({stg['taux_licencies_sport']}%)")
print(f"  Clubs sportifs: {stg['nb_clubs_sport']}")
print(f"  Détail sports: Foot={stg['licencies_football']}, Tennis={stg['licencies_tennis']}, Athlé={stg['licencies_athletisme']}, Basket={stg['licencies_basketball']}, Hand={stg['licencies_handball']}, Rugby={stg['licencies_rugby']}")

# Check Paris 15e
p15 = [f['properties'] for f in data['features'] if f['properties']['code_insee'] == '75115'][0]
print("\nParis 15e:")
print(f"  Pop totale: {p15['pop_totale']} hab.")
print(f"  Enfants 0-14 ans: {p15['pop_0_14']} ({p15['part_0_14']*100:.1f}%)")
print(f"  Licenciés sportifs: {p15['nb_licencies_sport']} ({p15['taux_licencies_sport']}%)")
print(f"  Clubs sportifs: {p15['nb_clubs_sport']}")
print(f"  Détail sports: Foot={p15['licencies_football']}, Tennis={p15['licencies_tennis']}, Basket={p15['licencies_basketball']}, Rugby={p15['licencies_rugby']}")
