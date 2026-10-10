import { FilterSettings, ZoneFeature, StrategyPreset } from './types';
import { STRATEGY_PRESETS, getColorForScore } from './score';

export interface UIEventListeners {
  onFiltersChanged: (filters: FilterSettings) => void;
  onZoneClickedFromTop10: (zone: ZoneFeature) => void;
  onResetWeights: () => void;
}

const PRESET_DESCRIPTIONS: Record<StrategyPreset, { badge: string; desc: string }> = {
  semelles: {
    badge: '💎 Semelles',
    desc: "<strong>💎 Semelles & Pouvoir d'Achat (Rentabilité) :</strong> Valorise les communes à haut revenu disponible (INSEE Filosofi) où le reste à charge des semelles (140€-210€) et dépassements d'honoraires sont absorbés par les mutuelles premium.",
  },
  equilibre: {
    badge: '⚖️ Équilibré',
    desc: "<strong>⚖️ Équilibré (Recommandé) :</strong> Compromis optimal entre rentabilité semelles (25%), faible concurrence locale (35%), demande seniors (25%) et transports (10%).",
  },
  medical: {
    badge: '🩺 Médical & Diabète',
    desc: "<strong>🩺 Médical & Diabète (Soins Conventionnés) :</strong> Focus sur les déserts podologiques stricts (45%), les soins diabétiques ALD conventionnés (10%) et les seniors (35%).",
  },
  custom: {
    badge: '⚙️ Personnalisé',
    desc: "<strong>⚙️ Profil Personnalisé :</strong> Pondérations ajustées manuellement sur mesure.",
  },
};

export class UIManager {
  private currentFilters: FilterSettings;
  private listeners: UIEventListeners;

  constructor(initialFilters: FilterSettings, listeners: UIEventListeners) {
    this.currentFilters = { ...initialFilters, weights: { ...initialFilters.weights } };
    this.listeners = listeners;
    this.bindEvents();
    this.updateSliderLabels();
    this.updatePresetDisplay();
  }

