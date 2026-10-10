"""Acceptance Report for Milestone 1 (Jalon 1 - Données brutes)."""

import json
from pathlib import Path
import pandas as pd
from pipeline.config import INTERIM_DIR, MIN_GEOCODE_SCORE

DEPT_NAMES = {
    "75": "Paris",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "77": "Seine-et-Marne",
    "78": "Yvelines",
    "91": "Essonne",
    "95": "Val-d'Oise",
}


def generate_jalon1_report() -> str:
    """Generate and display Milestone 1 acceptance report."""
    podologues_path = INTERIM_DIR / "podologues_geocoded.csv"
    pop_path = INTERIM_DIR / "population_communes.csv"

    if not podologues_path.exists() or not pop_path.exists():
        raise FileNotFoundError("Prerequisite files missing. Run clean_rpps, geocode and insee first.")

    df_pod = pd.read_csv(podologues_path)
    df_pop = pd.read_csv(pop_path)

    # Metrics
    total_locations = len(df_pod)
    unique_practitioners = df_pod["pp_id"].nunique()

    valid_mask = (
        df_pod["latitude"].notna()
        & df_pod["longitude"].notna()
        & (df_pod["result_score"] >= MIN_GEOCODE_SCORE)
    )
    successful_geocoded = int(valid_mask.sum())
    success_rate = (successful_geocoded / total_locations * 100) if total_locations > 0 else 0
    avg_score = float(df_pod["result_score"].mean())

    # Build Report
    lines = []
    lines.append("=" * 72)
    lines.append("RAPPORT D'ACCEPTATION – JALON 1 : DONNÉES BRUTES & QUALITÉ")
    lines.append("=" * 72)
    lines.append(f"1. Volume global Pédicures-Podologues :")
    lines.append(f"   - Lieux d'exercice distincts dédupliqués : {total_locations:,}")
    lines.append(f"   - Praticiens uniques identifiés (RPPS)   : {unique_practitioners:,}")
    lines.append("")
    lines.append(f"2. Performance du géocodage (API Adresse) :")
    lines.append(f"   - Adresses géocodées avec succès (score >= {MIN_GEOCODE_SCORE}) : {successful_geocoded:,} / {total_locations:,}")
    lines.append(f"   - Taux de succès                                : {success_rate:.2f}% (Critère d'acceptation > 95% : {'[VALIDE - SUCCES]' if success_rate >= 95 else '[ECHEC]'})")
    lines.append(f"   - Score moyen de confiance                      : {avg_score:.3f} / 1.000")
    lines.append(f"   - Adresses rejetées / douteuses (écartées)      : {total_locations - successful_geocoded}")
    lines.append("")
    lines.append(f"3. Répartition par département :")
    lines.append(f"{'Dép.':<6} {'Nom département':<20} {'Praticiens':<12} {'Lieux':<10} {'Succès Géo':<12} {'Taux Géo':<10}")
    lines.append("-" * 72)

    df_pod["dept_str"] = df_pod["dept"].astype(str).str.zfill(2)
    for dept, group in df_pod.groupby("dept_str"):
        d_name = DEPT_NAMES.get(str(dept), f"Dept {dept}")
        d_pract = group["pp_id"].nunique()
        d_loc = len(group)
        d_succ = int(
            (
                group["latitude"].notna()
                & group["longitude"].notna()
                & (group["result_score"] >= MIN_GEOCODE_SCORE)
            ).sum()
        )
        d_rate = (d_succ / d_loc * 100) if d_loc > 0 else 0
        lines.append(f"{dept:<6} {d_name:<20} {d_pract:<12} {d_loc:<10} {d_succ:<12} {d_rate:.1f}%")

    lines.append("-" * 72)
    lines.append("")
    lines.append(f"4. Démographie & Population INSEE :")
    lines.append(f"   - Nombre de zones (communes / arrondissements) : {len(df_pop)}")
    lines.append(f"   - Population totale couverte                 : {df_pop['pop_totale'].sum():,} habitants")
    lines.append(f"   - Population 65 ans et plus                  : {df_pop['pop_65plus'].sum():,} personnes ({df_pop['pop_65plus'].sum() / df_pop['pop_totale'].sum() * 100:.1f}%)")
    lines.append("=" * 72)

    report_text = "\n".join(lines)
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    print(report_text)

    # Save to markdown file in data/interim
    report_file = INTERIM_DIR / "RAPPORT_JALON_1.md"
    with open(report_file, "w", encoding="utf-8") as f:
        f.write("# Rapport d'Acceptation – Jalon 1\n\n```\n" + report_text + "\n```\n")

    return report_text


if __name__ == "__main__":
    generate_jalon1_report()
