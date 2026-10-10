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

// Under Semelles profile:
// 1. All top spots must have high purchasing power (>= 25 000 €) and low competition (<= 5 podos at 2km)
const allHighIncomeLowConc = top10Semelles.every(
  (f) => f.properties.revenu_median >= 25000 && (f.properties.nb_podologues_2km ?? 0) <= 5
);
if (!allHighIncomeLowConc) {
  throw new Error('All top 10 Semelles communes must have high income (>=25k€) and low competition (<=5 podos at 2km)');
}

// 2. Hyper-saturated communes (like Vincennes with 55 podos or Levallois with 97 podos) must be eliminated from top ranks
const vincennes = scoredSemelles.find((f) => f.properties.nom === 'Vincennes');
const nogent = scoredSemelles.find((f) => f.properties.nom === 'Nogent-sur-Marne');
console.log(`Vincennes score: ${vincennes?.properties.score} / 100 (Podos 2km: ${vincennes?.properties.nb_podologues_2km})`);
console.log(`Nogent score: ${nogent?.properties.score} / 100 (Podos 2km: ${nogent?.properties.nb_podologues_2km})`);

if ((vincennes?.properties.score ?? 100) > 30) {
  throw new Error(`Vincennes must be penalized by saturation (score <= 30, got ${vincennes?.properties.score})`);
}
if ((nogent?.properties.score ?? 100) > 35) {
  throw new Error(`Nogent-sur-Marne must be penalized by saturation (score <= 35, got ${nogent?.properties.score})`);
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
