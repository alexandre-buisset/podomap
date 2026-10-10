# Sources de données – Carte d'opportunités Cabinet de Podologie (Île-de-France)

Ce document recense l'ensemble des sources ouvertes utilisées, leur URL officielle, leur format, les colonnes exploitées et leur modalité de mise à jour.

---

## 1. Annuaire Santé – RPPS (Extraction publique ANS)
* **Producteur :** Agence du Numérique en Santé (ANS)
* **Plateforme :** data.gouv.fr
* **Jeu de données :** *Annuaire Santé - Extractions des données en libre accès des professionnels intervenant dans le système de Santé (RPPS) - Format Zip*
* **URL de référence :** `https://www.data.gouv.fr/datasets/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps-format-zip/`
* **URL ressource ZIP directe :** `https://static.data.gouv.fr/resources/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps-format-zip/20261009-115247/ps-libreacces-202610091234.zip`
* **Licence :** Licence Ouverte 2.0 (Etalab)
* **Fichier interne exploité :** `PS_LibreAcces_Personne_activite_*.txt` (séparateur `|`, encodage UTF-8)
* **Filtres appliqués :**
  - Profession : `Code profession == '80'` ou `Libellé profession == 'Pédicure-Podologue'`
  - Territoire : Départements d'Île-de-France (`75`, `92`, `93`, `94` en V1, étendu à `77`, `78`, `91`, `95` en V2)
* **Colonnes exploitées :**
  - `Identifiant PP` : identifiant RPPS anonymisé pour déduplication
  - `Identifiant technique de la structure` : identifiant du cabinet
  - `Numéro Voie (coord. structure)`
  - `Libellé type de voie (coord. structure)`
  - `Libellé Voie (coord. structure)`
  - `Code postal (coord. structure)`
  - `Code commune (coord. structure)`
  - `Libellé commune (coord. structure)`
* **Éthique & RGPD :**
  - Aucun nom ni prénom n'est exporté ni affiché sur la carte.
  - Seuls les points d'exercice géocodés anonymes sont conservés pour évaluer la concurrence.

---

## 2. Géocodage des adresses – API Adresse
* **Producteur :** Direction Interministérielle du Numérique (DINUM) / Base Adresse Nationale (BAN)
* **Endpoint :** `https://api-adresse.data.gouv.fr/search/csv/` (POST multipart CSV en lot)
* **Licence :** Licence Ouverte (ODbL / BAN)
* **Colonnes envoyées :** adresse complète assemblée, code postal, code commune
* **Colonnes récupérées :** `longitude`, `latitude`, `result_score`, `result_citycode`, `result_type`
* **Contrôle qualité :** Seules les adresses avec `result_score >= 0.5` sont retenues. Les adresses non géocodées ou de score insuffisant sont comptabilisées dans le rapport d'exécution.

---

## 3. Recensement de la population – INSEE
* **Producteur :** Institut National de la Statistique et des Études Économiques (INSEE)
* **Jeu de données :** *Base de données infracommunale (IRIS et Communes) - Évolution et structure de la population*
* **URL de référence :** `https://www.insee.fr/fr/statistiques/8268806`
* **URL fichier ZIP :** `https://www.insee.fr/fr/statistiques/fichier/8268806/base-ic-evol-struct-pop-2021_csv.zip`
* **Licence :** Licence Ouverte (Etalab)
* **Colonnes exploitées :**
  - `COM` : Code INSEE communal (incluant les 20 arrondissements parisiens 75101 à 75120)
  - `P21_POP` : Population totale légale au recensement
  - `P21_POP65P` : Population âgée de 65 ans et plus
* **Calculs dérivés :** `part_65plus = P21_POP65P / P21_POP`

---

## 4. Contours géographiques administratifs
* **Producteurs :** IGN / DINUM / Ville de Paris
* **Départements 92, 93, 94, 77, 78, 91, 95 :**
  - API Découpage Administratif : `https://geo.api.gouv.fr/departements/{dep}/communes?format=geojson&geometry=contour`
  - Format : GeoJSON WGS84 (EPSG:4326)
* **Paris (Arrondissements 75101 à 75120) :**
  - Ville de Paris Open Data : `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson`
  - Justification : Paris ne peut pas être traitée comme une seule zone de 2 millions d'habitants ; le découpage par arrondissement permet d'analyser la concurrence et le profil de chaque quartier parisien avec fidélité.

---

