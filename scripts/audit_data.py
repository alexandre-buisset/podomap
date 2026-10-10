import json
import os

with open('public/data/zones.geojson', 'r', encoding='utf-8') as f:
    data = json.load(f)

features = data['features']
print(f"Total zones in GeoJSON: {len(features)}")

# Check departments distribution
dept_counts = {}
for feat in features:
    dept = str(feat['properties'].get('departement'))
    dept_counts[dept] = dept_counts.get(dept, 0) + 1
print("Distribution par département:", sorted(dept_counts.items()))

# Check Paris specifically
paris_arrondissements = [f['properties']['nom'] for f in features if str(f['properties'].get('departement')) == '75']
print(f"Zones à Paris (75): {len(paris_arrondissements)} zones")
print(f"Exemples Paris: {paris_arrondissements[:5]}")

# Completeness check on critical fields
fields_to_check = [
    'nom', 'code_insee', 'departement', 'pop_totale', 'pop_65plus', 'part_65plus',
    'nb_podologues', 'nb_podologues_1km', 'nb_podologues_2km', 'nb_podologues_3km',
    'densite_10k_65plus_1km', 'densite_10k_65plus_2km', 'densite_10k_65plus_3km',
    'revenu_median', 'panier_semelles_estime', 'potentiel_semelles',
    'temps_paris_min', 'gare_nom', 'gare_dist_km', 'gare_mode', 'score_transport'
]

print("\n--- AUDIT DE COMPLÉTUDE DES DONNÉES ---")
total = len(features)
for field in fields_to_check:
    nulls = sum(1 for f in features if f['properties'].get(field) is None)
    zeros = sum(1 for f in features if f['properties'].get(field) == 0)
    valid = sum(1 for f in features if f['properties'].get(field) not in (None, ''))
    pct = (valid / total) * 100
    print(f"- {field:25s}: {valid}/{total} ({pct:.1f}%) valides | {nulls} nulls | {zeros} zeros")

# Check which communes might be missing transport or income
missing_income = [f['properties']['nom'] for f in features if f['properties'].get('revenu_median') is None or f['properties'].get('revenu_median') == 0]
print(f"\nCommunes sans revenu_median: {len(missing_income)}")
if missing_income:
    print(f"Exemples sans revenu: {missing_income[:10]}")

missing_transport = [f['properties']['nom'] for f in features if f['properties'].get('temps_paris_min') is None]
print(f"Communes sans temps_paris_min: {len(missing_transport)}")
if missing_transport:
    print(f"Exemples sans transport: {missing_transport[:10]}")
