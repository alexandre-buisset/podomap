import json
import pandas as pd
import numpy as np

with open('public/data/zones.geojson', 'r', encoding='utf-8') as f:
    zones = json.load(f)

df_inc = pd.read_csv('data/raw/revenu_communes.csv', sep=';', encoding='utf-8', dtype={'Code géographique': str})
df_inc['code'] = df_inc['Code géographique'].str.strip()
df_indexed = df_inc.set_index('code')

med_col = df_inc.columns[7]  # [DISP] Médiane (€)
imp_col = df_inc.columns[35] # [DEC] Part des ménages fiscaux imposés (%)
soc_col = df_inc.columns[27] # [DISP] Part de l'ensemble des prestations sociales (%)

values = []
for f in zones['features']:
    props = f['properties']
    c = props['code_insee']
    nom = props['nom']
    dept = props['departement']
    pop = props['pop_totale']
    pop65 = props['pop_65plus']
    pod = props['nb_podologues']
    density2k = props.get('densite_10k_65plus_2km', 0)
    transit = props.get('score_transport', 50)
    time_paris = props.get('temps_paris_min', 99)
    diab = props.get('prevalence_diabete', 5.0)

    if c in df_indexed.index:
        row = df_indexed.loc[c]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        med = pd.to_numeric(row[med_col], errors='coerce')
        imp = pd.to_numeric(row[imp_col], errors='coerce')
        soc = pd.to_numeric(row[soc_col], errors='coerce')
    else:
        med = np.nan
        imp = np.nan
        soc = np.nan

    values.append({
        'code': c,
        'nom': nom,
        'dept': dept,
        'pop': pop,
        'pop65': pop65,
        'pod': pod,
        'densite_2km': density2k,
        'transit': transit,
        'temps_paris': time_paris,
        'diab': diab,
        'med': med,
        'imp': imp,
        'soc': soc
    })

df = pd.DataFrame(values)
# Fill missing with IDF medians
df['med'] = df['med'].fillna(df['med'].median())
df['imp'] = df['imp'].fillna(df['imp'].median())
df['soc'] = df['soc'].fillna(df['soc'].median())

# Estimate average insole price based on purchasing power:
# Base price 130€ in low-income, up to 210€ in very high income
# Formula: 130 + (normalized income 0..1) * 80
med_min, med_max = df['med'].quantile(0.05), df['med'].quantile(0.95)
norm_inc = (df['med'] - med_min) / (med_max - med_min)
norm_inc = norm_inc.clip(0, 1)
df['tarif_semelles_estime'] = (130 + norm_inc * 80).round().astype(int)

# Filter for communes >= 5000 pop
df_filt = df[df['pop'] >= 5000].copy()

# Percentiles
df_filt['pct_income'] = df_filt['med'].rank(pct=True) * 100
df_filt['pct_imposed'] = df_filt['imp'].rank(pct=True) * 100
df_filt['score_pouvoir_achat'] = (df_filt['pct_income'] * 0.7 + df_filt['pct_imposed'] * 0.3).round(1)

df_filt['pct_concurrence'] = 100.0 - (df_filt['densite_2km'].rank(pct=True) * 100)
df_filt['pct_demande65'] = df_filt['pop65'].rank(pct=True) * 100
df_filt['pct_diabete'] = df_filt['diab'].rank(pct=True) * 100
df_filt['pct_transit'] = df_filt['transit'].rank(pct=True) * 100

# 1. Profil Semelles & Rentabilité:
# 35% Pouvoir d'Achat, 30% Faible Concurrence, 20% Seniors 65+, 10% Transports, 5% Diabète
df_filt['score_semelles'] = (
    0.35 * df_filt['score_pouvoir_achat'] +
    0.30 * df_filt['pct_concurrence'] +
    0.20 * df_filt['pct_demande65'] +
    0.10 * df_filt['pct_transit'] +
    0.05 * df_filt['pct_diabete']
).round(1)

# 2. Profil Équilibré:
# 25% Pouvoir d'Achat, 35% Faible Concurrence, 25% Seniors 65+, 10% Transports, 5% Diabète
df_filt['score_equilibre'] = (
    0.25 * df_filt['score_pouvoir_achat'] +
    0.35 * df_filt['pct_concurrence'] +
    0.25 * df_filt['pct_demande65'] +
    0.10 * df_filt['pct_transit'] +
    0.05 * df_filt['pct_diabete']
).round(1)

# 3. Profil Médical & Diabète (pure désert médical):
# 45% Faible Concurrence, 35% Seniors 65+, 10% Diabète, 10% Transports
df_filt['score_medical'] = (
    0.45 * df_filt['pct_concurrence'] +
    0.35 * df_filt['pct_demande65'] +
    0.10 * df_filt['pct_diabete'] +
    0.10 * df_filt['pct_transit']
).round(1)

print("\n" + "="*70)
print("TOP 10 - PROFIL 1: SEMELLES & RENTABILITE (Petite Couronne 75/92/93/94)")
print("="*70)
pc = df_filt[df_filt['dept'].isin(['75', '92', '93', '94'])].sort_values('score_semelles', ascending=False).head(10)
for idx, (_, r) in enumerate(pc.iterrows(), 1):
    print(f"#{idx:2d} {r['nom']} ({r['dept']}) | Score: {r['score_semelles']} | Revenu: {r['med']:.0f} EUR | Tarif Semelles: {r['tarif_semelles_estime']} EUR | Podologues: {r['pod']} | Temps Paris: {r['temps_paris']:.0f}min")

print("\n" + "="*70)
print("TOP 10 - PROFIL 1: SEMELLES & RENTABILITE (Toute l'IDF)")
print("="*70)
idf_top = df_filt.sort_values('score_semelles', ascending=False).head(10)
for idx, (_, r) in enumerate(idf_top.iterrows(), 1):
    print(f"#{idx:2d} {r['nom']} ({r['dept']}) | Score: {r['score_semelles']} | Revenu: {r['med']:.0f} EUR | Tarif Semelles: {r['tarif_semelles_estime']} EUR | Podologues: {r['pod']} | Temps Paris: {r['temps_paris']:.0f}min")

print("\n" + "="*70)
print("TOP 10 - PROFIL 3: MEDICAL & DIABETE (Pure Désert / Ancien Modèle)")
print("="*70)
med_top = df_filt[df_filt['dept'].isin(['75', '92', '93', '94'])].sort_values('score_medical', ascending=False).head(10)
for idx, (_, r) in enumerate(med_top.iterrows(), 1):
    print(f"#{idx:2d} {r['nom']} ({r['dept']}) | Score: {r['score_medical']} | Revenu: {r['med']:.0f} EUR | Podologues: {r['pod']}")
