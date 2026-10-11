"""Aggregate demographic, youth, sports, and competition metrics per geographic zone and export GeoJSON."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from shapely.geometry import shape, Point

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
from pipeline.transport import enrich_zones_with_transit, process_stations, process_lines
from pipeline.income import get_communal_income_lookup
from pipeline.sports import get_sports_lookup

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

    # 1. Load population with youth and family demographics
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
            "pop_0_14": int(row.get("pop_0_14", 0)),
            "pop_0_19": int(row.get("pop_0_19", 0)),
            "pop_30_44": int(row.get("pop_30_44", 0)),
            "part_0_14": float(row.get("part_0_14", 0.0)),
            "part_0_19": float(row.get("part_0_19", 0.0)),
            "ratio_jeunes_seniors": float(row.get("ratio_jeunes_seniors", 1.0)),
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

    # 6. Income & purchasing power metrics (INSEE Filosofi)
    income_lookup = get_communal_income_lookup()

    # 7. Sports licenses & clubs lookup (Ministère des Sports / INJEP 2023)
    try:
        sports_lookup = get_sports_lookup(departments=departments)
    except Exception as e:
        logger.warning(f"Could not load sports lookup: {e}")
        sports_lookup = {}

    # Identify missing INSEE income codes for reliability flags
    raw_income_path = DATA_DIR / "raw" / "revenu_communes.csv"
    missing_insee_income = set()
    if raw_income_path.exists():
        try:
            df_inc_raw = pd.read_csv(raw_income_path, sep=";", low_memory=False)
            df_inc_raw["code"] = df_inc_raw["Code géographique"].astype(str).str.strip().str.zfill(5)
            med_col = df_inc_raw.columns[7]
            missing_insee_income = set(df_inc_raw[pd.to_numeric(df_inc_raw[med_col], errors="coerce").isna()]["code"].tolist())
        except Exception as e:
            logger.warning(f"Could not parse missing income codes: {e}")

    # Build lookup of centroids for spatial radius calculation
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

    # Calculate metrics for each zone
    enriched_features = []
    for feat in zone_features:
        props = dict(feat["properties"])
        code = str(props["code_insee"])
        dept = str(props["departement"])
        c_lat = float(props["centroide_lat"])
        c_lon = float(props["centroide_lon"])

        # Demographic metrics
        p_info = pop_by_code.get(code, {
            "pop_totale": 0,
            "pop_65plus": 0,
            "part_65plus": 0.0,
            "pop_0_14": 0,
            "pop_0_19": 0,
            "pop_30_44": 0,
            "part_0_14": 0.0,
            "part_0_19": 0.0,
            "ratio_jeunes_seniors": 1.0,
        })
        props["pop_totale"] = p_info["pop_totale"]
        props["pop_65plus"] = p_info["pop_65plus"]
        props["part_65plus"] = p_info["part_65plus"]
        props["pop_0_14"] = p_info["pop_0_14"]
        props["pop_0_19"] = p_info["pop_0_19"]
        props["pop_30_44"] = p_info["pop_30_44"]
        props["part_0_14"] = p_info["part_0_14"]
        props["part_0_19"] = p_info["part_0_19"]
        props["ratio_jeunes_seniors"] = p_info["ratio_jeunes_seniors"]

        # Podologists directly located in this zone
        in_zone_pod = sum(1 for p in pod_points if p["code_insee"] == code)
        props["nb_podologues"] = in_zone_pod

        # Radial competition metrics for each radius (1km, 2km, 3km)
        for r_km in RADII_KM:
            podo_in_radius = sum(
                1 for p in pod_points
                if haversine_distance_km(c_lat, c_lon, p["lat"], p["lon"]) <= r_km
            )
            pop65_in_radius = sum(
                zc["pop_65plus"] for zc in zone_centroids
                if haversine_distance_km(c_lat, c_lon, zc["lat"], zc["lon"]) <= r_km
            )
            pop65_in_radius = max(pop65_in_radius, p_info["pop_65plus"])

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

        # Income & purchasing power metrics (INSEE Filosofi 2021)
        inc_data = income_lookup.get(code, {
            "revenu_median": 27200,
            "taux_imposition": 58.0,
            "part_prestations_sociales": 5.0,
            "panier_semelles_estime": 170,
            "potentiel_semelles": 50.0,
        })
        props["revenu_median"] = inc_data["revenu_median"]
        props["taux_imposition"] = inc_data["taux_imposition"]
        props["part_prestations_sociales"] = inc_data["part_prestations_sociales"]
        props["panier_semelles_estime"] = inc_data["panier_semelles_estime"]
        props["potentiel_semelles"] = inc_data["potentiel_semelles"]

        # Sports and Clubs metrics (Ministère des Sports / INJEP 2023)
        sp_data = sports_lookup.get(code, {
            "nb_licencies_sport": 0,
            "nb_clubs_sport": 0,
            "licencies_jeunes": 0,
            "licencies_football": 0,
            "licencies_tennis": 0,
            "licencies_athletisme": 0,
            "licencies_basketball": 0,
            "licencies_handball": 0,
            "licencies_rugby": 0,
            "licencies_running_sports": 0,
        })
        props["nb_licencies_sport"] = sp_data["nb_licencies_sport"]
        props["nb_clubs_sport"] = sp_data["nb_clubs_sport"]
        props["licencies_jeunes"] = sp_data["licencies_jeunes"]
        props["licencies_football"] = sp_data["licencies_football"]
        props["licencies_tennis"] = sp_data["licencies_tennis"]
        props["licencies_athletisme"] = sp_data["licencies_athletisme"]
        props["licencies_basketball"] = sp_data["licencies_basketball"]
        props["licencies_handball"] = sp_data["licencies_handball"]
        props["licencies_rugby"] = sp_data["licencies_rugby"]
        props["licencies_running_sports"] = sp_data["licencies_running_sports"]
        props["taux_licencies_sport"] = round((sp_data["nb_licencies_sport"] / max(1, props["pop_totale"])) * 100, 1)

        # Reliability and transparency
        has_inc = code not in missing_insee_income and props["pop_totale"] >= 150
        props["has_insee_income"] = has_inc
        props["fiabilite_revenu"] = "Certifié INSEE Filosofi (Officiel)" if has_inc else "Non diffusé par l'INSEE (secret fiscal < 150 hab)"
        props["revenu_source"] = "INSEE Filosofi 2021 communal" if has_inc else "Estimation départementale"
        props["qualite_donnees"] = "Certifiée (INSEE + RPPS + IDFM + Sports)" if has_inc else "Partielle (Revenu Insee non diffusé)"
        props["ratio_hab_commune"] = props["pop_totale"] if in_zone_pod == 0 else round(props["pop_totale"] / in_zone_pod)

        enriched_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": feat["geometry"],
        })

    # Enrich zones with IDFM public transit network (stations, lines, travel times to Paris)
    stations_features = []
    try:
        stations_features, _ = process_stations()
        process_lines()
        enriched_features = enrich_zones_with_transit(enriched_features, stations_features)
    except Exception as e:
        logger.warning(f"Transit network enrichment failed: {e}")

    # Enrich with territorial scale (diametre, superficie, poles de quartier)
    stations_list = [
        {
            "nom": f["properties"]["nom"],
            "mode": f["properties"].get("mode", "TRAIN"),
            "lat": f["geometry"]["coordinates"][1],
            "lon": f["geometry"]["coordinates"][0],
        }
        for f in stations_features
    ]
    podo_pts = [(p["id"], p["lat"], p["lon"]) for p in pod_points]

    for feat in enriched_features:
        props = feat["properties"]
        geom = feat["geometry"]
        poly = shape(geom)

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
            area_km2 = round(poly.area * 73.15 * 111.19, 1)
        else:
            diameter_km = 2.0
            area_km2 = 3.0

        props["diametre_territoire_km"] = diameter_km
        props["superficie_km2"] = area_km2

        pop = props.get("pop_totale", 0)
        is_large = pop >= 25000 or diameter_km >= 4.0 or area_km2 >= 10.0
        props["is_grande_ville"] = is_large

        # Poles for large cities
        c_lat = props["centroide_lat"]
        c_lon = props["centroide_lon"]
        zone_stations = []
        for st in stations_list:
            pt = Point(st["lon"], st["lat"])
            d_center = haversine_distance_km(c_lat, c_lon, st["lat"], st["lon"])
            if d_center <= (diameter_km / 2.0 + 1.0):
                if poly.contains(pt) or poly.distance(pt) * 111.0 <= 0.6:
                    zone_stations.append(st)

        seen_st_names = set()
        unique_stations = []
        for st in zone_stations:
            if st["nom"] not in seen_st_names:
                seen_st_names.add(st["nom"])
                unique_stations.append(st)

        poles = [{
            "nom": f"Centre-Ville / Mairie ({props['nom']})",
            "type": "CENTRE",
            "mode": "MAIRIE",
            "lat": c_lat,
            "lon": c_lon,
        }]
        for st in unique_stations[:5]:
            poles.append({
                "nom": f"Gare {st['mode']} {st['nom']}",
                "type": "GARE",
                "mode": st["mode"],
                "lat": st["lat"],
                "lon": st["lon"],
            })

        poles_details = []
        for pole in poles:
            p_lat = pole["lat"]
            p_lon = pole["lon"]
            podos_1km = sum(1 for p_id, lat, lon in podo_pts if haversine_distance_km(p_lat, p_lon, lat, lon) <= 1.0)
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

    zones_geojson = {
        "type": "FeatureCollection",
        "features": enriched_features,
    }

    # Anonymized Podologues GeoJSON FeatureCollection
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

    # Metadata JSON
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "departments": departments,
        "total_zones": len(enriched_features),
        "total_podologues_points": len(pod_features),
        "total_population": sum(f["properties"]["pop_totale"] for f in enriched_features),
        "total_65plus": sum(f["properties"]["pop_65plus"] for f in enriched_features),
        "total_0_14": sum(f["properties"].get("pop_0_14", 0) for f in enriched_features),
        "total_licencies_sport": sum(f["properties"].get("nb_licencies_sport", 0) for f in enriched_features),
        "total_clubs_sport": sum(f["properties"].get("nb_clubs_sport", 0) for f in enriched_features),
        "radii_km": RADII_KM,
        "default_radius_km": 2,
        "default_min_population": 2500,
        "diabetes_idf_avg_pct": round(DIABETES_IDF_AVG, 3),
        "sources": {
            "rpps": "ANS - Annuaire Santé 2026",
            "ban": "Base Adresse Nationale / API Adresse",
            "insee": "Recensement Insee 2021 (Population, Jeunes 0-14 & 0-19 ans)",
            "filosofi": "INSEE Filosofi 2021 (Revenus disponibles et pauvreté communaux)",
            "sports": "Ministère des Sports / INJEP 2023 (Recensement des licences et clubs par fédération)",
            "ameli": "Assurance Maladie - Cartographie des pathologies 2023",
            "idfm": "Île-de-France Mobilités - Réseau ferré et stations 2026",
            "contours": "geo.api.gouv.fr & Open Data Ville de Paris",
        },
    }

    # Write outputs (compact JSON to optimize bandwidth and parse speed)
    zones_file = output_dir / "zones.geojson"
    pod_file = output_dir / "podologues.geojson"
    meta_file = output_dir / "metadata.json"

    with open(zones_file, "w", encoding="utf-8") as f:
        json.dump(zones_geojson, f, separators=(",", ":"), ensure_ascii=False)
    logger.info(f"Exported zones GeoJSON ({len(enriched_features)} features) -> {zones_file} ({zones_file.stat().st_size / (1024*1024):.2f} MB)")

    # Also sync to dist/data if dist exists
    dist_data = output_dir.parent.parent / "dist" / "data"
    if dist_data.exists():
        with open(dist_data / "zones.geojson", "w", encoding="utf-8") as f:
            json.dump(zones_geojson, f, separators=(",", ":"), ensure_ascii=False)

    with open(pod_file, "w", encoding="utf-8") as f:
        json.dump(pod_geojson, f, separators=(",", ":"), ensure_ascii=False)
    if dist_data.exists():
        with open(dist_data / "podologues.geojson", "w", encoding="utf-8") as f:
            json.dump(pod_geojson, f, separators=(",", ":"), ensure_ascii=False)

    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    if dist_data.exists():
        with open(dist_data / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

    return zones_geojson, pod_geojson, metadata


if __name__ == "__main__":
    build_and_export_data(departments=["75", "77", "78", "91", "92", "93", "94", "95"])
