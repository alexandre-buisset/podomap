"""Clean and extract pedicure-podologues practice locations from RPPS."""

import logging
import zipfile
from pathlib import Path
import pandas as pd
from pipeline.config import RAW_DIR, INTERIM_DIR, TARGET_DEPARTMENTS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def extract_clean_podologues(
    departments: list[str] = None,
    zip_path: Path = None,
    output_path: Path = None,
) -> pd.DataFrame:
    """Filter RPPS for podologists in target departments and deduplicate practice locations."""
    departments = set(departments or TARGET_DEPARTMENTS)
    zip_path = zip_path or RAW_DIR / "rpps.zip"
    output_path = output_path or INTERIM_DIR / "podologues_clean.csv"

    if not zip_path.exists():
        raise FileNotFoundError(f"RPPS archive missing at {zip_path}. Run pipeline.download first.")

    logger.info(f"Extracting pedicure-podologues for departments: {sorted(list(departments))}...")

    cleaned_rows = []
    total_podologues_france = 0

    with zipfile.ZipFile(zip_path, "r") as z:
        # Find the activity file in the zip
        target_name = None
        for name in z.namelist():
            if "personne_activite" in name.lower() and name.endswith(".txt"):
                target_name = name
                break
        
        if not target_name:
            raise ValueError(f"Could not find Personne_activite file inside {zip_path}")

        logger.info(f"Reading {target_name} from ZIP...")
        with z.open(target_name) as f:
            header_line = f.readline().decode("utf-8", errors="ignore").strip()
            headers = header_line.split("|")
            
            # Map column indices
            idx_pp_id = headers.index("Identifiant PP")
            idx_code_prof = headers.index("Code profession")
            idx_lib_prof = headers.index("Libellé profession")
            idx_struct_id = headers.index("Identifiant technique de la structure")
            idx_num_voie = headers.index("Numéro Voie (coord. structure)")
            idx_ind_rep = headers.index("Indice répétition voie (coord. structure)")
            idx_type_voie = headers.index("Libellé type de voie (coord. structure)")
            idx_nom_voie = headers.index("Libellé Voie (coord. structure)")
            idx_cp = headers.index("Code postal (coord. structure)")
            idx_code_com = headers.index("Code commune (coord. structure)")
            idx_lib_com = headers.index("Libellé commune (coord. structure)")

            for line_bytes in f:
                line = line_bytes.decode("utf-8", errors="ignore")
                if "|80|" not in line and "|Pédicure-Podologue|" not in line:
                    continue

                parts = line.strip().split("|")
                if len(parts) < len(headers):
                    continue

                # Verify exact profession code
                if parts[idx_code_prof] != "80" and "pédicure" not in parts[idx_lib_prof].lower():
                    continue

                total_podologues_france += 1

                cp = parts[idx_cp].strip()
                code_com = parts[idx_code_com].strip()
                dept = cp[:2] if len(cp) >= 2 else code_com[:2]

                if dept not in departments:
                    continue

                pp_id = parts[idx_pp_id].strip()
                struct_id = parts[idx_struct_id].strip()
                num_voie = parts[idx_num_voie].strip()
                rep = parts[idx_ind_rep].strip()
                type_voie = parts[idx_type_voie].strip()
                nom_voie = parts[idx_nom_voie].strip()
                lib_com = parts[idx_lib_com].strip()

                # Assemble street address
                street_parts = [p for p in [num_voie, rep, type_voie, nom_voie] if p]
                adresse_voie = " ".join(street_parts)
                adresse_complete = f"{adresse_voie}, {cp} {lib_com}".strip(", ")

                cleaned_rows.append({
                    "pp_id": pp_id,
                    "struct_id": struct_id,
                    "dept": dept,
                    "code_postal": cp,
                    "code_insee_rpps": code_com,
                    "commune": lib_com,
                    "adresse_voie": adresse_voie,
                    "adresse_complete": adresse_complete,
                })

    df = pd.DataFrame(cleaned_rows)
    logger.info(f"Total Podologues national: {total_podologues_france}")
    logger.info(f"Raw practice locations in target depts: {len(df)}")

    # Deduplication: A practitioner at the same practice address / structure should be counted once.
    # If they practice at two distinct addresses, both locations are preserved as separate competitor sites.
    before_dedup = len(df)
    df = df.drop_duplicates(subset=["pp_id", "adresse_complete"]).copy()
    logger.info(f"Deduplication: {before_dedup} -> {len(df)} distinct practice locations ({df['pp_id'].nunique()} unique practitioners)")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8")
    logger.info(f"Saved clean podologues to {output_path}")

    return df


if __name__ == "__main__":
    extract_clean_podologues()
