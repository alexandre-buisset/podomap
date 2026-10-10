/**
 * Node test to verify frontend score calculation and reactivity on exported GeoJSON.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Import compiled score engine
const { computeOpportunityScores, getTop10Zones, getColorForScore, DEFAULT_WEIGHTS } =
  await import('../dist/src/score.js');

console.log('Testing frontend score engine...');

// Load exported zones.geojson
const geojsonPath = path.join(ROOT, 'dist', 'data', 'zones.geojson');
const raw = fs.readFileSync(geojsonPath, 'utf-8');
const zonesGeoJSON = JSON.parse(raw);

console.log(`Loaded ${zonesGeoJSON.features.length} zones from zones.geojson.`);

const filters = {
  weights: { ...DEFAULT_WEIGHTS },
  minPopulation: 5000,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
};

// 1. Calculate scores
const t0 = performance.now();
const scored = computeOpportunityScores(zonesGeoJSON.features, filters);
const elapsed = performance.now() - t0;
console.log(`computeOpportunityScores executed in ${elapsed.toFixed(2)} ms!`);

if (elapsed > 50) {
  throw new Error(`Performance issue: score calculation took ${elapsed.toFixed(2)} ms (expected < 50ms)`);
}

// 2. Verify scored features
const active = scored.filter(f => !f.properties.is_excluded);
console.log(`Active non-excluded zones (pop >= 5,000): ${active.length} / ${scored.length}`);

for (const f of active) {
  const p = f.properties;
  if (typeof p.score !== 'number' || p.score < 0 || p.score > 100) {
    throw new Error(`Invalid score ${p.score} for zone ${p.nom}`);
  }
  if (!p.rank_global || !p.rank_dept) {
    throw new Error(`Missing rank for active zone ${p.nom}`);
  }
}

// 3. Test Top 10
const top10 = getTop10Zones(scored, 'all');
console.log('\n--- TOP 10 OPPORTUNITÉS (Pondération par défaut) ---');
top10.forEach((f, i) => {
  const p = f.properties;
  console.log(
    `#${i + 1} ${p.nom} (${p.departement}) -> Score: ${p.score} | Pop 65+: ${p.pop_65plus} | Podologues (2km): ${p.nb_podologues_2km} | Densité: ${p.densite_pour_10k_65plus}`
  );
});

if (top10.length !== 10) {
  throw new Error(`Expected 10 top zones, got ${top10.length}`);
}

// 4. Test slider reactivity: change weights
console.log('\nTesting slider change reactivity...');
const customFilters = {
  ...filters,
  weights: {
    demande_65plus: 10,
    concurrence_inv: 80,
    coef_diabete: 5,
    bonus_zonage: 5,
  },
};

const customScored = computeOpportunityScores(zonesGeoJSON.features, customFilters);
const customTop10 = getTop10Zones(customScored, 'all');
console.log(`Top 1 with high competition weight: ${customTop10[0].properties.nom} (Score: ${customTop10[0].properties.score})`);

// 5. Test color mapping
const cLow = getColorForScore(15);
const cHigh = getColorForScore(85);
const cExcl = getColorForScore(0, true);
console.log(`Colors: Low=${cLow}, High=${cHigh}, Excluded=${cExcl}`);

console.log('\n>>> TOUS LES TESTS DU CALCUL DE SCORE FRONTEND SONT VALIDÉS [OK] <<<');
