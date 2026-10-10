"""Extraction and processing of INSEE Filosofi communal income and purchasing power data."""

import logging
from pathlib import Path
import pandas as pd
import numpy as np
from pipeline.config import RAW_DIR, INTERIM_DIR, FILOSOFI_INCOME_CSV_URL
from pipeline.download import download_file

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def extract_communal_income(
    raw_path: Path = None,
    output_path: Path = None,
    force_download: bool = False,
) -> pd.DataFrame:
    """Download and extract communal disposable income, poverty, and insole purchasing power metrics."""
    raw_path = raw_path or RAW_DIR / "revenu_communes.csv"
    output_path = output_path or INTERIM_DIR / "revenu_communes_clean.csv"

    if not raw_path.exists() or force_download:
        logger.info(f"Downloading communal income dataset from {FILOSOFI_INCOME_CSV_URL}...")
        download_file(FILOSOFI_INCOME_CSV_URL, raw_path, force=force_download)

    logger.info(f"Reading communal income dataset from {raw_path}...")
    df = pd.read_csv(
        raw_path,
        sep=";",
        encoding="utf-8",
        dtype={"Code géographique": str},
        low_memory=False,
    )

    # Standardize column names
    code_col = "Code géographique"
    nom_col = "Libellé géographique"
    med_col = df.columns[7]   # [DISP] Médiane (€)
    q1_col = df.columns[6]    # [DISP] 1er quartile (€)
    q3_col = df.columns[8]    # [DISP] 3e quartile (€)
    d1_col = df.columns[10]   # [DISP] 1er décile (€)
    d9_col = df.columns[17]   # [DISP] 9e décile (€)
    soc_col = df.columns[27]  # [DISP] Part de l'ensemble des prestations sociales (%)
    imp_col = df.columns[35]  # [DEC] Part des ménages fiscaux imposés (%)

    df["code_insee"] = df[code_col].str.strip()
    # Normalize 4-digit codes to 5 digits
    df["code_insee"] = df["code_insee"].apply(
        lambda s: str(s).zfill(5) if len(str(s)) == 4 and str(s).isdigit() else str(s)
    )

    # Filter for Île-de-France (75, 77, 78, 91, 92, 93, 94, 95)
    df["dept"] = df["code_insee"].str[:2]
    idf_df = df[df["dept"].isin(["75", "77", "78", "91", "92", "93", "94", "95"])].copy()

    # Parse numeric indicators
    idf_df["revenu_median"] = pd.to_numeric(idf_df[med_col], errors="coerce")
    idf_df["revenu_q1"] = pd.to_numeric(idf_df[q1_col], errors="coerce")
    idf_df["revenu_q3"] = pd.to_numeric(idf_df[q3_col], errors="coerce")
    idf_df["revenu_d1"] = pd.to_numeric(idf_df[d1_col], errors="coerce")
    idf_df["revenu_d9"] = pd.to_numeric(idf_df[d9_col], errors="coerce")
    idf_df["part_prestations_sociales"] = pd.to_numeric(idf_df[soc_col], errors="coerce")
    idf_df["taux_imposition"] = pd.to_numeric(idf_df[imp_col], errors="coerce")

    # Handle commune mergers (e.g., 93059 Pierrefitte merged into 93066 Saint-Denis)
    COMMUNE_MERGERS = {
        "93059": "93066",
    }
    idf_df["code_insee"] = idf_df["code_insee"].replace(COMMUNE_MERGERS)

    # Fill rare missing values with departmental medians
    for col in ["revenu_median", "taux_imposition", "part_prestations_sociales"]:
        dept_medians = idf_df.groupby("dept")[col].transform("median")
        idf_df[col] = idf_df[col].fillna(dept_medians)
        overall_med = idf_df[col].median()
        idf_df[col] = idf_df[col].fillna(overall_med)

    # Deduplicate in case of mergers
    idf_df = idf_df.groupby("code_insee", as_index=False).agg({
        "revenu_median": "median",
        "taux_imposition": "median",
        "part_prestations_sociales": "median",
        "dept": "first",
    })

    idf_df["revenu_median"] = idf_df["revenu_median"].round().astype(int)
    idf_df["taux_imposition"] = idf_df["taux_imposition"].round(1)
    idf_df["part_prestations_sociales"] = idf_df["part_prestations_sociales"].round(1)

    # Estimated Average Insole / Orthotics Price (Panier Semelles):
    # Base fee in IDF starts at ~130€ (low-income communes) up to ~210€ (high-income communes)
    # Reflects practitioner pricing freedom (honoraires libres) and patient willingness/mutuelle coverage
    p5 = idf_df["revenu_median"].quantile(0.05)
    p95 = idf_df["revenu_median"].quantile(0.95)
    norm_inc = (idf_df["revenu_median"] - p5) / (p95 - p5)
    norm_inc = norm_inc.clip(0.0, 1.0)
    idf_df["panier_semelles_estime"] = (130 + norm_inc * 80).round().astype(int)

    # Synthetic Purchasing Power / Insole Potential (0 to 100)
    # 70% median disposable income rank, 30% percentage of tax-paying households
    p_inc_rank = idf_df["revenu_median"].rank(pct=True) * 100.0
    p_imp_rank = idf_df["taux_imposition"].rank(pct=True) * 100.0
    idf_df["potentiel_semelles"] = (0.70 * p_inc_rank + 0.30 * p_imp_rank).round(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    idf_df.to_csv(output_path, index=False, encoding="utf-8")
    logger.info(
        f"Exported clean income data for {len(idf_df)} IDF communes to {output_path} "
        f"(Median income range: {idf_df['revenu_median'].min()}€ - {idf_df['revenu_median'].max()}€)"
    )

    return idf_df


def get_communal_income_lookup() -> dict[str, dict]:
    """Return dictionary of income metrics keyed by code_insee."""
    clean_path = INTERIM_DIR / "revenu_communes_clean.csv"
    if not clean_path.exists():
        df = extract_communal_income()
    else:
        df = pd.read_csv(clean_path, dtype={"code_insee": str})

    lookup = {}
    for _, row in df.iterrows():
        lookup[str(row["code_insee"])] = {
            "revenu_median": int(row["revenu_median"]),
            "taux_imposition": float(row["taux_imposition"]),
            "part_prestations_sociales": float(row["part_prestations_sociales"]),
            "panier_semelles_estime": int(row["panier_semelles_estime"]),
            "potentiel_semelles": float(row["potentiel_semelles"]),
        }
    return lookup


if __name__ == "__main__":
    extract_communal_income()
