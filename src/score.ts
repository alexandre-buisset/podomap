import { ZoneFeature, FilterSettings, ScoreWeights, StrategyPreset } from './types';

export const STRATEGY_PRESETS: Record<Exclude<StrategyPreset, 'custom'>, ScoreWeights> = {
  semelles: {
    pouvoir_achat_semelles: 35,
    concurrence_inv: 45,
    demande_65plus: 15,
    transport_access: 5,
    coef_diabete: 0,
    bonus_zonage: 0,
  },
  equilibre: {
    pouvoir_achat_semelles: 25,
    concurrence_inv: 50,
    demande_65plus: 20,
    transport_access: 5,
    coef_diabete: 0,
    bonus_zonage: 0,
  },
  medical: {
    pouvoir_achat_semelles: 0,
    concurrence_inv: 55,
    demande_65plus: 30,
    transport_access: 5,
    coef_diabete: 10,
    bonus_zonage: 0,
  },
};

export const DEFAULT_WEIGHTS: ScoreWeights = STRATEGY_PRESETS.semelles;

export const ZONAGE_SCORES: Record<string, number> = {
  tres_sous_dotee: 100,
  sous_dotee: 75,
  intermediaire: 40,
  tres_dotee: 15,
  surdotee: 0,
};

/**
 * Compute percentile rank (0 to 100) for an array of values.
 * Handles ties by assigning the average rank.
 */
export function computePercentiles(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 50);

  // Pair each value with its original index
  const indexed = values.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);

  const percentiles = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j + 1].val === indexed[i].val) {
      j++;
    }
    // Average rank for ties (0 to n - 1)
    const avgRank = (i + j) / 2.0;
    const pct = (avgRank / (n - 1)) * 100.0;
    for (let k = i; k <= j; k++) {
      percentiles[indexed[k].idx] = Math.round(pct * 10) / 10;
    }
    i = j + 1;
  }

  return percentiles;
}

/**
 * Compute percentile for a single value against a sorted reference array.
 */
export function computePercentileForValue(val: number, sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n <= 1) return 50;
  let i = 0;
  while (i < n && sortedAsc[i] < val) {
    i++;
  }
  let j = i;
  while (j < n && sortedAsc[j] === val) {
    j++;
  }
  if (j > i) {
    const avgRank = (i + (j - 1)) / 2.0;
    return Math.round(((avgRank / (n - 1)) * 100.0) * 10) / 10;
  }
  const rank = Math.min(n - 1, i);
  return Math.round(((rank / (n - 1)) * 100.0) * 10) / 10;
}

/**
 * Calculate opportunity score for all features based on active filter settings.
 */
