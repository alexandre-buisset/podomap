"""Diabetes prevalence coefficient by department from CNAM / Open Data Ameli."""

import logging
from pipeline.config import DIABETES_PREVALENCE_2023, DIABETES_IDF_AVG

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def get_diabetes_coefficients() -> dict[str, dict]:
    """Return diabetes prevalence (%) and normalized coefficient (~1.0) per department."""
    results = {}
    for dept, prev in DIABETES_PREVALENCE_2023.items():
        coef = prev / DIABETES_IDF_AVG
        results[dept] = {
            "prevalence_pct": round(prev, 3),
            "coef_diabete": round(coef, 3),
        }
    return results


if __name__ == "__main__":
    coeffs = get_diabetes_coefficients()
    for d, info in sorted(coeffs.items()):
        print(f"Dept {d}: {info['prevalence_pct']}% -> coef: {info['coef_diabete']}")
