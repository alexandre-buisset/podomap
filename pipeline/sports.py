"""Extract and aggregate sports licenses and clubs data per commune (Ministère des Sports / INJEP)."""

import csv
import io
import logging
import urllib.request
from collections import defaultdict
from pathlib import Path
import pandas as pd
from pipeline.config import RAW_DIR, INTERIM_DIR, TARGET_DEPARTMENTS, DEPARTMENTS_IDF_ALL

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

LIC_DATA_URL = "https://static.data.gouv.fr/resources/donnees-geocodees-issues-du-recensement-des-licences-et-clubs-aupres-des-federations-sportives-agreees-par-le-ministere-charge-des-sports/20251229-163107/lic-data-2023.csv"
CLUBS_DATA_URL = "https://static.data.gouv.fr/resources/donnees-geocodees-issues-du-recensement-des-licences-et-clubs-aupres-des-federations-sportives-agreees-par-le-ministere-charge-des-sports/20251229-163249/clubs-data-2023.csv"

def download_and_extract_sports(
    departments: list[str] = None,
    output_path: Path = None,
    force: bool = False,
) -> pd.DataFrame:
    """Download and aggregate sports licenses and clubs for target departments."""
    departments = set(departments or DEPARTMENTS_IDF_ALL)
    output_path = output_path or INTERIM_DIR / "sports_communes.csv"

    if output_path.exists() and not force:
        logger.info(f"Loading existing sports data from {output_path}")
        return pd.read_csv(output_path, dtype={"code_insee": str})

    logger.info("Fetching sports clubs data from Ministère des Sports / INJEP...")
    clubs_by_com = defaultdict(int)
    try:
        req_clubs = urllib.request.Request(CLUBS_DATA_URL, headers={"User-Agent": "etude-podologue/1.0"})
        with urllib.request.urlopen(req_clubs, timeout=45) as resp:
            reader = csv.reader(io.TextIOWrapper(resp, encoding="utf-8-sig", errors="ignore"), delimiter=";")
            header = next(reader)
            idx_com = header.index("Code Commune")
            idx_dept = [i for i, h in enumerate(header) if "artement" in h.lower() or "dept" in h.lower()][0]
            idx_actifs = [i for i, h in enumerate(header) if "total_actifs" in h.lower() or "clubs_actifs" in h.lower()][0]

            for row in reader:
                if not row or len(row) <= idx_com:
                    continue
                dept = row[idx_dept].strip().zfill(2)
                if dept in departments:
                    code_com = row[idx_com].strip().zfill(5)
                    try:
                        nb = int(float(row[idx_actifs].strip().replace(" ", "") or 0))
                    except:
                        nb = 1
                    clubs_by_com[code_com] += nb
        logger.info(f"Loaded clubs data for {len(clubs_by_com)} communes.")
    except Exception as e:
        logger.warning(f"Could not load clubs-data-2023: {e}")

    logger.info("Streaming and aggregating sports licenses from INJEP (lic-data-2023)...")
    stats = defaultdict(lambda: {
        "nb_licencies_sport": 0,
        "licencies_jeunes": 0,
        "licencies_football": 0,
        "licencies_tennis": 0,
        "licencies_athletisme": 0,
        "licencies_basketball": 0,
        "licencies_handball": 0,
        "licencies_rugby": 0,
    })

    req_lic = urllib.request.Request(LIC_DATA_URL, headers={"User-Agent": "etude-podologue/1.0"})
    with urllib.request.urlopen(req_lic, timeout=120) as resp:
        reader = csv.reader(io.TextIOWrapper(resp, encoding="utf-8-sig", errors="ignore"), delimiter=";")
        header = next(reader)

        idx_code_com = header.index("Code Commune")
        idx_dept = [i for i, h in enumerate(header) if "artement" in h.lower() or "dept" in h.lower()][0]
        idx_fed = [i for i, h in enumerate(header) if "ration" in h.lower() or "fed" in h.lower()][0]
        idx_total = header.index("Total")

        # Female and Male youth indices (ages 1 to 19): 9, 10, 11, 12, 27, 28, 29, 30
        youth_indices = [9, 10, 11, 12, 27, 28, 29, 30]

        for row in reader:
            if not row or len(row) <= idx_total:
                continue
            dept = row[idx_dept].strip().zfill(2)
            if dept not in departments:
                continue

            code_com = row[idx_code_com].strip().zfill(5)
            # Handle commune mergers (e.g. 93059 Pierrefitte-sur-Seine -> 93066 Saint-Denis)
            if code_com == "93059":
                code_com = "93066"

            fed = row[idx_fed].strip().lower()
            try:
                tot = int(float(row[idx_total].strip().replace(" ", "") or 0))
            except:
                tot = 0

            youth_tot = 0
            for yi in youth_indices:
                if yi < len(row):
                    try:
                        youth_tot += int(float(row[yi].strip().replace(" ", "") or 0))
                    except:
                        pass

            st = stats[code_com]
            st["nb_licencies_sport"] += tot
            st["licencies_jeunes"] += youth_tot

            if "football" in fed:
                st["licencies_football"] += tot
            elif "tennis" in fed and "table" not in fed:
                st["licencies_tennis"] += tot
            elif "athl" in fed and "pentathlon" not in fed:
                st["licencies_athletisme"] += tot
            elif "basketball" in fed or "basket" in fed:
                st["licencies_basketball"] += tot
            elif "handball" in fed:
                st["licencies_handball"] += tot
            elif "rugby" in fed:
                st["licencies_rugby"] += tot

    rows = []
    for code_com, data in stats.items():
        data_row = {"code_insee": code_com}
        data_row.update(data)
        data_row["nb_clubs_sport"] = clubs_by_com.get(code_com, 0)
        # Running / running-heavy sports aggregate
        data_row["licencies_running_sports"] = (
            data["licencies_football"]
            + data["licencies_tennis"]
            + data["licencies_athletisme"]
            + data["licencies_basketball"]
            + data["licencies_handball"]
            + data["licencies_rugby"]
        )
        rows.append(data_row)

    df_sports = pd.DataFrame(rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df_sports.to_csv(output_path, index=False, encoding="utf-8")
    logger.info(f"Saved sports metrics for {len(df_sports)} communes to {output_path}")

    return df_sports


def get_sports_lookup(departments: list[str] = None) -> dict[str, dict]:
    """Return dictionary of sports metrics keyed by commune INSEE code."""
    df = download_and_extract_sports(departments=departments)
    lookup = {}
    for _, row in df.iterrows():
        code = str(row["code_insee"]).strip().zfill(5)
        lookup[code] = {
            "nb_licencies_sport": int(row.get("nb_licencies_sport", 0)),
            "nb_clubs_sport": int(row.get("nb_clubs_sport", 0)),
            "licencies_jeunes": int(row.get("licencies_jeunes", 0)),
            "licencies_football": int(row.get("licencies_football", 0)),
            "licencies_tennis": int(row.get("licencies_tennis", 0)),
            "licencies_athletisme": int(row.get("licencies_athletisme", 0)),
            "licencies_basketball": int(row.get("licencies_basketball", 0)),
            "licencies_handball": int(row.get("licencies_handball", 0)),
            "licencies_rugby": int(row.get("licencies_rugby", 0)),
            "licencies_running_sports": int(row.get("licencies_running_sports", 0)),
        }
    return lookup


if __name__ == "__main__":
    download_and_extract_sports(force=True)