export function computeOpportunityScores(
  features: ZoneFeature[],
  filters: FilterSettings
): ZoneFeature[] {
  const { weights, minPopulation, selectedRadiusKm } = filters;
  const podoRadiusKey = `nb_podologues_${selectedRadiusKm}km` as const;

  // 1. Identify eligibility and exclusion reasons for all features
  const activeIndices: number[] = [];
  const excludedIndices: number[] = [];
  const exclusionMap: Map<number, string[]> = new Map();

  features.forEach((feat, idx) => {
    const pop = feat.properties.pop_totale || 0;
    const transitTime = feat.properties.temps_paris_min ?? 99;
    const hasStationNearby = (feat.properties.nb_gares_1_5km || 0) > 0 || (feat.properties.gare_dist_km || 99) <= 1.5;
    const podosCommune = feat.properties.nb_podologues || 0;
    const podosInRadius = typeof (feat.properties as any)[podoRadiusKey] === 'number'
      ? (feat.properties as any)[podoRadiusKey]
      : feat.properties.nb_podologues_rayon || 0;
    const ratioCommune = podosCommune === 0 ? pop : Math.round(pop / podosCommune);

    // Practitioner density metrics (standard health demography)
    feat.properties.densite_podo_10k_hab = pop > 0 ? Math.round((podosCommune / pop) * 10000 * 10) / 10 : 0;
    feat.properties.densite_podo_100k_hab = pop > 0 ? Math.round((podosCommune / pop) * 100000) : 0;

    const reasons: string[] = [];
    if (pop < minPopulation) {
      reasons.push(`Population < ${minPopulation.toLocaleString('fr-FR')} hab.`);
    }

    // Filter by practitioner ratio (Habitants par Podologue)
    if (filters.onlyDesertPodo) {
      if (podosCommune > 0) {
        reasons.push(`Présence de ${podosCommune} podologue(s)`);
      }
    } else if (filters.minRatioHabPodoNum && filters.minRatioHabPodoNum > 0) {
      if (podosCommune > 0 && ratioCommune < filters.minRatioHabPodoNum) {
        reasons.push(`Ratio ${ratioCommune.toLocaleString('fr-FR')} hab/podo < ${filters.minRatioHabPodoNum.toLocaleString('fr-FR')}`);
      }
    } else if (filters.minRatioHabPodo && filters.minRatioHabPodo !== 'all') {
      if (filters.minRatioHabPodo === 'desert') {
        if (podosCommune > 0) reasons.push(`Présence de ${podosCommune} cabinet(s)`);
      } else {
        const threshold = parseInt(filters.minRatioHabPodo, 10);
        if (podosCommune > 0 && ratioCommune < threshold) {
          reasons.push(`Ratio < ${threshold.toLocaleString('fr-FR')} hab/podo`);
        }
      }
    }

    // Filter by maximum competition in radius (Max confrères à 2km)
    if (typeof filters.maxConcurrencePodos === 'number' && filters.maxConcurrencePodos >= 0) {
      if (podosInRadius > filters.maxConcurrencePodos) {
        reasons.push(`Concurrence (${podosInRadius}) > max autorisé (${filters.maxConcurrencePodos})`);
      }
    }

    if (filters.maxTransitTimeParis && filters.maxTransitTimeParis > 0) {
      if (transitTime > filters.maxTransitTimeParis) {
        reasons.push(`Temps vers Paris (${transitTime} min) > max (${filters.maxTransitTimeParis} min)`);
      }
    }
    if (filters.requireTransitStation) {
      if (!hasStationNearby) {
        reasons.push(`Pas de gare ferrée dans 1.5 km`);
      }
    }
    if (filters.selectedDepartment && filters.selectedDepartment !== 'all') {
      if (feat.properties.departement !== filters.selectedDepartment) {
        reasons.push(`Hors département sélectionné (Dép. ${filters.selectedDepartment})`);
      }
    }

    if (reasons.length > 0) {
      exclusionMap.set(idx, reasons);
      excludedIndices.push(idx);
    } else {
      activeIndices.push(idx);
    }
  });

  // Candidate pool for benchmark distribution (fall back to all features if candidate pool too small)
  const candidateIndices = activeIndices.length >= 20 ? activeIndices : features.map((_, i) => i);

  // Check if any candidate feature has non-empty zonage
  const hasZonageData = candidateIndices.some(
    (idx) => (features[idx].properties.zonage || '').trim().length > 0
  );

  // 2. Adjust weights: if no zonage data, redistribute zonage weight proportionally
  let wPouvoirAchat = Math.max(0, weights.pouvoir_achat_semelles || 0);
  let wDemande = Math.max(0, weights.demande_65plus);
  let wConcurrence = Math.max(0, weights.concurrence_inv);
  let wDiabete = Math.max(0, weights.coef_diabete);
  let wZonage = hasZonageData ? Math.max(0, weights.bonus_zonage) : 0;
  let wTransit = Math.max(0, weights.transport_access || 0);

  const baseSum = wPouvoirAchat + wDemande + wConcurrence + wDiabete + wTransit;
  if (!hasZonageData && weights.bonus_zonage > 0 && baseSum > 0) {
    const bonusToDistribute = weights.bonus_zonage;
    wPouvoirAchat += (wPouvoirAchat / baseSum) * bonusToDistribute;
    wDemande += (wDemande / baseSum) * bonusToDistribute;
    wConcurrence += (wConcurrence / baseSum) * bonusToDistribute;
    wDiabete += (wDiabete / baseSum) * bonusToDistribute;
    if (wTransit > 0) wTransit += (wTransit / baseSum) * bonusToDistribute;
  }

  const totalEffectiveWeight = wPouvoirAchat + wDemande + wConcurrence + wDiabete + wZonage + wTransit;

  // 3. Extract and sort benchmark vectors from the candidate pool
  const sortedIncomes = candidateIndices
    .map((idx) => features[idx].properties.potentiel_semelles ?? 50)
    .sort((a, b) => a - b);

  const sortedPop65 = candidateIndices
    .map((idx) => features[idx].properties.pop_65plus || 0)
    .sort((a, b) => a - b);

  const sortedDiabete = candidateIndices
    .map((idx) => features[idx].properties.coef_diabete || 1.0)
    .sort((a, b) => a - b);

  const sortedDensity = candidateIndices
    .map((idx) => {
      const p = features[idx].properties as any;
      const podos = typeof p[podoRadiusKey] === 'number' ? p[podoRadiusKey] : p.nb_podologues_rayon || 0;
      const pop = Math.max(1, p.pop_totale || 1);
      return (podos / pop) * 10000.0;
    })
    .sort((a, b) => a - b);

  const sortedTransit = candidateIndices
    .map((idx) => features[idx].properties.score_transport ?? 50)
    .sort((a, b) => a - b);

  // 4. Assign individual criterion percentiles and composite score to ALL features
  features.forEach((feat, i) => {
    const pProp = feat.properties as any;
    const podosInRadius = typeof pProp[podoRadiusKey] === 'number'
      ? pProp[podoRadiusKey]
      : feat.properties.nb_podologues_rayon || 0;
    const popCommune = feat.properties.pop_totale || 1;
    const podosCommune = feat.properties.nb_podologues || 0;

    const pPouvoirAchat = computePercentileForValue(feat.properties.potentiel_semelles ?? 50, sortedIncomes);
    const pDemande = computePercentileForValue(feat.properties.pop_65plus || 0, sortedPop65);
    const pDiabete = computePercentileForValue(feat.properties.coef_diabete || 1.0, sortedDiabete);
    const densityVal = (podosInRadius / Math.max(1, popCommune)) * 10000.0;
    const pDensity = computePercentileForValue(densityVal, sortedDensity);
    const pConcurrence = Math.round((100.0 - pDensity) * 10) / 10;
    const pTransit = computePercentileForValue(feat.properties.score_transport ?? 50, sortedTransit);

    const zCode = (feat.properties.zonage || '').toLowerCase().trim();
    const pZonage = ZONAGE_SCORES[zCode] ?? 0;

    // Métier Ratio: 1 podologue pour X habitants (idéal 1 pour 2 500 à 3 000 hab cité par la podologue)
    let ratioHabPodo = 0;
    if (podosCommune === 0) {
      ratioHabPodo = popCommune;
      if (podosInRadius === 0) {
        feat.properties.ratio_hab_label = `🛡️ Désert total (0 podo. pour ${popCommune.toLocaleString('fr-FR')} hab.)`;
        feat.properties.ratio_hab_color = '#10b981';
      } else if (podosInRadius <= 3) {
        feat.properties.ratio_hab_label = `🛡️ 0 cabinet local (${podosInRadius} confrère${podosInRadius > 1 ? 's' : ''} à ${selectedRadiusKm}km)`;
        feat.properties.ratio_hab_color = '#10b981';
      } else {
        feat.properties.ratio_hab_label = `🟡 0 cabinet communal (${podosInRadius} à ${selectedRadiusKm}km)`;
        feat.properties.ratio_hab_color = '#0284c7';
      }
    } else {
      ratioHabPodo = Math.round(popCommune / podosCommune);
      if (podosInRadius >= 20) {
        feat.properties.ratio_hab_label = `⚠️ Environs saturés (${podosInRadius} podos à ${selectedRadiusKm}km)`;
        feat.properties.ratio_hab_color = '#ef4444';
      } else if (ratioHabPodo >= 3000) {
        feat.properties.ratio_hab_label = `🟢 Très favorable (1 pour ${ratioHabPodo.toLocaleString('fr-FR')} hab.)`;
        feat.properties.ratio_hab_color = '#10b981';
      } else if (ratioHabPodo >= 2500) {
        feat.properties.ratio_hab_label = `⚖️ Favorable (1 pour ${ratioHabPodo.toLocaleString('fr-FR')} hab.)`;
        feat.properties.ratio_hab_color = '#0d9488';
      } else if (ratioHabPodo >= 1800) {
        feat.properties.ratio_hab_label = `🟡 Modéré (1 pour ${ratioHabPodo.toLocaleString('fr-FR')} hab.)`;
        feat.properties.ratio_hab_color = '#0284c7';
      } else {
        feat.properties.ratio_hab_label = `🔴 Saturé (1 pour ${ratioHabPodo.toLocaleString('fr-FR')} hab.)`;
        feat.properties.ratio_hab_color = '#ef4444';
      }
    }
    feat.properties.ratio_hab_par_podo = ratioHabPodo;

    // Saturation Penalty / Gatekeeper:
    let saturationMultiplier = 1.0;
    if (podosInRadius >= 35) {
      saturationMultiplier = 0.20; // Saturation extrême (Vincennes 55, Saint-Mandé 76)
    } else if (podosInRadius >= 20) {
      saturationMultiplier = 0.32; // Forte saturation avérée (Nogent 26, Saint-Maur 32)
    } else if (podosInRadius >= 12) {
      saturationMultiplier = 0.55; // Saturation modérée
    } else if (podosInRadius >= 8) {
      saturationMultiplier = 0.78;
    }

    if (pConcurrence < 15) {
      saturationMultiplier = Math.min(saturationMultiplier, 0.30);
    } else if (pConcurrence < 25) {
      saturationMultiplier = Math.min(saturationMultiplier, 0.45);
    }

    let composite = 0;
    if (totalEffectiveWeight > 0) {
      composite =
        (wPouvoirAchat * pPouvoirAchat +
          wDemande * pDemande +
          wConcurrence * pConcurrence +
          wDiabete * pDiabete +
          wZonage * pZonage +
          wTransit * pTransit) /
        totalEffectiveWeight;
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(composite * saturationMultiplier * 10) / 10));

    feat.properties.score = finalScore;
    feat.properties.score_pouvoir_achat = pPouvoirAchat;
    feat.properties.score_demande = pDemande;
    feat.properties.score_concurrence = pConcurrence;
    feat.properties.score_diabete = pDiabete;
    feat.properties.score_zonage = pZonage;
    feat.properties.score_transit = pTransit;

    // Diagnostic labels and qualitative levels
    if (podosInRadius === 0) {
      feat.properties.concurrence_niveau = 'tres_faible';
      feat.properties.concurrence_label = '🛡️ Désert (0 podologue à 2km)';
      feat.properties.concurrence_color = '#10b981';
    } else if (podosInRadius <= 3) {
      feat.properties.concurrence_niveau = 'tres_faible';
      feat.properties.concurrence_label = `🛡️ Très faible (${podosInRadius} podo. à 2km)`;
      feat.properties.concurrence_color = '#10b981';
    } else if (podosInRadius <= 8) {
      feat.properties.concurrence_niveau = 'faible';
      feat.properties.concurrence_label = `🟢 Faible (${podosInRadius} podo. à 2km)`;
      feat.properties.concurrence_color = '#0d9488';
    } else if (podosInRadius <= 15) {
      feat.properties.concurrence_niveau = 'moderee';
      feat.properties.concurrence_label = `🟡 Modérée (${podosInRadius} podo. à 2km)`;
      feat.properties.concurrence_color = '#0284c7';
    } else if (podosInRadius <= 25) {
      feat.properties.concurrence_niveau = 'elevee';
      feat.properties.concurrence_label = `🟠 Soutenue (${podosInRadius} podo. à 2km)`;
      feat.properties.concurrence_color = '#f59e0b';
    } else {
      feat.properties.concurrence_niveau = 'saturee';
      feat.properties.concurrence_label = `🔴 Saturée (${podosInRadius} podo. à 2km)`;
      feat.properties.concurrence_color = '#ef4444';
    }

    const rev = feat.properties.revenu_median || 0;
    if (rev >= 33000) {
      feat.properties.pouvoir_achat_label = '💎 Très aisé (Semelles ~210 €)';
    } else if (rev >= 27000) {
      feat.properties.pouvoir_achat_label = '💎 Aisé (Semelles ~190 €)';
    } else if (rev >= 22000) {
      feat.properties.pouvoir_achat_label = '💰 Moyen (Semelles ~160 €)';
    } else {
      feat.properties.pouvoir_achat_label = '⚠️ Modeste (Soins Sécu 27 €)';
    }

    // Ensure data reliability fields
    if (feat.properties.has_insee_income === false) {
      feat.properties.fiabilite_revenu = "Non diffusé par l'INSEE (secret statistique < 150 hab)";
      feat.properties.revenu_source = "Estimation départementale";
      feat.properties.qualite_donnees = "Partielle (Revenu Insee non diffusé)";
    } else {
      feat.properties.has_insee_income = true;
      feat.properties.fiabilite_revenu = "Certifié INSEE Filosofi (Officiel)";
      feat.properties.revenu_source = "INSEE Filosofi 2021 communal";
      feat.properties.qualite_donnees = "Certifiée (INSEE + RPPS + IDFM)";
    }

    // Handle Active vs Excluded State
    const reasons = exclusionMap.get(i);
    if (reasons && reasons.length > 0) {
      feat.properties.is_excluded = true;
      feat.properties.exclusion_reason = reasons.join(' • ');
      feat.properties.color = getColorForScore(0, true);
      feat.properties.rank_global = undefined;
      feat.properties.rank_dept = undefined;
    } else {
      feat.properties.is_excluded = false;
      feat.properties.exclusion_reason = undefined;

      // Assign map choropleth color based on selected display criterion
      const criterion = filters.displayCriterion || 'score_global';
      switch (criterion) {
        case 'concurrence':
          feat.properties.color = getColorForConcurrence(pConcurrence, false);
          break;
        case 'ratio_podo_hab':
          feat.properties.color = getColorForRatioPodoHab(podosCommune, ratioHabPodo, podosInRadius, false);
          break;
        case 'pouvoir_achat':
          feat.properties.color = getColorForPouvoirAchat(pPouvoirAchat, false);
          break;
        case 'seniors':
          feat.properties.color = getColorForSeniors(pDemande, false);
          break;
        case 'transports':
          feat.properties.color = getColorForTransports(pTransit, false);
          break;
        case 'score_global':
        default:
          feat.properties.color = getColorForScore(finalScore, false);
          break;
      }
    }
  });

  // 6. Compute ranks among active features
  const sortedActive = [...activeIndices].sort((a, b) => {
    return (features[b].properties.score || 0) - (features[a].properties.score || 0);
  });

  sortedActive.forEach((featIdx, rank0) => {
    features[featIdx].properties.rank_global = rank0 + 1;
  });

  // Department ranks
  const depts = new Set(features.map((f) => f.properties.departement));
  depts.forEach((dept) => {
    const deptActive = sortedActive.filter(
      (idx) => features[idx].properties.departement === dept
    );
    const totalInDept = deptActive.length;
    deptActive.forEach((featIdx, r0) => {
      features[featIdx].properties.rank_dept = r0 + 1;
      features[featIdx].properties.total_in_dept = totalInDept;
    });
  });

  return features;
}

