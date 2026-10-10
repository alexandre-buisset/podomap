# Carte d'Opportunités – Cabinet de Pédicurie-Podologie (Île-de-France)

Outil d'aide à la décision interactif pour l'installation d'une pédicure-podologue en Île-de-France.
L'application met en évidence sur une carte interactive, par zone (commune / arrondissement), où la demande potentielle (seniors 65+, prévalence du diabète) est forte et la concurrence médicale existante est faible.

> ⚠️ **Avertissement méthodologique :** Ce score est un outil comparatif d'aide à la décision, pas une prévision de chiffre d'affaires. L'outil ne dispense pas d'une étude de terrain approfondie (rencontre des médecins traitants, kinésithérapeutes, diabétologues, EHPAD locaux, et vérification des loyers et des locaux disponibles).

---

## 🚀 Fonctionnalités Clés
- **Carte interactive plein écran** : Rendu vectoriel fluide (MapLibre GL JS & OpenFreeMap) avec choroplèthe coloré selon le score d'opportunité en temps réel.
- **Points des cabinets existants** : 3 084 lieux d'exercice répertoriés en Île-de-France, anonymisés (respect strict du RGPD et déontologie).
- **Curseurs de pondération dynamiques** :
  - *Demande Seniors (65 ans et plus)* (défaut : 35 %)
  - *Concurrence inversée (Densité de podologues)* (défaut : 40 %)
  - *Besoin Diabète (Assurance Maladie)* (défaut : 10 %)
  - *Bonus Zonage conventionnel ARS* (défaut : 15 %, redistribué si non renseigné)
- **Filtres interactifs instantanés** :
  - Filtre par département (Tous IDF, 75, 92, 93, 94, 77, 78, 91, 95)
  - Rayon d'influence concurrentielle paramétrable (1 km, 2 km [défaut], 3 km)
  - Seuil de population minimale (défaut : 5 000 hab., communes sous le seuil grisées)
- **Fiche détaillée de zone** : Décomposition du score en percentiles, rang départemental, tableau complet des données brutes et ratios.
- **Top 10 instantané** : Cliquable avec centrage automatique et zoom sur la commune.
- **Architecture statique ultra-rapide** : Chargement < 100 ms, calcul du score en < 2 ms côté navigateur.

---

## 📊 Jalons du Projet & Critères d'Acceptation

| Jalon | Statut | Réalisations & Critères d'Acceptation |
|---|---|---|
| **Jalon 1 – Données brutes** | ✅ Terminé | Extraction RPPS (3 147 lieux, 2 711 praticiens), Recensement INSEE (1 286 zones). Géocodage BAN à **98,00 %** de succès (score moy: 0,944, critère >95 % validé). |
| **Jalon 2 – Agrégation & export** | ✅ Terminé | Calcul des métriques radiales (1, 2, 3 km), ratios par 10k seniors, export GeoJSON WGS84. Contrôle manuel sur 3 communes connues (Paris 15e, Boulogne, Montreuil) 100% conforme. 12 tests unitaires passés. |
| **Jalon 3 – Carte de base** | ✅ Terminé | Choroplèthe MapLibre GL JS, tuiles vectorielles sans clé API, couche des points cabinets activable, popups au survol, chargement instantané. |
| **Jalon 4 – Score interactif** | ✅ Terminé | Moteur de percentiles côté client (<2 ms), 4 curseurs temps réel, sélecteur de rayon 1/2/3 km, Top 10 dynamique réactif, tests de réactivité validés. |
| **Jalon 5 – Finition & déploiement** | ✅ Terminé | Fichier `netlify.toml`, balise `noindex, nofollow`, modal « Méthode & Sources » avec citations complètes et licences (Licence Ouverte, ODbL). Build statique en 1 commande. |
| **Jalon 6 – V2 Extension Île-de-France** | ✅ Terminé | Extension paramétrable à toute l'Île-de-France (75, 77, 78, 91, 92, 93, 94, 95) couvrant 12,3M d'habitants et 1 285 communes. Support de la maille IRIS documenté. |

---

## 🛠️ Installation & Commandes

### Pré-requis
- Python 3.10+
- Node.js 18+ et npm

### 1. Installation des dépendances
```bash
# Dépendances Python
python -m pip install -r requirements.txt

# Dépendances Node.js
npm install
```

### 2. Régénération des données (Pipeline Python)
Le pipeline télécharge, nettoie, géocode, agrège et exporte les GeoJSON en une seule commande reproductible :

```bash
# Petite Couronne V1 (75, 92, 93, 94)
python -m pipeline.run

# Toute l'Île-de-France V2 (75, 77, 78, 91, 92, 93, 94, 95)
python -m pipeline.run --all-idf

# Forcer le re-téléchargement et re-géocodage
python -m pipeline.run --all-idf --force
```

