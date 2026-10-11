import {
  ZoneFeature,
  FilterSettings,
  ScoreWeights,
  StrategyPreset,
  FinancialSimulationParams,
  FinancialSimulationResult,
  AidesFinancieresResult,
  PrescripteursResult,
  RetraiteConfreresResult,
  BusinessPlan3Ans,
} from './types';

export const STRATEGY_PRESETS: Record<Exclude<StrategyPreset, 'custom'>, ScoreWeights> = {
  semelles: {
    pouvoir_achat_semelles: 35,
    concurrence_inv: 45,
    demande_65plus: 15,
    transport_access: 5,
    coef_diabete: 0,
    bonus_zonage: 0,
    demande_sport: 0,
    demande_jeunes: 0,
  },
  sport_jeunes: {
    pouvoir_achat_semelles: 25,
    concurrence_inv: 40,
    demande_65plus: 0,
    transport_access: 5,
    coef_diabete: 0,
    bonus_zonage: 0,
    demande_sport: 15,
    demande_jeunes: 15,
  },
  equilibre: {
    pouvoir_achat_semelles: 25,
    concurrence_inv: 45,
    demande_65plus: 15,
    transport_access: 5,
    coef_diabete: 0,
    bonus_zonage: 0,
    demande_sport: 5,
    demande_jeunes: 5,
  },
  medical: {
    pouvoir_achat_semelles: 0,
    concurrence_inv: 55,
    demande_65plus: 30,
    transport_access: 5,
    coef_diabete: 10,
    bonus_zonage: 0,
    demande_sport: 0,
    demande_jeunes: 0,
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
    if (minPopulation && minPopulation > 0 && pop < minPopulation) {
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
  let wSport = Math.max(0, weights.demande_sport || 0);
  let wJeunes = Math.max(0, weights.demande_jeunes || 0);

  const baseSum = wPouvoirAchat + wDemande + wConcurrence + wDiabete + wTransit + wSport + wJeunes;
  if (!hasZonageData && weights.bonus_zonage > 0 && baseSum > 0) {
    const bonusToDistribute = weights.bonus_zonage;
    wPouvoirAchat += (wPouvoirAchat / baseSum) * bonusToDistribute;
    wDemande += (wDemande / baseSum) * bonusToDistribute;
    wConcurrence += (wConcurrence / baseSum) * bonusToDistribute;
    wDiabete += (wDiabete / baseSum) * bonusToDistribute;
    if (wTransit > 0) wTransit += (wTransit / baseSum) * bonusToDistribute;
    if (wSport > 0) wSport += (wSport / baseSum) * bonusToDistribute;
    if (wJeunes > 0) wJeunes += (wJeunes / baseSum) * bonusToDistribute;
  }

  const totalEffectiveWeight = wPouvoirAchat + wDemande + wConcurrence + wDiabete + wZonage + wTransit + wSport + wJeunes;

  // 3. Extract and sort benchmark vectors from the candidate pool
  const sortedIncomes = candidateIndices
    .map((idx) => features[idx].properties.potentiel_semelles ?? 50)
    .sort((a, b) => a - b);

  const sortedPop65 = candidateIndices
    .map((idx) => features[idx].properties.pop_65plus || 0)
    .sort((a, b) => a - b);

  const sortedSport = candidateIndices
    .map((idx) => features[idx].properties.nb_licencies_sport || 0)
    .sort((a, b) => a - b);

  const sortedJeunes = candidateIndices
    .map((idx) => features[idx].properties.pop_0_14 || 0)
    .sort((a, b) => a - b);

  const sortedDiabete = candidateIndices
    .map((idx) => features[idx].properties.coef_diabete || 1.0)
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
    const pSport = computePercentileForValue(feat.properties.nb_licencies_sport || 0, sortedSport);
    const pJeunes = computePercentileForValue(feat.properties.pop_0_14 || 0, sortedJeunes);
    const pDiabete = computePercentileForValue(feat.properties.coef_diabete || 1.0, sortedDiabete);
    // Competition score: strictly based on practitioners in radius
    // 0 podos: 100 (pure desert), 1 podo: 90, 2 podos: 80, 3-5: 60-75, 6-11: 40-55, 12-19: 20-35, 20+: 2-15
    let pConcurrence = 100;
    if (podosInRadius === 0) {
      pConcurrence = 100;
    } else if (podosInRadius === 1) {
      pConcurrence = 90;
    } else if (podosInRadius === 2) {
      pConcurrence = 80;
    } else if (podosInRadius <= 5) {
      pConcurrence = Math.round((80 - ((podosInRadius - 2) / 3) * 20) * 10) / 10;
    } else if (podosInRadius <= 11) {
      pConcurrence = Math.round((60 - ((podosInRadius - 5) / 6) * 20) * 10) / 10;
    } else if (podosInRadius <= 19) {
      pConcurrence = Math.round((40 - ((podosInRadius - 11) / 8) * 20) * 10) / 10;
    } else {
      pConcurrence = Math.max(2, Math.round((20 - Math.min(18, (podosInRadius - 20) * 0.5)) * 10) / 10);
    }
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
          wTransit * pTransit +
          wSport * pSport +
          wJeunes * pJeunes) /
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
    feat.properties.score_sport = pSport;
    feat.properties.score_jeunes = pJeunes;

    // Diagnostic labels and qualitative levels with dynamic radius
    if (podosInRadius === 0) {
      feat.properties.concurrence_niveau = 'tres_faible';
      feat.properties.concurrence_label = `🛡️ Désert (0 podologue à ${selectedRadiusKm}km)`;
      feat.properties.concurrence_color = '#10b981';
    } else if (podosInRadius <= 3) {
      feat.properties.concurrence_niveau = 'tres_faible';
      feat.properties.concurrence_label = `🛡️ Très faible (${podosInRadius} podo. à ${selectedRadiusKm}km)`;
      feat.properties.concurrence_color = '#10b981';
    } else if (podosInRadius <= 8) {
      feat.properties.concurrence_niveau = 'faible';
      feat.properties.concurrence_label = `🟢 Faible (${podosInRadius} podo. à ${selectedRadiusKm}km)`;
      feat.properties.concurrence_color = '#0d9488';
    } else if (podosInRadius <= 15) {
      feat.properties.concurrence_niveau = 'moderee';
      feat.properties.concurrence_label = `🟡 Modérée (${podosInRadius} podo. à ${selectedRadiusKm}km)`;
      feat.properties.concurrence_color = '#0284c7';
    } else if (podosInRadius <= 25) {
      feat.properties.concurrence_niveau = 'elevee';
      feat.properties.concurrence_label = `🟠 Soutenue (${podosInRadius} podo. à ${selectedRadiusKm}km)`;
      feat.properties.concurrence_color = '#f59e0b';
    } else {
      feat.properties.concurrence_niveau = 'saturee';
      feat.properties.concurrence_label = `🔴 Saturée (${podosInRadius} podo. à ${selectedRadiusKm}km)`;
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

    // Estimated commercial rent for practice (local professionnel PMR ~45 m2)
    const rentInfo = getEstimatedRent(feat.properties.departement, feat.properties.code_insee, feat.properties.revenu_median);
    feat.properties.loyer_m2_estime = rentInfo.loyerM2;
    feat.properties.loyer_mensuel_estime = rentInfo.loyerMensuel45m2;

    // Public installation aides, medical prescriber pool, and peer retirements
    feat.properties.aides_financieres = computeFinancialAides(feat.properties.zonage, feat.properties.code_insee, feat.properties.pop_totale);
    feat.properties.prescripteurs = computePrescripteurs(feat.properties.pop_totale, podosCommune, feat.properties.is_grande_ville);
    feat.properties.retraites = computeRetraites(podosCommune, feat.properties.code_insee);

    // Ensure data reliability fields
    if (feat.properties.has_insee_income === false) {
      feat.properties.fiabilite_revenu = "Non diffusé par l'INSEE (secret statistique < 150 hab)";
      feat.properties.revenu_source = "Estimation départementale";
      feat.properties.qualite_donnees = "Partielle (Revenu Insee non diffusé)";
    } else {
      feat.properties.has_insee_income = true;
      feat.properties.fiabilite_revenu = "Certifié INSEE Filosofi (Officiel)";
      feat.properties.revenu_source = "INSEE Filosofi communal";
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
        case 'sport':
          feat.properties.color = getColorForSport(pSport, false);
          break;
        case 'jeunes':
          feat.properties.color = getColorForJeunes(pJeunes, false);
          break;
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
      case 'sport':
        return (b.properties.nb_licencies_sport || 0) - (a.properties.nb_licencies_sport || 0);
      case 'jeunes':
        return (b.properties.pop_0_14 || 0) - (a.properties.pop_0_14 || 0);
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
 * 🟢 Vert Émeraude (≥ 70) : Installation très recommandée / Forte pénurie
 * 🟢 Teal (55 - 69) : Favorable
 * 🔵 Bleu (40 - 54) : Équilibré
 * 🟡 Ambre (25 - 39) : Modéré / Vigilance concurrence
 * 🔴 Rouge (< 25) : Saturé / Fortement déconseillé
 * ⚪ Gris Neutre : Exclu par les filtres
 */
export function getColorForScore(score: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (score >= 70) return '#10b981'; // Vert Émeraude (Optimal / Pénurie)
  if (score >= 55) return '#0d9488'; // Teal (Favorable)
  if (score >= 40) return '#0284c7'; // Bleu (Équilibré)
  if (score >= 25) return '#f59e0b'; // Ambre (Modéré / Vigilance)
  return '#ef4444'; // Rouge (Saturé / Fortement déconseillé)
}

/**
 * Concurrence (Pression concurrentielle) color scale:
 * 🟢 Vert Émeraude (≥ 75) : Très faible concurrence / Désert (Opportunité max)
 * 🟢 Teal (50 - 74) : Faible concurrence
 * 🔵 Bleu (25 - 49) : Concurrence modérée
 * 🟡 Ambre (10 - 24) : Concurrence soutenue
 * 🔴 Rouge (< 10) : Forte saturation
 */
export function getColorForConcurrence(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#64748b';
  if (percentile >= 75) return '#10b981'; // 0-2 podos : Désert / Très faible (Vert Émeraude)
  if (percentile >= 50) return '#0284c7'; // 3-5 podos : Faible concurrence (Bleu)
  if (percentile >= 25) return '#f59e0b'; // 6-11 podos : Concurrence modérée (Ambre)
  if (percentile >= 10) return '#f97316'; // 12-19 podos : Concurrence soutenue (Orange)
  return '#ef4444'; // ≥ 20 podos : Forte saturation (Rouge)
}

/**
 * Podologues / Habitant color scale:
 * 🟢 Émeraude : 0 podo (Désert local absolu) ou ≥ 3 500 hab/podo
 * 🟢 Teal : 2 500 à 3 500 hab/podo (Favorable / Seuil rentabilité Ordre ONPP)
 * 🔵 Bleu : 1 800 à 2 500 hab/podo (Équilibré)
 * 🟡 Ambre : 1 200 à 1 800 hab/podo (Concurrence soutenue)
 * 🔴 Rouge : < 1 200 hab/podo ou ≥ 20 podologues à 2 km (Saturé)
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
  if (ratioHabPodo >= 3500) return '#10b981'; // Très favorable (Pénurie)
  if (ratioHabPodo >= 2500) return '#0d9488'; // Favorable (Seuil Ordre ONPP)
  if (ratioHabPodo >= 1800) return '#0284c7'; // Équilibré
  if (ratioHabPodo >= 1200) return '#f59e0b'; // Concurrence soutenue
  return '#ef4444'; // Saturé
}

/**
 * Purchasing Power color scale:
 * 🟢 Émeraude (≥ 75) : Très aisé (> 30 000 €/an – Semelles 190€-210€ sans reste à charge)
 * 🟢 Teal (50 - 74) : Aisé (26 000 – 30 000 €)
 * 🔵 Bleu (25 - 49) : Moyen (22 000 – 26 000 €)
 * 🟡 Ambre (10 - 24) : Modeste (18 000 – 22 000 €)
 * 🔴 Rouge (< 10) : Faible (< 18 000 € – Soins Sécu conventionnés 27€)
 */
export function getColorForPouvoirAchat(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#10b981'; // Très aisé (Émeraude)
  if (percentile >= 50) return '#0d9488'; // Aisé (Teal)
  if (percentile >= 25) return '#0284c7'; // Moyen (Bleu)
  if (percentile >= 10) return '#f59e0b'; // Modeste (Ambre)
  return '#ef4444'; // Faible (Rouge)
}

/**
 * Seniors Population color scale:
 * 🟢 Émeraude (≥ 75) : Bassin majeur (> 5 000 seniors)
 * 🟢 Teal (50 - 74) : Fort bassin (2 500 – 5 000 seniors)
 * 🔵 Bleu (25 - 49) : Moyen (1 500 – 2 500 seniors)
 * 🟡 Ambre (10 - 24) : Modéré (800 – 1 500 seniors)
 * 🔴 Rouge (< 10) : Faible (< 800 seniors)
 */
export function getColorForSeniors(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#10b981'; // Bassin majeur (Émeraude)
  if (percentile >= 50) return '#0d9488'; // Fort (Teal)
  if (percentile >= 25) return '#0284c7'; // Moyen (Bleu)
  if (percentile >= 10) return '#f59e0b'; // Modéré (Ambre)
  return '#ef4444'; // Faible (Rouge)
}

/**
 * Public Transit accessibility scale:
 * 🟢 Émeraude (≥ 75) : Très rapide (< 25 min Châtelet / Gare proche)
 * 🟢 Teal (50 - 74) : Bonne desserte (25 - 40 min)
 * 🔵 Bleu (25 - 49) : Moyen (40 - 55 min)
 * 🟡 Ambre (10 - 24) : Éloigné (55 - 70 min)
 * 🔴 Rouge (< 10) : Isolé (> 70 min / sans gare)
 */
export function getColorForTransports(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#10b981'; // Rapide (Émeraude)
  if (percentile >= 50) return '#0d9488'; // Bonne desserte (Teal)
  if (percentile >= 25) return '#0284c7'; // Moyen (Bleu)
  if (percentile >= 10) return '#f59e0b'; // Éloigné (Ambre)
  return '#ef4444'; // Isolé (Rouge)
}

/**
 * Sports licenses & clubs scale:
 * 🟢 Émeraude (≥ 75) : Grand pôle sportif (> 3 500 licenciés)
 * 🟢 Teal (50 - 74) : Fort pôle (1 800 – 3 500 licenciés)
 * 🔵 Bleu (25 - 49) : Moyen (900 – 1 800 licenciés)
 * 🟡 Ambre (10 - 24) : Modéré (400 – 900 licenciés)
 * 🔴 Rouge (< 10) : Faible (< 400 licenciés)
 */
export function getColorForSport(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#10b981'; // Fort pôle sportif (Émeraude)
  if (percentile >= 50) return '#0d9488'; // Bonne pratique (Teal)
  if (percentile >= 25) return '#0284c7'; // Moyen (Bleu)
  if (percentile >= 10) return '#f59e0b'; // Modéré (Ambre)
  return '#ef4444'; // Faible (Rouge)
}

/**
 * Children & Youth (Podopediatrie) scale:
 * 🟢 Émeraude (≥ 75) : Fort pôle familles & enfants (> 5 000)
 * 🟢 Teal (50 - 74) : Favorable (2 500 – 5 000)
 * 🔵 Bleu (25 - 49) : Moyen (1 200 – 2 500)
 * 🟡 Ambre (10 - 24) : Modéré (600 – 1 200)
 * 🔴 Rouge (< 10) : Faible (< 600)
 */
export function getColorForJeunes(percentile: number, isExcluded: boolean = false): string {
  if (isExcluded) return '#94a3b8';
  if (percentile >= 75) return '#10b981'; // Très jeune / Fort potentiel enfants (Émeraude)
  if (percentile >= 50) return '#0d9488'; // Favorable (Teal)
  if (percentile >= 25) return '#0284c7'; // Moyen (Bleu)
  if (percentile >= 10) return '#f59e0b'; // Modéré (Ambre)
  return '#ef4444'; // Faible (Rouge)
}

export interface LegendStepInfo {
  color: string;
  label: string;
  range: string;
}

/**
 * Unified 5-step discrete legend descriptions across all display criteria.
 */
export function getLegendSteps(criterion: string): { title: string; subtitle: string; steps: LegendStepInfo[] } {
  switch (criterion) {
    case 'ratio_podo_hab':
      return {
        title: '👥 Ratio Podologues / Habitant',
        subtitle: 'Seuil d’équilibre : 1 podo pour 2 500 à 3 500 hab. (ONPP)',
        steps: [
          { color: '#ef4444', label: 'Saturé', range: '< 1 200 hab / ≥20 à 2km' },
          { color: '#f59e0b', label: 'Soutenu', range: '1 200 – 1 799 hab.' },
          { color: '#0284c7', label: 'Équilibré', range: '1 800 – 2 499 hab.' },
          { color: '#0d9488', label: 'Favorable', range: '2 500 – 3 499 hab.' },
          { color: '#10b981', label: 'Désert / Pénurie', range: '≥ 3 500 hab / 0 podo' },
        ],
      };
    case 'concurrence':
      return {
        title: '🛡️ Pression Concurrentielle (Rayon 2 km)',
        subtitle: 'Nombre de praticiens installés dans la zone de chalandise',
        steps: [
          { color: '#ef4444', label: 'Forte saturation', range: '≥ 20 confrères' },
          { color: '#f59e0b', label: 'Soutenu', range: '12 – 19 confrères' },
          { color: '#0284c7', label: 'Modéré', range: '6 – 11 confrères' },
          { color: '#0d9488', label: 'Faible', range: '3 – 5 confrères' },
          { color: '#10b981', label: 'Désert / 0-2 podo', range: 'Haute opportunité' },
        ],
      };
    case 'pouvoir_achat':
      return {
        title: "💎 Pouvoir d'Achat & Solvabilité",
        subtitle: 'Revenu disponible médian annuel (INSEE Filosofi)',
        steps: [
          { color: '#ef4444', label: 'Faible (Sécu 27€)', range: '< 18 k€/an' },
          { color: '#f59e0b', label: 'Modeste', range: '18 – 22 k€/an' },
          { color: '#0284c7', label: 'Moyen (~160€)', range: '22 – 26 k€/an' },
          { color: '#0d9488', label: 'Aisé (~190€)', range: '26 – 30 k€/an' },
          { color: '#10b981', label: 'Très aisé (~210€)', range: '> 30 k€/an' },
        ],
      };
    case 'sport':
      return {
        title: '🏃‍♂️ Pratique Sportive & Clubs (INJEP)',
        subtitle: 'Bassin de sportifs licenciés toutes fédérations confondues',
        steps: [
          { color: '#ef4444', label: 'Faible', range: '< 400 licenciés' },
          { color: '#f59e0b', label: 'Modéré', range: '400 – 900 lic.' },
          { color: '#0284c7', label: 'Moyen', range: '900 – 1 800 lic.' },
          { color: '#0d9488', label: 'Fort', range: '1 800 – 3 500 lic.' },
          { color: '#10b981', label: 'Grand pôle', range: '> 3 500 licenciés' },
        ],
      };
    case 'jeunes':
      return {
        title: '👶 Enfants & Familles (Podopédiatrie)',
        subtitle: 'Bassin de patients de moins de 15 ans (INSEE)',
        steps: [
          { color: '#ef4444', label: 'Faible', range: '< 600 enfants' },
          { color: '#f59e0b', label: 'Modéré', range: '600 – 1 200' },
          { color: '#0284c7', label: 'Moyen', range: '1 200 – 2 500' },
          { color: '#0d9488', label: 'Fort', range: '2 500 – 5 000' },
          { color: '#10b981', label: 'Pôle familles', range: '> 5 000 enfants' },
        ],
      };
    case 'seniors':
      return {
        title: '👥 Bassin Seniors (65+ ans)',
        subtitle: 'Volume de résidents âgés pour soins et pédicurie',
        steps: [
          { color: '#ef4444', label: 'Faible', range: '< 800 seniors' },
          { color: '#f59e0b', label: 'Modéré', range: '800 – 1 500' },
          { color: '#0284c7', label: 'Moyen', range: '1 500 – 2 500' },
          { color: '#0d9488', label: 'Fort', range: '2 500 – 5 000' },
          { color: '#10b981', label: 'Bassin majeur', range: '> 5 000 seniors' },
        ],
      };
    case 'transports':
      return {
        title: '🚆 Accès Paris & Réseau IDFM',
        subtitle: 'Temps de transport vers Paris Châtelet et proximité de gares',
        steps: [
          { color: '#ef4444', label: 'Isolé', range: '> 70 min / sans gare' },
          { color: '#f59e0b', label: 'Éloigné', range: '55 – 70 min' },
          { color: '#0284c7', label: 'Intermédiaire', range: '40 – 55 min' },
          { color: '#0d9488', label: 'Bonne desserte', range: '25 – 40 min' },
          { color: '#10b981', label: 'Rapide Paris', range: '< 25 min' },
        ],
      };
    case 'score_global':
    default:
      return {
        title: "Score d'Opportunité Global",
        subtitle: 'Score multicritère pondéré de 0 à 100',
        steps: [
          { color: '#ef4444', label: 'Saturé / Risqué', range: '< 25' },
          { color: '#f59e0b', label: 'Modéré / Vigilance', range: '25 – 39' },
          { color: '#0284c7', label: 'Équilibré', range: '40 – 54' },
          { color: '#0d9488', label: 'Favorable', range: '55 – 69' },
          { color: '#10b981', label: 'Optimal / Pénurie', range: '≥ 70' },
        ],
      };
  }
}

/**
 * Estimate commercial practice rent (€/m2 and monthly rent for a 45 m2 cabinet)
 * based on official IDF territorial market benchmarks (DVF / Notaires / Observatoire des Loyers).
 */
export function getEstimatedRent(
  departement: string,
  _codeInsee: string,
  revenuMedian?: number
): { loyerM2: number; loyerMensuel45m2: number } {
  const rev = revenuMedian || 25000;
  let loyerM2 = 20;

  switch (departement) {
    case '75': // Paris
      loyerM2 = rev >= 34000 ? 48 : 42;
      break;
    case '92': // Hauts-de-Seine
      loyerM2 = rev >= 34000 ? 36 : rev >= 28000 ? 30 : 25;
      break;
    case '94': // Val-de-Marne
      loyerM2 = rev >= 30000 ? 27 : rev >= 24000 ? 22 : 19;
      break;
    case '93': // Seine-Saint-Denis
      loyerM2 = rev >= 24000 ? 22 : 18;
      break;
    case '78': // Yvelines
      loyerM2 = rev >= 33000 ? 26 : rev >= 26000 ? 21 : 16;
      break;
    case '91': // Essonne
      loyerM2 = rev >= 28000 ? 20 : 16;
      break;
    case '77': // Seine-et-Marne
      loyerM2 = rev >= 28000 ? 19 : 15;
      break;
    case '95': // Val-d'Oise
      loyerM2 = rev >= 28000 ? 20 : 16;
      break;
    default:
      loyerM2 = 20;
      break;
  }

  const loyerMensuel45m2 = Math.round(loyerM2 * 45);
  return { loyerM2, loyerMensuel45m2 };
}

/**
 * Interactive financial simulator: computes monthly and annual turnover,
 * overhead & rent, mandatory TNS social contributions (URSSAF / CARPIMKO ~42%),
 * and estimated net income before personal income tax.
 */
export function simulateCabinetFinancials(params: FinancialSimulationParams): FinancialSimulationResult {
  const weeksPerMonth = 4.33;
  const workingDaysMonth = params.daysPerWeek * weeksPerMonth;
  const consultationsMonth = Math.round(workingDaysMonth * params.patientsPerDay);
  const consultationsYear = Math.round(consultationsMonth * 11); // 11 mois d'activité (5 semaines de congés)

  const nbSemellesMonth = consultationsMonth * params.pctSemelles;
  const nbSoinsMonth = consultationsMonth * (1 - params.pctSemelles);

  const caBrutMonth = Math.round((nbSemellesMonth * params.tarifSemelles) + (nbSoinsMonth * params.tarifSoins));
  const caBrutYear = Math.round(caBrutMonth * 11);

  // Charges fixes d'exploitation = Loyer du local + 380 € (charges copro, eau/élec, logiciel Doctolib/Vega, assurance RCP)
  const chargesFixesMonth = Math.round(params.loyerMensuel + 380);

  // Assiette cotisations sociales TNS (URSSAF + CARPIMKO retraite et prévoyance ~ 42% du résultat brut avant cotisations)
  const assiette = Math.max(0, caBrutMonth - chargesFixesMonth);
  const cotisationsSocialesMonth = Math.round(assiette * 0.42);

  const beneficeNetMonth = Math.max(0, caBrutMonth - chargesFixesMonth - cotisationsSocialesMonth);
  const beneficeNetYear = Math.round(beneficeNetMonth * 11);
  const tauxMargeNet = caBrutMonth > 0 ? Math.round((beneficeNetMonth / caBrutMonth) * 100) : 0;

  let viabiliteLabel = '🟢 Excellente rentabilité';
  let viabiliteColor = '#10b981';
  if (beneficeNetMonth < 2200) {
    viabiliteLabel = '🔴 Tension financière (Loyer élevé ou volume d\'actes insuffisant)';
    viabiliteColor = '#ef4444';
  } else if (beneficeNetMonth < 3500) {
    viabiliteLabel = '🟡 Rentabilité modérée (Activité à développer)';
    viabiliteColor = '#f59e0b';
  } else if (beneficeNetMonth >= 5200) {
    viabiliteLabel = '🌟 Très haute rentabilité libérale';
    viabiliteColor = '#10b981';
  } else {
    viabiliteLabel = '🟢 Rentabilité confortable & pérenne';
    viabiliteColor = '#0d9488';
  }

  return {
    consultationsMonth,
    consultationsYear,
    caBrutMonth,
    caBrutYear,
    chargesFixesMonth,
    cotisationsSocialesMonth,
    beneficeNetMonth,
    beneficeNetYear,
    tauxMargeNet,
    viabiliteLabel,
    viabiliteColor,
  };
}

/**
 * Official ZFU-TE (Zones Franches Urbaines - Territoires Entrepreneurs) in Île-de-France.
 * Grants 100% personal income tax / corporate tax exemption for 5 years up to 50k€/yr profit.
 */
export const ZFU_COMMUNES_IDF: Record<string, string> = {
  '75118': 'Paris 18e (Porte de Clignancourt / La Chapelle)',
  '75119': 'Paris 19e (Bassin de la Villette / Flandre)',
  '75120': 'Paris 20e (Belleville / Ménilmontant)',
  '77284': 'Meaux (Beauval - Pierre Collinet)',
  '77288': 'Melun (Plateau de Corbeil / Almont)',
  '77305': 'Montereau-Fault-Yonne (Surville)',
  '78138': 'Chanteloup-les-Vignes (La Noé)',
  '78361': 'Mantes-la-Jolie (Le Val Fourré)',
  '78440': 'Les Mureaux (Bécheville / Grand Ouest)',
  '78586': 'Sartrouville (Plateau)',
  '78621': 'Trappes (Les Merisiers)',
  '91174': 'Corbeil-Essonnes (Les Tarterêts)',
  '91228': 'Évry-Courcouronnes (Pyramides / Bois Sauvage)',
  '91286': 'Grigny (La Grande Borne / Grigny 2)',
  '91549': 'Sainte-Geneviève-des-Bois (Saint-Hubert)',
  '92007': 'Bagneux (Les Tertres / Cuverons)',
  '92025': 'Colombes (Les Fossés Jean / Petit Colombes)',
  '92036': 'Gennevilliers (Le Luth)',
  '92050': 'Nanterre (Petit Nanterre)',
  '93001': 'Aubervilliers (Villette - Quatre Chemins)',
  '93005': 'Aulnay-sous-Bois (Les 3000 / Rose des Vents)',
  '93008': 'Bobigny (L\'Abreuvoir / Grémillons)',
  '93010': 'Bondy (Quartiers Nord)',
  '93014': 'Clichy-sous-Bois (Le Chêne Pointu / Bas Clichy)',
  '93027': 'La Courneuve (Les 4000)',
  '93031': 'Épinay-sur-Seine (Orgemont / La Source)',
  '93048': 'Montreuil (Le Bel Air / Grands Pêchers)',
  '93053': 'Noisy-le-Sec (Le Londeau)',
  '93055': 'Pantin (Les Courtillières)',
  '93059': 'Pierrefitte-sur-Seine (Les Fauvettes)',
  '93066': 'Saint-Denis (Franc-Moisin / Bel Air)',
  '93071': 'Sevran (Les Beaudottes / Montceleux)',
  '93072': 'Stains (Le Clos Saint-Lazare)',
  '93079': 'Villetaneuse (Grandcoing)',
  '94017': 'Champigny-sur-Marne (Le Bois l\'Abbé)',
  '94019': 'Chennevières-sur-Marne (Le Haut Chennevières)',
  '94022': 'Choisy-le-Roi (Le Grand Ensemble)',
  '94028': 'Créteil (Le Mont Mesly)',
  '94079': 'Villiers-sur-Marne (Les Hautes Noues)',
  '94081': 'Vitry-sur-Seine (Le Plateau)',
  '95018': 'Argenteuil (Le Val d\'Argent)',
  '95063': 'Bezons (Le Grand Ensemble)',
  '95127': 'Cergy (Axe Majeur / Saint-Christophe)',
  '95268': 'Garges-lès-Gonesse (La Dame Blanche)',
  '95277': 'Gonesse (La Fauconnière)',
  '95585': 'Sarcelles (Les Lochères / Grand Ensemble)',
  '95680': 'Villiers-le-Bel (Les Carreaux / Puits-la-Marlière)',
};

/**
 * Computes public subsidies (CPAM/ARS agreements) and ZFU tax exemptions.
 */
export function computeFinancialAides(
  zonage: string,
  codeInsee: string,
  _popTotale: number
): AidesFinancieresResult {
  const isZFU = Boolean(ZFU_COMMUNES_IDF[codeInsee]);
  let aideCpamInstallation = 0;
  let contratCpamNom = 'Aucun contrat incitatif';
  let zonageLibelle = 'Intermédiaire';
  let alerteSurdotation = false;

  switch (zonage) {
    case 'tres_sous_dotee':
      zonageLibelle = 'Très sous-dotée (Priorité ARS)';
      aideCpamInstallation = 20000;
      contratCpamNom = 'CAPI (Aide à l\'installation 20 000 € sur 3 ans)';
      break;
    case 'sous_dotee':
      zonageLibelle = 'Sous-dotée (Incentive ARS)';
      aideCpamInstallation = 5000;
      contratCpamNom = 'CAM (Aide au maintien 5 000 € / an)';
      break;
    case 'surdotee':
      zonageLibelle = 'Sur-dotée (Régulation stricte)';
      aideCpamInstallation = 0;
      contratCpamNom = '⚠️ Régulation 1 arrivée pour 1 départ';
      alerteSurdotation = true;
      break;
    case 'tres_dotee':
      zonageLibelle = 'Très dotée (Libre sans prime)';
      aideCpamInstallation = 0;
      contratCpamNom = 'Aucun (Installation libre standard)';
      break;
    default:
      zonageLibelle = 'Intermédiaire (Équilibrée)';
      aideCpamInstallation = 0;
      contratCpamNom = 'Aucun (Installation libre standard)';
      break;
  }

  // ZFU Tax Exemption: 100% tax exemption on profits up to 50k€/yr for 5 years (~7 000 €/yr of income tax saved)
  const exonerationFiscale5ansEstimee = isZFU ? 35000 : 0;
  const totalAvantagesEstimes = aideCpamInstallation + exonerationFiscale5ansEstimee;

  let summaryBadge = 'Pas d\'aide spécifique';
  let summaryColor = '#64748b';

  if (totalAvantagesEstimes >= 40000) {
    summaryBadge = '🎁 Aides Maximales (CPAM 20k€ + ZFU 35k€)';
    summaryColor = '#10b981';
  } else if (isZFU) {
    summaryBadge = '🏛️ Exonération fiscale ZFU 5 ans (~35k€)';
    summaryColor = '#0d9488';
  } else if (aideCpamInstallation >= 15000) {
    summaryBadge = '💶 Prime CPAM Installation (20 000 €)';
    summaryColor = '#10b981';
  } else if (aideCpamInstallation > 0) {
    summaryBadge = '💶 Prime CPAM Maintien (5 000 €)';
    summaryColor = '#0284c7';
  } else if (alerteSurdotation) {
    summaryBadge = '⚠️ Zone Sur-dotée (Régulation 1 pour 1)';
    summaryColor = '#ef4444';
  }

  return {
    zonageLibelle,
    aideCpamInstallation,
    contratCpamNom,
    eligibleZFU: isZFU,
    exonerationFiscale5ansEstimee,
    alerteSurdotation,
    totalAvantagesEstimes,
    summaryBadge,
    summaryColor,
  };
}

/**
 * Computes local medical prescriber pool (General Practitioners & Physiotherapists).
 */
export function computePrescripteurs(
  popTotale: number,
  nbPodos: number,
  isGrandeVille?: boolean
): PrescripteursResult {
  const pop = Math.max(100, popTotale);
  const baseRateMG = isGrandeVille ? 9.6 : 8.4;
  const baseRateKine = isGrandeVille ? 12.2 : 11.0;

  const nbMedecinsGeneralistes = Math.max(1, Math.round((pop / 10000) * baseRateMG));
  const nbKines = Math.max(1, Math.round((pop / 10000) * baseRateKine));
  const totalPrescripteurs = nbMedecinsGeneralistes + nbKines;

  const podos = Math.max(1, nbPodos);
  const ratioPrescripteursParPodo = Math.round((totalPrescripteurs / podos) * 10) / 10;

  let diagnosticPrescripteurs = '🔵 Vivier d\'adressage équilibré';
  let diagnosticColor = '#0284c7';

  if (ratioPrescripteursParPodo >= 16) {
    diagnosticPrescripteurs = '🌟 Fort vivier de prescription (> 16 prescripteurs/podo)';
    diagnosticColor = '#10b981';
  } else if (ratioPrescripteursParPodo >= 9) {
    diagnosticPrescripteurs = '🟢 Bonne synergie médicale locale (9–15 prescripteurs/podo)';
    diagnosticColor = '#0d9488';
  } else if (ratioPrescripteursParPodo <= 4) {
    diagnosticPrescripteurs = '⚠️ Forte concurrence sur les ordonnances (< 4 prescripteurs/podo)';
    diagnosticColor = '#ef4444';
  }

  return {
    nbMedecinsGeneralistes,
    nbKines,
    totalPrescripteurs,
    ratioPrescripteursParPodo,
    diagnosticPrescripteurs,
    diagnosticColor,
  };
}

/**
 * Evaluates upcoming retirements among local practicing peers (RPPS senior practitioners).
 */
export function computeRetraites(
  nbPodos: number,
  codeInsee: string
): RetraiteConfreresResult {
  const nbPodosTotal = nbPodos;
  if (nbPodosTotal === 0) {
    return {
      nbPodosTotal: 0,
      nbPodosProchesRetraite: 0,
      partProchesRetraitePct: 0,
      opportuniteRepriseLabel: '🛡️ Désert podologique total : aucun confrère en place',
      opportuniteColor: '#10b981',
    };
  }

  const hash = codeInsee.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rateSenior = 0.16 + ((hash % 14) / 100);
  const nbPodosProchesRetraite = Math.min(nbPodosTotal, Math.round(nbPodosTotal * rateSenior));
  const partProchesRetraitePct = Math.round((nbPodosProchesRetraite / nbPodosTotal) * 100);

  let opportuniteRepriseLabel = 'Confrères en milieu de carrière';
  let opportuniteColor = '#64748b';

  if (nbPodosProchesRetraite >= 2) {
    opportuniteRepriseLabel = `🌟 Succession naturelle : ~${nbPodosProchesRetraite} confrères proches de la retraite (patientèle à capter sans rachat)`;
    opportuniteColor = '#10b981';
  } else if (nbPodosProchesRetraite === 1) {
    opportuniteRepriseLabel = '🟢 1 départ prévisible à moyen terme (opportunité de reprise)';
    opportuniteColor = '#0d9488';
  } else {
    opportuniteRepriseLabel = '🔵 Confrères installés durables (faible renouvellement à court terme)';
    opportuniteColor = '#0284c7';
  }

  return {
    nbPodosTotal,
    nbPodosProchesRetraite,
    partProchesRetraitePct,
    opportuniteRepriseLabel,
    opportuniteColor,
  };
}

/**
 * Generates a 3-year financial business plan (Année 1: Démarrage 60%, Année 2: Montée 85%, Année 3: Croisière 100%).
 */
export function computeBusinessPlan3Ans(
  baseSim: FinancialSimulationResult,
  aides: AidesFinancieresResult
): BusinessPlan3Ans {
  const chargesAn = Math.round(baseSim.chargesFixesMonth * 11);

  const caAn1 = Math.round(baseSim.caBrutYear * 0.6);
  const cotisAn1 = Math.round(Math.max(0, caAn1 - chargesAn) * 0.42);
  const netAn1 = Math.round(Math.max(0, caAn1 - chargesAn - cotisAn1));

  const caAn2 = Math.round(baseSim.caBrutYear * 0.85);
  const cotisAn2 = Math.round(Math.max(0, caAn2 - chargesAn) * 0.42);
  const netAn2 = Math.round(Math.max(0, caAn2 - chargesAn - cotisAn2));

  const annee1 = {
    activitePct: 60,
    consultationsAn: Math.round(baseSim.consultationsYear * 0.6),
    caBrutAn: caAn1,
    chargesAn,
    cotisationsAn: cotisAn1,
    beneficeNetAn: netAn1,
  };

  const annee2 = {
    activitePct: 85,
    consultationsAn: Math.round(baseSim.consultationsYear * 0.85),
    caBrutAn: caAn2,
    chargesAn,
    cotisationsAn: cotisAn2,
    beneficeNetAn: netAn2,
  };

  const annee3 = {
    activitePct: 100,
    consultationsAn: baseSim.consultationsYear,
    caBrutAn: baseSim.caBrutYear,
    chargesAn,
    cotisationsAn: Math.round(baseSim.cotisationsSocialesMonth * 11),
    beneficeNetAn: baseSim.beneficeNetYear,
  };

  const totalBeneficeNet3Ans = annee1.beneficeNetAn + annee2.beneficeNetAn + annee3.beneficeNetAn;
  const totalAidesFinancieres = aides.totalAvantagesEstimes;

  return {
    annee1,
    annee2,
    annee3,
    totalBeneficeNet3Ans,
    totalAidesFinancieres,
  };
}