/**
 * Get top 10 zones matching the current filters and active criterion.
 */
export function getTop10Zones(
  features: ZoneFeature[],
  selectedDepartment: string = 'all',
  displayCriterion: string = 'score_global'
): ZoneFeature[] {
  const matching = features.filter((f) => {
    if (f.properties.is_excluded) return false;
    if (selectedDepartment !== 'all' && f.properties.departement !== selectedDepartment) {
      return false;
    }
    return true;
  });

  matching.sort((a, b) => {
    switch (displayCriterion) {
      case 'concurrence':
        return (b.properties.score_concurrence || 0) - (a.properties.score_concurrence || 0);
      case 'ratio_podo_hab':
        return (b.properties.ratio_hab_par_podo || 0) - (a.properties.ratio_hab_par_podo || 0);
      case 'pouvoir_achat':
        return (b.properties.score_pouvoir_achat || 0) - (a.properties.score_pouvoir_achat || 0);
      case 'seniors':
        return (b.properties.pop_65plus || 0) - (a.properties.pop_65plus || 0);
      case 'transports':
        return (b.properties.score_transit || 0) - (a.properties.score_transit || 0);
      case 'score_global':
      default:
        return (b.properties.score || 0) - (a.properties.score || 0);
    }
  });

  return matching.slice(0, 10);
}