### 3. Exécution des tests
```bash
# Tests unitaires du pipeline de données et du moteur de score (12 tests)
python -m pytest tests/

# Contrôle manuel sur les 3 communes témoins
python -m tests.control_3_communes

# Test d'intégration du moteur frontend dans Node
node tests/test_frontend_engine.js
```

### 4. Lancement en local
```bash
npm run dev
# L'application est accessible sur : http://localhost:5173/
```

### 5. Build de production (Statique)
```bash
npm run build
# Génère l'application statique complète optimisée dans dist/
```

---

## 🌐 Déploiement sur Netlify

L'application est 100 % statique et prête pour un déploiement continu sur Netlify :
- **Build command :** `npm run build`
- **Publish directory :** `dist`
- **Configuration :** Fichier [netlify.toml](file:///c:/Users/alexa/Downloads/projets/etude-podologue/netlify.toml) inclus avec en-têtes de sécurité, mise en cache GeoJSON et instruction `X-Robots-Tag: noindex, nofollow`.

Déploiement direct via Netlify CLI :
```bash
npx netlify deploy --prod --dir=dist
```

---

## 📁 Architecture du Projet

```
etude-podologue/
├── .gitignore                      # Fichiers ignorés (cache raw lourd, dist)
├── Makefile                        # Raccourcis make (install, data, test, dev, build)
├── README.md                       # Documentation complète et guide d'usage
├── DATA_SOURCES.md                 # Registre documenté de toutes les sources ouvertes
├── DECISIONS.md                    # Registre des décisions techniques et méthodologiques
├── netlify.toml                    # Configuration de build et sécurité Netlify
├── package.json                    # Scripts npm et dépendances frontend
├── requirements.txt                # Dépendances Python (pandas, geopandas, requests, pytest)
├── tsconfig.json                   # Configuration TypeScript (ES2022)
├── vite.config.ts                  # Configuration du bundler Vite
├── pipeline/                       # Pipeline de données Python autonome
│   ├── config.py                   # URLs, départements, seuils et constantes
│   ├── download.py                 # Téléchargement avec cache des archives
│   ├── clean_rpps.py               # Extraction RPPS (podologues, déduplication lieux)
│   ├── geocode.py                  # Géocodage par lots via API Adresse (BAN)
│   ├── insee.py                    # Démographie & seniors par commune (Insee 2021)
│   ├── geo.py                      # Contours communaux & arrondissements de Paris
│   ├── diabetes.py                 # Prévalences départementales du diabète (Ameli)
│   ├── aggregate.py                # Calcul des rayons (1, 2, 3 km) et export GeoJSON
│   ├── report_jalon1.py            # Rapport qualité & acceptation du géocodage
│   └── run.py                      # Orchestrateur one-shot (python -m pipeline.run)
├── public/data/                    # GeoJSON exportés chargés par le frontend
│   ├── zones.geojson               # 1 285 polygones communaux avec toutes les métriques
│   ├── podologues.geojson          # 3 084 points géocodés anonymisés
│   └── metadata.json               # Métadonnées d'exécution et sources
├── src/                            # Code source Frontend
│   ├── main.ts                     # Orchestrateur de l'application web
│   ├── map.ts                      # Gestionnaire de carte MapLibre GL JS
│   ├── score.ts                    # Moteur de score d'opportunité en temps réel
│   ├── ui.ts                       # Gestionnaire d'interface (sidebar, tabs, sliders, Top 10)
│   ├── types.ts                    # Interfaces TypeScript
│   └── style.css                   # Design system moderne (glassmorphism, tokens)
├── tests/                          # Suite de tests automatisés
│   ├── test_jalon1.py              # Tests de conformité des données brutes
│   ├── test_jalon2.py              # Tests des calculs de rayon et des ratios
│   ├── test_score.py               # Tests unitaires du moteur de score
│   ├── control_3_communes.py       # Contrôle manuel sur Paris 15e, Boulogne, Montreuil
│   └── test_frontend_engine.js     # Test Node d'exécution du moteur compilé sur le GeoJSON
└── data/                           # Données brutes et intermédiaires
    ├── zonage_manuel.csv           # Fichier éditable pour zonage ARS optionnel
    └── interim/RAPPORT_JALON_1.md  # Rapport formel d'acceptation du géocodage
```

---

## 🔒 Déontologie & Conformité

1. **Anonymat des professionnels :** Aucun nom, prénom, numéro RPPS personnel ni coordonnée téléphonique de praticien n'est publié dans les fichiers `public/data/` ni affiché sur la carte.
2. **Pas de scraping :** Toutes les données proviennent d'extractions officielles ouvertes (*Open Data*) certifiées.
3. **Usage privé :** L'application intègre des balises d'exclusion des moteurs de recherche (`noindex, nofollow`) conformément aux spécifications d'un outil d'aide à la décision à usage personnel.
