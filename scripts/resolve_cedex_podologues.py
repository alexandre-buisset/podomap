"""Script to resolve the 60 missing CEDEX podologues from RPPS using the BAN API."""

import json
import time
import urllib.parse
import urllib.request
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
interim_geo_path = ROOT / "data" / "interim" / "podologues_geocoded.csv"

df = pd.read_csv(interim_geo_path, dtype={"code_insee_rpps": str, "code_postal": str, "dept": str})
df["result_citycode"] = df["result_citycode"].astype(object)
df["result_postcode"] = df["result_postcode"].astype(object)
df["result_city"] = df["result_city"].astype(object)
df["result_label"] = df["result_label"].astype(object)
df["result_status"] = df["result_status"].astype(object)
nan_mask = df["latitude"].isna()
print(f"Total missing / un-geocoded podologues in RPPS extract: {nan_mask.sum()}")

resolved_count = 0
for idx in df[nan_mask].index:
    row = df.loc[idx]
    pp_id = row["pp_id"]
    addr_voie = str(row["adresse_voie"]) if pd.notna(row["adresse_voie"]) else ""
    commune = str(row["commune"]) if pd.notna(row["commune"]) else ""
    dept = str(row["dept"]).replace(".0", "").zfill(2)
    code_insee = str(row["code_insee_rpps"]).replace(".0", "").zfill(5) if pd.notna(row["code_insee_rpps"]) else ""

    # Build clean query
    # E.g. "3 Place DU 11 NOVEMBRE, Noisy-le-Grand 93"
    commune_clean = commune.replace("Arrondissement", "").replace("  ", " ").strip()
    query = f"{addr_voie}, {commune_clean} {dept}".strip(", ")
    
    url = f"https://api-adresse.data.gouv.fr/search/?q={urllib.parse.quote(query)}&limit=1"
    if code_insee:
        url += f"&citycode={code_insee}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "etude-podologue-audit/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data.get("features"):
                feat = data["features"][0]
                props = feat["properties"]
                geom = feat["geometry"]
                score = props.get("score", 0)

                # BAN match accepted if score >= 0.5
                if score >= 0.5:
                    lon, lat = geom["coordinates"]
                    df.at[idx, "latitude"] = lat
                    df.at[idx, "longitude"] = lon
                    df.at[idx, "result_score"] = score
                    df.at[idx, "result_label"] = props.get("label", "")
                    df.at[idx, "result_citycode"] = props.get("citycode", code_insee)
                    df.at[idx, "result_city"] = props.get("city", commune)
                    df.at[idx, "result_postcode"] = props.get("postcode", "")
                    df.at[idx, "result_status"] = "ok"
                    resolved_count += 1
                    print(f"[{resolved_count}] Resolved pp_id {pp_id}: {props.get('label')} (score: {score:.2f}, citycode: {props.get('citycode')})")
    except Exception as e:
        print(f"Error resolving pp_id {pp_id}: {e}")

    time.sleep(0.04)

print(f"\nSuccessfully resolved {resolved_count} out of {nan_mask.sum()} CEDEX records!")

# If any remain, fallback to commune centroid so NO podologist is lost
still_nan = df["latitude"].isna()
print(f"Remaining un-geocoded: {still_nan.sum()}")

if still_nan.sum() > 0:
    zones_geojson = json.load(open(ROOT / "public" / "data" / "zones.geojson", encoding="utf-8"))
    centroids = {
        f["properties"]["code_insee"]: (f["properties"]["centroide_lat"], f["properties"]["centroide_lon"], f["properties"]["nom"])
        for f in zones_geojson["features"]
    }
    for idx in df[still_nan].index:
        r = df.loc[idx]
        code = str(r["code_insee_rpps"]).replace(".0", "").zfill(5)
        if code in centroids:
            c_lat, c_lon, c_nom = centroids[code]
            df.at[idx, "latitude"] = c_lat
            df.at[idx, "longitude"] = c_lon
            df.at[idx, "result_score"] = 0.50
            df.at[idx, "result_citycode"] = code
            df.at[idx, "result_city"] = c_nom
            df.at[idx, "result_status"] = "commune_centroid_fallback"
            print(f"Fallback to centroid for pp_id {r['pp_id']} ({c_nom} - {code})")

# Save updated geocoded CSV
df.to_csv(interim_geo_path, index=False)
print("Saved updated podologues_geocoded.csv!")