/**
 * Global Score color scale (0 to 100).
 */
export function getColorForScore(score: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (score < 25) return '#ef4444'; // Rouge (Zone saturée ou défavorable)
  if (score < 45) return '#64748b'; // Ardoise (Concurrence soutenue / Risqué)
  if (score < 60) return '#0284c7'; // Bleu (Intermédiaire)
  if (score < 75) return '#0d9488'; // Teal (Favorable)
  return '#10b981'; // Émeraude (Excellente opportunité d'installation)
}

/**
 * Concurrence (Pression concurrentielle) color scale:
 * 100 = very few or 0 podologues per capita (High Opportunity Emerald)
 * 0 = oversaturated zone (Red)
 */
export function getColorForConcurrence(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#10b981'; // Très faible concurrence (Émeraude / Haute opportunité)
  if (percentile >= 50) return '#0d9488'; // Faible concurrence (Teal)
  if (percentile >= 25) return '#0284c7'; // Concurrence modérée (Bleu)
  if (percentile >= 10) return '#f59e0b'; // Concurrence soutenue (Ambre)
  return '#ef4444'; // Forte saturation (Rouge)
}

/**
 * Podologues / Habitant color scale:
 * Émeraude = 0 podo (Désert local absolu) ou >= 3 500 hab/podo (< 2.8 / 10k hab)
 * Teal = 2 500 à 3 500 hab/podo (Favorable / Seuil de rentabilité Ordre)
 * Bleu = 1 800 à 2 500 hab/podo (Modéré)
 * Ambre = 1 200 à 1 800 hab/podo (Concurrence soutenue)
 * Rouge = < 1 200 hab/podo ou >= 20 podologues à 2 km (Saturé)
 */
