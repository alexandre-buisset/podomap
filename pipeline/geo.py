"""Pure-Python geographic data processing for Île-de-France commune boundaries and distances."""

import json
import logging
import math
from pathlib import Path
import requests
from pipeline.config import (
    RAW_DIR,
    PARIS_ARRONDISSEMENTS_GEOJSON_URL,
    TARGET_DEPARTMENTS,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometers."""
    r = 6371.0088  # Mean Earth radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def compute_polygon_centroid(coordinates: list) -> tuple[float, float]:
    """Compute the centroid (lon, lat) of a 2D polygon ring using the shoelace centroid formula."""
    # coordinates is a list of [lon, lat]
    n = len(coordinates)
    if n == 0:
        return (0.0, 0.0)
    if n == 1:
        return (coordinates[0][0], coordinates[0][1])

    area = 0.0
    cx = 0.0
    cy = 0.0

    for i in range(n - 1):
        x0, y0 = coordinates[i][0], coordinates[i][1]
        x1, y1 = coordinates[i + 1][0], coordinates[i + 1][1]
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross

    area = area / 2.0
    if abs(area) < 1e-12:
        # Fallback to arithmetic mean of vertices if polygon is degenerate or line
        avg_lon = sum(pt[0] for pt in coordinates) / n
        avg_lat = sum(pt[1] for pt in coordinates) / n
        return (avg_lon, avg_lat)

    cx = cx / (6.0 * area)
    cy = cy / (6.0 * area)
    return (cx, cy)


def get_geometry_centroid(geometry: dict) -> tuple[float, float]:
    """Compute centroid (lon, lat) for GeoJSON Polygon or MultiPolygon."""
    gtype = geometry.get("type", "")
    coords = geometry.get("coordinates", [])

    if gtype == "Polygon" and coords:
        # Outer ring is coords[0]
        return compute_polygon_centroid(coords[0])
    elif gtype == "MultiPolygon" and coords:
        # Find the polygon with largest ring or weighted average
        best_ring = max(coords, key=lambda poly: len(poly[0]) if poly else 0)
        if best_ring:
            return compute_polygon_centroid(best_ring[0])
    elif gtype == "Point" and coords:
        return (coords[0], coords[1])

    return (0.0, 0.0)


def fetch_paris_arrondissements() -> list[dict]:
    """Load Paris 20 arrondissements GeoJSON features (75101 to 75120)."""
    cache_path = RAW_DIR / "paris_arrondissements.geojson"
    if not cache_path.exists() or cache_path.stat().st_size < 1000:
        logger.info(f"Downloading Paris arrondissements from {PARIS_ARRONDISSEMENTS_GEOJSON_URL}...")
        r = requests.get(PARIS_ARRONDISSEMENTS_GEOJSON_URL, timeout=30)
        r.raise_for_status()
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(r.text)

    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})

        # Extract code insee
        c_insee = str(props.get("c_arinsee", ""))
        c_ar = props.get("c_ar")
        if not c_insee and c_ar:
            c_insee = f"751{str(c_ar).zfill(2)}"

        # Clean Paris names e.g. Paris 1er, Paris 2e, ...
        arr_num = int(c_insee[-2:]) if len(c_insee) >= 2 and c_insee[-2:].isdigit() else 1
        suffix = "er" if arr_num == 1 else "e"
        nom = f"Paris {arr_num}{suffix}"

        # Centroid
        if "geom_x_y" in props and isinstance(props["geom_x_y"], dict):
            lon = float(props["geom_x_y"].get("lon", 0.0))
            lat = float(props["geom_x_y"].get("lat", 0.0))
        else:
            lon, lat = get_geometry_centroid(geom)

        features.append({
            "type": "Feature",
            "properties": {
                "code_insee": c_insee,
                "nom": nom,
                "departement": "75",
                "centroide_lat": round(lat, 6),
                "centroide_lon": round(lon, 6),
            },
            "geometry": geom,
        })

    logger.info(f"Loaded {len(features)} Paris arrondissements features.")
    return features


def fetch_communes_department(dept: str) -> list[dict]:
    """Fetch commune features for a given department from geo.api.gouv.fr."""
    cache_path = RAW_DIR / f"communes_{dept}.geojson"
    if not cache_path.exists() or cache_path.stat().st_size < 1000:
        url = f"https://geo.api.gouv.fr/departements/{dept}/communes?format=geojson&geometry=contour"
        logger.info(f"Fetching communes for department {dept} from {url}...")
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(r.text)

    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})

        code_insee = str(props.get("code", ""))
        nom = str(props.get("nom", ""))
        lon, lat = get_geometry_centroid(geom)

        features.append({
            "type": "Feature",
            "properties": {
                "code_insee": code_insee,
                "nom": nom,
                "departement": str(dept),
                "centroide_lat": round(lat, 6),
                "centroide_lon": round(lon, 6),
            },
            "geometry": geom,
        })

    logger.info(f"Loaded {len(features)} communes for department {dept}.")
    return features


def get_all_zones_features(departments: list[str] = None) -> list[dict]:
    """Assemble all zone features across target departments."""
    departments = departments or TARGET_DEPARTMENTS
    all_features = []

    for dept in departments:
        if dept == "75":
            all_features.extend(fetch_paris_arrondissements())
        else:
            all_features.extend(fetch_communes_department(dept))

    logger.info(f"Total zone features assembled: {len(all_features)}")
    return all_features


if __name__ == "__main__":
    feats = get_all_zones_features()
    print("Sample feature properties:")
    for f in feats[:5]:
        print(f["properties"])
