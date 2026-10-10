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
const { computeOpportunityScores, getTop10Zones, getColorForScore, DEFAULT_WEIGHTS, STRATEGY_PRESETS } =
  await import('../dist/src/score.js');

console.log('Testing frontend score engine with strategy presets & purchasing power...');

// Load exported zones.geojson
const geojsonPath = path.join(ROOT, 'dist', 'data', 'zones.geojson');
const raw = fs.readFileSync(geojsonPath, 'utf-8');
const zonesGeoJSON = JSON.parse(raw);

console.log(`Loaded ${zonesGeoJSON.features.length} zones from zones.geojson.`);

// 1. Verify income and transit data on features
for (const f of zonesGeoJSON.features) {
  const p = f.properties;
  if (typeof p.revenu_median !== 'number' || p.revenu_median <= 0) {
    throw new Error(`Missing or invalid revenu_median for zone ${p.nom}`);
  }
  if (typeof p.panier_semelles_estime !== 'number' || p.panier_semelles_estime < 120 || p.panier_semelles_estime > 220) {
    throw new Error(`Invalid panier_semelles_estime (${p.panier_semelles_estime}) for zone ${p.nom}`);
  }
}
console.log('Verified revenu_median and panier_semelles_estime on 100% of zones.');

// 2. Test Profil 1: Semelles & Rentabilité (Pouvoir d'achat)
const filtersSemelles = {
  weights: { ...STRATEGY_PRESETS.semelles },
  activePreset: 'semelles',
  minPopulation: 5000,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
};

const t0 = performance.now();
const scoredSemelles = computeOpportunityScores(zonesGeoJSON.features, filtersSemelles);
const elapsed = performance.now() - t0;
console.log(`computeOpportunityScores executed in ${elapsed.toFixed(2)} ms!`);

if (elapsed > 50) {
  throw new Error(`Performance issue: score calculation took ${elapsed.toFixed(2)} ms (expected < 50ms)`);
}

const top10Semelles = getTop10Zones(scoredSemelles, 'all');
console.log('\n--- TOP 10 OPPORTUNITÉS : PROFIL SEMELLES & POUVOIR D\'ACHAT ---');
top10Semelles.forEach((f, i) => {
  const p = f.properties;
  console.log(
    `#${i + 1} ${p.nom} (${p.departement}) -> Score: ${p.score} | Rev: ${p.revenu_median} € | Semelles: ~${p.panier_semelles_estime} € | Podologues (2km): ${p.nb_podologues_2km}`
  );
});

// Under Semelles profile, Seine-Saint-Denis should NOT monopolize top spots!
const top10SemellesDepts = top10Semelles.map(f => f.properties.departement);
console.log('Top 10 departments under Semelles profile:', top10SemellesDepts);
const deptsAises = top10Semelles.filter(f => ['75', '92', '78', '94'].includes(f.properties.departement));
if (deptsAises.length < 7) {
  throw new Error(`Expected at least 7 affluent communes (75/92/78/94) in top 10 for Semelles profile, got ${deptsAises.length}`);
}

// 3. Test Profil 3: Médical & Diabète (pure désert conventionné)
console.log('\n--- TOP 10 OPPORTUNITÉS : PROFIL MÉDICAL & DIABÈTE (DÉSERT CONVENTIONNÉ) ---');
const filtersMedical = {
  weights: { ...STRATEGY_PRESETS.medical },
  activePreset: 'medical',
  minPopulation: 5000,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
};

const scoredMedical = computeOpportunityScores(zonesGeoJSON.features, filtersMedical);
const top10Medical = getTop10Zones(scoredMedical, 'all');
top10Medical.forEach((f, i) => {
  const p = f.properties;
  console.log(
    `#${i + 1} ${p.nom} (${p.departement}) -> Score: ${p.score} | Rev: ${p.revenu_median} € | Diabète: ${p.prevalence_diabete}% | Podologues (2km): ${p.nb_podologues_2km}`
  );
});

// Under Medical profile, Seine-Saint-Denis has strong presence
const count93Medical = top10Medical.filter(f => f.properties.departement === '93').length;
console.log(`Count of 93 communes in Medical profile top 10: ${count93Medical}`);
if (count93Medical < 4) {
  throw new Error(`Expected at least 4 Seine-Saint-Denis communes in top 10 for Medical profile, got ${count93Medical}`);
}

// 4. Test color mapping
const cLow = getColorForScore(15);
const cHigh = getColorForScore(85);
const cExcl = getColorForScore(0, true);
console.log(`Colors: Low=${cLow}, High=${cHigh}, Excluded=${cExcl}`);

console.log('\n>>> TOUS LES TESTS DES PROFILS STRATÉGIQUES ET CALCULS DE SCORE SONT VALIDÉS [OK] <<<');
