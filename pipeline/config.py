"""Configuration for the IDF Podologist Study pipeline."""

import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
OUTPUT_DIR = BASE_DIR / "public" / "data"

# Ensure directories exist
for d in [DATA_DIR, RAW_DIR, INTERIM_DIR, OUTPUT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Departments
DEPARTMENTS_V1 = ["75", "92", "93", "94"]
DEPARTMENTS_IDF_ALL = ["75", "77", "78", "91", "92", "93", "94", "95"]

# Default active departments (V1 per spec)
TARGET_DEPARTMENTS = os.getenv("DEPARTMENTS", "75,92,93,94").split(",")

# Remote URLs
RPPS_ZIP_URL = "https://static.data.gouv.fr/resources/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps-format-zip/20261009-115247/ps-libreacces-202610091234.zip"
INSEE_POP_ZIP_URL = "https://www.insee.fr/fr/statistiques/fichier/8268806/base-ic-evol-struct-pop-2021_csv.zip"
PARIS_ARRONDISSEMENTS_GEOJSON_URL = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson"
AMELI_EFFECTIFS_API_URL = "https://data.ameli.fr/api/explore/v2.1/catalog/datasets/effectifs/records"
API_ADRESSE_CSV_URL = "https://api-adresse.data.gouv.fr/search/csv/"
FILOSOFI_INCOME_CSV_URL = "https://static.data.gouv.fr/resources/revenu-des-francais-a-la-commune/20251210-134014/revenu-des-francais-a-la-commune-1765372688826.csv"

# Geocoding thresholds
MIN_GEOCODE_SCORE = 0.45

# Spatial buffers (in kilometers)
RADII_KM = [1, 2, 3]

# Diabetes default baseline rates if offline (Consolidated 2023 CNAM Open Data)
DIABETES_PREVALENCE_2023 = {
    "75": 4.893,
    "77": 6.282,
    "78": 5.146,
    "91": 5.847,
    "92": 4.979,
    "93": 7.606,
    "94": 5.998,
    "95": 6.569,
}
DIABETES_IDF_AVG = sum(DIABETES_PREVALENCE_2023.values()) / len(DIABETES_PREVALENCE_2023)
