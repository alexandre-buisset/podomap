"""Extract and aggregate INSEE census data for population and 65+ seniors."""

import logging
import zipfile
from pathlib import Path
import pandas as pd
from pipeline.config import RAW_DIR, INTERIM_DIR, TARGET_DEPARTMENTS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def extract_insee_population(
    departments: list[str] = None,
    zip_path: Path = None,
    output_path: Path = None,
) -> pd.DataFrame:
    """Extract population and age 65+ per commune from the INSEE census dataset."""
    departments = set(departments or TARGET_DEPARTMENTS)
    zip_path = zip_path or RAW_DIR / "insee_iris_pop.zip"
    output_path = output_path or INTERIM_DIR / "population_communes.csv"

    if not zip_path.exists():
        raise FileNotFoundError(f"Insee archive missing at {zip_path}. Run pipeline.download first.")

    logger.info(f"Extracting INSEE population for departments: {sorted(list(departments))}...")

    with zipfile.ZipFile(zip_path, "r") as z:
        target_name = None
        for name in z.namelist():
            if "base-ic-evol-struct-pop" in name.lower() and name.endswith(".CSV"):
                target_name = name
                break

        if not target_name:
            raise ValueError(f"Could not find base-ic CSV inside {zip_path}")

        logger.info(f"Reading {target_name} from ZIP...")
        with z.open(target_name) as f:
            df = pd.read_csv(
                f,
                sep=";",
                dtype={"COM": str, "IRIS": str},
                usecols=["IRIS", "COM", "P21_POP", "P21_POP65P", "P21_POP0014", "P21_POP0019", "P21_POP3044"],
            )

    # Filter for target departments
    df["dept"] = df["COM"].str[:2]
    df_filtered = df[df["dept"].isin(departments)].copy()

    # Handle recent commune mergers (e.g. 93059 Pierrefitte-sur-Seine merged into 93066 Saint-Denis)
    COMMUNE_MERGERS = {
        "93059": "93066",  # Pierrefitte-sur-Seine -> Saint-Denis
    }
    df_filtered["COM"] = df_filtered["COM"].replace(COMMUNE_MERGERS)

    # Clean numeric columns
    for col in ["P21_POP", "P21_POP65P", "P21_POP0014", "P21_POP0019", "P21_POP3044"]:
        df_filtered[col] = pd.to_numeric(df_filtered[col], errors="coerce").fillna(0)

    # Aggregate by commune (COM contains Paris arrondissements 75101-75120 and all other communes)
    com_agg = (
        df_filtered.groupby("COM")
        .agg(
            pop_totale=("P21_POP", "sum"),
            pop_65plus=("P21_POP65P", "sum"),
            pop_0_14=("P21_POP0014", "sum"),
            pop_0_19=("P21_POP0019", "sum"),
            pop_30_44=("P21_POP3044", "sum"),
        )
        .reset_index()
    )

    com_agg["pop_totale"] = com_agg["pop_totale"].round().astype(int)
    com_agg["pop_65plus"] = com_agg["pop_65plus"].round().astype(int)
    com_agg["pop_0_14"] = com_agg["pop_0_14"].round().astype(int)
    com_agg["pop_0_19"] = com_agg["pop_0_19"].round().astype(int)
    com_agg["pop_30_44"] = com_agg["pop_30_44"].round().astype(int)
    com_agg["part_65plus"] = (
        (com_agg["pop_65plus"] / com_agg["pop_totale"].replace(0, 1))
    ).round(4)
    com_agg["part_0_14"] = (
        (com_agg["pop_0_14"] / com_agg["pop_totale"].replace(0, 1))
    ).round(4)
    com_agg["part_0_19"] = (
        (com_agg["pop_0_19"] / com_agg["pop_totale"].replace(0, 1))
    ).round(4)
    com_agg["ratio_jeunes_seniors"] = (
        (com_agg["pop_0_19"] / com_agg["pop_65plus"].replace(0, 1))
    ).round(2)
    com_agg["dept"] = com_agg["COM"].str[:2]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    com_agg.to_csv(output_path, index=False, encoding="utf-8")
    logger.info(
        f"Saved population for {len(com_agg)} zones (total pop: {com_agg['pop_totale'].sum():,}, "
        f"0-14: {com_agg['pop_0_14'].sum():,}, 65+: {com_agg['pop_65plus'].sum():,}) to {output_path}"
    )

    return com_agg


if __name__ == "__main__":
    extract_insee_population()
