export interface ZoneProperties {
  code_insee: string;
  nom: string;
  departement: string;
  pop_totale: number;
  pop_65plus: number;
  part_65plus: number;
  nb_podologues: number;
  nb_podologues_1km: number;
  nb_podologues_2km: number;
  nb_podologues_3km: number;
  nb_podologues_rayon: number;
  pop_65plus_1km: number;
  pop_65plus_2km: number;
  pop_65plus_3km: number;
  densite_10k_65plus_1km: number;
  densite_10k_65plus_2km: number;
  densite_10k_65plus_3km: number;
  densite_pour_10k_65plus: number;
  coef_diabete: number;
  prevalence_diabete: number;
  zonage: string;
  centroide_lat: number;
  centroide_lon: number;
  // Transit accessibility metrics
  gare_nom?: string;
  gare_dist_km?: number;
  gare_mode?: string;
  gare_lignes?: string[];
  nb_gares_1_5km?: number;
  modes_transport?: string[];
  temps_paris_min?: number;
  score_transport?: number;
  // Income & Purchasing Power metrics (INSEE Filosofi)
  revenu_median?: number;
  taux_imposition?: number;
  part_prestations_sociales?: number;
  panier_semelles_estime?: number;
  potentiel_semelles?: number;
  // Dynamic frontend-computed properties
  score?: number;
  score_pouvoir_achat?: number;
  score_demande?: number;
  score_concurrence?: number;
  score_diabete?: number;
  score_zonage?: number;
  score_transit?: number;
  concurrence_niveau?: 'tres_faible' | 'faible' | 'moderee' | 'elevee' | 'saturee';
  concurrence_label?: string;
  concurrence_color?: string;
  ratio_hab_par_podo?: number;
  ratio_hab_label?: string;
  ratio_hab_color?: string;
  pouvoir_achat_label?: string;
  is_excluded?: boolean;
  rank_global?: number;
  rank_dept?: number;
  total_in_dept?: number;
  // Data reliability & transparency flags
  has_insee_income?: boolean;
  fiabilite_revenu?: string;
  revenu_source?: string;
  qualite_donnees?: string;
  ratio_hab_commune?: number;
  color?: string;
}

export interface ZoneFeature {
  type: 'Feature';
  properties: ZoneProperties;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
}

export interface ZonesGeoJSON {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

export interface PodologueFeature {
  type: 'Feature';
  properties: {
    id: number;
    dept: string;
    code_insee: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export interface PodologuesGeoJSON {
  type: 'FeatureCollection';
  features: PodologueFeature[];
}

export type StrategyPreset = 'semelles' | 'equilibre' | 'medical' | 'custom';

export type MapDisplayCriterion = 'score_global' | 'concurrence' | 'pouvoir_achat' | 'seniors' | 'transports';

export interface ScoreWeights {
  pouvoir_achat_semelles: number; // default 30 (Revenu disponible & solvabilité semelles)
  concurrence_inv: number; // default 30 (Faible concurrence podologues)
  demande_65plus: number; // default 25 (Bassin seniors 65+)
  transport_access: number; // default 10 (Accessibilité gares & temps Paris)
  coef_diabete: number; // default 5 (Sur-incidence diabète ALD)
  bonus_zonage: number; // default 0 (Aides ARS éventuelles)
}

export interface FilterSettings {
  weights: ScoreWeights;
  activePreset: StrategyPreset;
  displayCriterion: MapDisplayCriterion; // default 'score_global'
  minPopulation: number; // default 5000
  selectedRadiusKm: number; // 1, 2, or 3
  selectedDepartment: string; // 'all' or '75', '92', etc.
  showPodologuesLayer: boolean; // default false
  showTransportsLayer: boolean; // default true
  showCityLabels: boolean; // default true
  maxTransitTimeParis?: number; // 0 = all, 25, 40, 60
  requireTransitStation?: boolean; // false
  minRatioHabPodo?: 'all' | 'desert' | '3000' | '2500' | '1800'; // filter by practitioner ratio
  maxConcurrencePodos?: number; // 0 = all, or 0, 1, 2, 5, 10 max podos in radius
}

export interface Metadata {
  generated_at: string;
  departments: string[];
  total_zones: number;
  total_podologues_points: number;
  total_population: number;
  total_65plus: number;
  radii_km: number[];
  default_radius_km: number;
  default_min_population: number;
  diabetes_idf_avg_pct: number;
  sources: Record<string, string>;
}
