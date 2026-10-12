/**
 * Script to fix commune centroids using official Mairie / Centre-Ville coordinates
 * from geo.api.gouv.fr, and recompute radial competition and transport distances.
 */
import fs from 'fs';
import https from 'https';
import path from 'path';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2.0) ** 2 +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2.0) ** 2;
  return R * 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
}

async function run() {
  console.log('>>> 1. Loading current dataset...');
  const zonesPath = path.resolve('public/data/zones.geojson');
  const podosPath = path.resolve('public/data/podologues.geojson');
  const stationsPath = path.resolve('public/data/stations.geojson');

  const zonesGeo = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
  const podosGeo = JSON.parse(fs.readFileSync(podosPath, 'utf8'));
  const stationsGeo = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));

  const podoPoints = podosGeo.features.map((f) => ({
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    dept: f.properties.dept,
    code_insee: f.properties.code_insee,
  }));

  const stations = stationsGeo.features.map((f) => ({
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    nom: f.properties.nom,
    mode: f.properties.mode,
    lignes: f.properties.lignes || [f.properties.mode],
    lignes_str: f.properties.lignes_str || f.properties.mode,
  }));

  console.log(`Loaded ${zonesGeo.features.length} zones, ${podoPoints.length} podo points, ${stations.length} stations.`);

  console.log('>>> 2. Fetching official Mairie / Centre-Ville coordinates from geo.api.gouv.fr...');
  const depts = ['77', '78', '91', '92', '93', '94', '95'];
  const mairieLookup = new Map();

  for (const dept of depts) {
    const list = await fetchJson(
      `https://geo.api.gouv.fr/departements/${dept}/communes?fields=nom,code,centre,mairie,codesPostaux`
    );
    for (const c of list) {
      const coords = c.mairie?.coordinates || c.centre?.coordinates;
      if (coords) {
        mairieLookup.set(c.code, {
          lon: coords[0],
          lat: coords[1],
          codesPostaux: c.codesPostaux || [],
          hasMairie: !!c.mairie,
        });
      }
    }
  }
  console.log(`Fetched official town hall coordinates for ${mairieLookup.size} IDF communes.`);

  console.log('>>> 3. Updating centroids to Mairie/Centre-Ville & checking shift...');
  let updatedCentroidsCount = 0;
  for (const feat of zonesGeo.features) {
    const p = feat.properties;
    const insee = p.code_insee;
    if (mairieLookup.has(insee)) {
      const target = mairieLookup.get(insee);
      const shift = haversineKm(p.centroide_lon, p.centroide_lat, target.lon, target.lat);
      if (shift > 0.05) {
        // Update centroid to real town center
        p.centroide_lon = Math.round(target.lon * 1e6) / 1e6;
        p.centroide_lat = Math.round(target.lat * 1e6) / 1e6;
        updatedCentroidsCount++;
      }
    }
  }
  console.log(`Updated centroids to official town hall/centre for ${updatedCentroidsCount} communes.`);

  console.log('>>> 4. Recomputing radial competition (1km, 2km, 3km), seniors density, and nearest transit stations...');
  const radii = [1, 2, 3];

  // Helper lookup for demographic seniors
  const zoneCentroids = zonesGeo.features.map((f) => ({
    code_insee: f.properties.code_insee,
    lat: f.properties.centroide_lat,
    lon: f.properties.centroide_lon,
    pop_65plus: f.properties.pop_65plus || 0,
  }));

  for (const feat of zonesGeo.features) {
    const p = feat.properties;
    const cLat = p.centroide_lat;
    const cLon = p.centroide_lon;
    const codeInsee = p.code_insee;
    const podosCommune = p.nb_podologues || 0;

    // A. Competition counts for 1km, 2km, 3km
    for (const r of radii) {
      let count = 0;
      for (const pt of podoPoints) {
        if (haversineKm(cLon, cLat, pt.lon, pt.lat) <= r) {
          count++;
        }
      }
      p[`nb_podologues_${r}km`] = count;

      // Calculate pop 65+ in radius
      let pop65Radius = 0;
      for (const z of zoneCentroids) {
        if (haversineKm(cLon, cLat, z.lon, z.lat) <= r) {
          pop65Radius += z.pop_65plus;
        }
      }
      pop65Radius = Math.max(pop65Radius, p.pop_65plus || 0);
      p[`pop_65plus_${r}km`] = pop65Radius;

      const density = pop65Radius > 0 ? (count / pop65Radius) * 10000.0 : 0.0;
      p[`densite_10k_65plus_${r}km`] = Math.round(density * 100) / 100;
    }

    // Default 2km radius
    p.nb_podologues_rayon = p.nb_podologues_2km;
    p.densite_pour_10k_65plus = p.densite_10k_65plus_2km;

    // B. Recompute nearest station and transit metrics from Mairie
    let nearestStation = null;
    let minDist = 999.0;
    let nbGares15km = 0;
    const nearbyModes = new Set();

    for (const st of stations) {
      const d = haversineKm(cLon, cLat, st.lon, st.lat);
      if (d < minDist) {
        minDist = d;
        nearestStation = st;
      }
      if (d <= 1.5) {
        nbGares15km++;
        nearbyModes.add(st.mode);
      }
    }

    if (nearestStation) {
      p.gare_nom = nearestStation.nom;
      p.gare_dist_km = Math.round(minDist * 100) / 100;
      p.gare_mode = nearestStation.mode;
      p.gare_lignes = nearestStation.lignes;
      p.nb_gares_1_5km = nbGares15km;
      p.modes_transport = Array.from(nearbyModes.size > 0 ? nearbyModes : [nearestStation.mode]);

      // Estimate travel time to Paris
      let estimatedTime = p.temps_paris_min || 45;
      if (nearestStation.mode === 'METRO') {
        estimatedTime = Math.round(10 + minDist * 5);
      } else if (nearestStation.mode === 'RER') {
        // Special known lines
        if (nearestStation.nom.includes('Saint-Germain-en-Laye')) {
          estimatedTime = 28;
        } else if (nearestStation.nom.includes('Achères')) {
          estimatedTime = 38;
        } else {
          estimatedTime = Math.min(estimatedTime, Math.round(20 + minDist * 4));
        }
      }
      p.temps_paris_min = Math.max(5, estimatedTime);
      p.score_transport = Math.max(0, Math.min(100, Math.round(100 - p.temps_paris_min * 1.1 - minDist * 8)));
    }
  }

  // Preview Saint-Germain-en-Laye
  const stg = zonesGeo.features.find((f) => f.properties.code_insee === '78551');
  console.log('\n=== PREVIEW SAINT-GERMAIN-EN-LAYE AFTER MAIRIE FIX ===');
  console.log('Centroid (Mairie):', stg.properties.centroide_lat, stg.properties.centroide_lon);
  console.log('Cabinets communal:', stg.properties.nb_podologues);
  console.log('Cabinets 1km:', stg.properties.nb_podologues_1km);
  console.log('Cabinets 2km:', stg.properties.nb_podologues_2km);
  console.log('Cabinets 3km:', stg.properties.nb_podologues_3km);
  console.log('Nearest station:', stg.properties.gare_nom, `(${stg.properties.gare_dist_km} km)`);
  console.log('Temps vers Paris:', stg.properties.temps_paris_min, 'min');

  // Preview Tremblay-en-France
  const tremb = zonesGeo.features.find((f) => f.properties.code_insee === '93073');
  console.log('\n=== PREVIEW TREMBLAY-EN-FRANCE AFTER MAIRIE FIX ===');
  console.log('Centroid (Mairie):', tremb.properties.centroide_lat, tremb.properties.centroide_lon);
  console.log('Cabinets communal:', tremb.properties.nb_podologues);
  console.log('Cabinets 2km:', tremb.properties.nb_podologues_2km);
  console.log('Nearest station:', tremb.properties.gare_nom, `(${tremb.properties.gare_dist_km} km)`);

  // Save updated zones.geojson
  fs.writeFileSync(zonesPath, JSON.stringify(zonesGeo));
  console.log(`\nSuccessfully updated ${zonesPath} with accurate Mairie-centered competition and transport metrics!`);
}

run().catch(console.error);
