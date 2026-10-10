import { FilterSettings, ZoneFeature } from './types';
import { DEFAULT_WEIGHTS, getColorForScore } from './score';

export interface UIEventListeners {
  onFiltersChanged: (filters: FilterSettings) => void;
  onZoneClickedFromTop10: (zone: ZoneFeature) => void;
  onResetWeights: () => void;
}

export class UIManager {
  private currentFilters: FilterSettings;
  private listeners: UIEventListeners;

  constructor(initialFilters: FilterSettings, listeners: UIEventListeners) {
    this.currentFilters = { ...initialFilters, weights: { ...initialFilters.weights } };
    this.listeners = listeners;
    this.bindEvents();
    this.updateSliderLabels();
  }

  private bindEvents(): void {
    // 1. Sidebar Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab');
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // 2. Department Filter Pills
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

    // 3. Radius Selector Pills
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

    // 4. Weight Sliders
    const sliderDemande = document.getElementById('slider-demande') as HTMLInputElement;
    const sliderConcurrence = document.getElementById('slider-concurrence') as HTMLInputElement;
    const sliderDiabete = document.getElementById('slider-diabete') as HTMLInputElement;
    const sliderZonage = document.getElementById('slider-zonage') as HTMLInputElement;

    const onWeightInput = () => {
      this.currentFilters.weights = {
        demande_65plus: Number(sliderDemande.value),
        concurrence_inv: Number(sliderConcurrence.value),
        coef_diabete: Number(sliderDiabete.value),
        bonus_zonage: Number(sliderZonage.value),
      };
      this.updateSliderLabels();
      this.listeners.onFiltersChanged(this.currentFilters);
    };

    sliderDemande?.addEventListener('input', onWeightInput);
    sliderConcurrence?.addEventListener('input', onWeightInput);
    sliderDiabete?.addEventListener('input', onWeightInput);
    sliderZonage?.addEventListener('input', onWeightInput);

    // 5. Reset Weights Button
    const btnReset = document.getElementById('btn-reset-weights');
    btnReset?.addEventListener('click', () => {
      this.currentFilters.weights = { ...DEFAULT_WEIGHTS };
      if (sliderDemande) sliderDemande.value = String(DEFAULT_WEIGHTS.demande_65plus);
      if (sliderConcurrence) sliderConcurrence.value = String(DEFAULT_WEIGHTS.concurrence_inv);
      if (sliderDiabete) sliderDiabete.value = String(DEFAULT_WEIGHTS.coef_diabete);
      if (sliderZonage) sliderZonage.value = String(DEFAULT_WEIGHTS.bonus_zonage);
      this.updateSliderLabels();
      this.listeners.onResetWeights();
    });

    // 6. Minimum Population Slider
    const sliderMinPop = document.getElementById('slider-min-pop') as HTMLInputElement;
    sliderMinPop?.addEventListener('input', () => {
      const val = Number(sliderMinPop.value);
      this.currentFilters.minPopulation = val;
      const label = document.getElementById('val-min-pop');
      if (label) label.textContent = `${val.toLocaleString('fr-FR')} hab.`;
      this.updateSliderGauge(sliderMinPop, '#06b6d4');
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 7. Toggle Podologues Layer
    const togglePodo = document.getElementById('toggle-podologues-layer') as HTMLInputElement;
    togglePodo?.addEventListener('change', () => {
      this.currentFilters.showPodologuesLayer = togglePodo.checked;
      const chip = document.getElementById('legend-podologues-chip');
      if (chip) {
        chip.classList.toggle('hidden', !togglePodo.checked);
      }
      this.listeners.onFiltersChanged(this.currentFilters);
    });

    // 8. Sidebar Toggle Button
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    btnToggleSidebar?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
    });

    // 9. Methodology Modal
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
    const vD = document.getElementById('val-demande');
    const vC = document.getElementById('val-concurrence');
    const vDia = document.getElementById('val-diabete');
    const vZ = document.getElementById('val-zonage');

    if (vD) vD.textContent = `${w.demande_65plus} %`;
    if (vC) vC.textContent = `${w.concurrence_inv} %`;
    if (vDia) vDia.textContent = `${w.coef_diabete} %`;
    if (vZ) vZ.textContent = `${w.bonus_zonage} %`;

    const sliderDemande = document.getElementById('slider-demande') as HTMLInputElement;
    const sliderConcurrence = document.getElementById('slider-concurrence') as HTMLInputElement;
    const sliderDiabete = document.getElementById('slider-diabete') as HTMLInputElement;
    const sliderZonage = document.getElementById('slider-zonage') as HTMLInputElement;
    const sliderMinPop = document.getElementById('slider-min-pop') as HTMLInputElement;

    this.updateSliderGauge(sliderDemande, '#38bdf8');
    this.updateSliderGauge(sliderConcurrence, '#a855f7');
    this.updateSliderGauge(sliderDiabete, '#f59e0b');
    this.updateSliderGauge(sliderZonage, '#10b981');
    this.updateSliderGauge(sliderMinPop, '#06b6d4');
  }

