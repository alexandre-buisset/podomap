"""Transit network processing for Île-de-France (IDFM Open Data).
Downloads, cleans, and associates rail transit stations (Métro, RER, Train, Tramway)
with each commune to compute public transit accessibility and travel times to Paris.
"""

import gzip
import json
import math
import os
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple

from pipeline.config import OUTPUT_DIR, RAW_DIR
from pipeline.geo import haversine_distance_km as haversine_distance

STATIONS_URL = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/emplacement-des-gares-idf-data-generalisee/exports/geojson"
LINES_URL = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/traces-du-reseau-ferre-idf/exports/geojson"

# Central Paris reference point (Châtelet - Les Halles)
PARIS_CENTRE_LAT = 48.8584
PARIS_CENTRE_LON = 2.3470


def fetch_geojson(url: str, cache_file: Path) -> Dict[str, Any]:
    """Fetch GeoJSON from URL with gzip support and local caching."""
    if cache_file.exists():
        print(f"Loading cached transit data from {cache_file.name}...")
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)

    print(f"Downloading transit dataset from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        data = json.loads(raw.decode("utf-8"))

    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"Saved {cache_file.name} ({len(data.get('features', []))} features).")
    return data


def process_stations() -> Tuple[List[Dict[str, Any]], Path]:
    """Download, clean and deduplicate transit stations."""
    raw_file = RAW_DIR / "idfm_stations_raw.geojson"
    raw_data = fetch_geojson(STATIONS_URL, raw_file)

    # Clean & group by station name and position
    stations_map: Dict[str, Dict[str, Any]] = {}

    for feat in raw_data.get("features", []):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [])

        if not coords or len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]
        nom = props.get("nom_long") or props.get("nom_zdc") or props.get("nom_so_gar") or "Gare"
        mode_raw = (props.get("mode") or "").upper().strip()
        ligne = props.get("res_com") or ""

        # Normalize mode
        if props.get("metro") == 1 or "METRO" in mode_raw:
            mode = "METRO"
        elif props.get("rer") == 1 or "RER" in mode_raw:
            mode = "RER"
        elif props.get("tramway") == 1 or "TRAM" in mode_raw:
            mode = "TRAMWAY"
        else:
            mode = "TRAIN"

        # Unique key based on coordinates rounded to ~50m
        key = f"{round(lon, 4)}_{round(lat, 4)}"

        if key not in stations_map:
            stations_map[key] = {
                "nom": nom,
                "modes": {mode},
                "lignes": set(),
                "lon": lon,
                "lat": lat,
            }
        else:
            stations_map[key]["modes"].add(mode)

        if ligne:
            stations_map[key]["lignes"].add(ligne)

    # Convert to clean GeoJSON features
    clean_features = []
    station_id = 1
    for key, s in stations_map.items():
        modes_list = sorted(list(s["modes"]))
        # Priority mode for icon/display: METRO > RER > TRAIN > TRAMWAY
        if "METRO" in s["modes"]:
            main_mode = "METRO"
        elif "RER" in s["modes"]:
            main_mode = "RER"
        elif "TRAIN" in s["modes"]:
            main_mode = "TRAIN"
        else:
            main_mode = "TRAMWAY"

        lignes_list = sorted(list(s["lignes"]))
        clean_features.append({
            "type": "Feature",
            "properties": {
                "id": station_id,
                "nom": s["nom"],
                "mode": main_mode,
                "modes": modes_list,
                "lignes": lignes_list,
                "lignes_str": ", ".join(lignes_list) if lignes_list else main_mode,
            },
            "geometry": {
                "type": "Point",
                "coordinates": [round(s["lon"], 6), round(s["lat"], 6)],
            },
        })
        station_id += 1

    out_file = OUTPUT_DIR / "stations.geojson"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": clean_features}, f, ensure_ascii=False)

    print(f"Exported clean stations to {out_file.name} ({len(clean_features)} stations).")
    return clean_features, out_file


def process_lines() -> Path:
    """Download, clean and format rail transit lines."""
    raw_file = RAW_DIR / "idfm_lines_raw.geojson"
    raw_data = fetch_geojson(LINES_URL, raw_file)

    clean_features = []
    for feat in raw_data.get("features", []):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        if not geom.get("coordinates"):
            continue

        ligne = props.get("res_com") or props.get("indice_lig") or "Ligne"
        mode = props.get("mode") or props.get("reseau") or "TRAIN"
        color_hex = props.get("colourweb_hexa") or "0284c7"
        if not color_hex.startswith("#"):
            color_hex = f"#{color_hex}"

        clean_features.append({
            "type": "Feature",
            "properties": {
                "ligne": ligne,
                "mode": mode,
                "color": color_hex,
            },
            "geometry": geom,
        })

    out_file = OUTPUT_DIR / "lignes_transport.geojson"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": clean_features}, f, ensure_ascii=False)

    print(f"Exported clean transit lines to {out_file.name} ({len(clean_features)} segments).")
    return out_file