## 5. Prévalence du diabète – Cartographie des pathologies (Assurance Maladie)
* **Producteur :** Caisse Nationale de l'Assurance Maladie (CNAM)
* **Plateforme :** data.ameli.fr
* **Jeu de données :** *Pathologies : effectif de patients par pathologie, sexe, classe d'âge et territoire (département, région)*
* **URL catalogue :** `https://data.ameli.fr/explore/dataset/effectifs/`
* **Périmètre extrait (données consolidées 2023) :**
  - Catégorie : `patho_niv1 = "Diabète"`
  - Sexe : `tous sexes` (`sexe = "9"`)
  - Classe d'âge : `tous âges` (`cla_age_5 = "tsage"`)
  - Taux par département :
    - 75 (Paris) : 4.89%
    - 92 (Hauts-de-Seine) : 4.98%
    - 94 (Val-de-Marne) : 6.00%
    - 93 (Seine-Saint-Denis) : 7.61%
    - 77 (Seine-et-Marne) : 6.28%
    - 78 (Yvelines) : 5.15%
    - 91 (Essonne) : 5.85%
    - 95 (Val-d'Oise) : 6.57%
  - Normalisation : `coef_diabete = prev_dept / moyenne_idf`

---

## 6. Zonage conventionnel (Aides à l'installation)
* **Source :** ARS Île-de-France / Assurance Maladie
* **Statut :** Contrairement aux médecins ou kinésithérapeutes, il n'existe pas d'arrêté opposable régulier de zonage conventionnel des podologues avec aides dédiées en open data structuré.
* **Solution mise en place :**
  - Fichier de configuration manuelle : `data/zonage_manuel.csv` éditable.
  - Comportement par défaut : si aucun zonage n'est spécifié, le poids de ce critère (15%) est redistribué de façon transparente sur les 3 autres critères (Demande et Concurrence).

---

## 7. Réseau de transport en commun – Île-de-France Mobilités (IDFM)
* **Producteur :** Île-de-France Mobilités (IDFM)
* **Plateforme :** data.iledefrance-mobilites.fr / data.gouv.fr
* **Jeux de données :**
  - *Emplacement des gares d'Île-de-France (donnée généralisée)* : `https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf-data-generalisee/` (999 gares et stations géolocalisées).
  - *Tracés du réseau ferré d'Île-de-France* : `https://data.iledefrance-mobilites.fr/explore/dataset/traces-du-reseau-ferre-idf/` (1 673 tronçons avec couleurs officielles en hexadécimal).
* **Licence :** Licence Ouverte 2.0 (Etalab)
* **Modes couverts :** Métro, RER, Train (Transilien / SNCF), Tramway.
* **Calculs dérivés par commune :**
  - `gare_nom` : Gare ou station la plus proche.
  - `gare_dist_km` : Distance à vol d'oiseau entre le centroïde et la gare.
  - `nb_gares_1_5km` : Dénombrement des gares accessibles à moins de 1.5 km.
  - `temps_paris_min` : Temps de trajet estimé vers Paris Châtelet en transport (modèle tenant compte de la distance d'accès à la gare et de la vitesse commerciale de chaque mode : RER ~50 km/h, Métro ~25 km/h, Train ~55 km/h).
  - `score_transport` : Indice d'accessibilité aux transports (0 à 100).

---

## 8. Fonds de carte – OpenStreetMap
* **Producteur :** Contributeurs OpenStreetMap
* **Tuiles cartographiques :** `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
* **Licence :** ODbL (Open Database License)
* **API Key :** Aucune clé d'API requise, 100% ouvert et gratuit.

---

## 9. Revenus, Fiscalité et Pouvoir d'Achat – INSEE Filosofi
* **Producteur :** Institut National de la Statistique et des Études Économiques (INSEE) / DGFiP
* **Plateforme :** data.gouv.fr / insee.fr
* **Jeu de données :** *Revenus des Français à la commune – Dispositif Filosofi (Fichier Localisé Social et Fiscal)*
* **URL ressource :** `https://static.data.gouv.fr/resources/revenu-des-francais-a-la-commune/20251210-134014/revenu-des-francais-a-la-commune-1765372688826.csv`
* **Licence :** Licence Ouverte (Etalab)
* **Colonnes exploitées :**
  - `Code géographique` : Code INSEE de la commune (incluant 75101 à 75120)
  - `[DISP] Médiane (€)` : Revenu disponible médian annuel par unité de consommation
  - `[DEC] Part des ménages fiscaux imposés (%)` : Taux de foyers imposables (proxy de mutuelles de bon niveau et d'absence de précarité)
  - `[DISP] Part de l'ensemble des prestations sociales (%)` : Taux d'aides sociales (indicateur de fragilité économique)
* **Indicateurs dérivés pour la podologie :**
  - `panier_semelles_estime` : Estimation du tarif moyen praticable pour un bilan postural + semelles orthopédiques (de 130 € à 210 €).
  - `potentiel_semelles` : Score synthétique (0 à 100) combinant revenu médian et taux de foyers imposés.