  private bindEvents(): void {
    // 1. Sidebar Navigation Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab');
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // 2. Strategy Presets Pills
    const presetPills = document.querySelectorAll('#strategy-preset-group .preset-btn');
    presetPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const preset = target.getAttribute('data-preset') as StrategyPreset;
        if (!preset || preset === 'custom') return;

        presetPills.forEach((p) => p.classList.remove('active'));
        target.classList.add('active');

        this.applyPreset(preset);
      });
    });

    // 3. Department Filter Pills
    const deptPills = document.querySelectorAll('#dept-filter-group .pill-btn');
    deptPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        deptPills.forEach((p) => p.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        const dept = target.getAttribute('data-dept') || 'all';
        this.currentFilters.selectedDepartment = dept;
        this.listeners.onFiltersChanged(this.currentFilters);
      });
    });

    // 4. Radius Selector Pills
    const radiusPills = document.querySelectorAll('#radius-btn-group .pill-btn');
    radiusPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        radiusPills.forEach((p) => p.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        const radius = Number(target.getAttribute('data-radius')) || 2;
        this.currentFilters.selectedRadiusKm = radius;
        const label = document.getElementById('radius-val-label');
        if (label) label.textContent = `${radius} km`;
        this.listeners.onFiltersChanged(this.currentFilters);
      });
    });

    // 5. Weight Sliders
    const sliderPouvoirAchat = document.getElementById('slider-pouvoir-achat') as HTMLInputElement;
    const sliderConcurrence = document.getElementById('slider-concurrence') as HTMLInputElement;
    const sliderDemande = document.getElementById('slider-demande') as HTMLInputElement;
    const sliderTransports = document.getElementById('slider-transports') as HTMLInputElement;
    const sliderDiabete = document.getElementById('slider-diabete') as HTMLInputElement;
    const sliderZonage = document.getElementById('slider-zonage') as HTMLInputElement;

    const onWeightInput = () => {
      this.currentFilters.weights = {
        pouvoir_achat_semelles: Number(sliderPouvoirAchat?.value || 0),
        concurrence_inv: Number(sliderConcurrence?.value || 0),
        demande_65plus: Number(sliderDemande?.value || 0),
        transport_access: Number(sliderTransports?.value || 0),
        coef_diabete: Number(sliderDiabete?.value || 0),
        bonus_zonage: Number(sliderZonage?.value || 0),
      };
      this.currentFilters.activePreset = 'custom';
      this.updatePresetDisplay();
      this.updateSliderLabels();
      this.listeners.onFiltersChanged(this.currentFilters);
    };

    sliderPouvoirAchat?.addEventListener('input', onWeightInput);
    sliderConcurrence?.addEventListener('input', onWeightInput);
    sliderDemande?.addEventListener('input', onWeightInput);
    sliderTransports?.addEventListener('input', onWeightInput);
    sliderDiabete?.addEventListener('input', onWeightInput);
    sliderZonage?.addEventListener('input', onWeightInput);

    // 6. Reset Weights Button
    const btnReset = document.getElementById('btn-reset-weights');
    btnReset?.addEventListener('click', () => {
      const activePreset = this.currentFilters.activePreset === 'custom' ? 'semelles' : this.currentFilters.activePreset;
      this.applyPreset(activePreset);
      this.listeners.onResetWeights();
    });

    // 7. Minimum Population Slider
    const sliderMinPop = document.getElementById('slider-min-pop') as HTMLInputElement;
    sliderMinPop?.addEventListener('input', () => {
      const val = Number(sliderMinPop.value);
      this.currentFilters.minPopulation = val;
      const label = document.getElementById('val-min-pop');
      if (label) label.textContent = `${val.toLocaleString('fr-FR')} hab.`;
      this.updateSliderGauge(sliderMinPop, '#06b6d4');
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 8. Toggle Podologues Layer
    const togglePodo = document.getElementById('toggle-podologues-layer') as HTMLInputElement;
    togglePodo?.addEventListener('change', () => {
      this.currentFilters.showPodologuesLayer = togglePodo.checked;
      const chip = document.getElementById('legend-podologues-chip');
      if (chip) {
        chip.classList.toggle('hidden', !togglePodo.checked);
      }
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 9. Toggle Transports Layer
    const toggleTransports = document.getElementById('toggle-transports-layer') as HTMLInputElement;
    toggleTransports?.addEventListener('change', () => {
      this.currentFilters.showTransportsLayer = toggleTransports.checked;
      const chip = document.getElementById('legend-transports-chip');
      if (chip) {
        chip.classList.toggle('hidden', !toggleTransports.checked);
      }
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 10. Toggle City Labels
    const toggleLabels = document.getElementById('toggle-city-labels') as HTMLInputElement;
    toggleLabels?.addEventListener('change', () => {
      this.currentFilters.showCityLabels = toggleLabels.checked;
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 11. Transit Travel Time Filter Pills
    const transitPills = document.querySelectorAll('#transit-time-btn-group .pill-btn');
    transitPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        transitPills.forEach((p) => p.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        const maxTime = Number(target.getAttribute('data-transit-time')) || 0;
        this.currentFilters.maxTransitTimeParis = maxTime;
        const label = document.getElementById('val-transit-time-label');
        if (label) {
          label.textContent = maxTime === 0 ? 'Tous' : `< ${maxTime} min`;
        }
        this.listeners.onFiltersChanged(this.currentFilters);
      });
    });

    // 12. Toggle Require Station Nearby
    const toggleRequireStation = document.getElementById('toggle-require-station') as HTMLInputElement;
    toggleRequireStation?.addEventListener('change', () => {
      this.currentFilters.requireTransitStation = toggleRequireStation.checked;
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 13. Sidebar Toggle Button
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    btnToggleSidebar?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
    });

    // 14. Methodology Modal
    const btnOpenMethodo = document.getElementById('btn-open-methodology');
    const btnCloseMethodo = document.getElementById('btn-close-modal');
    const modalMethodo = document.getElementById('modal-methodology');

    btnOpenMethodo?.addEventListener('click', () => {
      modalMethodo?.classList.remove('hidden');
    });
    btnCloseMethodo?.addEventListener('click', () => {
      modalMethodo?.classList.add('hidden');
    });
    modalMethodo?.addEventListener('click', (e) => {
      if (e.target === modalMethodo) modalMethodo.classList.add('hidden');
    });
  }

  public applyPreset(preset: StrategyPreset): void {
    if (preset === 'custom') return;
    this.currentFilters.activePreset = preset;
    this.currentFilters.weights = { ...STRATEGY_PRESETS[preset] };

    const sliderPouvoirAchat = document.getElementById('slider-pouvoir-achat') as HTMLInputElement;
    const sliderConcurrence = document.getElementById('slider-concurrence') as HTMLInputElement;
    const sliderDemande = document.getElementById('slider-demande') as HTMLInputElement;
    const sliderTransports = document.getElementById('slider-transports') as HTMLInputElement;
    const sliderDiabete = document.getElementById('slider-diabete') as HTMLInputElement;
    const sliderZonage = document.getElementById('slider-zonage') as HTMLInputElement;

    const w = this.currentFilters.weights;
    if (sliderPouvoirAchat) sliderPouvoirAchat.value = String(w.pouvoir_achat_semelles);
    if (sliderConcurrence) sliderConcurrence.value = String(w.concurrence_inv);
    if (sliderDemande) sliderDemande.value = String(w.demande_65plus);
    if (sliderTransports) sliderTransports.value = String(w.transport_access);
    if (sliderDiabete) sliderDiabete.value = String(w.coef_diabete);
    if (sliderZonage) sliderZonage.value = String(w.bonus_zonage);

    // Update preset pills active state
    const presetPills = document.querySelectorAll('#strategy-preset-group .preset-btn');
    presetPills.forEach((p) => {
      p.classList.toggle('active', p.getAttribute('data-preset') === preset);
    });

    this.updatePresetDisplay();
    this.updateSliderLabels();
    this.listeners.onFiltersChanged(this.currentFilters);
  }

  private updatePresetDisplay(): void {
    const info = PRESET_DESCRIPTIONS[this.currentFilters.activePreset] || PRESET_DESCRIPTIONS.custom;
    const badge = document.getElementById('active-preset-badge');
    const desc = document.getElementById('preset-description');

    if (badge) badge.textContent = info.badge;
    if (desc) desc.innerHTML = info.desc;

    if (this.currentFilters.activePreset === 'custom') {
      const presetPills = document.querySelectorAll('#strategy-preset-group .preset-btn');
      presetPills.forEach((p) => p.classList.remove('active'));
    }
  }

  public switchTab(tabName: string): void {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tabName}`);
    });
  }

  private updateSliderGauge(slider: HTMLInputElement | null, color: string): void {
    if (!slider) return;
    const val = Number(slider.value);
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 100;
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    slider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`;
  }

  private updateSliderLabels(): void {
    const w = this.currentFilters.weights;
    const vPA = document.getElementById('val-pouvoir-achat');
    const vC = document.getElementById('val-concurrence');
    const vD = document.getElementById('val-demande');
    const vT = document.getElementById('val-transports');
    const vDia = document.getElementById('val-diabete');
    const vZ = document.getElementById('val-zonage');

    if (vPA) vPA.textContent = `${w.pouvoir_achat_semelles} %`;
    if (vC) vC.textContent = `${w.concurrence_inv} %`;
    if (vD) vD.textContent = `${w.demande_65plus} %`;
    if (vT) vT.textContent = `${w.transport_access} %`;
    if (vDia) vDia.textContent = `${w.coef_diabete} %`;
    if (vZ) vZ.textContent = `${w.bonus_zonage} %`;

    const sliderPouvoirAchat = document.getElementById('slider-pouvoir-achat') as HTMLInputElement;
    const sliderConcurrence = document.getElementById('slider-concurrence') as HTMLInputElement;
    const sliderDemande = document.getElementById('slider-demande') as HTMLInputElement;
    const sliderTransports = document.getElementById('slider-transports') as HTMLInputElement;
    const sliderDiabete = document.getElementById('slider-diabete') as HTMLInputElement;
    const sliderZonage = document.getElementById('slider-zonage') as HTMLInputElement;
    const sliderMinPop = document.getElementById('slider-min-pop') as HTMLInputElement;

    this.updateSliderGauge(sliderPouvoirAchat, '#f59e0b'); // Warm Gold / Amber
    this.updateSliderGauge(sliderConcurrence, '#a855f7');  // Purple
    this.updateSliderGauge(sliderDemande, '#38bdf8');      // Sky Blue
    this.updateSliderGauge(sliderTransports, '#06b6d4');   // Cyan
    this.updateSliderGauge(sliderDiabete, '#f97316');      // Orange
    this.updateSliderGauge(sliderZonage, '#10b981');       // Emerald
    this.updateSliderGauge(sliderMinPop, '#06b6d4');
  }

  public updateExcludedCount(count: number): void {
    const label = document.getElementById('excluded-count-label');
    if (label) {
      label.textContent = `${count} zone${count > 1 ? 's' : ''} exclue${count > 1 ? 's' : ''} (< seuil minimal)`;
    }
  }

  public renderTop10(top10Zones: ZoneFeature[]): void {
    const container = document.getElementById('top10-list');
    const badge = document.getElementById('badge-top-count');
    if (badge) badge.textContent = String(top10Zones.length);

    if (!container) return;
    container.innerHTML = '';

    if (top10Zones.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>Aucune zone éligible avec les filtres actuels.</p></div>`;
      return;
    }

    const radius = this.currentFilters.selectedRadiusKm;
    const podoKey = `nb_podologues_${radius}km` as const;

    top10Zones.forEach((feat, idx) => {
      const p = feat.properties as any;
      const rank = idx + 1;
      const score = (p.score || 0).toFixed(1);
      const color = getColorForScore(p.score || 0);

      const income = p.revenu_median ? `${p.revenu_median.toLocaleString('fr-FR')} €/an` : '-';
      const semelles = p.panier_semelles_estime ? `💎 ~${p.panier_semelles_estime} €` : '';

      const card = document.createElement('div');
      card.className = 'ranking-card';
      card.innerHTML = `
        <div class="ranking-card-left">
          <div class="rank-badge top-${rank <= 3 ? rank : 'other'}">${rank}</div>
          <div class="ranking-zone-info">
            <div class="ranking-title-row">
              <h4>${p.nom}</h4>
              ${semelles ? `<span class="ranking-semelles-chip">${semelles}</span>` : ''}
            </div>
            <div class="ranking-zone-meta">
              <span>Dép. ${p.departement}</span>
              <span>•</span>
              <span class="meta-income">Rev. ${income}</span>
              <span>•</span>
              <span>${p[podoKey] ?? p.nb_podologues_rayon} podo. (${radius} km)</span>
              ${p.temps_paris_min ? `<span>• ⏱️ ${p.temps_paris_min}m</span>` : ''}
            </div>
          </div>
        </div>
        <div class="ranking-score-pill" style="color: ${color}; border-color: ${color}40; background: ${color}15;">
          ${score}
        </div>
      `;

      card.addEventListener('click', () => {
        this.listeners.onZoneClickedFromTop10(feat);
      });

      container.appendChild(card);
    });
  }

  public renderZoneDetail(zone: ZoneFeature, autoSwitchTab: boolean = false): void {
    const emptyState = document.getElementById('zone-detail-empty');
    const content = document.getElementById('zone-detail-content');
    if (emptyState) emptyState.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    const p = zone.properties as any;
    const radius = this.currentFilters.selectedRadiusKm;

    // Header & Badges
    const elNom = document.getElementById('sheet-zone-nom');
    const elDept = document.getElementById('sheet-dept-badge');
    const elInsee = document.getElementById('sheet-insee-code');
    const elScoreVal = document.getElementById('sheet-score-val');
    const elScoreCircle = document.getElementById('sheet-score-circle');

    if (elNom) elNom.textContent = p.nom;
    if (elDept) elDept.textContent = `Dép. ${p.departement}`;
    if (elInsee) elInsee.textContent = `Code INSEE : ${p.code_insee}`;

    const score = p.is_excluded ? 0 : p.score || 0;
    if (elScoreVal) elScoreVal.textContent = p.is_excluded ? 'Exclue' : score.toFixed(1);

    const scoreColor = getColorForScore(score, p.is_excluded);
    if (elScoreCircle) {
      elScoreCircle.style.borderColor = scoreColor;
      elScoreCircle.style.background = `radial-gradient(circle closest-side, rgba(15, 23, 42, 0.95) 70%, transparent 72%), conic-gradient(${scoreColor} ${score}%, rgba(255, 255, 255, 0.1) 0)`;
      elScoreCircle.style.boxShadow = `0 0 18px ${scoreColor}50`;
    }

    // Rank Banner
    const elRankBanner = document.getElementById('sheet-rank-banner');
    const elRankText = document.getElementById('sheet-rank-text');
    if (elRankBanner && elRankText) {
      if (p.is_excluded) {
        elRankBanner.classList.add('hidden');
      } else {
        elRankBanner.classList.remove('hidden');
        elRankText.textContent = `Rang départemental : ${p.rank_dept || '-'}${p.rank_dept === 1 ? 'er' : 'e'} sur ${p.total_in_dept || '-'} (${p.rank_global ? `Rang IDF: ${p.rank_global}e` : ''})`;
      }
    }

    // Breakdown Bars (Percentile & Active Weight)
    const pctPouvoirAchat = Math.round(p.score_pouvoir_achat || 0);
    const pctConcurrence = Math.round(p.score_concurrence || 0);
    const pctDemande = Math.round(p.score_demande || 0);
    const pctTransit = Math.round(p.score_transit || 0);
    const pctDiabete = Math.round(p.score_diabete || 0);
    const w = this.currentFilters.weights;

    const elBarValPA = document.getElementById('bar-val-pouvoir-achat');
    const elBarFillPA = document.getElementById('bar-fill-pouvoir-achat');
    if (elBarValPA) elBarValPA.textContent = `${pctPouvoirAchat} % (Poids: ${w.pouvoir_achat_semelles}%)`;
    if (elBarFillPA) elBarFillPA.style.width = `${pctPouvoirAchat}%`;

    const elBarValC = document.getElementById('bar-val-concurrence');
    const elBarFillC = document.getElementById('bar-fill-concurrence');
    if (elBarValC) elBarValC.textContent = `${pctConcurrence} % (Poids: ${w.concurrence_inv}%)`;
    if (elBarFillC) elBarFillC.style.width = `${pctConcurrence}%`;

    const elBarValD = document.getElementById('bar-val-demande');
    const elBarFillD = document.getElementById('bar-fill-demande');
    if (elBarValD) elBarValD.textContent = `${pctDemande} % (Poids: ${w.demande_65plus}%)`;
    if (elBarFillD) elBarFillD.style.width = `${pctDemande}%`;

    const elBarValT = document.getElementById('bar-val-transit');
    const elBarFillT = document.getElementById('bar-fill-transit');
    if (elBarValT) elBarValT.textContent = `${pctTransit} % (Poids: ${w.transport_access}%)`;
    if (elBarFillT) elBarFillT.style.width = `${pctTransit}%`;

    const elBarValDia = document.getElementById('bar-val-diabete');
    const elBarFillDia = document.getElementById('bar-fill-diabete');
    if (elBarValDia) elBarValDia.textContent = `${pctDiabete} % (Poids: ${w.coef_diabete}%)`;
    if (elBarFillDia) elBarFillDia.style.width = `${pctDiabete}%`;

    // Economic Potential & Insole Pricing Card
    const elIncomeMedian = document.getElementById('m-income-median');
    const elSemellesPrice = document.getElementById('m-income-semelles-price');
    const elTaxRate = document.getElementById('m-income-tax-rate');
    const elSocialShare = document.getElementById('m-income-social-share');
    const elIncomeVerdict = document.getElementById('m-income-verdict');

    const revMedian = p.revenu_median || 0;
    const taxRate = p.taux_imposition ?? 0;
    const semellesPrice = p.panier_semelles_estime || 170;

    if (elIncomeMedian) {
      elIncomeMedian.textContent = revMedian ? `${revMedian.toLocaleString('fr-FR')} € / an` : '-';
    }
    if (elSemellesPrice) {
      elSemellesPrice.textContent = `~${semellesPrice} € (Bilan + paire)`;
    }
    if (elTaxRate) {
      elTaxRate.textContent = `${taxRate} % des foyers`;
    }
    if (elSocialShare) {
      elSocialShare.textContent = `${p.part_prestations_sociales ?? '-'} %`;
    }

    if (elIncomeVerdict) {
      if (revMedian >= 32000 && taxRate >= 65) {
        elIncomeVerdict.className = 'income-verdict-box verdict-high';
        elIncomeVerdict.innerHTML = `<strong>🌟 Excellent pouvoir d'achat pour semelles :</strong> Population aisée avec d'excellentes mutuelles complémentaires. Les honoraires libres (170€–210€) et le renouvellement annuel sont largement acceptés.`;
      } else if (revMedian >= 25000) {
        elIncomeVerdict.className = 'income-verdict-box verdict-medium';
        elIncomeVerdict.innerHTML = `<strong>⚖️ Potentiel équilibré :</strong> Bonne solvabilité globale. Clientèle familiale et active capable d'investir dans des bilans posturaux et semelles sur prescription.`;
      } else {
        elIncomeVerdict.className = 'income-verdict-box verdict-low';
        elIncomeVerdict.innerHTML = `<strong>⚠️ Attention solvabilité hors-Sécu :</strong> Zone à revenu modeste. Forte part de soins conventionnés plafonnés (diabète à ~27€) et patientèle CSS/CMU peu encline aux semelles à honoraires libres.`;
      }
    }

    // Transit Accessibility Card
    const elTransitTime = document.getElementById('m-transit-time');
    const elTransitStation = document.getElementById('m-transit-station');
    const elTransitDist = document.getElementById('m-transit-dist');
    const elTransitNbGares = document.getElementById('m-transit-nb-gares');
    const elTransitLines = document.getElementById('m-transit-lines');

    if (elTransitTime) {
      elTransitTime.textContent = p.temps_paris_min ? `~${p.temps_paris_min} min vers Paris Châtelet` : '-';
    }
    if (elTransitStation) {
      elTransitStation.textContent = p.gare_nom ? `${p.gare_nom}` : 'Aucune gare ferrée proche';
    }
    if (elTransitDist) {
      elTransitDist.textContent = p.gare_dist_km != null ? `${p.gare_dist_km} km (${p.gare_mode || ''})` : '-';
    }
    if (elTransitNbGares) {
      const nb = p.nb_gares_1_5km || 0;
      elTransitNbGares.textContent = `${nb} station${nb > 1 ? 's' : ''} ferrée${nb > 1 ? 's' : ''}`;
    }
    if (elTransitLines) {
      elTransitLines.innerHTML = '';
      const lignes = p.gare_lignes || [];
      if (lignes.length === 0) {
        elTransitLines.textContent = p.gare_mode || 'Réseau bus';
      } else {
        lignes.forEach((lig: string) => {
          const badge = document.createElement('span');
          badge.className = `badge-transit-line mode-${p.gare_mode || 'TRAIN'}`;
          badge.textContent = lig;
          elTransitLines.appendChild(badge);
        });
      }
    }

    // Metrics Table
    const podoInRadius = p[`nb_podologues_${radius}km`] ?? p.nb_podologues_rayon ?? 0;
    const densityInRadius = p[`densite_10k_65plus_${radius}km`] ?? p.densite_pour_10k_65plus ?? 0;

    const setVal = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('m-pop-totale', `${Number(p.pop_totale || 0).toLocaleString('fr-FR')} hab.`);
    setVal('m-pop-65plus', `${Number(p.pop_65plus || 0).toLocaleString('fr-FR')} hab.`);
    setVal('m-part-65plus', `${((p.part_65plus || 0) * 100).toFixed(1)} %`);
    setVal('m-podo-zone', `${p.nb_podologues || 0}`);
    setVal('m-podo-radius', `${podoInRadius}`);
    setVal('m-density-senior', `${Number(densityInRadius).toFixed(2)} podo. / 10k seniors`);
    setVal('m-diabete-prev', `${p.prevalence_diabete ?? '-'} % (coef. ${p.coef_diabete ?? 1.0})`);
    setVal('m-pop-revenu', `${revMedian ? `${revMedian.toLocaleString('fr-FR')} € / an` : '-'}`);
    setVal('m-podo-semelles-tarif', `~${semellesPrice} € (estimé)`);
    setVal('m-zonage-status', p.zonage ? p.zonage : 'Non applicable (Standard)');

    document.querySelectorAll('.m-radius-val').forEach((el) => {
      el.textContent = String(radius);
    });

    if (autoSwitchTab) {
      this.switchTab('detail');
    }
  }
}
