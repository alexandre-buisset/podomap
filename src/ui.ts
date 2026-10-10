import { FilterSettings, ZoneFeature, StrategyPreset, MapDisplayCriterion } from './types';
import { STRATEGY_PRESETS, getColorForScore } from './score';

export interface UIEventListeners {
  onFiltersChanged: (filters: FilterSettings) => void;
  onZoneClickedFromTop10: (zone: ZoneFeature) => void;
  onResetWeights: () => void;
  onRecenterIDF?: () => void;
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
    this.updateLegendDisplay(this.currentFilters.displayCriterion || 'score_global');
    this.updateRankingHeader(this.currentFilters.displayCriterion || 'score_global');
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

    // 15. Map Display Criterion Pills (Score Global, Concurrence, Pouvoir d'Achat, Seniors, Transports)
    const criterionPills = document.querySelectorAll('#criterion-btn-group .mode-pill');
    criterionPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        criterionPills.forEach((p) => p.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        const criterion = (target.getAttribute('data-criterion') || 'score_global') as MapDisplayCriterion;
        this.currentFilters.displayCriterion = criterion;
        this.updateLegendDisplay(criterion);
        this.updateRankingHeader(criterion);
        this.listeners.onFiltersChanged(this.currentFilters);
      });
    });

    // 16. Recenter IDF Button
    const btnRecenter = document.getElementById('btn-recenter-idf');
    btnRecenter?.addEventListener('click', () => {
      this.listeners.onRecenterIDF?.();
    });

    // 17. Quick Toggle Podologues Practices Button in Floating Bar
    const btnQuickPodo = document.getElementById('btn-quick-toggle-podo');
    btnQuickPodo?.addEventListener('click', () => {
      this.currentFilters.showPodologuesLayer = !this.currentFilters.showPodologuesLayer;
      const togglePodo = document.getElementById('toggle-podologues-layer') as HTMLInputElement;
      if (togglePodo) togglePodo.checked = this.currentFilters.showPodologuesLayer;
      btnQuickPodo.classList.toggle('active', this.currentFilters.showPodologuesLayer);
      const chip = document.getElementById('legend-podologues-chip');
      if (chip) chip.classList.toggle('hidden', !this.currentFilters.showPodologuesLayer);
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 18. Smart Strategy Quick Chips
    const smartChips = document.querySelectorAll('#smart-chips-group .smart-chip');
    smartChips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const smartType = target.getAttribute('data-smart') || '';
        smartChips.forEach((c) => c.classList.remove('active'));
        target.classList.add('active');
        this.applySmartFilter(smartType);
      });
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

  public applySmartFilter(type: string): void {
    const setCriterionPill = (crit: MapDisplayCriterion) => {
      this.currentFilters.displayCriterion = crit;
      const criterionPills = document.querySelectorAll('#criterion-btn-group .mode-pill');
      criterionPills.forEach((p) => {
        p.classList.toggle('active', p.getAttribute('data-criterion') === crit);
      });
      this.updateLegendDisplay(crit);
      this.updateRankingHeader(crit);
    };

    if (type === 'desert') {
      this.currentFilters.weights = {
        pouvoir_achat_semelles: 15,
        concurrence_inv: 60,
        demande_65plus: 25,
        transport_access: 0,
        coef_diabete: 0,
        bonus_zonage: 0,
      };
      this.currentFilters.activePreset = 'custom';
      setCriterionPill('concurrence');
    } else if (type === 'riche') {
      this.currentFilters.weights = {
        pouvoir_achat_semelles: 55,
        concurrence_inv: 25,
        demande_65plus: 15,
        transport_access: 5,
        coef_diabete: 0,
        bonus_zonage: 0,
      };
      this.currentFilters.activePreset = 'semelles';
      setCriterionPill('pouvoir_achat');
    } else if (type === 'proche_paris') {
      this.currentFilters.maxTransitTimeParis = 25;
      this.currentFilters.requireTransitStation = true;
      const toggleStation = document.getElementById('toggle-require-station') as HTMLInputElement;
      if (toggleStation) toggleStation.checked = true;
      setCriterionPill('transports');
    } else if (type === 'seniors') {
      this.currentFilters.weights = {
        demande_65plus: 55,
        concurrence_inv: 25,
        pouvoir_achat_semelles: 15,
        transport_access: 5,
        coef_diabete: 0,
        bonus_zonage: 0,
      };
      this.currentFilters.activePreset = 'custom';
      setCriterionPill('seniors');
    }

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

    this.updatePresetDisplay();
    this.updateSliderLabels();
    this.listeners.onFiltersChanged(this.currentFilters);
  }

  public initSearch(
    features: ZoneFeature[],
    onZoneSelect: (zone: ZoneFeature) => void
  ): void {
    const input = document.getElementById('global-zone-search') as HTMLInputElement;
    const dropdown = document.getElementById('search-results-dropdown');
    const btnClear = document.getElementById('btn-clear-search');
    if (!input || !dropdown) return;

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const q = normalize(raw);
      if (btnClear) btnClear.classList.toggle('hidden', q.length === 0);

      if (q.length < 2) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
      }

      const matches = features
        .filter((f) => {
          const nom = normalize(f.properties.nom || '');
          const insee = f.properties.code_insee || '';
          const dept = f.properties.departement || '';
          return nom.includes(q) || insee.startsWith(q) || (q.length >= 2 && dept === q);
        })
        .slice(0, 8);

      if (matches.length === 0) {
        dropdown.innerHTML = `<div class="search-no-result">Aucune commune trouvée pour "${input.value}"</div>`;
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = '';
      matches.forEach((f) => {
        const p = f.properties as any;
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const income = p.revenu_median ? `${p.revenu_median.toLocaleString('fr-FR')} €` : '-';
        const podos = p.nb_podologues_2km ?? p.nb_podologues ?? 0;
        const color = getColorForScore(p.score || 0);

        item.innerHTML = `
          <div class="search-item-info">
            <div class="search-item-name">
              <strong>${p.nom}</strong>
              <span class="search-dept-badge">Dép. ${p.departement}</span>
            </div>
            <div class="search-item-meta">
              <span>👥 ${Number(p.pop_totale || 0).toLocaleString('fr-FR')} hab.</span>
              <span>•</span>
              <span>Rev. ${income}</span>
              <span>•</span>
              <span style="color:${p.concurrence_color || '#10b981'}; font-weight:600;">${podos} podo. (2km)</span>
            </div>
          </div>
          <div class="search-item-score" style="color:${color}; background:${color}15; border:1px solid ${color}40;">
            ${(p.score || 0).toFixed(1)}
          </div>
        `;

        item.addEventListener('click', () => {
          input.value = p.nom;
          dropdown.classList.add('hidden');
          onZoneSelect(f);
        });

        dropdown.appendChild(item);
      });

      dropdown.classList.remove('hidden');
    });

    btnClear?.addEventListener('click', () => {
      input.value = '';
      btnClear.classList.add('hidden');
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      input.focus();
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.classList.add('hidden');
      }
    });
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

  public updateLegendDisplay(criterion: MapDisplayCriterion): void {
    const titleEl = document.getElementById('legend-title');
    const rangeEl = document.getElementById('legend-range-label');
    const barEl = document.getElementById('legend-gradient-bar');
    const lbl1 = document.getElementById('legend-lbl-1');
    const lbl2 = document.getElementById('legend-lbl-2');
    const lbl3 = document.getElementById('legend-lbl-3');
    const lbl4 = document.getElementById('legend-lbl-4');

    if (barEl) {
      barEl.className = `legend-gradient-bar gradient-${criterion}`;
    }

    switch (criterion) {
      case 'concurrence':
        if (titleEl) titleEl.textContent = '🛡️ Pression Concurrentielle';
        if (rangeEl) rangeEl.textContent = 'Saturation ➔ Désert';
        if (lbl1) lbl1.textContent = 'Saturé (>25)';
        if (lbl2) lbl2.textContent = 'Soutenu';
        if (lbl3) lbl3.textContent = 'Modéré';
        if (lbl4) lbl4.textContent = 'Désert (<8)';
        break;
      case 'pouvoir_achat':
        if (titleEl) titleEl.textContent = "💎 Pouvoir d'Achat (Filosofi)";
        if (rangeEl) rangeEl.textContent = 'Revenu médian / ménage';
        if (lbl1) lbl1.textContent = '< 22 k€';
        if (lbl2) lbl2.textContent = '22 - 27 k€';
        if (lbl3) lbl3.textContent = '27 - 33 k€';
        if (lbl4) lbl4.textContent = '> 33 k€';
        break;
      case 'seniors':
        if (titleEl) titleEl.textContent = '👥 Bassin Seniors (65+ ans)';
        if (rangeEl) rangeEl.textContent = 'Volume de patients';
        if (lbl1) lbl1.textContent = '< 1 500';
        if (lbl2) lbl2.textContent = '1 500 - 3 500';
        if (lbl3) lbl3.textContent = '3 500 - 7 000';
        if (lbl4) lbl4.textContent = '> 7 000';
        break;
      case 'transports':
        if (titleEl) titleEl.textContent = '🚆 Accès Paris & Gares (IDFM)';
        if (rangeEl) rangeEl.textContent = 'Temps vers Paris Châtelet';
        if (lbl1) lbl1.textContent = '> 60 min';
        if (lbl2) lbl2.textContent = '40 - 60 min';
        if (lbl3) lbl3.textContent = '25 - 40 min';
        if (lbl4) lbl4.textContent = '< 25 min';
        break;
      case 'score_global':
      default:
        if (titleEl) titleEl.textContent = "Score d'Opportunité Global";
        if (rangeEl) rangeEl.textContent = '0 à 100';
        if (lbl1) lbl1.textContent = 'Faible';
        if (lbl2) lbl2.textContent = 'Modéré';
        if (lbl3) lbl3.textContent = 'Favorable';
        if (lbl4) lbl4.textContent = 'Optimal';
        break;
    }
  }

  public updateRankingHeader(criterion: MapDisplayCriterion): void {
    const titleEl = document.getElementById('ranking-panel-title');
    const subEl = document.getElementById('ranking-panel-subtitle');
    switch (criterion) {
      case 'concurrence':
        if (titleEl) titleEl.textContent = '🛡️ Top 10 - Moins de Concurrence';
        if (subEl) subEl.textContent = 'Déserts podologiques (le plus faible ratio confrères / senior)';
        break;
      case 'pouvoir_achat':
        if (titleEl) titleEl.textContent = "💎 Top 10 - Pouvoir d'Achat";
        if (subEl) subEl.textContent = 'Communes les plus aisées (reste à charge semelles 140€-210€)';
        break;
      case 'seniors':
        if (titleEl) titleEl.textContent = '👥 Top 10 - Bassin Seniors 65+';
        if (subEl) subEl.textContent = "Communes comptant le plus grand nombre d'habitants âgés";
        break;
      case 'transports':
        if (titleEl) titleEl.textContent = '🚆 Top 10 - Accessibilité Paris';
        if (subEl) subEl.textContent = "Communes les plus rapides d'accès vers Paris et gares";
        break;
      case 'score_global':
      default:
        if (titleEl) titleEl.textContent = '🌟 Top 10 des Opportunités';
        if (subEl) subEl.textContent = 'Classement synthétique pondéré selon le profil actif';
        break;
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
    const densKey = `densite_10k_65plus_${radius}km` as const;
    const criterion = this.currentFilters.displayCriterion || 'score_global';

    top10Zones.forEach((feat, idx) => {
      const p = feat.properties as any;
      const rank = idx + 1;
      const podoRadius = p[podoKey] ?? p.nb_podologues_rayon ?? 0;
      const density = p[densKey] ?? p.densite_pour_10k_65plus ?? 0;
      const income = p.revenu_median ? `${p.revenu_median.toLocaleString('fr-FR')} €/an` : '-';
      const concColor = p.concurrence_color || '#10b981';
      const concLabel = p.concurrence_label || 'Faible concurrence';

      let pillScore = '';
      let pillColor = '';
      let pillBadgeHtml = '';

      if (criterion === 'concurrence') {
        pillScore = `${density.toFixed(1)} /10k`;
        pillColor = concColor;
        pillBadgeHtml = `
          <span class="ranking-pill-badge" style="color: ${p.ratio_hab_color || concColor}; background: ${p.ratio_hab_color || concColor}18; border-color: ${p.ratio_hab_color || concColor}45;">
            ${p.ratio_hab_label || concLabel} • ${podoRadius} podo. à ${radius}km
          </span>`;
      } else if (criterion === 'pouvoir_achat') {
        pillScore = `${p.revenu_median ? `${Math.round(p.revenu_median / 1000)}k€` : '-'}`;
        pillColor = '#f59e0b';
        pillBadgeHtml = `
          <span class="ranking-pill-badge" style="color: #d97706; background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.3);">
            ${p.pouvoir_achat_label || 'Aisé'} • Panier: ~${p.panier_semelles_estime || 170}€
          </span>`;
      } else if (criterion === 'seniors') {
        pillScore = `${Math.round((p.pop_65plus || 0) / 1000)}k sen.`;
        pillColor = '#6366f1';
        pillBadgeHtml = `
          <span class="ranking-pill-badge" style="color: #6366f1; background: rgba(99, 102, 241, 0.12); border-color: rgba(99, 102, 241, 0.3);">
            👥 ${Number(p.pop_65plus || 0).toLocaleString('fr-FR')} seniors (${((p.part_65plus || 0) * 100).toFixed(1)}%)
          </span>`;
      } else if (criterion === 'transports') {
        pillScore = p.temps_paris_min ? `${p.temps_paris_min} m` : '-';
        pillColor = '#06b6d4';
        pillBadgeHtml = `
          <span class="ranking-pill-badge" style="color: #06b6d4; background: rgba(6, 182, 212, 0.12); border-color: rgba(6, 182, 212, 0.3);">
            ⏱️ ${p.temps_paris_min ? `${p.temps_paris_min}m vers Châtelet` : 'Non desservi'} ${p.gare_nom ? `• 🚉 ${p.gare_nom}` : ''}
          </span>`;
      } else {
        // Score global
        pillScore = (p.score || 0).toFixed(1);
        pillColor = getColorForScore(p.score || 0);
        pillBadgeHtml = `
          <span class="ranking-pill-badge" style="color: ${p.ratio_hab_color || concColor}; background: ${p.ratio_hab_color || concColor}15; border-color: ${p.ratio_hab_color || concColor}35;">
            ${p.ratio_hab_label || `${podoRadius} podo. à ${radius}km`}
          </span>
          <span class="ranking-pill-badge" style="color: #f59e0b; background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.25);">
            💎 ~${p.panier_semelles_estime || 170}€
          </span>`;
      }

      const card = document.createElement('div');
      card.className = 'ranking-card';
      card.innerHTML = `
        <div class="ranking-card-left">
          <div class="rank-badge top-${rank <= 3 ? rank : 'other'}">${rank}</div>
          <div class="ranking-zone-info">
            <div class="ranking-title-row">
              <h4>${p.nom}</h4>
              <span class="ranking-dept-tag">Dép. ${p.departement}</span>
            </div>
            <div class="ranking-badges-row">
              ${pillBadgeHtml}
            </div>
            <div class="ranking-zone-meta">
              <span>👥 ${Number(p.pop_totale || 0).toLocaleString('fr-FR')} hab.</span>
              <span>•</span>
              <span class="meta-income">Rev. ${income}</span>
              ${p.temps_paris_min ? `<span>• ⏱️ ${p.temps_paris_min}m</span>` : ''}
            </div>
          </div>
        </div>
        <div class="ranking-score-pill" style="color: ${pillColor}; border-color: ${pillColor}45; background: ${pillColor}15;">
          ${pillScore}
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

    const elRatio = document.getElementById('m-ratio-hab-podo');
    if (elRatio) {
      elRatio.textContent = p.ratio_hab_label || (p.nb_podologues === 0 ? `🛡️ 0 podologue (${Number(p.pop_totale || 0).toLocaleString('fr-FR')} hab.)` : `1 pour ${Math.round((p.pop_totale || 0) / (p.nb_podologues || 1)).toLocaleString('fr-FR')} hab.`);
      if (p.ratio_hab_color) {
        elRatio.style.color = p.ratio_hab_color;
      }
    }

    setVal('m-density-senior', `${Number(densityInRadius).toFixed(2)} podo. / 10k seniors`);
    setVal('m-diabete-prev', `${p.prevalence_diabete ?? '-'} % (coef. ${p.coef_diabete ?? 1.0})`);
    setVal('m-pop-revenu', `${revMedian ? `${revMedian.toLocaleString('fr-FR')} € / an` : '-'}`);
    setVal('m-podo-semelles-tarif', `~${semellesPrice} € (estimé)`);
    setVal('m-zonage-status', p.zonage ? p.zonage : 'Non applicable (Standard)');

    document.querySelectorAll('.m-radius-val').forEach((el) => {
      el.textContent = String(radius);
    });

    // Regional Benchmark vs Île-de-France (1 285 communes, 12.3M hab)
    const elBmIncome = document.getElementById('bm-val-income');
    const elBmDiffIncome = document.getElementById('bm-diff-income');
    const elBmFillIncome = document.getElementById('bm-fill-income');

    const elBmDensity = document.getElementById('bm-val-density');
    const elBmDiffDensity = document.getElementById('bm-diff-density');
    const elBmFillDensity = document.getElementById('bm-fill-density');

    const elBmTransit = document.getElementById('bm-val-transit');
    const elBmDiffTransit = document.getElementById('bm-diff-transit');
    const elBmFillTransit = document.getElementById('bm-fill-transit');

    const IDF_AVG_INCOME = 25800;
    const IDF_AVG_DENSITY = 9.2;
    const IDF_AVG_TRANSIT = 42;

    if (elBmIncome) elBmIncome.textContent = revMedian ? `${revMedian.toLocaleString('fr-FR')} €` : '-';
    if (elBmDiffIncome) {
      if (!revMedian) {
        elBmDiffIncome.textContent = '-';
        elBmDiffIncome.className = 'bm-tag';
      } else if (revMedian >= IDF_AVG_INCOME) {
        const pct = Math.round(((revMedian - IDF_AVG_INCOME) / IDF_AVG_INCOME) * 100);
        elBmDiffIncome.textContent = `+${pct}% vs IDF`;
        elBmDiffIncome.className = 'bm-tag tag-green';
      } else {
        const pct = Math.round(((IDF_AVG_INCOME - revMedian) / IDF_AVG_INCOME) * 100);
        elBmDiffIncome.textContent = `-${pct}% vs IDF`;
        elBmDiffIncome.className = 'bm-tag tag-orange';
      }
    }
    if (elBmFillIncome) {
      const pct = Math.min(100, Math.max(10, Math.round((revMedian / 45000) * 100)));
      elBmFillIncome.style.width = `${pct}%`;
    }

    if (elBmDensity) elBmDensity.textContent = `${Number(densityInRadius).toFixed(1)} podo.`;
    if (elBmDiffDensity) {
      if (densityInRadius <= 3.0) {
        elBmDiffDensity.textContent = `🛡️ Désert`;
        elBmDiffDensity.className = 'bm-tag tag-emerald';
      } else if (densityInRadius < IDF_AVG_DENSITY) {
        elBmDiffDensity.textContent = `🟢 Moins saturé`;
        elBmDiffDensity.className = 'bm-tag tag-green';
      } else {
        elBmDiffDensity.textContent = `⚠️ Plus saturé`;
        elBmDiffDensity.className = 'bm-tag tag-red';
      }
    }
    if (elBmFillDensity) {
      const pct = Math.min(100, Math.max(5, Math.round((densityInRadius / 25) * 100)));
      elBmFillDensity.style.width = `${pct}%`;
    }

    if (elBmTransit) elBmTransit.textContent = p.temps_paris_min ? `${p.temps_paris_min} min` : '-';
    if (elBmDiffTransit) {
      if (!p.temps_paris_min) {
        elBmDiffTransit.textContent = '-';
        elBmDiffTransit.className = 'bm-tag';
      } else if (p.temps_paris_min <= 25) {
        elBmDiffTransit.textContent = `⚡ Express (<25m)`;
        elBmDiffTransit.className = 'bm-tag tag-cyan';
      } else if (p.temps_paris_min <= IDF_AVG_TRANSIT) {
        elBmDiffTransit.textContent = `🚆 Rapide`;
        elBmDiffTransit.className = 'bm-tag tag-green';
      } else {
        elBmDiffTransit.textContent = `⏱️ Éloigné`;
        elBmDiffTransit.className = 'bm-tag tag-orange';
      }
    }
    if (elBmFillTransit) {
      const t = p.temps_paris_min || 60;
      const pct = Math.min(100, Math.max(10, Math.round(((90 - t) / 75) * 100)));
      elBmFillTransit.style.width = `${pct}%`;
    }

    if (autoSwitchTab) {
      this.switchTab('detail');
    }
  }
}