  public updateExcludedCount(count: number): void {
    const label = document.getElementById('excluded-count-label');
    if (label) {
      label.textContent = `${count} zone${count > 1 ? 's' : ''} exclue${count > 1 ? 's' : ''} (&lt; seuil minimal)`;
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

      const card = document.createElement('div');
      card.className = 'ranking-card';
      card.innerHTML = `
        <div class="ranking-card-left">
          <div class="rank-badge top-${rank <= 3 ? rank : 'other'}">${rank}</div>
          <div class="ranking-zone-info">
            <h4>${p.nom}</h4>
            <div class="ranking-zone-meta">
              <span>Dép. ${p.departement}</span>
              <span>•</span>
              <span>${Number(p.pop_65plus || 0).toLocaleString('fr-FR')} seniors</span>
              <span>•</span>
              <span>${p[podoKey] ?? p.nb_podologues_rayon} podo. (${radius} km)</span>
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
        elRankText.textContent = `Rang départemental : ${p.rank_dept || '-'}${p.rank_dept === 1 ? 'er' : 'e'} sur ${p.total_in_dept || '-'} (${p.rank_global ? `Rang global: ${p.rank_global}e` : ''})`;
      }
    }

    // Breakdown Bars (Percentile & Active Weight)
    const pctDemande = Math.round(p.score_demande || 0);
    const pctConcurrence = Math.round(p.score_concurrence || 0);
    const pctDiabete = Math.round(p.score_diabete || 0);
    const w = this.currentFilters.weights;

    const elBarValD = document.getElementById('bar-val-demande');
    const elBarFillD = document.getElementById('bar-fill-demande');
    if (elBarValD) elBarValD.textContent = `${pctDemande} % (Poids: ${w.demande_65plus}%)`;
    if (elBarFillD) elBarFillD.style.width = `${pctDemande}%`;

    const elBarValC = document.getElementById('bar-val-concurrence');
    const elBarFillC = document.getElementById('bar-fill-concurrence');
    if (elBarValC) elBarValC.textContent = `${pctConcurrence} % (Poids: ${w.concurrence_inv}%)`;
    if (elBarFillC) elBarFillC.style.width = `${pctConcurrence}%`;

    const elBarValDia = document.getElementById('bar-val-diabete');
    const elBarFillDia = document.getElementById('bar-fill-diabete');
    if (elBarValDia) elBarValDia.textContent = `${pctDiabete} % (Poids: ${w.coef_diabete}%)`;
    if (elBarFillDia) elBarFillDia.style.width = `${pctDiabete}%`;

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
    setVal('m-zonage-status', p.zonage ? p.zonage : 'Non applicable (Standard)');

    document.querySelectorAll('.m-radius-val').forEach((el) => {
      el.textContent = String(radius);
    });

    if (autoSwitchTab) {
      this.switchTab('detail');
    }
  }
}
