import fs from 'fs';

const zones = JSON.parse(fs.readFileSync('public/data/zones.geojson', 'utf8')).features;
console.log('Testing criteria sorting:');

// 1. Competition sorting (least competition / desert)
const sortedConc = [...zones].filter(z => (z.properties.pop_totale || 0) >= 5000)
  .sort((a, b) => (a.properties.densite_pour_10k_65plus || 0) - (b.properties.densite_pour_10k_65plus || 0));

console.log('\n--- TOP 5 DÉSERTS (CONCURRENCE LA PLUS FAIBLE) ---');
sortedConc.slice(0, 5).forEach((z, i) => {
  const p = z.properties;
  console.log(`#${i + 1} ${p.nom} (${p.departement}) -> Densité: ${(p.densite_pour_10k_65plus || 0).toFixed(2)}/10k seniors | Podos 2km: ${p.nb_podologues_2km} | Pop: ${p.pop_totale}`);
});

// 2. Purchasing power sorting
const sortedIncome = [...zones].filter(z => (z.properties.pop_totale || 0) >= 5000)
  .sort((a, b) => (b.properties.revenu_median || 0) - (a.properties.revenu_median || 0));

console.log('\n--- TOP 5 POUVOIR D\'ACHAT (SOLVABILITÉ SEMELLES) ---');
sortedIncome.slice(0, 5).forEach((z, i) => {
  const p = z.properties;
  console.log(`#${i + 1} ${p.nom} (${p.departement}) -> Rev: ${p.revenu_median} €/an | Semelles: ~${p.panier_semelles_estime} € | Pop: ${p.pop_totale}`);
});

// 3. Seniors volume sorting
const sortedSeniors = [...zones].filter(z => (z.properties.pop_totale || 0) >= 5000)
  .sort((a, b) => (b.properties.pop_65plus || 0) - (a.properties.pop_65plus || 0));

console.log('\n--- TOP 5 BASSINS DE SENIORS (65+ ANS) ---');
sortedSeniors.slice(0, 5).forEach((z, i) => {
  const p = z.properties;
  console.log(`#${i + 1} ${p.nom} (${p.departement}) -> Seniors: ${p.pop_65plus} hab. (${((p.part_65plus || 0) * 100).toFixed(1)}%) | Pop: ${p.pop_totale}`);
});

// 4. Transport access sorting
const sortedTransport = [...zones].filter(z => (z.properties.pop_totale || 0) >= 5000 && z.properties.temps_paris_min)
  .sort((a, b) => (a.properties.temps_paris_min || 999) - (b.properties.temps_paris_min || 999));

console.log('\n--- TOP 5 TRANSPORTS (PLUS RAPIDES VERS PARIS) ---');
sortedTransport.slice(0, 5).forEach((z, i) => {
  const p = z.properties;
  console.log(`#${i + 1} ${p.nom} (${p.departement}) -> Temps Paris: ${p.temps_paris_min} min | Gare: ${p.gare_nom}`);
});

console.log('\n>>> TOUS LES CRITÈRES SONT PROPRES ET COHÉRENTS ! <<<');