def estimate_transit_time_to_paris(
    c_lat: float,
    c_lon: float,
    dist_station_km: float,
    station_modes: List[str],
    dept: str,
) -> int:
    """Estimate public transit travel time (in minutes) to central Paris (Châtelet).
    Takes into account walking distance to the station and rail transit line speed.
    """
    # Distance from commune centroid to central Paris
    dist_paris_km = haversine_distance(c_lat, c_lon, PARIS_CENTRE_LAT, PARIS_CENTRE_LON)

    # 1. Paris intramuros (75)
    if dept == "75":
        # Paris transit network is ultra-dense (average 8 to 20 minutes)
        return int(max(5, min(22, round(dist_paris_km * 2.2 + 5))))

    # 2. Outer communes
    # Walking/access time to nearest station (~12 min per km walk/bus)
    access_time = min(25, dist_station_km * 10)

    # Line transit time depending on technology
    if "METRO" in station_modes:
        # Métro speed ~ 25 km/h + stops + transfers
        transit_time = 10 + dist_paris_km * 1.7
    elif "RER" in station_modes:
        # RER speed ~ 50 km/h express
        transit_time = 12 + dist_paris_km * 1.15
    elif "TRAIN" in station_modes:
        # Transilien speed ~ 55 km/h to major Parisian station + Metro transfer
        transit_time = 16 + dist_paris_km * 1.25
    elif "TRAMWAY" in station_modes:
        # Tramway connection to metro/RER
        transit_time = 18 + dist_paris_km * 1.6
    else:
        # No rail station: bus connection to nearest hub
        transit_time = 25 + dist_paris_km * 1.8

    total_time = int(round(access_time + transit_time))
    # Cap between 10 min and 85 min
    return max(10, min(85, total_time))


def enrich_zones_with_transit(zones_features: List[Dict[str, Any]], stations_features: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Enrich each commune feature in zones with public transit metrics and travel time."""
    print(f"Enriching {len(zones_features)} zones with transit accessibility metrics...")

    for feat in zones_features:
        p = feat["properties"]
        c_lat = p.get("centroide_lat", 0.0)
        c_lon = p.get("centroide_lon", 0.0)
        dept = p.get("departement", "")

        # Find closest station and count stations in 1.5 km
        closest_station = None
        min_dist_km = 999.0
        nearby_stations = []

        for st in stations_features:
            s_coords = st["geometry"]["coordinates"]
            s_lon, s_lat = s_coords[0], s_coords[1]
            dist_km = haversine_distance(c_lat, c_lon, s_lat, s_lon)

            if dist_km < min_dist_km:
                min_dist_km = dist_km
                closest_station = st

            if dist_km <= 1.5:
                nearby_stations.append(st)

        if closest_station:
            st_props = closest_station["properties"]
            gare_nom = st_props["nom"]
            gare_modes = st_props["modes"]
            gare_lignes = st_props["lignes"]
            gare_mode_main = st_props["mode"]
        else:
            gare_nom = "Aucune"
            gare_modes = []
            gare_lignes = []
            gare_mode_main = "AUCUN"

        # Unique modes within 1.5 km
        modes_1_5km = set()
        for s in nearby_stations:
            for m in s["properties"]["modes"]:
                modes_1_5km.add(m)

        # Estimate travel time to Paris Châtelet
        temps_paris = estimate_transit_time_to_paris(
            c_lat, c_lon, min_dist_km, list(modes_1_5km) or gare_modes, dept
        )

        # Calculate a transit accessibility score (0 to 100)
        # Factors: travel time to Paris + proximity of station + rail modes
        acc_score = 100 - min(100, temps_paris * 1.1)
        if min_dist_km <= 1.0:
            acc_score += 15
        if "METRO" in modes_1_5km or "RER" in modes_1_5km:
            acc_score += 10
        acc_score = max(5, min(100, round(acc_score)))

        p["gare_nom"] = gare_nom
        p["gare_dist_km"] = round(min_dist_km, 2)
        p["gare_mode"] = gare_mode_main
        p["gare_lignes"] = gare_lignes
        p["nb_gares_1_5km"] = len(nearby_stations)
        p["modes_transport"] = sorted(list(modes_1_5km))
        p["temps_paris_min"] = temps_paris
        p["score_transport"] = acc_score

    return zones_features


def run_transit_pipeline() -> Tuple[Path, Path]:
    """Execute complete transit pipeline."""
    print("=== Processing Île-de-France Public Transit Network (IDFM) ===")
    stations, stations_path = process_stations()
    lines_path = process_lines()
    return stations_path, lines_path


if __name__ == "__main__":
    run_transit_pipeline()
