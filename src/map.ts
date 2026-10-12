import maplibregl, { Map, MapGeoJSONFeature } from 'maplibre-gl';
import { ZonesGeoJSON, PodologuesGeoJSON, ZoneFeature } from './types';

// Safe MapLibre accessor: prioritize window.maplibregl from unpkg CDN script
declare const window: any;
function getMapLibre(): any {
  if (typeof window !== 'undefined' && window.maplibregl) {
    return window.maplibregl;
  }
  return maplibregl;
}

export class MapManager {
  private map: Map;
  private popup: any;
  private currentRadiusKm: number = 2;

  constructor(
    containerId: string,
    onZoneClick: (zone: ZoneFeature) => void,
    onLoadComplete: () => void
  ) {
    const ml = getMapLibre();

    // 100% Free OpenStreetMap raster tiles with MapLibre font glyphs - NO API KEY REQUIRED
    const mapStyle = {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    this.map = new ml.Map({
      container: containerId,
      style: mapStyle as any,
      center: [2.50, 48.68], // Centroid of all Île-de-France (1 285 communes)
      zoom: 8.7,
      minZoom: 7.5,
      maxZoom: 18,
    });

    this.map.addControl(new ml.NavigationControl({ showCompass: true }), 'top-right');

    this.popup = new ml.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });

    this.map.on('load', () => {
      this.initLayers();
      this.setupInteractions(onZoneClick);
      onLoadComplete();
    });

