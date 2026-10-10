"""Download raw datasets from official open data portals with local caching."""

import logging
import requests
from pathlib import Path
from pipeline.config import (
    RAW_DIR,
    RPPS_ZIP_URL,
    INSEE_POP_ZIP_URL,
    PARIS_ARRONDISSEMENTS_GEOJSON_URL,
    FILOSOFI_INCOME_CSV_URL,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def download_file(url: str, dest_path: Path, force: bool = False, headers: dict = None) -> Path:
    """Download a file with streaming and caching."""
    if dest_path.exists() and dest_path.stat().st_size > 1000 and not force:
        logger.info(f"Using cached file: {dest_path.name} ({dest_path.stat().st_size / (1024*1024):.1f} MB)")
        return dest_path

    logger.info(f"Downloading from {url} to {dest_path.name}...")
    headers = headers or {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    with requests.get(url, stream=True, headers=headers, timeout=60) as response:
        response.raise_for_status()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)

    logger.info(f"Downloaded {dest_path.name} ({dest_path.stat().st_size / (1024*1024):.1f} MB)")
    return dest_path


def download_all_raw(force: bool = False) -> dict:
    """Download all required raw source archives."""
    rpps_path = download_file(RPPS_ZIP_URL, RAW_DIR / "rpps.zip", force=force)
    insee_path = download_file(INSEE_POP_ZIP_URL, RAW_DIR / "insee_iris_pop.zip", force=force)
    paris_path = download_file(
        PARIS_ARRONDISSEMENTS_GEOJSON_URL,
        RAW_DIR / "paris_arrondissements.geojson",
        force=force,
    )
    income_path = download_file(
        FILOSOFI_INCOME_CSV_URL,
        RAW_DIR / "revenu_communes.csv",
        force=force,
    )
    return {
        "rpps": rpps_path,
        "insee": insee_path,
        "paris": paris_path,
        "income": income_path,
    }


if __name__ == "__main__":
    download_all_raw()
