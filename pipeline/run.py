"""One-shot reproducible pipeline runner for etude-podologue.

Usage:
    python -m pipeline.run [--all-idf] [--force]
"""

import argparse
import logging
import sys
import time
from pipeline.config import DEPARTMENTS_V1, DEPARTMENTS_IDF_ALL
from pipeline.download import download_all_raw
from pipeline.clean_rpps import extract_clean_podologues
from pipeline.geocode import run_geocoding
from pipeline.insee import extract_insee_population
from pipeline.aggregate import build_and_export_data
from pipeline.report_jalon1 import generate_jalon1_report

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def run_pipeline(all_idf: bool = False, force: bool = False):
    """Execute end-to-end data processing pipeline."""
    t0 = time.time()
    depts = DEPARTMENTS_IDF_ALL if all_idf else DEPARTMENTS_V1

    logger.info("=" * 60)
    logger.info(f"STARTING DATA PIPELINE (Perimeter: {'IDF Complète (V2)' if all_idf else 'Petite Couronne V1 (75, 92, 93, 94)'})")
    logger.info("=" * 60)

    # Step 1: Download raw archives
    logger.info("\n>>> ÉTAPE 1 : Téléchargement des sources ouvertes...")
    download_all_raw(force=force)

    # Step 2: Clean and extract podologists
    logger.info("\n>>> ÉTAPE 2 : Extraction et déduplication RPPS...")
    extract_clean_podologues(departments=depts)

    # Step 3: Geocode addresses
    logger.info("\n>>> ÉTAPE 3 : Géocodage API Adresse...")
    run_geocoding(force=force)

    # Step 4: Extract Insee census population
    logger.info("\n>>> ÉTAPE 4 : Démographie & Recensement Insee...")
    extract_insee_population(departments=depts)

    # Step 5: Aggregate metrics and export GeoJSON
    logger.info("\n>>> ÉTAPE 5 : Calcul des rayons et export GeoJSON...")
    build_and_export_data(departments=depts)

    # Step 6: Summary Quality Report
    logger.info("\n>>> ÉTAPE 6 : Rapport de conformité & acceptation...")
    generate_jalon1_report()

    logger.info("=" * 60)
    logger.info(f"PIPELINE COMPLETED SUCCESSFULLY in {time.time() - t0:.2f}s")
    logger.info("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reproducible Data Pipeline for Podologist Study")
    parser.add_argument("--all-idf", action="store_true", help="Include all 8 departments of Île-de-France (V2)")
    parser.add_argument("--force", action="store_true", help="Force re-downloading and re-geocoding")
    args = parser.parse_args()

    run_pipeline(all_idf=args.all_idf, force=args.force)
