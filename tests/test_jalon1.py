"""Unit tests for Milestone 1 (data cleaning, geocoding and population)."""

from pathlib import Path
import pandas as pd
import pytest
from pipeline.config import INTERIM_DIR, MIN_GEOCODE_SCORE


@pytest.fixture
def podologues_df():
    path = INTERIM_DIR / "podologues_geocoded.csv"
    assert path.exists(), "podologues_geocoded.csv missing"
    return pd.read_csv(path)


@pytest.fixture
def population_df():
    path = INTERIM_DIR / "population_communes.csv"
    assert path.exists(), "population_communes.csv missing"
    return pd.read_csv(path)


def test_podologues_geocoding_acceptance(podologues_df):
    """Jalon 1 criteria: geocoding success rate must be > 95%."""
    total = len(podologues_df)
    assert total > 1000, f"Expected at least 1000 podologist sites in V1, got {total}"

    valid_mask = (
        podologues_df["latitude"].notna()
        & podologues_df["longitude"].notna()
        & (podologues_df["result_score"] >= MIN_GEOCODE_SCORE)
    )
    successful = int(valid_mask.sum())
    rate = successful / total * 100

    assert rate >= 95.0, f"Geocoding success rate {rate:.2f}% is below the 95% acceptance threshold"


def test_podologues_coordinates_bounds(podologues_df):
    """Ensure geocoded coordinates fall inside the Greater Paris / Île-de-France bbox."""
    valid = podologues_df[
        podologues_df["latitude"].notna()
        & podologues_df["longitude"].notna()
        & (podologues_df["result_score"] >= MIN_GEOCODE_SCORE)
    ]
    # IDF roughly bounded by Lat [48.1, 49.3], Lon [1.4, 3.6]
    assert valid["latitude"].between(48.0, 49.5).all(), "Some latitudes are outside IDF bbox"
    assert valid["longitude"].between(1.5, 3.5).all(), "Some longitudes are outside IDF bbox"


def test_population_consistency(population_df):
    """Ensure population numbers are positive and senior ratio is physically realistic."""
    assert len(population_df) >= 140, f"Expected at least 140 communes in V1, got {len(population_df)}"
    assert (population_df["pop_totale"] > 0).all(), "Found commune with zero or negative total population"
    assert (population_df["pop_65plus"] > 0).all(), "Found commune with zero or negative 65+ population"
    assert (population_df["pop_65plus"] <= population_df["pop_totale"]).all(), "Found 65+ population exceeding total population"
    # Realistic senior percentage across 1,286 IDF communes spans between 1% and 60%
    assert population_df["part_65plus"].between(0.01, 0.60).all(), "Unrealistic senior percentage found"


def test_paris_arrondissements_present(population_df):
    """Ensure all 20 Paris arrondissements (75101-75120) are present in the population dataset."""
    paris_codes = {f"751{str(i).zfill(2)}" for i in range(1, 21)}
    found_codes = set(population_df["COM"].astype(str))
    missing = paris_codes - found_codes
    assert not missing, f"Missing Paris arrondissements: {missing}"
