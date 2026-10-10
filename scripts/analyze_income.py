import json
import pandas as pd

with open('public/data/zones.geojson', 'r', encoding='utf-8') as f:
    zones = json.load(f)

df = pd.read_csv('data/raw/revenu_communes.csv', sep=';', encoding='utf-8', dtype={'Code géographique': str})
df['code'] = df['Code géographique'].str.strip()
df_indexed = df.set_index('code')

med_col = df.columns[7] # [DISP] Médiane (€)
imp_col = df.columns[35] # [DEC] Part des ménages fiscaux imposés (%)
soc_col = df.columns[27] # [DISP] Part de l'ensemble des prestations sociales (%)

values = []
for f in zones['features']:
    c = f['properties']['code_insee']
    nom = f['properties']['nom']
    dept = f['properties']['departement']
    pop = f['properties']['pop_totale']
    pod = f['properties']['nb_podologues']
    if c in df_indexed.index:
        row = df_indexed.loc[c]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        med = pd.to_numeric(row[med_col], errors='coerce')
        imp = pd.to_numeric(row[imp_col], errors='coerce')
        soc = pd.to_numeric(row[soc_col], errors='coerce')
        values.append({
            'code': c,
            'nom': nom,
            'dept': dept,
            'pop': pop,
            'pod': pod,
            'med': med,
            'imp': imp,
            'soc': soc
        })

df_res = pd.DataFrame(values)
print('--- Summary of Median Income (EUR) ---')
print(df_res['med'].describe())

print('\n--- Summary by Department ---')
print(df_res.groupby('dept')['med'].agg(['count', 'mean', 'median', 'min', 'max']))

print('\n--- Top 10 communes (> 5k pop) by median income ---')
top_pop = df_res[df_res['pop'] >= 5000].sort_values('med', ascending=False).head(10)
for _, r in top_pop.iterrows():
    print(f"{r['code']} {r['nom']} ({r['dept']}): {r['med']:.0f} EUR | Imposes: {r['imp']}% | Pop: {r['pop']} | Podologues: {r['pod']}")

print('\n--- Bottom 10 communes (> 5k pop) by median income ---')
bot_pop = df_res[df_res['pop'] >= 5000].sort_values('med', ascending=True).head(10)
for _, r in bot_pop.iterrows():
    print(f"{r['code']} {r['nom']} ({r['dept']}): {r['med']:.0f} EUR | Imposes: {r['imp']}% | Pop: {r['pop']} | Podologues: {r['pod']}")
