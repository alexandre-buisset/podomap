import { ZoneFeature, FilterSettings, ScoreWeights } from './types';

export const DEFAULT_WEIGHTS: ScoreWeights = {
  demande_65plus: 35,
  concurrence_inv: 40,
  coef_diabete: 10,
  bonus_zonage: 15,
};

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
 * Calculate opportunity score for all features based on active filter settings.
 */
export function computeOpportunityScores(
  features: ZoneFeature[],
  filters: FilterSettings
): ZoneFeature[] {
  const { weights, minPopulation, selectedRadiusKm } = filters;
  const radiusKey = `densite_10k_65plus_${selectedRadiusKm}km` as const;

  // 1. Identify active (non-excluded) features
  const activeIndices: number[] = [];
  const excludedIndices: number[] = [];

  features.forEach((feat, idx) => {
    const pop = feat.properties.pop_totale || 0;
    if (pop >= minPopulation) {
      activeIndices.push(idx);
    } else {
      excludedIndices.push(idx);
    }
  });

  // Check if any active feature has non-empty zonage
  const hasZonageData = activeIndices.some(
    (idx) => (features[idx].properties.zonage || '').trim().length > 0
  );

  // 2. Adjust weights: if no zonage data, redistribute zonage weight proportionally
  let wDemande = Math.max(0, weights.demande_65plus);
  let wConcurrence = Math.max(0, weights.concurrence_inv);
  let wDiabete = Math.max(0, weights.coef_diabete);
  let wZonage = hasZonageData ? Math.max(0, weights.bonus_zonage) : 0;

  const baseSum = wDemande + wConcurrence + wDiabete;
  if (!hasZonageData && weights.bonus_zonage > 0 && baseSum > 0) {
    const bonusToDistribute = weights.bonus_zonage;
    wDemande += (wDemande / baseSum) * bonusToDistribute;
    wConcurrence += (wConcurrence / baseSum) * bonusToDistribute;
    wDiabete += (wDiabete / baseSum) * bonusToDistribute;
  }

  const totalEffectiveWeight = wDemande + wConcurrence + wDiabete + wZonage;

  // 3. Extract active vectors for percentiles
  const pop65Values = activeIndices.map((idx) => features[idx].properties.pop_65plus || 0);
  const diabeteValues = activeIndices.map((idx) => features[idx].properties.coef_diabete || 1.0);
  const densityValues = activeIndices.map((idx) => {
    const p = features[idx].properties as any;
    return typeof p[radiusKey] === 'number' ? p[radiusKey] : p.densite_pour_10k_65plus || 0;
  });

  const pctDemande = computePercentiles(pop65Values);
  const pctDiabete = computePercentiles(diabeteValues);
  // Concurrence is inverted: less density = higher score
  const pctDensity = computePercentiles(densityValues);
  const pctConcurrenceInv = pctDensity.map((p) => Math.round((100.0 - p) * 10) / 10);

  // 4. Assign individual criterion percentiles and composite score
  activeIndices.forEach((featIdx, i) => {
    const feat = features[featIdx];
    const pDemande = pctDemande[i];
    const pConcurrence = pctConcurrenceInv[i];
    const pDiabete = pctDiabete[i];
    const zCode = (feat.properties.zonage || '').toLowerCase().trim();
    const pZonage = ZONAGE_SCORES[zCode] ?? 0;

    let composite = 0;
    if (totalEffectiveWeight > 0) {
      composite =
        (wDemande * pDemande +
          wConcurrence * pConcurrence +
          wDiabete * pDiabete +
          wZonage * pZonage) /
        totalEffectiveWeight;
    }

    feat.properties.is_excluded = false;
    feat.properties.score = Math.max(0, Math.min(100, Math.round(composite * 10) / 10));
    feat.properties.score_demande = pDemande;
    feat.properties.score_concurrence = pConcurrence;
    feat.properties.score_diabete = pDiabete;
    feat.properties.score_zonage = pZonage;
    feat.properties.color = getColorForScore(feat.properties.score, false);
  });

  // 5. Excluded features
  excludedIndices.forEach((featIdx) => {
    const feat = features[featIdx];
    feat.properties.is_excluded = true;
    feat.properties.score = 0;
    feat.properties.score_demande = 0;
    feat.properties.score_concurrence = 0;
    feat.properties.score_diabete = 0;
    feat.properties.score_zonage = 0;
    feat.properties.color = getColorForScore(0, true);
    feat.properties.rank_global = undefined;
    feat.properties.rank_dept = undefined;
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
 * Get top 10 zones matching the current filters (ordered by score descending).
 */
export function getTop10Zones(
  features: ZoneFeature[],
  selectedDepartment: string = 'all'
): ZoneFeature[] {
  const matching = features.filter((f) => {
    if (f.properties.is_excluded) return false;
    if (selectedDepartment !== 'all' && f.properties.departement !== selectedDepartment) {
      return false;
    }
    return true;
  });

  matching.sort((a, b) => (b.properties.score || 0) - (a.properties.score || 0));
  return matching.slice(0, 10);
}

/**
 * Return sleek HSL color hex for a given score (0 to 100).
 * Gradient:
 * - Excluded: Translucent Cool Gray
 * - 0 - 30: Muted Slate / Cool Steel
 * - 30 - 55: Cyan / Sky Blue
 * - 55 - 75: Emerald Green / Mint
 * - 75 - 100: Vivid Teal / Warm Gold / High Opportunity Emerald
 */
export function getColorForScore(score: number, isExcluded: boolean = false): string {
  if (isExcluded) {
    return '#94a3b8'; // Slate 400
  }

  if (score < 25) {
    // Low opportunity (cool steel)
    return '#64748b'; // Slate 500
  } else if (score < 45) {
    // Moderate (Sky Blue)
    return '#0284c7'; // Sky 600
  } else if (score < 65) {
    // Promising (Teal / Cyan)
    return '#0d9488'; // Teal 600
  } else if (score < 80) {
    // High opportunity (Emerald Green)
    return '#10b981'; // Emerald 500
  } else {
    // Exceptional opportunity (Vibrant Emerald / Warm Gold highlight)
    return '#f59e0b'; // Amber 500
  }
}
