"""Unit tests for public transit integration."""

from pathlib import Path
import json
from pipeline.config import OUTPUT_DIR
from pipeline.transport import estimate_transit_time_to_paris


def test_transit_time_estimation():
    # Paris intramuros
    time_paris = estimate_transit_time_to_paris(48.85, 2.35, 0.2, ["METRO"], "75")
    assert 5 <= time_paris <= 20

    # Near suburb with Metro (Saint-Denis)
    time_sd = estimate_transit_time_to_paris(48.93, 2.36, 0.2, ["METRO"], "93")
    assert 15 <= time_sd <= 35

    # Far suburb with Train/RER
    time_far = estimate_transit_time_to_paris(48.95, 2.88, 1.0, ["TRAIN"], "77")
    assert 30 <= time_far <= 85


def test_transit_geojson_files():
    stations_file = OUTPUT_DIR / "stations.geojson"
    lines_file = OUTPUT_DIR / "lignes_transport.geojson"

    assert stations_file.exists(), "stations.geojson should exist in public/data"
    assert lines_file.exists(), "lignes_transport.geojson should exist in public/data"

    with open(stations_file, "r", encoding="utf-8") as f:
        st_data = json.load(f)
    assert len(st_data.get("features", [])) >= 900

    with open(lines_file, "r", encoding="utf-8") as f:
        ln_data = json.load(f)
    assert len(ln_data.get("features", [])) >= 1000
