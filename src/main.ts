import { FilterSettings, ZonesGeoJSON, PodologuesGeoJSON, ZoneFeature } from './types';
import { DEFAULT_WEIGHTS, computeOpportunityScores, getTop10Zones } from './score';
import { MapManager } from './map';
import { UIManager } from './ui';

class App {
  private zonesGeoJSON: ZonesGeoJSON | null = null;
  private podologuesGeoJSON: PodologuesGeoJSON | null = null;
  private stationsGeoJSON: any | null = null;
  private lignesGeoJSON: any | null = null;
  private mapManager: MapManager | null = null;
  private uiManager: UIManager | null = null;
  private mapReady: boolean = false;
  private currentFilters: FilterSettings = {
    weights: { ...DEFAULT_WEIGHTS },
    activePreset: 'semelles',
    displayCriterion: 'score_global',
    minPopulation: 0,
    selectedRadiusKm: 2,
    selectedDepartment: 'all',
    showPodologuesLayer: false,
    showTransportsLayer: true,
    showCityLabels: true,
    maxTransitTimeParis: 0,
    requireTransitStation: false,
    minRatioHabPodo: 'all',
    maxConcurrencePodos: -1,
  };
  private selectedZone: ZoneFeature | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // 1. Initialize UI Manager immediately so controls and sliders are interactive from millisecond 0
    this.uiManager = new UIManager(this.currentFilters, {
      onFiltersChanged: (filters) => this.handleFiltersChanged(filters),
      onZoneClickedFromTop10: (zone) => this.handleZoneSelected(zone, true),
      onResetWeights: () => this.handleFiltersChanged(this.currentFilters),
      onRecenterIDF: () => this.mapManager?.fitIDFBounds(true),
    });

    // 2. Initialize Map Manager
    this.mapManager = new MapManager(
      'map',
      (zone) => this.handleZoneSelected(zone, false),
      () => this.onMapReady()
    );

    // 3. Asynchronously fetch GeoJSON data files in parallel
    this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      const [zonesRes, podRes, stationsRes, lignesRes] = await Promise.all([
        fetch('/data/zones.geojson'),
        fetch('/data/podologues.geojson'),
        fetch('/data/stations.geojson'),
        fetch('/data/lignes_transport.geojson'),
      ]);

      if (!zonesRes.ok || !podRes.ok) {
        throw new Error('Impossible de charger les fichiers de données GeoJSON.');
      }

      this.zonesGeoJSON = await zonesRes.json();
      this.podologuesGeoJSON = await podRes.json();
      if (stationsRes.ok) this.stationsGeoJSON = await stationsRes.json();
      if (lignesRes.ok) this.lignesGeoJSON = await lignesRes.json();

      console.log(`[Podologie IDF] Données chargées : ${this.zonesGeoJSON?.features.length} zones, ${this.podologuesGeoJSON?.features.length} praticiens, ${this.stationsGeoJSON?.features?.length || 0} gares/stations.`);

      // If map is already loaded, render immediately
      if (this.mapReady) {
        this.setupMapDataAndRender();
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'application:', error);
      alert('Erreur lors du chargement des données. Veuillez vérifier que le serveur local est actif.');
    }
  }

  private onMapReady(): void {
    this.mapReady = true;
    if (this.zonesGeoJSON && this.podologuesGeoJSON) {
      this.setupMapDataAndRender();
    }
  }

  private setupMapDataAndRender(): void {
    if (!this.zonesGeoJSON || !this.mapManager) return;

    if (this.podologuesGeoJSON) {
      this.mapManager.setPodologuesData(this.podologuesGeoJSON);
    }

    if (this.lignesGeoJSON && this.stationsGeoJSON) {
      this.mapManager.setTransportsData(this.lignesGeoJSON, this.stationsGeoJSON);
      this.mapManager.setTransportsVisible(this.currentFilters.showTransportsLayer);
    }

    this.mapManager.setCityLabelsVisible(this.currentFilters.showCityLabels);

    // Run initial score calculation
    this.recalculateAndRender();

    // Frame the whole Île-de-France region cleanly
    this.mapManager.fitIDFBounds(false);

    // Initialize instant search autocomplete with dynamic features provider
    this.uiManager?.initSearch(
      () => this.zonesGeoJSON?.features || [],
      (zone) => {
        this.handleZoneSelected(zone, true);
      }
    );
  }

  private handleFiltersChanged(newFilters: FilterSettings): void {
    this.currentFilters = { ...newFilters, weights: { ...newFilters.weights } };

    if (this.mapManager) {
      this.mapManager.setSelectedRadiusKm(this.currentFilters.selectedRadiusKm);
      this.mapManager.setPodologuesVisible(this.currentFilters.showPodologuesLayer);
      this.mapManager.setTransportsVisible(this.currentFilters.showTransportsLayer);
      this.mapManager.setCityLabelsVisible(this.currentFilters.showCityLabels);
      this.mapManager.filterByDepartment(this.currentFilters.selectedDepartment);
    }

    this.recalculateAndRender();
  }

  private recalculateAndRender(): void {
    if (!this.zonesGeoJSON || !this.mapManager || !this.uiManager) return;

    // Compute scores and individual colors on all features (< 2ms)
    this.zonesGeoJSON.features = computeOpportunityScores(
      this.zonesGeoJSON.features,
      this.currentFilters
    );
    this.uiManager.setAllZones(this.zonesGeoJSON.features);

    // Update map choropleth data
    this.mapManager.updateZonesData(this.zonesGeoJSON);

    // Count excluded zones (total and specific to population threshold)
    const excludedCount = this.zonesGeoJSON.features.filter(
      (f) => f.properties.is_excluded
    ).length;
    const minPop = this.currentFilters.minPopulation || 0;
    const popExcludedCount = minPop > 0
      ? this.zonesGeoJSON.features.filter((f) => (f.properties.pop_totale || 0) < minPop).length
      : 0;
    this.uiManager.updateExcludedCount(excludedCount, popExcludedCount);

    // Update Top 10 list
    const top10 = getTop10Zones(
      this.zonesGeoJSON.features,
      this.currentFilters.selectedDepartment,
      this.currentFilters.displayCriterion
    );
    this.uiManager.renderTop10(top10);

    // If a zone is currently selected, refresh its detail sheet with updated scores (without stealing tab focus)
    if (this.selectedZone) {
      const refreshed = this.zonesGeoJSON.features.find(
        (f) => f.properties.code_insee === this.selectedZone?.properties.code_insee
      );
      if (refreshed) {
        this.selectedZone = refreshed;
        this.uiManager.renderZoneDetail(refreshed, false);
      }
    }
  }

  private handleZoneSelected(zone: ZoneFeature, flyTo: boolean): void {
    if (!zone || !zone.properties) return;
    const inseeCode = zone.properties.code_insee;
    // Always resolve the master in-memory feature with complete typed properties
    const masterZone =
      this.zonesGeoJSON?.features.find(
        (f) => f.properties.code_insee === inseeCode
      ) || zone;

    this.selectedZone = masterZone;
    if (this.uiManager) {
      // User explicitly clicked a zone: switch to detail tab
      this.uiManager.renderZoneDetail(masterZone, true);
    }

    if (this.mapManager) {
      this.mapManager.setSelectedZone(inseeCode);
      if (flyTo) {
        const cLon = masterZone.properties.centroide_lon;
        const cLat = masterZone.properties.centroide_lat;
        if (cLon && cLat) {
          this.mapManager.flyTo(cLon, cLat, 13);
        }
      }
    }
  }
}

// Robust startup that guarantees execution even if DOMContentLoaded already fired
function startApp(): void {
  new App();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
