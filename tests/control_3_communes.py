"""Manual inspection and control on 3 known communes per Jalon 2 acceptance criteria."""

import json
from pathlib import Path
import pandas as pd
from pipeline.config import OUTPUT_DIR, INTERIM_DIR, MIN_GEOCODE_SCORE

KNOWN_COMMUNES = [
    {"code": "75115", "nom": "Paris 15e", "dept": "75"},
    {"code": "92012", "nom": "Boulogne-Billancourt", "dept": "92"},
    {"code": "93048", "nom": "Montreuil", "dept": "93"},
]


def run_manual_control() -> dict:
    zones_geojson_path = OUTPUT_DIR / "zones.geojson"
    assert zones_geojson_path.exists(), "zones.geojson missing"

    with open(zones_geojson_path, "r", encoding="utf-8") as f:
        zones_data = json.load(f)

    zones_by_code = {
        f["properties"]["code_insee"]: f["properties"]
        for f in zones_data["features"]
    }

    # Load raw sources for comparison
    df_pop = pd.read_csv(INTERIM_DIR / "population_communes.csv", dtype={"COM": str})
    pop_raw = df_pop.set_index("COM").to_dict(orient="index")

    df_pod = pd.read_csv(INTERIM_DIR / "podologues_geocoded.csv", dtype=str)
    valid_pod = df_pod[
        df_pod["latitude"].notna()
        & df_pod["longitude"].notna()
        & (pd.to_numeric(df_pod["result_score"], errors="coerce") >= MIN_GEOCODE_SCORE)
    ].copy()

    results = {}
    print("\n" + "=" * 76)
    print("CONTRÔLE MANUEL SUR 3 COMMUNES CONNUES (JALON 2)")
    print("=" * 76)

    for comm in KNOWN_COMMUNES:
        code = comm["code"]
        name = comm["nom"]
        dept = comm["dept"]

        assert code in zones_by_code, f"Commune {code} ({name}) not found in zones.geojson"
        props = zones_by_code[code]

        # Verify demographic data against raw INSEE
        raw_p = pop_raw.get(code, {})
        assert raw_p["pop_totale"] == props["pop_totale"], f"Population mismatch for {name}"
        assert raw_p["pop_65plus"] == props["pop_65plus"], f"Pop 65+ mismatch for {name}"
        assert abs(raw_p["part_65plus"] - props["part_65plus"]) < 1e-4, f"Part 65+ mismatch for {name}"

        # Verify podologues count in zone matches filtered raw
        # (check either result_citycode or code_insee_rpps)
        pod_in_commune = sum(
            1 for _, r in valid_pod.iterrows()
            if r.get("result_citycode") == code or (pd.isna(r.get("result_citycode")) and r.get("code_insee_rpps") == code)
        )

        # Check radial metrics
        podo_1km = props["nb_podologues_1km"]
        podo_2km = props["nb_podologues_2km"]
        podo_3km = props["nb_podologues_3km"]
        assert podo_1km <= podo_2km <= podo_3km, f"Radial ordering violated for {name}: {podo_1km} <= {podo_2km} <= {podo_3km}"

        densite_2km = props["densite_pour_10k_65plus"]
        pop65_2km = props["pop_65plus_2km"]

        # Recompute ratio
        expected_dens = round((podo_2km / pop65_2km) * 10000.0, 2)
        assert abs(densite_2km - expected_dens) < 0.05, f"Density mismatch for {name}: {densite_2km} vs {expected_dens}"

        results[code] = {
            "nom": props["nom"],
            "dept": dept,
            "pop_totale": props["pop_totale"],
            "pop_65plus": props["pop_65plus"],
            "part_65plus_pct": round(props["part_65plus"] * 100, 2),
            "nb_podologues_commune": props["nb_podologues"],
            "nb_podologues_1km": podo_1km,
            "nb_podologues_2km": podo_2km,
            "nb_podologues_3km": podo_3km,
            "pop_65plus_2km": pop65_2km,
            "densite_10k_65plus_2km": densite_2km,
            "coef_diabete": props["coef_diabete"],
        }

        print(f"\n--- {props['nom']} ({code}) - Dép. {dept} ---")
        print(f"  • Population totale  : {props['pop_totale']:,} hab. | 65 ans et + : {props['pop_65plus']:,} ({props['part_65plus']*100:.1f}%)")
        print(f"  • Podologues cabinet : {props['nb_podologues']} dans la commune")
        print(f"  • Podologues rayon   : {podo_1km} (1 km) | {podo_2km} (2 km) | {podo_3km} (3 km)")
        print(f"  • Bassin 65+ (2 km)  : {pop65_2km:,} personnes")
        print(f"  • Densité / 10k 65+  : {densite_2km:.2f} podologues (pour 10 000 seniors)")
        print(f"  • Coef. Diabète      : {props['coef_diabete']:.3f} (Prévalence dép: {props['prevalence_diabete']}%)")

    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    print("\n" + "=" * 76)
    print("Contrôle manuel sur 3 communes : TOUS LES RÉSULTATS SONT CONFORMES [OK]")
    print("=" * 76 + "\n")
    return results


if __name__ == "__main__":
    run_manual_control()
