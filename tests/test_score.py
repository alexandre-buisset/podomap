"""Unit tests for the Opportunity Score calculation engine."""

import pytest


def compute_percentiles(values: list[float]) -> list[float]:
    n = len(values)
    if n <= 1:
        return [50.0] * n

    indexed = sorted(enumerate(values), key=lambda x: x[1])
    percentiles = [0.0] * n

    i = 0
    while i < n:
        j = i
        while j < n - 1 and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2.0
        pct = round((avg_rank / (n - 1)) * 100.0, 1)
        for k in range(i, j + 1):
            percentiles[indexed[k][0]] = pct
        i = j + 1

    return percentiles


def compute_score(
    idx: int,
    weights: dict,
    all_demande: list[float],
    all_densite: list[float],
    all_diabete: list[float],
) -> float:
    pct_demande = compute_percentiles(all_demande)
    pct_densite = compute_percentiles(all_densite)
    # Invert density
    pct_concurrence_inv = [100.0 - p for p in pct_densite]
    pct_diabete = compute_percentiles(all_diabete)

    # Weights redistribution if no zonage
    w_demande = weights.get("demande_65plus", 35)
    w_concurrence = weights.get("concurrence_inv", 40)
    w_diabete = weights.get("coef_diabete", 10)
    bonus_zonage = weights.get("bonus_zonage", 15)

    base_sum = w_demande + w_concurrence + w_diabete
    w_demande += (w_demande / base_sum) * bonus_zonage
    w_concurrence += (w_concurrence / base_sum) * bonus_zonage
    w_diabete += (w_diabete / base_sum) * bonus_zonage

    total_w = w_demande + w_concurrence + w_diabete

    score = (
        w_demande * pct_demande[idx]
        + w_concurrence * pct_concurrence_inv[idx]
        + w_diabete * pct_diabete[idx]
    ) / total_w

    return round(score, 1)


def test_percentile_calculation_ties_and_bounds():
    vals = [10, 20, 20, 40]
    pcts = compute_percentiles(vals)
    assert pcts[0] == 0.0
    assert pcts[3] == 100.0
    assert pcts[1] == pcts[2] == 50.0  # Average of rank 1 and 2 out of 3 = 1.5/3 = 50%


def test_score_reactivity_to_competition():
    """Zone with less podologist density must have a higher score when competition weight is high."""
    demandes = [1000, 1000]
    diabetes = [1.0, 1.0]
    # Zone 0 has high density (high competition), Zone 1 has low density (low competition)
    densities = [30.0, 5.0]

    weights = {"demande_65plus": 10, "concurrence_inv": 70, "coef_diabete": 5, "bonus_zonage": 15}

    score_0 = compute_score(0, weights, demandes, densities, diabetes)
    score_1 = compute_score(1, weights, demandes, densities, diabetes)

    assert score_1 > score_0, f"Zone with lower competition density should have higher score ({score_1} vs {score_0})"


def test_score_reactivity_to_weights_change():
    """Modifying weight sliders changes the composite score immediately."""
    demandes = [5000, 1000]
    diabetes = [0.8, 1.3]
    densities = [10.0, 25.0]

    # Baseline weights
    w1 = {"demande_65plus": 40, "concurrence_inv": 40, "coef_diabete": 5, "bonus_zonage": 15}
    # Emphasize diabetes
    w2 = {"demande_65plus": 10, "concurrence_inv": 20, "coef_diabete": 55, "bonus_zonage": 15}

    score1_zone1 = compute_score(1, w1, demandes, densities, diabetes)
    score2_zone1 = compute_score(1, w2, demandes, densities, diabetes)

    assert score2_zone1 > score1_zone1, "Increasing diabetes weight should increase score of high-diabetes zone"
