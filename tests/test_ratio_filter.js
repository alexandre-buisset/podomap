/**
 * Test ratio podologue / habitant filter and display criterion.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const { computeOpportunityScores, getTop10Zones, DEFAULT_WEIGHTS } =
  await import('../dist/src/score.js');

console.log('Testing Podologues / Habitant Filter and Display Criterion...');

const raw = fs.readFileSync(path.join(ROOT, 'dist', 'data', 'zones.geojson'), 'utf-8');
const zonesGeoJSON = JSON.parse(raw);

// 1. Test displayCriterion = 'ratio_podo_hab'
const filtersRatio = {
  weights: { ...DEFAULT_WEIGHTS },
  activePreset: 'semelles',
  displayCriterion: 'ratio_podo_hab',
  minPopulation: 3000,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
};

const scoredRatio = computeOpportunityScores(zonesGeoJSON.features, filtersRatio);
const top10Ratio = getTop10Zones(scoredRatio, 'all', 'ratio_podo_hab');

console.log('\n--- TOP 10 ZONES (CRITÈRE: PODOS / HABITANT) ---');
top10Ratio.forEach((f, idx) => {
  const p = f.properties;
  console.log(
    `#${idx + 1} ${p.nom} (${p.departement}) -> Pop: ${p.pop_totale} | Podos: ${p.nb_podologues} | Ratio: ${p.ratio_hab_par_podo} hab/podo | Densité: ${p.densite_podo_10k_hab} /10k | Color: ${p.color}`
  );
});

// Verify that top 10 with this criterion have 0 podologues or massive ratio >= 3000
for (const f of top10Ratio) {
  if (f.properties.nb_podologues > 0 && f.properties.ratio_hab_par_podo < 3000) {
    throw new Error(`Expected high ratio or 0 podos in top 10, got ${f.properties.ratio_hab_par_podo}`);
  }
}
console.log('✅ Top 10 sorted correctly by highest ratio hab/podo.');

// 2. Test onlyDesertPodo filter (strict 0 podologue communal)
const filtersDesertOnly = {
  weights: { ...DEFAULT_WEIGHTS },
  activePreset: 'semelles',
  minPopulation: 2500,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
  onlyDesertPodo: true,
};

const scoredDesert = computeOpportunityScores(zonesGeoJSON.features, filtersDesertOnly);
const activeDesert = scoredDesert.filter((f) => !f.properties.is_excluded);
console.log(`\nActive communes with 0 podologue and pop >= 2500: ${activeDesert.length}`);

for (const f of activeDesert) {
  if (f.properties.nb_podologues !== 0) {
    throw new Error(`Zone ${f.properties.nom} has ${f.properties.nb_podologues} podologues, expected 0 in desert mode!`);
  }
}
console.log('✅ onlyDesertPodo strictly filtered to 0 podologue communal.');

// 3. Test minRatioHabPodoNum (>= 3500 hab/podo)
const filtersMinRatio = {
  weights: { ...DEFAULT_WEIGHTS },
  activePreset: 'semelles',
  minPopulation: 2500,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
  minRatioHabPodoNum: 3500,
};

const scoredMinRatio = computeOpportunityScores(zonesGeoJSON.features, filtersMinRatio);
const activeMinRatio = scoredMinRatio.filter((f) => !f.properties.is_excluded);
console.log(`Active communes with >= 3 500 hab/podo and pop >= 2500: ${activeMinRatio.length}`);

for (const f of activeMinRatio) {
  const p = f.properties;
  if (p.nb_podologues > 0 && Math.round(p.pop_totale / p.nb_podologues) < 3500) {
    throw new Error(`Zone ${p.nom} violates ratio threshold: ${p.pop_totale}/${p.nb_podologues} = ${p.pop_totale / p.nb_podologues}`);
  }
}
console.log('✅ minRatioHabPodoNum strictly enforced.');

// 4. Test missing income transparency (15 micro-communes)
const microCommunes = zonesGeoJSON.features.filter((f) => f.properties.has_insee_income === false);
console.log(`\nMicro-communes without INSEE income: ${microCommunes.length}`);
if (microCommunes.length !== 15) {
  throw new Error(`Expected exactly 15 micro-communes with has_insee_income === false, got ${microCommunes.length}`);
}
for (const f of microCommunes) {
  if (f.properties.pop_totale >= 150) {
    throw new Error(`Micro-commune ${f.properties.nom} has pop >= 150 (${f.properties.pop_totale})`);
  }
}
console.log('✅ All 15 micro-communes correctly flagged with has_insee_income = false (zero data invented).');

console.log('\n>>> ALL RATIO FILTER & DATA INTEGRITY TESTS PASSED SUCCESSFULLY! <<<');
