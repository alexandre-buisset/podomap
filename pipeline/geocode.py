"""Batch geocoding of podologist practice addresses using the French National Address API."""

import io
import logging
import time
from pathlib import Path
import pandas as pd
import requests
from pipeline.config import (
    INTERIM_DIR,
    API_ADRESSE_CSV_URL,
    MIN_GEOCODE_SCORE,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def geocode_addresses_batch(
    df: pd.DataFrame,
    chunk_size: int = 1000,
    max_retries: int = 3,
) -> pd.DataFrame:
    """Geocode addresses using the api-adresse.data.gouv.fr/search/csv/ endpoint."""
    if df.empty:
        return df

    logger.info(f"Geocoding {len(df)} addresses via API Adresse batch endpoint...")
    results = []

    # Prepare chunks
    for chunk_start in range(0, len(df), chunk_size):
        chunk_df = df.iloc[chunk_start : chunk_start + chunk_size].copy()
        logger.info(f"Sending chunk {chunk_start + 1} - {min(chunk_start + len(chunk_df), len(df))} / {len(df)}...")

        # Prepare CSV payload
        csv_buffer = io.StringIO()
        # Ensure ID column is present
        chunk_df["batch_id"] = range(chunk_start, chunk_start + len(chunk_df))
        chunk_df.to_csv(csv_buffer, index=False)
        csv_bytes = csv_buffer.getvalue().encode("utf-8")

        files = {"data": ("addresses.csv", csv_bytes, "text/csv")}
        data = {
            "columns": "adresse_complete",
            "postcode": "code_postal",
        }

        success = False
        for attempt in range(1, max_retries + 1):
            try:
                response = requests.post(
                    API_ADRESSE_CSV_URL,
                    files=files,
                    data=data,
                    timeout=120,
                )
                if response.status_code == 200:
                    resp_df = pd.read_csv(io.StringIO(response.text))
                    results.append(resp_df)
                    success = True
                    break
                else:
                    logger.warning(f"Attempt {attempt}: API responded with status {response.status_code}: {response.text[:200]}")
                    time.sleep(2 * attempt)
            except Exception as e:
                logger.warning(f"Attempt {attempt} failed with exception: {e}")
                time.sleep(2 * attempt)

        if not success:
            raise RuntimeError(f"Failed to geocode chunk {chunk_start} after {max_retries} attempts.")

    geocoded_df = pd.concat(results, ignore_index=True)
    return geocoded_df


def run_geocoding(
    input_path: Path = None,
    output_path: Path = None,
    force: bool = False,
) -> tuple[pd.DataFrame, dict]:
    """Load clean podologues, geocode them, evaluate accuracy and save output."""
    input_path = input_path or INTERIM_DIR / "podologues_clean.csv"
    output_path = output_path or INTERIM_DIR / "podologues_geocoded.csv"

    should_geocode = force or not output_path.exists()
    if output_path.exists() and not force:
        cached_df = pd.read_csv(output_path)
        raw_df = pd.read_csv(input_path)
        if len(cached_df) < len(raw_df):
            logger.info(f"Input has {len(raw_df)} rows but cache only has {len(cached_df)}. Re-geocoding full set...")
            should_geocode = True
        else:
            df = cached_df

    if should_geocode:
        df_raw = pd.read_csv(input_path)
        df_geo = geocode_addresses_batch(df_raw)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df_geo.to_csv(output_path, index=False, encoding="utf-8")
        df = df_geo
        logger.info(f"Saved geocoded podologues to {output_path}")

    # Evaluate metrics
    total = len(df)
    valid_mask = (
        df["latitude"].notna()
        & df["longitude"].notna()
        & (df["result_score"] >= MIN_GEOCODE_SCORE)
    )
    successful = int(valid_mask.sum())
    rejected = total - successful
    success_rate = (successful / total * 100) if total > 0 else 0.0

    report = {
        "total_addresses": total,
        "successful_geocoded": successful,
        "rejected_geocoded": rejected,
        "success_rate_pct": round(success_rate, 2),
        "min_score_threshold": MIN_GEOCODE_SCORE,
        "avg_score": round(float(df["result_score"].mean()), 3),
        "by_dept": {},
    }

    # Department breakdown
    for dept, group in df.groupby("dept"):
        dept_total = len(group)
        dept_succ = int(
            (
                group["latitude"].notna()
                & group["longitude"].notna()
                & (group["result_score"] >= MIN_GEOCODE_SCORE)
            ).sum()
        )
        report["by_dept"][str(dept)] = {
            "total": dept_total,
            "successful": dept_succ,
            "success_rate_pct": round(dept_succ / dept_total * 100, 2) if dept_total > 0 else 0,
        }

    logger.info(
        f"Geocoding Acceptance: {successful}/{total} successful "
        f"({report['success_rate_pct']}%), average score: {report['avg_score']}"
    )

    return df, report


if __name__ == "__main__":
    run_geocoding()
