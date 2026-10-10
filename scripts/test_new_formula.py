import json

with open('public/data/zones.geojson', 'r', encoding='utf-8') as f:
    data = json.load(f)

features = data['features']

def compute_test_scores(min_pop=2500, radius_km=2):
    radius_podo_key = f'nb_podologues_{radius_km}km'
    
    # 1. Filter active features
    active = []
    for f in features:
        p = f['properties']
        if p['pop_totale'] >= min_pop:
            active.append(f)
            
    print(f"Total communes actives (pop >= {min_pop}): {len(active)} / {len(features)}")
    
    # Extract values for percentiles
    incomes = [f['properties']['potentiel_semelles'] for f in active]
    # For competition: we want FEW podologues relative to population
    # Let's compute podologues per 10k pop (or per 10k seniors)
    # The fewer podologues, the better the score!
    densities = []
    for f in active:
        p = f['properties']
        podos = p.get(radius_podo_key, p.get('nb_podologues_rayon', 0))
        # Density per 10k inhabitants
        dens_pop = (podos / max(1, p['pop_totale'])) * 10000.0
        densities.append(dens_pop)
        
    def get_percentiles(vals):
        n = len(vals)
        indexed = sorted(enumerate(vals), key=lambda x: x[1])
        pcts = [0] * n
        for rank, (orig_idx, _) in enumerate(indexed):
            pcts[orig_idx] = (rank / (n - 1)) * 100.0
        return pcts

    pct_income = get_percentiles(incomes)
    # Concurrence inverted: less density = high score
    pct_density = get_percentiles(densities)
    pct_conc_inv = [100.0 - p for p in pct_density]
    
    # Compute composite with SATURATION PENALTY
    results = []
    for i, f in enumerate(active):
        p = f['properties']
        p_inc = pct_income[i]
        p_conc = pct_conc_inv[i]
        podos = p.get(radius_podo_key, 0)
        
        # Base opportunity: 45% competition + 40% income + 15% demand
        base = 0.45 * p_conc + 0.40 * p_inc + 0.15 * (p['part_65plus'] * 100)
        
        # Saturation Penalty:
        # If podos in 2km >= 20, or if p_conc < 25 (very saturated):
        # The opportunity must be penalized heavily!
        mult = 1.0
        if podos >= 40:
            mult = 0.35 # Extreme saturation like Vincennes (55 podos) or Levallois (97 podos)
        elif podos >= 20:
            mult = 0.60 # Strong saturation like Nogent (26 podos)
        elif podos >= 12:
            mult = 0.80
        elif p_conc < 20:
            mult = 0.50
            
        final_score = base * mult
        
        results.append({
            'nom': p['nom'],
            'dept': p['departement'],
            'pop': p['pop_totale'],
            'podos_2km': podos,
            'rev': p['revenu_median'],
            'score': final_score,
            'p_conc': p_conc,
            'p_inc': p_inc
        })
        
    results.sort(key=lambda x: -x['score'])
    return results

print("=== NOUVEAU CLASSEMENT AVEC PÉNALITÉ DE SATURATION ===")
res = compute_test_scores(min_pop=2500)

print("\n--- TOP 15 ÎLE-DE-FRANCE ---")
for i, r in enumerate(res[:15]):
    print(f"#{i+1:2d} {r['nom']:28s} ({r['dept']}) | Score: {r['score']:5.1f} | Rev: {r['rev']:5d} € | Podos 2km: {r['podos_2km']:2d} | Pop: {r['pop']:6,d}")

print("\n--- VÉRIFICATION DE VINCENNES, NOGENT, LEVALLOIS ---")
for r in res:
    if r['nom'] in ['Vincennes', 'Nogent-sur-Marne', 'Levallois-Perret', 'Saint-Maur-des-Fossés']:
        print(f"  {r['nom']:25s} ({r['dept']}) -> Score: {r['score']:5.1f} | Rang: {res.index(r)+1}e / {len(res)} | Podos 2km: {r['podos_2km']}")

print("\n--- TOP 10 EN SEINE-ET-MARNE (77) ---")
res_77 = [r for r in res if r['dept'] == '77']
for i, r in enumerate(res_77[:10]):
    print(f"#{i+1:2d} {r['nom']:28s} | Score: {r['score']:5.1f} | Rev: {r['rev']:5d} € | Podos 2km: {r['podos_2km']:2d} | Pop: {r['pop']:6,d}")