    // Auto-resize MapLibre on viewport changes and device rotation
    window.addEventListener('resize', () => {
      this.map.resize();
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.map.resize(), 200);
    });
  }

  public resize(): void {
    this.map.resize();
  }

  private initLayers(): void {
    // 1. Sources
    this.map.addSource('zones-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'code_insee',
    });

    this.map.addSource('podologues-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addSource('transports-lignes-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addSource('transports-stations-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // 2. Zones Fill Choropleth Layer (direct color property computed client-side)
    this.map.addLayer({
      id: 'zones-fill',
      type: 'fill',
      source: 'zones-source',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'is_excluded'], true],
          '#64748b', // Excluded: neutral slate gray
          ['coalesce', ['get', 'color'], '#64748b'],
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'is_excluded'], true],
          0.35,
          0.78, // High-contrast, vibrant, rich color saturation
        ],
      },
    });

    // 3. Zones Borders Layer
    this.map.addLayer({
      id: 'zones-borders',
      type: 'line',
      source: 'zones-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.0,
        'line-opacity': 0.70,
      },
    });

    // 4. Highlight Border for Selected / Hovered Zone
    this.map.addLayer({
      id: 'zones-highlight',
      type: 'line',
      source: 'zones-source',
      paint: {
        'line-color': '#0284c7',
        'line-width': [
          'case',
          ['==', ['get', 'code_insee'], ''],
          0,
          3.5,
        ],
        'line-opacity': 0.95,
      },
    });

    // 5. Commune Names Labels Layer (crisp text with halo visible over all polygons)
    this.map.addLayer({
      id: 'zones-labels',
      type: 'symbol',
      source: 'zones-source',
      minzoom: 10,
      layout: {
        'text-field': ['get', 'nom'],
        'text-font': ['Open Sans Semibold'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          10, 10,
          12, 11.5,
          14, 13.5
        ],
        'text-anchor': 'center',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-max-width': 8,
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2.2,
      },
    });

    // 6. Public Transit Network Lines (Métro, RER, Train, Tramway)
    this.map.addLayer({
      id: 'transports-lignes',
      type: 'line',
      source: 'transports-lignes-source',
      layout: {
        'visibility': 'visible',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#0284c7'],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          9, 1.8,
          12, 3.2,
          15, 5.0
        ],
        'line-opacity': 0.85,
      },
    });

    // 7. Public Transit Stations Circles
    this.map.addLayer({
      id: 'transports-stations-circles',
      type: 'circle',
      source: 'transports-stations-source',
      minzoom: 10.5,
      layout: {
        'visibility': 'visible',
      },
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10.5, 3.5,
          13, 5.5,
          16, 7.5
        ],
        'circle-color': [
          'match',
          ['get', 'mode'],
          'METRO', '#06b6d4',
          'RER', '#ef4444',
          'TRAIN', '#8b5cf6',
          'TRAMWAY', '#f59e0b',
          '#3b82f6'
        ],
        'circle-stroke-width': 1.8,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });

    // 8. Transit Station Name Labels
    this.map.addLayer({
      id: 'transports-stations-labels',
      type: 'symbol',
      source: 'transports-stations-source',
      minzoom: 13,
      layout: {
        'visibility': 'visible',
        'text-field': ['get', 'nom'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 8,
      },
      paint: {
        'text-color': '#1e293b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2.0,
      },
    });

    // 9a. Podologues Catchment / Neighborhood Coverage Halos (shows ~1km influence zone per cabinet)
    this.map.addLayer({
      id: 'podologues-halos',
      type: 'circle',
      source: 'podologues-source',
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          9, 6,
          11, 14,
          13, 30,
          15, 65
        ],
        'circle-color': '#06b6d4',
        'circle-opacity': 0.16,
        'circle-stroke-width': 1.0,
        'circle-stroke-color': '#06b6d4',
        'circle-stroke-opacity': 0.4,
      },
    });

    // 9b. Podologues Practice Locations Points
    this.map.addLayer({
      id: 'podologues-circles',
      type: 'circle',
      source: 'podologues-source',
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          9, 3,
          12, 4.5,
          14, 6.5
        ],
        'circle-color': '#06b6d4',
        'circle-stroke-width': 2.0,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });
  }

  private setupInteractions(onZoneClick: (zone: ZoneFeature) => void): void {
    // Hover on Zones
    this.map.on('mousemove', 'zones-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      this.map.getCanvas().style.cursor = 'pointer';

      const feat = e.features[0] as MapGeoJSONFeature;
      const props = feat.properties as any;

      const score = typeof props.score === 'number' ? props.score.toFixed(1) : '-';
      const pop = props.pop_totale ? Number(props.pop_totale).toLocaleString('fr-FR') : '-';
      const pop65 = props.pop_65plus ? Number(props.pop_65plus).toLocaleString('fr-FR') : '-';
      const isExcluded = props.is_excluded === true || props.is_excluded === 'true';
      const tempsParis = props.temps_paris_min ? `~${props.temps_paris_min} min` : '';
      const gareInfo = props.gare_nom ? `${props.gare_nom}` : '';

      const radius = this.currentRadiusKm || 2;
      const podoRadius = typeof props[`nb_podologues_${radius}km`] === 'number'
        ? props[`nb_podologues_${radius}km`]
        : (props.nb_podologues_rayon ?? props.nb_podologues_2km ?? 0);
      const revMedian = props.revenu_median ? `${Number(props.revenu_median).toLocaleString('fr-FR')} €/an` : '-';
      const semellesPrice = props.panier_semelles_estime ? `~${props.panier_semelles_estime} €` : '-';
      const concColor = props.concurrence_color || '#0284c7';

      let html = `<div class="map-hover-hud">
        <div class="hud-header">
          <div class="hud-title-col">
            <h4 class="hud-commune-name">${props.nom}</h4>
            <span class="hud-dept-chip">Dép. ${props.departement} • ${pop} hab.</span>
          </div>
          <div class="hud-score-chip" style="color: ${isExcluded ? '#94a3b8' : props.score_color || '#10b981'}; background: ${isExcluded ? '#94a3b818' : (props.score_color || '#10b981') + '20'}; border-color: ${isExcluded ? '#94a3b840' : (props.score_color || '#10b981') + '50'};">
            <strong>${isExcluded ? `${score}*` : score}</strong>
            <span>/ 100</span>
          </div>
        </div>`;

      if (isExcluded) {
        const reason = props.exclusion_reason || 'Commune non retenue par les filtres';
        html += `<div class="hud-excluded-alert">
          ⚠️ <strong>Hors sélection :</strong> ${reason}
        </div>`;
      } else {
        const numScore = Number(props.score) || 0;
        let badgeLabel = '🟢 Opportunité Optimale';
        let badgeColor = '#10b981';
        if (numScore >= 70) {
          badgeLabel = '🌟 Opportunité Exceptionnelle';
          badgeColor = '#10b981';
        } else if (numScore >= 55) {
          badgeLabel = '🟢 Favorable';
          badgeColor = '#0d9488';
        } else if (numScore >= 40) {
          badgeLabel = '🔵 Équilibré';
          badgeColor = '#0284c7';
        } else if (numScore >= 25) {
          badgeLabel = '🟡 Vigilance (Concurrence modérée)';
          badgeColor = '#f59e0b';
        } else {
          badgeLabel = '🔴 Saturé / Risqué';
          badgeColor = '#ef4444';
        }

        html += `<div class="hud-status-bar" style="color: ${badgeColor};">
          <span>${badgeLabel}</span>
          ${props.rank_dept ? `<span class="hud-rank-tag">#${props.rank_dept} dép.</span>` : ''}
        </div>`;
      }

      const podosComm = props.nb_podologues || 0;
      const ratioLabel = props.ratio_hab_label || (podosComm === 0 ? 'Désert (0 cabinet)' : `1 pour ${Math.round(props.pop_totale / podosComm).toLocaleString('fr-FR')} hab.`);
      const ratioColor = props.ratio_hab_color || concColor;

      html += `<div class="hud-kpi-grid">
        <div class="hud-kpi-cell">
          <span class="hud-kpi-lbl">🛡️ Concurrence (${radius}km)</span>
          <strong class="hud-kpi-val" style="color: ${podoRadius <= 2 ? '#10b981' : podoRadius >= 15 ? '#ef4444' : '#f59e0b'};">
            ${podoRadius} confrère${podoRadius > 1 ? 's' : ''}
          </strong>
        </div>
        <div class="hud-kpi-cell">
          <span class="hud-kpi-lbl">👥 Ratio & Seniors (65+)</span>
          <strong class="hud-kpi-val" style="color: ${ratioColor};">${ratioLabel} (${pop65} sen.)</strong>
        </div>
        <div class="hud-kpi-cell">
          <span class="hud-kpi-lbl">💎 Pouvoir d'achat</span>
          <strong class="hud-kpi-val text-amber">${revMedian} (Semelles ${semellesPrice})</strong>
        </div>
        <div class="hud-kpi-cell">
          <span class="hud-kpi-lbl">🚆 Paris & Gare</span>
          <strong class="hud-kpi-val text-sky">${tempsParis ? tempsParis : 'Éloigné'}${gareInfo ? ` (${gareInfo})` : ''}</strong>
        </div>
      </div>

      <div class="hud-footer-hint">
        <span>👆 Cliquer pour ouvrir la fiche complète & le simulateur</span>
      </div>
    </div>`;

      this.popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
    });

    this.map.on('mouseleave', 'zones-fill', () => {
      this.map.getCanvas().style.cursor = '';
      this.popup.remove();
    });

    // Click on Zones
    this.map.on('click', 'zones-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0] as unknown as ZoneFeature;
      this.setSelectedZone(feat.properties.code_insee);
      onZoneClick(feat);
    });

    // Hover on Podologues
    this.map.on('mouseenter', 'podologues-circles', (e) => {
      this.map.getCanvas().style.cursor = 'pointer';
      if (!e.features || e.features.length === 0) return;
      const pt = e.features[0];
      const props = pt.properties as any;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="map-hover-hud map-hover-hud-compact">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="font-size:1.1rem; line-height:1;">🩺</span>
              <div>
                <strong style="color:#f8fafc; font-size:0.82rem; display:block;">Cabinet de pédicurie-podologie</strong>
                <span style="color:#94a3b8; font-size:0.72rem;">Dép. ${props.dept} • Point géocodé BAN</span>
              </div>
            </div>
            <div style="color:#64748b; font-size:0.70rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:4px; margin-top:3px;">
              Anonymisé • Source RPPS / CNAM
            </div>
          </div>`
        )
        .addTo(this.map);
    });

    this.map.on('mouseleave', 'podologues-circles', () => {
      this.map.getCanvas().style.cursor = '';
      this.popup.remove();
    });

    // Hover on Public Transit Stations
    this.map.on('mouseenter', 'transports-stations-circles', (e) => {
      this.map.getCanvas().style.cursor = 'pointer';
      if (!e.features || e.features.length === 0) return;
      const st = e.features[0];
      const props = st.properties as any;
      const lignes = props.lignes_str || props.mode;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="map-hover-hud map-hover-hud-compact">
            <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:4px;">
              <span style="font-size:1.15rem; line-height:1.2;">🚉</span>
              <div>
                <strong style="color:#f8fafc; font-size:0.85rem; display:block;">${props.nom}</strong>
                <span style="display:inline-block; font-size:0.70rem; font-weight:600; padding:1px 6px; border-radius:4px; background:rgba(2,132,199,0.22); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); margin-top:2px;">${props.mode}</span>
              </div>
            </div>
            <div style="color:#cbd5e1; font-size:0.73rem; line-height:1.35; margin-top:4px; border-top:1px solid rgba(255,255,255,0.08); padding-top:4px;">
              ${lignes}
            </div>
          </div>`
        )
        .addTo(this.map);
    });

    this.map.on('mouseleave', 'transports-stations-circles', () => {
      this.map.getCanvas().style.cursor = '';
      this.popup.remove();
    });
  }

  public updateZonesData(geojson: ZonesGeoJSON): void {
    const source = this.map.getSource('zones-source') as any;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: geojson.features,
      });
    }
  }

  public setPodologuesData(geojson: PodologuesGeoJSON): void {
    const source = this.map.getSource('podologues-source') as any;
    if (source) {
      source.setData(geojson as any);
    }
  }

  public setTransportsData(linesGeoJSON: any, stationsGeoJSON: any): void {
    const lSource = this.map.getSource('transports-lignes-source') as any;
    if (lSource && linesGeoJSON) {
      lSource.setData(linesGeoJSON);
    }
    const sSource = this.map.getSource('transports-stations-source') as any;
    if (sSource && stationsGeoJSON) {
      sSource.setData(stationsGeoJSON);
    }
  }

  public setPodologuesVisible(visible: boolean): void {
    const val = visible ? 'visible' : 'none';
    if (this.map.getLayer('podologues-circles')) {
      this.map.setLayoutProperty('podologues-circles', 'visibility', val);
    }
    if (this.map.getLayer('podologues-halos')) {
      this.map.setLayoutProperty('podologues-halos', 'visibility', val);
    }
  }

  public setTransportsVisible(visible: boolean): void {
    const val = visible ? 'visible' : 'none';
    if (this.map.getLayer('transports-lignes')) {
      this.map.setLayoutProperty('transports-lignes', 'visibility', val);
    }
    if (this.map.getLayer('transports-stations-circles')) {
      this.map.setLayoutProperty('transports-stations-circles', 'visibility', val);
    }
    if (this.map.getLayer('transports-stations-labels')) {
      this.map.setLayoutProperty('transports-stations-labels', 'visibility', val);
    }
  }

  public setCityLabelsVisible(visible: boolean): void {
    if (this.map.getLayer('zones-labels')) {
      this.map.setLayoutProperty(
        'zones-labels',
        'visibility',
        visible ? 'visible' : 'none'
      );
    }
  }

  public setSelectedZone(codeInsee: string): void {
    if (this.map.getLayer('zones-highlight')) {
      this.map.setPaintProperty('zones-highlight', 'line-width', [
        'case',
        ['==', ['get', 'code_insee'], codeInsee],
        3.5,
        0,
      ]);
    }
  }

  public flyTo(lon: number, lat: number, zoom: number = 13): void {
    this.map.flyTo({
      center: [lon, lat],
      zoom: zoom,
      essential: true,
      duration: 1200,
    });
  }

  public setSelectedRadiusKm(radius: number): void {
    this.currentRadiusKm = radius;
  }

  private getResponsiveMapPadding(): { top: number; bottom: number; left: number; right: number } {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const isMobile = width <= 768;
    const isTablet = width > 768 && width <= 1024;
    const sidebar = typeof document !== 'undefined' ? document.getElementById('sidebar') : null;
    const isSidebarOpen = sidebar && !sidebar.classList.contains('collapsed');

    if (isMobile) {
      return { top: 60, bottom: 30, left: 20, right: 20 };
    }
    if (isTablet) {
      const leftPad = isSidebarOpen ? Math.min(380, width * 0.42) : 24;
      return { top: 60, bottom: 30, left: leftPad, right: 24 };
    }
    // Desktop
    const leftPad = isSidebarOpen ? 465 : 30;
    return { top: 60, bottom: 40, left: leftPad, right: 30 };
  }

  public fitIDFBounds(animated: boolean = true): void {
    this.map.fitBounds(
      [
        [1.44, 48.12], // Southwest (Essonne / Seine-et-Marne / Yvelines)
        [3.52, 49.23], // Northeast (Val-d'Oise / Seine-et-Marne)
      ],
      {
        padding: this.getResponsiveMapPadding(),
        duration: animated ? 900 : 0,
        essential: true,
      }
    );
  }

  public filterByDepartment(dept: string): void {
    if (!this.map.getLayer('zones-fill')) return;
    if (dept === 'all') {
      this.map.setFilter('zones-fill', null);
      this.map.setFilter('zones-borders', null);
      this.map.setFilter('zones-labels', null);
      this.fitIDFBounds(true);
    } else {
      const filter = ['==', ['get', 'departement'], dept] as any;
      this.map.setFilter('zones-fill', filter);
      this.map.setFilter('zones-borders', filter);
      this.map.setFilter('zones-labels', filter);

      const deptBounds: Record<string, [[number, number], [number, number]]> = {
        '75': [[2.24, 48.81], [2.44, 48.91]],
        '77': [[2.40, 48.12], [3.51, 49.10]],
        '78': [[1.46, 48.44], [2.22, 49.09]],
        '91': [[1.91, 48.29], [2.58, 48.77]],
        '92': [[2.14, 48.73], [2.34, 48.95]],
        '93': [[2.29, 48.82], [2.60, 48.99]],
        '94': [[2.30, 48.68], [2.60, 48.86]],
        '95': [[1.61, 48.91], [2.58, 49.23]],
      };

      if (deptBounds[dept]) {
        this.map.fitBounds(deptBounds[dept], {
          padding: this.getResponsiveMapPadding(),
          duration: 900,
          essential: true,
        });
      }
    }
  }
}
