"""Tests for INSEE Filosofi communal income and purchasing power metrics."""

import json
from pathlib import Path
import pandas as pd
from pipeline.config import OUTPUT_DIR, INTERIM_DIR

def test_revenu_communes_clean_exists():
    clean_path = INTERIM_DIR / "revenu_communes_clean.csv"
    assert clean_path.exists(), "Clean income CSV missing in interim directory"
    df = pd.read_csv(clean_path, dtype={"code_insee": str})
    assert len(df) >= 1200, f"Expected at least 1200 communes, found {len(df)}"
    assert "revenu_median" in df.columns
    assert "taux_imposition" in df.columns
    assert "panier_semelles_estime" in df.columns
    assert "potentiel_semelles" in df.columns

    # Verify realistic ranges
    assert df["revenu_median"].min() >= 14000
    assert df["revenu_median"].max() <= 55000
    assert df["panier_semelles_estime"].min() >= 120
    assert df["panier_semelles_estime"].max() <= 220


def test_zones_geojson_income_enrichment():
    zones_path = OUTPUT_DIR / "zones.geojson"
    assert zones_path.exists(), "zones.geojson missing"
    with open(zones_path, "r", encoding="utf-8") as f:
        zones = json.load(f)

    features = zones["features"]
    assert len(features) > 100

    for feat in features:
        props = feat["properties"]
        assert "revenu_median" in props, f"Missing revenu_median for {props.get('nom')}"
        assert isinstance(props["revenu_median"], (int, float)) and props["revenu_median"] > 0
        assert "panier_semelles_estime" in props, f"Missing panier_semelles_estime for {props.get('nom')}"
        assert 120 <= props["panier_semelles_estime"] <= 220
        assert "potentiel_semelles" in props
        assert 0 <= props["potentiel_semelles"] <= 100


def test_contrast_affluent_vs_modest():
    clean_path = INTERIM_DIR / "revenu_communes_clean.csv"
    df = pd.read_csv(clean_path, dtype={"code_insee": str}).set_index("code_insee")

    # Neuilly (92051) or Vincennes (94080) vs Saint-Denis (93066)
    rev_neuilly = df.loc["92051", "revenu_median"]
    rev_st_denis = df.loc["93066", "revenu_median"]

    assert rev_neuilly > 40000, f"Neuilly should have > 40k median income, got {rev_neuilly}"
    assert rev_st_denis < 20000, f"Saint-Denis should have < 20k median income, got {rev_st_denis}"

    price_neuilly = df.loc["92051", "panier_semelles_estime"]
    price_st_denis = df.loc["93066", "panier_semelles_estime"]

    assert price_neuilly > price_st_denis
    assert price_neuilly >= 200
    assert price_st_denis <= 150
