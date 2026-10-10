# Carte d'opportunités – Cabinet de Pédicurie-Podologie (Île-de-France)

Outil d'aide à la décision interactif pour l'installation d'un cabinet de podologie en Île-de-France.
L'application met en évidence sur une carte interactive, par zone (commune / arrondissement), où la demande potentielle (seniors, prévalence du diabète) est forte et la concurrence médicale faible.

> ⚠️ **Avertissement :** Ce score est une aide à la décision, pas une prévision de chiffre d'affaires. L'outil ne dispense pas d'une étude de terrain approfondie (rencontre des professionnels de santé locaux, vérification des locaux disponibles, etc.).

---

## 🚀 Fonctionnalités
- **Carte interactive plein écran** avec choroplèthe coloré selon le score d'opportunité calculé en temps réel.
- **Visualisation des cabinets existants** (points géocodés anonymes, respect du RGPD et des praticiens).
- **Curseurs de pondération dynamiques** : Demande (65+), Concurrence inversée, Diabète, Zonage ARS.
- **Filtres interactifs** : Par département (75, 92, 93, 94 pour V1 ; 77, 78, 91, 95 pour V2), seuil de population minimale, rayon de concurrence (1 km, 2 km, 3 km).
- **Fiche détaillée de zone** : Métriques brutes, score global, rang départemental, décomposition en barres par critère.
- **Top 10 instantané** cliquable avec centrage et zoom sur la commune.

---

## 📊 Jalons du projet

| Jalon | Statut | Description |
|---|---|---|
| **Jalon 1 – Données brutes** | ✅ Terminé | Extraction & déduplication RPPS (1 780 lieux, 1 575 praticiens), INSEE (143 zones), Géocodage BAN à 97,30% (>95% requis) |
| **Jalon 2 – Agrégation & export** | ⏳ En cours | Calcul des métriques par commune, rayons 1/2/3km, tests unitaires, contrôle 3 communes |
| **Jalon 3 – Carte de base** | ⏳ À venir | Frontend statique Vite + MapLibre GL JS, choroplèthe, points cabinets, clic zone |
| **Jalon 4 – Score interactif** | ⏳ À venir | Curseurs temps réel, filtres, Top 10 dynamique, tests du moteur de calcul |
| **Jalon 5 – Finition & déploiement** | ⏳ À venir | Configuration Netlify, balise noindex, citations des licences et documentation |
| **Jalon 6 – V2 Extension Île-de-France**| ⏳ À venir | Support paramétrable étendu à toute l'IDF (75, 77, 78, 91, 92, 93, 94, 95) et documentation IRIS |

---

## 🛠️ Installation & Commandes

### Pré-requis
- Python 3.10+
- Node.js 18+ et npm

### Installation
```bash
# 1. Dépendances Python
python -m venv .venv
# Sur Windows :
.\.venv\Scripts\Activate.ps1
# Sur macOS/Linux :
source .venv/bin/activate

pip install -r requirements.txt

# 2. Dépendances Frontend
npm install
```

### Régénération complète des données (Pipeline)
```bash
python -m pipeline.run
# ou
npm run data
# ou (si make est installé)
make data
```

### Lancement du serveur local
```bash
npm run dev
```

### Tests
```bash
python -m pytest tests/
```

### Build pour production
```bash
npm run build
```
