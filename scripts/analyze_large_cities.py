"""Analyze how the 2km centroid disk affects large cities in IDF."""

import json
from pathlib import Path
from shapely.geometry import shape, Point

ROOT = Path(__file__).resolve().parent.parent
zones_data = json.load(open(ROOT / "public" / "data" / "zones.geojson", encoding="utf-8"))
podos_data = json.load(open(ROOT / "public" / "data" / "podologues.geojson", encoding="utf-8"))

print(f"Total zones: {len(zones_data['features'])}, Total podo points: {len(podos_data['features'])}")

# Analyze cities >= 30 000 inhabitants
large_cities = [f for f in zones_data["features"] if f["properties"].get("pop_totale", 0) >= 30000]
print(f"Total cities >= 30 000 pop in IDF: {len(large_cities)}")

results = []
for f in large_cities:
    props = f["properties"]
    poly = shape(f["geometry"])
    c_lat = props["centroide_lat"]
    c_lon = props["centroide_lon"]

    # Calculate approximate area and span in km
    # At lat 48.85: 1 deg lat = 111.19 km, 1 deg lon = 73.15 km
    coords = []
    def get_coords(g):
        if g.geom_type == 'Polygon':
            return list(g.exterior.coords)
        elif g.geom_type == 'MultiPolygon':
            c = []
            for p in g.geoms:
                c.extend(list(p.exterior.coords))
            return c
        return []
    pts_coords = get_coords(poly)
    lons = [p[0] for p in pts_coords]
    lats = [p[1] for p in pts_coords]
    span_x_km = (max(lons) - min(lons)) * 73.15
    span_y_km = (max(lats) - min(lats)) * 111.19
    diameter_km = max(span_x_km, span_y_km)

    podos_commune = props.get("nb_podologues", 0)
    podos_2km = props.get("nb_podologues_2km", 0)
    pop = props["pop_totale"]
    ratio = round(pop / max(1, podos_commune))

    results.append({
        "nom": props["nom"],
        "dept": props["departement"],
        "pop": pop,
        "diameter_km": round(diameter_km, 1),
        "podos_commune": podos_commune,
        "ratio_hab_podo": ratio,
        "podos_2km": podos_2km,
        "ratio_vs_2km_ratio": podos_2km / max(1, podos_commune),
    })

results.sort(key=lambda x: -x["pop"])

print("\n=== TOP 20 GRANDES VILLES IDF : IMPACT DE L'ENVERGURE TERRITORIALE (DIAMÈTRE > 4 KM) ===")
print(f"{'Ville':<25} {'Dép':<4} {'Pop':<8} {'Diam(km)':<9} {'Podos Com':<10} {'1 podo / X hab':<15} {'Podos 2km':<10}")
print("-" * 85)
for r in results[:20]:
    print(f"{r['nom']:<25} {r['dept']:<4} {r['pop']:<8} {r['diameter_km']:<9} {r['podos_commune']:<10} 1 / {r['ratio_hab_podo']:<11} {r['podos_2km']:<10}")
