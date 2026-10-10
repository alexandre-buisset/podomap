# Registre des Décisions d'Architecture et Méthodologiques (DECISIONS.md)

Ce document consigne les choix structurants, techniques et fonctionnels opérés pour le projet « Carte d'opportunités Cabinet de Podologie ».

---

## 1. Découpage géographique de Paris (Arrondissements vs Commune globale)
* **Contexte :** Paris (code 75056) compte 2,1 millions d'habitants répartis sur 20 arrondissements aux caractéristiques démographiques, économiques et concurrentielles radicalement différentes.
* **Décision :** Utiliser les 20 arrondissements (codes INSEE 75101 à 75120) comme unités géographiques de base pour Paris, et non la commune globale 75056.
* **Conséquences :**
  - Données démographiques INSEE agrégées à la maille arrondissement.
  - Contours géographiques récupérés via Open Data Paris.
  - La podologue peut comparer le 18e, le 15e ou le 4e arrondissement de manière distincte.

---

## 2. Déduplication des podologues RPPS
* **Contexte :** Dans le RPPS, un même praticien peut avoir plusieurs lignes d'activité (statut libéral, titulaire, remplaçant, exercice en cabinet partagé, ou déclaration multiple).
* **Décision :**
  1. Filtrage strict sur la profession code `80` (*Pédicure-Podologue*).
  2. Déduplication sur le couple `(Identifiant PP, Adresse normalisée)` : un praticien qui exerce effectivement à deux adresses distinctes (ex: 2 jours par semaine à Montreuil et 3 jours à Paris 12e) est compté comme une offre concurrente sur chaque site. En revanche, les doublons administratifs au sein du même cabinet sont ramenés à une seule occurrence.
  3. Aucun nom de famille, prénom ou numéro de téléphone n'est stocké dans les fichiers publics `public/data/` pour garantir la confidentialité et la conformité RGPD.

---

## 3. Stratégie de géocodage et seuil de qualité
* **Contexte :** L'API Adresse (`api-adresse.data.gouv.fr/search/csv/`) renvoie un score de confiance de 0 à 1 pour chaque géocodage.
* **Décision :**
  - Seuil d'acceptation fixé à `score >= 0.5`.
  - En cas d'échec de géocodage ou de score trop bas (<0.5), l'adresse est écartée du nuage de points et comptabilisée dans le rapport d'exécution de Jalon 1.
  - L'objectif d'acceptation du Jalon 1 (>95% de géocodage réussi) est surveillé dans le rapport.

---

## 4. Calcul du rayon de concurrence et projection spatiale
* **Contexte :** Pour chaque commune/zone, il faut compter les podologues dans un rayon de 1 km, 2 km et 3 km autour du centroïde de la zone.
* **Décision :**
  - Utilisation de la projection légale métrique française Lambert-93 (`EPSG:2154`) pour le calcul géodésique exact des distances à vol d'oiseau.
  - Calcul du centroïde géométrique pour chaque polygone communal.
  - Pré-calcul dans le GeoJSON des métriques pour les 3 rayons (1 km, 2 km, 3 km) :
    - `nb_podologues_1km`, `nb_podologues_2km`, `nb_podologues_3km`
    - `densite_10k_65plus_1km`, `densite_10k_65plus_2km`, `densite_10k_65plus_3km`
  - Cela permet au sélecteur de rayon dans le frontend d'ajuster instantanément le score sans latence.

---

## 5. Formule du Score d'Opportunité & Normalisation
* **Contexte :** Combiner la demande (population 65+, coefficient diabète) et la concurrence (densité pour 10 000 habitants 65+) sur une échelle de 0 à 100.
* **Décision :**
  - Normalisation par percentiles / min-max sur les zones éligibles (population >= seuil minimal, défaut 5 000 hab).
  - Poids par défaut :
    - Population 65+ : 35 % (plus il y a de seniors, plus le score monte)
    - Concurrence inversée : 40 % (moins il y a de podologues par 10k seniors, plus le score monte)
    - Prévalence diabète : 10 % (surpondère les départements à plus forte prévalence comme le 93)
    - Bonus zonage ARS : 15 % (si zone sous-dotée ; si zonage absent, les 15% sont redistribués proportionnellement sur les 3 autres critères).
  - Le calcul s'exécute côté client (TypeScript) en moins de 10 ms lors de la manipulation des curseurs.

---

## 6. Choix de la pile frontend et rendu cartographique
* **Contexte :** Web app statique, ultra-rapide (<3s au chargement), esthétique soignée, sans framework lourd, fonds de carte sans clé API requise.
* **Décision :**
  - Bundler : Vite avec TypeScript.
  - Moteur cartographique : MapLibre GL JS avec tuiles vectorielles libres OpenFreeMap (style Positron / Liberty fluide et haute définition) ou tuiles OSM raster en repli.
  - CSS Vanilla sur-mesure avec design tokens soignés : typographie moderne (Inter), mode sombre/clair raffiné, badges contrastés, animations subtiles, micro-interactions, responsive mobile et desktop.
  - Configuration de déploiement Netlify avec balise `noindex` conformément au cahier des charges.
