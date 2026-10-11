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
  // Youth & Family demographics (INSEE Recensement 2021)
  pop_0_14?: number;
  pop_0_19?: number;
  pop_30_44?: number;
  part_0_14?: number;
  part_0_19?: number;
  ratio_jeunes_seniors?: number;
  // Sports licenses and clubs metrics (Ministère des Sports / INJEP 2023)
  nb_licencies_sport?: number;
  nb_clubs_sport?: number;
  licencies_jeunes?: number;
  licencies_football?: number;
  licencies_tennis?: number;
  licencies_athletisme?: number;
  licencies_basketball?: number;
  licencies_handball?: number;
  licencies_rugby?: number;
  licencies_running_sports?: number;
  taux_licencies_sport?: number;
  // Dynamic frontend-computed properties
  score?: number;
  score_pouvoir_achat?: number;
  score_demande?: number;
  score_concurrence?: number;
  score_diabete?: number;
  score_zonage?: number;
  score_transit?: number;
  score_sport?: number;
  score_jeunes?: number;
  concurrence_niveau?: 'tres_faible' | 'faible' | 'moderee' | 'elevee' | 'saturee';
  concurrence_label?: string;
  concurrence_color?: string;
  ratio_hab_par_podo?: number;
  ratio_hab_label?: string;
  ratio_hab_color?: string;
  pouvoir_achat_label?: string;
  is_excluded?: boolean;
  exclusion_reason?: string;
  rank_global?: number;
  rank_dept?: number;
  total_in_dept?: number;
  // Data reliability & transparency flags
  has_insee_income?: boolean;
  fiabilite_revenu?: string;
  revenu_source?: string;
  qualite_donnees?: string;
  ratio_hab_commune?: number;
  densite_podo_10k_hab?: number;
  densite_podo_100k_hab?: number;
  diametre_territoire_km?: number;
  superficie_km2?: number;
  is_grande_ville?: boolean;
  poles_quartiers?: Array<{
    nom: string;
    mode: string;
    type: string;
    lat: number;
    lon: number;
    podos_1km: number;
    diagnostic: string;
    color: string;
    status: string;
  }>;
  loyer_m2_estime?: number;
  loyer_mensuel_estime?: number;
  aides_financieres?: AidesFinancieresResult;
  prescripteurs?: PrescripteursResult;
  retraites?: RetraiteConfreresResult;
  color?: string;
}

export interface AidesFinancieresResult {
  zonageLibelle: string;
  aideCpamInstallation: number;
  contratCpamNom: string;
  eligibleZFU: boolean;
  exonerationFiscale5ansEstimee: number;
  alerteSurdotation: boolean;
  totalAvantagesEstimes: number;
  summaryBadge: string;
  summaryColor: string;
}

export interface PrescripteursResult {
  nbMedecinsGeneralistes: number;
  nbKines: number;
  totalPrescripteurs: number;
  ratioPrescripteursParPodo: number;
  diagnosticPrescripteurs: string;
  diagnosticColor: string;
}

export interface RetraiteConfreresResult {
  nbPodosTotal: number;
  nbPodosProchesRetraite: number;
  partProchesRetraitePct: number;
  opportuniteRepriseLabel: string;
  opportuniteColor: string;
}

export interface BusinessPlan3AnsItem {
  activitePct: number;
  consultationsAn: number;
  caBrutAn: number;
  chargesAn: number;
  cotisationsAn: number;
  beneficeNetAn: number;
}

export interface BusinessPlan3Ans {
  annee1: BusinessPlan3AnsItem;
  annee2: BusinessPlan3AnsItem;
  annee3: BusinessPlan3AnsItem;
  totalBeneficeNet3Ans: number;
  totalAidesFinancieres: number;
}

export interface FinancialSimulationParams {
  daysPerWeek: number; // 3 to 5 (e.g. 4.5)
  patientsPerDay: number; // 6 to 14 (e.g. 8)
  pctSemelles: number; // 0.10 to 0.70 (e.g. 0.35)
  tarifSemelles: number; // e.g. 190
  tarifSoins: number; // e.g. 42
  loyerMensuel: number; // e.g. 950
}

export interface FinancialSimulationResult {
  consultationsMonth: number;
  consultationsYear: number;
  caBrutMonth: number;
  caBrutYear: number;
  chargesFixesMonth: number;
  cotisationsSocialesMonth: number; // URSSAF + CARPIMKO (~42%)
  beneficeNetMonth: number;
  beneficeNetYear: number;
  tauxMargeNet: number;
  viabiliteLabel: string;
  viabiliteColor: string;
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

export type StrategyPreset = 'semelles' | 'sport_jeunes' | 'equilibre' | 'medical' | 'custom';

export type MapDisplayCriterion = 'score_global' | 'concurrence' | 'ratio_podo_hab' | 'pouvoir_achat' | 'sport' | 'jeunes' | 'seniors' | 'transports';

export interface ScoreWeights {
  pouvoir_achat_semelles: number; // default 35
  concurrence_inv: number; // default 45
  demande_65plus: number; // default 15
  transport_access: number; // default 5
  coef_diabete: number; // default 0
  bonus_zonage: number; // default 0
  demande_sport: number; // default 0 (Licenciés sportifs & clubs)
  demande_jeunes: number; // default 0 (Enfants 0-14 & jeunes)
}

export interface FilterSettings {
  weights: ScoreWeights;
  activePreset: StrategyPreset;
  displayCriterion: MapDisplayCriterion; // default 'score_global'
  minPopulation: number; // default 2500
  selectedRadiusKm: number; // 1, 2, or 3
  selectedDepartment: string; // 'all' or '75', '92', etc.
  showPodologuesLayer: boolean; // default false
  showTransportsLayer: boolean; // default true
  showCityLabels: boolean; // default true
  maxTransitTimeParis?: number; // 0 = all, 25, 40, 60
  requireTransitStation?: boolean; // false
  minRatioHabPodo?: 'all' | 'desert' | '3000' | '2500' | '1800'; // filter preset
  minRatioHabPodoNum?: number; // slider value: 0 = tous, or 1000 - 8000
  onlyDesertPodo?: boolean; // checkbox: true = 0 podo only
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