export function getColorForRatioPodoHab(
  podosCommune: number,
  ratioHabPodo: number,
  podosInRadius: number = 0,
  isExcluded: boolean = false
): string {
  if (isExcluded) return '#94a3b8';
  if (podosInRadius >= 20) return '#ef4444'; // Saturated neighborhood overrides
  if (podosCommune === 0) return '#10b981'; // Désert communal absolu
  if (ratioHabPodo >= 3500) return '#10b981'; // Très favorable
  if (ratioHabPodo >= 2500) return '#0d9488'; // Favorable (Seuil Ordre)
  if (ratioHabPodo >= 1800) return '#0284c7'; // Modéré
  if (ratioHabPodo >= 1200) return '#f59e0b'; // Concurrence soutenue
  return '#ef4444'; // Saturé
}

/**
 * Purchasing Power color scale:
 * 100 = Highest disposable income (Warm Gold / Amber)
 * 0 = Modest income (Slate)
 */
export function getColorForPouvoirAchat(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#f59e0b'; // Très aisé (Or chaud)
  if (percentile >= 50) return '#10b981'; // Aisé (Émeraude)
  if (percentile >= 25) return '#0284c7'; // Moyen (Bleu)
  return '#64748b'; // Modeste (Acier)
}

/**
 * Seniors Population color scale:
 * 100 = Major senior population pool (Indigo)
 */
export function getColorForSeniors(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#6366f1'; // Bassin majeur (Indigo)
  if (percentile >= 50) return '#0ea5e9'; // Fort (Bleu ciel)
  if (percentile >= 25) return '#14b8a6'; // Moyen (Teal)
  return '#64748b';
}

/**
 * Public Transit accessibility scale:
 * 100 = Fast access to Paris (< 25 min) and stations nearby (Cyan)
 */
export function getColorForTransports(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#06b6d4'; // Rapide (Cyan vif)
  if (percentile >= 50) return '#10b981'; // Bonne desserte (Émeraude)
  if (percentile >= 25) return '#0284c7'; // Moyen
  return '#64748b';
}
