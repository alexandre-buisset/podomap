"""Aggregate demographic and competition metrics per geographic zone and export GeoJSON."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from pipeline.config import (
    INTERIM_DIR,
    OUTPUT_DIR,
    DATA_DIR,
    MIN_GEOCODE_SCORE,
    RADII_KM,
    TARGET_DEPARTMENTS,
    DIABETES_IDF_AVG,
)
from pipeline.diabetes import get_diabetes_coefficients
from pipeline.geo import get_all_zones_features, haversine_distance_km

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def load_manual_zonage() -> dict[str, str]:
    """Load optional manual zonage definitions from CSV."""
    zonage_path = DATA_DIR / "zonage_manuel.csv"
    zonage_dict = {}
    if zonage_path.exists():
        try:
            df_zone = pd.read_csv(zonage_path, comment="#", dtype={"code_insee": str})
            for _, row in df_zone.iterrows():
                code = str(row.get("code_insee", "")).strip()
                val = str(row.get("zonage", "")).strip()
                if code and val:
                    zonage_dict[code] = val
        except Exception as e:
            logger.warning(f"Could not parse zonage_manuel.csv: {e}")
    return zonage_dict


def build_and_export_data(
    departments: list[str] = None,
    output_dir: Path = None,
) -> tuple[dict, dict, dict]:
    """Run aggregation of metrics per zone and export GeoJSON files."""
    departments = departments or TARGET_DEPARTMENTS
    output_dir = output_dir or OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load population
    pop_path = INTERIM_DIR / "population_communes.csv"
    if not pop_path.exists():
        from pipeline.insee import extract_insee_population
        df_pop = extract_insee_population(departments=departments)
    else:
        df_pop = pd.read_csv(pop_path, dtype={"COM": str, "dept": str})

    pop_by_code = {
        str(row["COM"]): {
            "pop_totale": int(row["pop_totale"]),
            "pop_65plus": int(row["pop_65plus"]),
            "part_65plus": float(row["part_65plus"]),
        }
        for _, row in df_pop.iterrows()
    }

    # 2. Load geocoded podologists
    pod_path = INTERIM_DIR / "podologues_geocoded.csv"
    if not pod_path.exists():
        from pipeline.geocode import run_geocoding
        df_pod, _ = run_geocoding()
    else:
        df_pod = pd.read_csv(pod_path, dtype={"dept": str, "code_insee_rpps": str})

    # Filter strictly valid podologist coordinates
    valid_pod = df_pod[
        df_pod["latitude"].notna()
        & df_pod["longitude"].notna()
        & (df_pod["result_score"] >= MIN_GEOCODE_SCORE)
        & df_pod["dept"].isin(departments)
    ].copy()

    def normalize_code(val, fallback=""):
        if pd.isna(val):
            val = fallback
        s = str(val).strip()
        if s.endswith(".0"):
            s = s[:-2]
        return s.zfill(5) if (len(s) == 4 and s.isdigit()) else s

    pod_points = [
        {
            "id": int(row["batch_id"]) if "batch_id" in row and pd.notna(row["batch_id"]) else idx,
            "lat": float(row["latitude"]),
            "lon": float(row["longitude"]),
            "dept": str(row["dept"]).strip().zfill(2) if pd.notna(row["dept"]) else "",
            "code_insee": normalize_code(row.get("result_citycode"), fallback=row.get("code_insee_rpps", "")),
        }
        for idx, row in valid_pod.iterrows()
    ]
    logger.info(f"Loaded {len(pod_points)} valid geocoded podologist points across target departments.")

    # 3. Load zone features
    zone_features = get_all_zones_features(departments=departments)

    # 4. Diabetes coefficients
    diabetes_coeffs = get_diabetes_coefficients()

    # 5. Manual zonage
    manual_zonage = load_manual_zonage()

    # 6. Build lookup of centroids for spatial radius calculation
    zone_centroids = []
    for feat in zone_features:
        props = feat["properties"]
        code = str(props["code_insee"])
        c_lat = float(props["centroide_lat"])
        c_lon = float(props["centroide_lon"])
        p_info = pop_by_code.get(code, {"pop_totale": 0, "pop_65plus": 0, "part_65plus": 0.0})
        zone_centroids.append({
            "code_insee": code,
            "lat": c_lat,
            "lon": c_lon,
            "pop_65plus": p_info["pop_65plus"],
            "pop_totale": p_info["pop_totale"],
        })

    # 7. Calculate metrics for each zone
    enriched_features = []
    for feat in zone_features:
        props = dict(feat["properties"])
        code = str(props["code_insee"])
        dept = str(props["departement"])
        c_lat = float(props["centroide_lat"])
        c_lon = float(props["centroide_lon"])

        # Demographic metrics
        p_info = pop_by_code.get(code, {"pop_totale": 0, "pop_65plus": 0, "part_65plus": 0.0})
        props["pop_totale"] = p_info["pop_totale"]
        props["pop_65plus"] = p_info["pop_65plus"]
        props["part_65plus"] = p_info["part_65plus"]

        # Podologists directly located in this zone
        in_zone_pod = sum(1 for p in pod_points if p["code_insee"] == code)
        props["nb_podologues"] = in_zone_pod

        # Radial competition metrics for each radius (1km, 2km, 3km)
        for r_km in RADII_KM:
            # Count podologists within r_km of centroid
            podo_in_radius = sum(
                1 for p in pod_points
                if haversine_distance_km(c_lat, c_lon, p["lat"], p["lon"]) <= r_km
            )
            # Sum 65+ senior population of all zones whose centroid is within r_km
            pop65_in_radius = sum(
                zc["pop_65plus"] for zc in zone_centroids
                if haversine_distance_km(c_lat, c_lon, zc["lat"], zc["lon"]) <= r_km
            )
            # Fallback: ensure accessible population is at least the zone's own population
            pop65_in_radius = max(pop65_in_radius, p_info["pop_65plus"])

            # Density per 10,000 seniors
            if pop65_in_radius > 0:
                density = (podo_in_radius / pop65_in_radius) * 10000.0
            else:
                density = 0.0

            props[f"nb_podologues_{r_km}km"] = podo_in_radius
            props[f"pop_65plus_{r_km}km"] = pop65_in_radius
            props[f"densite_10k_65plus_{r_km}km"] = round(density, 2)

        # Baseline default radius = 2 km (per spec Section 6)
        props["nb_podologues_rayon"] = props["nb_podologues_2km"]
        props["densite_pour_10k_65plus"] = props["densite_10k_65plus_2km"]

        # Diabetes metrics
        diab_info = diabetes_coeffs.get(dept, {"coef_diabete": 1.0, "prevalence_pct": DIABETES_IDF_AVG})
        props["coef_diabete"] = diab_info["coef_diabete"]
        props["prevalence_diabete"] = diab_info["prevalence_pct"]

        # Zonage
        props["zonage"] = manual_zonage.get(code, "")

        enriched_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": feat["geometry"],
        })

    zones_geojson = {
        "type": "FeatureCollection",
        "features": enriched_features,
    }

    # 8. Anonymized Podologues GeoJSON FeatureCollection
    pod_features = [
        {
            "type": "Feature",
            "properties": {
                "id": p["id"],
                "dept": p["dept"],
                "code_insee": p["code_insee"],
            },
            "geometry": {
                "type": "Point",
                "coordinates": [round(p["lon"], 6), round(p["lat"], 6)],
            },
        }
        for p in pod_points
    ]
    pod_geojson = {
        "type": "FeatureCollection",
        "features": pod_features,
    }

    # 9. Metadata JSON
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "departments": departments,
        "total_zones": len(enriched_features),
        "total_podologues_points": len(pod_features),
        "total_population": sum(f["properties"]["pop_totale"] for f in enriched_features),
        "total_65plus": sum(f["properties"]["pop_65plus"] for f in enriched_features),
        "radii_km": RADII_KM,
        "default_radius_km": 2,
        "default_min_population": 5000,
        "diabetes_idf_avg_pct": round(DIABETES_IDF_AVG, 3),
        "sources": {
            "rpps": "ANS - Annuaire Santé 2026",
            "ban": "Base Adresse Nationale / API Adresse",
            "insee": "Recensement Insee 2021",
            "ameli": "Assurance Maladie - Cartographie des pathologies 2023",
            "contours": "geo.api.gouv.fr & Open Data Ville de Paris",
        },
    }

    # 10. Write outputs
    zones_file = output_dir / "zones.geojson"
    pod_file = output_dir / "podologues.geojson"
    meta_file = output_dir / "metadata.json"

    with open(zones_file, "w", encoding="utf-8") as f:
        json.dump(zones_geojson, f, ensure_ascii=False)
    logger.info(f"Exported zones GeoJSON ({len(enriched_features)} features) -> {zones_file} ({zones_file.stat().st_size / (1024*1024):.2f} MB)")

    with open(pod_file, "w", encoding="utf-8") as f:
        json.dump(pod_geojson, f, ensure_ascii=False)
    logger.info(f"Exported podologues GeoJSON ({len(pod_features)} points) -> {pod_file} ({pod_file.stat().st_size / 1024:.1f} KB)")

    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    logger.info(f"Exported metadata JSON -> {meta_file}")

    return zones_geojson, pod_geojson, metadata


if __name__ == "__main__":
    build_and_export_data()
