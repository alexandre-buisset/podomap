"""Enrich zones with territorial scale (diameter, area) and intra-urban neighborhood/transit poles."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shapely.geometry import shape, Point
from pipeline.geo import haversine_distance_km

zones_path = ROOT / "public" / "data" / "zones.geojson"
podos_path = ROOT / "public" / "data" / "podologues.geojson"
stations_path = ROOT / "public" / "data" / "stations.geojson"

zones_data = json.load(open(zones_path, encoding="utf-8"))
podos_data = json.load(open(podos_path, encoding="utf-8"))
stations_data = json.load(open(stations_path, encoding="utf-8"))

podo_pts = [
    (f["properties"]["id"], f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0])
    for f in podos_data["features"]
]

stations_list = [
    {
        "nom": f["properties"]["nom"],
        "mode": f["properties"].get("mode", "TRAIN"),
        "lat": f["geometry"]["coordinates"][1],
        "lon": f["geometry"]["coordinates"][0],
    }
    for f in stations_data["features"]
]

print(f"Loaded {len(zones_data['features'])} zones, {len(podo_pts)} podo points, {len(stations_list)} stations.")

large_cities_count = 0

for feat in zones_data["features"]:
    props = feat["properties"]
    geom = feat["geometry"]
    poly = shape(geom)

    # 1. Bounding box & diameter calculation
    coords = []
    if geom["type"] == "Polygon":
        coords = geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        for p in geom["coordinates"]:
            coords.extend(p[0])

    if coords:
        lons = [pt[0] for pt in coords]
        lats = [pt[1] for pt in coords]
        span_x_km = (max(lons) - min(lons)) * 73.15
        span_y_km = (max(lats) - min(lats)) * 111.19
        diameter_km = round(max(span_x_km, span_y_km), 1)
        # Approximate area in km2
        area_km2 = round(poly.area * 73.15 * 111.19, 1)
    else:
        diameter_km = 2.0
        area_km2 = 3.0

    props["diametre_territoire_km"] = diameter_km
    props["superficie_km2"] = area_km2

    pop = props.get("pop_totale", 0)
    is_large = pop >= 25000 or diameter_km >= 4.0 or area_km2 >= 10.0
    props["is_grande_ville"] = is_large

    if is_large:
        large_cities_count += 1

    # 2. Find stations located inside or within 500m of this zone
    zone_stations = []
    c_lat = props["centroide_lat"]
    c_lon = props["centroide_lon"]

    for st in stations_list:
        pt = Point(st["lon"], st["lat"])
        # Quick bounding box pre-filter
        d_center = haversine_distance_km(c_lat, c_lon, st["lat"], st["lon"])
        if d_center <= (diameter_km / 2.0 + 1.0):
            if poly.contains(pt) or poly.distance(pt) * 111.0 <= 0.6:
                zone_stations.append(st)

    # De-duplicate stations by name
    seen_st_names = set()
    unique_stations = []
    for st in zone_stations:
        if st["nom"] not in seen_st_names:
            seen_st_names.add(st["nom"])
            unique_stations.append(st)

    # Always include Centre-Ville / Mairie pole
    poles = []
    poles.append({
        "nom": f"Centre-Ville / Mairie ({props['nom']})",
        "type": "CENTRE",
        "mode": "MAIRIE",
        "lat": c_lat,
        "lon": c_lon,
    })

    for st in unique_stations[:5]: # Up to 5 main transit hubs
        poles.append({
            "nom": f"Gare {st['mode']} {st['nom']}",
            "type": "GARE",
            "mode": st["mode"],
            "lat": st["lat"],
            "lon": st["lon"],
        })

    # For each pole, compute hyper-local competition (podologues at <= 1.0 km)
    poles_details = []
    for pole in poles:
        p_lat = pole["lat"]
        p_lon = pole["lon"]
        podos_1km = sum(
            1 for p_id, lat, lon in podo_pts
            if haversine_distance_km(p_lat, p_lon, lat, lon) <= 1.0
        )

        if podos_1km == 0:
            diag = "🛡️ Désert de quartier (Opportunité maximale)"
            color = "#10b981"
            status = "desert"
        elif podos_1km == 1:
            diag = "🟢 Très favorable (1 seul confrère à 1 km)"
            color = "#10b981"
            status = "favorable"
        elif podos_1km == 2:
            diag = "⚖️ Favorable (2 confrères à 1 km)"
            color = "#0d9488"
            status = "equilibre"
        elif podos_1km <= 4:
            diag = "🟡 Modéré (3 à 4 confrères à 1 km)"
            color = "#0284c7"
            status = "modere"
        else:
            diag = f"⚠️ Pôle saturé ({podos_1km} confrères à 1 km)"
            color = "#ef4444"
            status = "sature"

        poles_details.append({
            "nom": pole["nom"],
            "mode": pole["mode"],
            "type": pole["type"],
            "lat": p_lat,
            "lon": p_lon,
            "podos_1km": podos_1km,
            "diagnostic": diag,
            "color": color,
            "status": status,
        })

    props["poles_quartiers"] = poles_details

print(f"Identified {large_cities_count} large polycentric cities in IDF.")

# Save to public and dist
json.dump(zones_data, open(zones_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(zones_data, open(ROOT / "dist" / "data" / "zones.geojson", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("Saved enriched zones.geojson to public/data/ and dist/data/!")

# Verify Noisy-le-Grand
nlg = [f for f in zones_data["features"] if "Noisy-le-Grand" in f["properties"]["nom"]][0]
print("\n=== NOISY-LE-GRAND ENRICHMENT VERIFICATION ===")
print("Pop:", nlg["properties"]["pop_totale"])
print("Diametre territorial:", nlg["properties"]["diametre_territoire_km"], "km")
print("Superficie:", nlg["properties"]["superficie_km2"], "km2")
print("Poles identifies:")
for p in nlg["properties"]["poles_quartiers"]:
    safe_diag = p["diagnostic"].encode("ascii", "replace").decode("ascii")
    print(f"  - {p['nom']}: {p['podos_1km']} podo(s) a 1 km -> {safe_diag}")
