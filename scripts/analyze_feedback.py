import json

with open('public/data/zones.geojson', 'r', encoding='utf-8') as f:
    data = json.load(f)

features = data['features']

print("=== 1. ANALYSE DE VINCENNES, NOGENT-SUR-MARNE ET LEVALLOIS ===")
for f in features:
    p = f['properties']
    if p['nom'] in ['Vincennes', 'Nogent-sur-Marne', 'Levallois-Perret', 'Saint-Maur-des-Fossés']:
        ratio_zone = p['pop_totale'] / max(1, p['nb_podologues'])
        print(f"-> {p['nom']} ({p['departement']}):")
        print(f"   Population: {p['pop_totale']:,} hab. | Seniors 65+: {p['pop_65plus']:,} hab.")
        print(f"   Cabinets dans la commune: {p['nb_podologues']} (soit 1 podologue pour {ratio_zone:.0f} hab)")
        print(f"   Cabinets dans un rayon de 2 km: {p['nb_podologues_2km']} podologues !")
        print(f"   Revenu médian: {p['revenu_median']} €/an")
        print(f"   Score actuel: {p.get('score', 'N/A')}")
        print()

print("\n=== 2. ANALYSE SEINE-ET-MARNE (77) & PETITES VILLES (Pop >= 2 000 hab, bon pouvoir d'achat, peu de podologues) ===")
candidates = []
for f in features:
    p = f['properties']
    pop = p['pop_totale']
    nb_podo = p['nb_podologues']
    podo_2km = p['nb_podologues_2km']
    rev = p.get('revenu_median', 0)
    dept = p['departement']
    
    # Hab per podologue
    hab_per_podo = pop / nb_podo if nb_podo > 0 else 99999
    
    if pop >= 2000 and rev >= 24000:
        candidates.append({
            'nom': p['nom'],
            'dept': dept,
            'pop': pop,
            'podo_commune': nb_podo,
            'podo_2km': podo_2km,
            'rev': rev,
            'hab_per_podo': hab_per_podo
        })

# Filter for real low competition (podo_2km <= 3 or hab_per_podo >= 3500)
good_opps = [c for c in candidates if c['podo_2km'] <= 2 or c['hab_per_podo'] >= 3500]
good_opps.sort(key=lambda x: (x['podo_2km'], -x['rev']))

print(f"Total opportunités trouvées (pop >= 2000, rev >= 24k€, podos 2km <= 2): {len(good_opps)}")
for c in good_opps[:20]:
    commune_podo = f"{c['podo_commune']} podo" if c['podo_commune'] > 0 else "0 podo (DÉSERT)"
    print(f"  {c['nom']:28s} ({c['dept']}) | Pop: {c['pop']:6,d} | Commune: {commune_podo:15s} | 2km: {c['podo_2km']} podo | Rev: {c['rev']:5d} € | Ratio: 1 pour {c['hab_per_podo']:.0f} hab")
