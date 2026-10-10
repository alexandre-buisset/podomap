"""Unit tests for Milestone 2 (aggregation, radial calculations, and GeoJSON export)."""

import json
from pathlib import Path
import pytest
from pipeline.config import OUTPUT_DIR, RADII_KM


@pytest.fixture
def zones_geojson():
    path = OUTPUT_DIR / "zones.geojson"
    assert path.exists(), "zones.geojson missing"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def podologues_geojson():
    path = OUTPUT_DIR / "podologues.geojson"
    assert path.exists(), "podologues.geojson missing"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def metadata_json():
    path = OUTPUT_DIR / "metadata.json"
    assert path.exists(), "metadata.json missing"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_zones_geojson_structure(zones_geojson):
    """Ensure zones GeoJSON is a valid FeatureCollection with proper geometry."""
    assert zones_geojson.get("type") == "FeatureCollection"
    features = zones_geojson.get("features", [])
    assert len(features) >= 140, f"Expected at least 140 zones in V1, got {len(features)}"

    required_props = [
        "code_insee",
        "nom",
        "departement",
        "pop_totale",
        "pop_65plus",
        "part_65plus",
        "nb_podologues",
        "nb_podologues_rayon",
        "densite_pour_10k_65plus",
        "coef_diabete",
        "centroide_lat",
        "centroide_lon",
    ]
    for feat in features:
        assert feat.get("type") == "Feature"
        geom = feat.get("geometry", {})
        assert geom.get("type") in ["Polygon", "MultiPolygon"], f"Invalid geometry type: {geom.get('type')}"
        props = feat.get("properties", {})
        for req in required_props:
            assert req in props, f"Missing required property {req} in zone {props.get('code_insee')}"


def test_radial_monotonicity(zones_geojson):
    """Podologist count must increase or stay equal as radius increases: 1km <= 2km <= 3km."""
    for feat in zones_geojson["features"]:
        props = feat["properties"]
        p1 = props["nb_podologues_1km"]
        p2 = props["nb_podologues_2km"]
        p3 = props["nb_podologues_3km"]
        assert 0 <= p1 <= p2 <= p3, (
            f"Radial ordering violated in zone {props.get('nom')}: "
            f"1km={p1}, 2km={p2}, 3km={p3}"
        )


def test_density_ratio_formula(zones_geojson):
    """Density ratio must strictly match (nb_podologues / pop_65plus) * 10,000."""
    for feat in zones_geojson["features"]:
        props = feat["properties"]
        for r in RADII_KM:
            podo = props[f"nb_podologues_{r}km"]
            pop65 = props[f"pop_65plus_{r}km"]
            reported_density = props[f"densite_10k_65plus_{r}km"]

            if pop65 > 0:
                calc_density = round((podo / pop65) * 10000.0, 2)
            else:
                calc_density = 0.0

            assert abs(reported_density - calc_density) <= 0.05, (
                f"Density calculation mismatch for {props.get('nom')} at {r}km: "
                f"reported={reported_density}, calculated={calc_density}"
            )


def test_diabetes_coefficient_normalized(zones_geojson):
    """Diabetes coefficient must be positive and bounded around 1.0 (between 0.5 and 2.0)."""
    for feat in zones_geojson["features"]:
        coef = feat["properties"]["coef_diabete"]
        assert 0.5 <= coef <= 2.0, f"Unrealistic diabetes coefficient: {coef}"


def test_podologues_anonymity_and_ethics(podologues_geojson):
    """Per Section 10: No personal names, telephone or sensitive data on exported points."""
    forbidden_keys = {"nom", "prenom", "nom_exercice", "prenom_exercice", "telephone", "email", "siret"}
    features = podologues_geojson.get("features", [])
    assert len(features) > 1000, f"Expected >1000 podologist points, got {len(features)}"

    for pt in features:
        assert pt.get("type") == "Feature"
        geom = pt.get("geometry", {})
        assert geom.get("type") == "Point"
        props = pt.get("properties", {})
        for key in props.keys():
            assert key.lower() not in forbidden_keys, f"Found forbidden personal field in public point: {key}"
