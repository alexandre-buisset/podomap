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
const {
  computeOpportunityScores,
  getTop10Zones,
  getColorForScore,
  DEFAULT_WEIGHTS,
  STRATEGY_PRESETS,
  getEstimatedRent,
  simulateCabinetFinancials,
} = await import('../dist/src/score.js');

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
  (f) => f.properties.revenu_median >= 25000 && (f.properties.nb_podologues_2km ?? 0) <= 6
);
if (!allHighIncomeLowConc) {
  throw new Error('All top 10 Semelles communes must have high income (>=25k€) and low competition (<=6 podos at 2km)');
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

// 4. Test Profil 4: Sport & Podopédiatrie (Semelles Orthopédiques)
console.log('\n--- TOP 10 OPPORTUNITÉS : PROFIL SPORT & PODOPÉDIATRIE ---');
const filtersSportJeunes = {
  weights: { ...STRATEGY_PRESETS.sport_jeunes },
  activePreset: 'sport_jeunes',
  minPopulation: 5000,
  selectedRadiusKm: 2,
  selectedDepartment: 'all',
  showPodologuesLayer: false,
};

const scoredSport = computeOpportunityScores(zonesGeoJSON.features, filtersSportJeunes);
const top10Sport = getTop10Zones(scoredSport, 'all');
top10Sport.forEach((f, i) => {
  const p = f.properties;
  console.log(
    `#${i + 1} ${p.nom} (${p.departement}) -> Score: ${p.score} | Licenciés Sport: ${p.nb_licencies_sport} | Enfants 0-14: ${p.pop_0_14} | Podos 2km: ${p.nb_podologues_2km}`
  );
});

if (top10Sport.length < 10) {
  throw new Error(`Expected 10 zones in Sport top 10, got ${top10Sport.length}`);
}

// Check that top sport communes have active licenses and young demographics
for (const f of top10Sport) {
  if ((f.properties.nb_licencies_sport || 0) < 500) {
    throw new Error(`Expected at least 500 licensed sports participants in top sport spot, got ${f.properties.nb_licencies_sport} in ${f.properties.nom}`);
  }
}

// 5. Test Criterion 'sport' ranking
const top10BySportCriterion = getTop10Zones(scoredSport, 'all', 'sport');
console.log('\n--- TOP 10 CRITÈRE SPORTIF DIRECT (LICENCIÉS) ---');
top10BySportCriterion.forEach((f, i) => {
  const p = f.properties;
  console.log(`#${i + 1} ${p.nom} (${p.departement}) -> ${p.nb_licencies_sport} licenciés (${p.nb_clubs_sport} clubs, foot: ${p.licencies_football}, tennis: ${p.licencies_tennis}, athlé: ${p.licencies_athletisme})`);
});

// Highest spot must have the highest licenses
if (top10BySportCriterion[0].properties.nb_licencies_sport < top10BySportCriterion[1].properties.nb_licencies_sport) {
  throw new Error('Ranking by sport criterion must be descending by nb_licencies_sport');
}

// 6. Test Criterion 'jeunes' ranking
const top10ByJeunesCriterion = getTop10Zones(scoredSport, 'all', 'jeunes');
console.log('\n--- TOP 10 CRITÈRE ENFANTS & FAMILLES (0-14 ANS) ---');
top10ByJeunesCriterion.forEach((f, i) => {
  const p = f.properties;
  console.log(`#${i + 1} ${p.nom} (${p.departement}) -> ${p.pop_0_14} enfants 0-14 ans (part: ${((p.part_0_14 || 0) * 100).toFixed(1)}%, parents 30-44: ${p.pop_30_44})`);
});

if (top10ByJeunesCriterion[0].properties.pop_0_14 < top10ByJeunesCriterion[1].properties.pop_0_14) {
  throw new Error('Ranking by jeunes criterion must be descending by pop_0_14');
}

// 7. Test color mapping
const cLow = getColorForScore(15);
const cHigh = getColorForScore(85);
const cExcl = getColorForScore(0, true);
console.log(`\nColors: Low=${cLow}, High=${cHigh}, Excluded=${cExcl}`);

// 8. Test Commercial Rent Benchmarks
console.log('\n--- TEST DU MODÈLE DE LOYERS COMMERCIAUX ---');
const rentParisHigh = getEstimatedRent('75', '75116', 38000);
const rentParisStd = getEstimatedRent('75', '75119', 28000);
const rent92 = getEstimatedRent('92', '92050', 32000);
const rent78 = getEstimatedRent('78', '78551', 34000);
const rent93 = getEstimatedRent('93', '93005', 18000);
console.log(`Paris (riche): ${rentParisHigh.loyerM2} €/m² (${rentParisHigh.loyerMensuel45m2} €/mois pour 45m²)`);
console.log(`Paris (std): ${rentParisStd.loyerM2} €/m² (${rentParisStd.loyerMensuel45m2} €/mois)`);
console.log(`92 (Issy/Neuilly): ${rent92.loyerM2} €/m² (${rent92.loyerMensuel45m2} €/mois)`);
console.log(`78 (St-Germain): ${rent78.loyerM2} €/m² (${rent78.loyerMensuel45m2} €/mois)`);
console.log(`93 (Aulnay): ${rent93.loyerM2} €/m² (${rent93.loyerMensuel45m2} €/mois)`);

if (rentParisHigh.loyerM2 <= rent93.loyerM2) {
  throw new Error('Paris commercial rent should be higher than Seine-Saint-Denis');
}

// Check that scored features all contain estimated rents
for (const f of scoredSport.slice(0, 50)) {
  if (!f.properties.loyer_m2_estime || !f.properties.loyer_mensuel_estime) {
    throw new Error(`Missing rent estimation on zone ${f.properties.nom}`);
  }
}

// 9. Test Interactive Financial Simulator
console.log('\n--- TEST DU SIMULATEUR FINANCIER LIBÉRAL ---');
const simResult = simulateCabinetFinancials({
  daysPerWeek: 5,
  patientsPerDay: 8,
  pctSemelles: 0.45,
  tarifSemelles: 175,
  tarifSoins: 38,
  loyerMensuel: 950,
});

console.log(`Sim: CA brut = ${simResult.caBrutMonth} €/m (${simResult.caBrutYear} €/an)`);
console.log(`Sim: Charges fixes = ${simResult.chargesFixesMonth} €/m (loyer + doctolib/rcp/eau/edf)`);
console.log(`Sim: Cotisations sociales TNS = ${simResult.cotisationsSocialesMonth} €/m`);
console.log(`Sim: Bénéfice net estimé = ${simResult.beneficeNetMonth} €/m (${simResult.beneficeNetYear} €/an) [Marge: ${simResult.tauxMargeNet}%]`);
console.log(`Sim: Diagnostic = ${simResult.viabiliteLabel}`);

if (simResult.beneficeNetMonth <= 0 || simResult.caBrutMonth <= 0) {
  throw new Error('Simulation should produce positive turnover and net income');
}
if (simResult.beneficeNetMonth < 3500) {
  throw new Error(`Expected comfortable income for 8 patients/day, got ${simResult.beneficeNetMonth} €`);
}

console.log('\n>>> TOUS LES TESTS DES PROFILS STRATÉGIQUES, SPORT, JEUNES, LOYERS & SIMULATEUR SONT VALIDÉS [OK] <<<');
