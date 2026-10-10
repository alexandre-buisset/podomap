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
      center: [2.3522, 48.8566], // Paris
      zoom: 10.4,
      minZoom: 8,
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
          '#94a3b8', // Excluded: neutral gray
          ['coalesce', ['get', 'color'], '#64748b'],
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'is_excluded'], true],
          0.30,
          0.68,
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
        'line-width': 1.2,
        'line-opacity': 0.6,
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

    // 9. Podologues Practice Locations Points
    this.map.addLayer({
      id: 'podologues-circles',
      type: 'circle',
      source: 'podologues-source',
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': 4.5,
        'circle-color': '#0ea5e9',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9,
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
      const isExcluded = props.is_excluded === true || props.is_excluded === 'true';
      const tempsParis = props.temps_paris_min ? `~${props.temps_paris_min} min vers Paris Châtelet` : '';
      const gareInfo = props.gare_nom ? `${props.gare_nom} (${props.gare_dist_km} km)` : '';

      let html = `<div style="font-family: var(--font-body); padding: 4px 6px;">
        <strong style="font-size: 0.92rem; color: #0f172a;">${props.nom} (${props.departement})</strong><br/>
        <span style="font-size: 0.78rem; color: #475569;">Population: ${pop} hab.</span><br/>`;

      if (tempsParis) {
        html += `<span style="font-size: 0.76rem; color: #0284c7; font-weight: 600;">🚆 ${tempsParis}</span><br/>`;
      }
      if (gareInfo) {
        html += `<span style="font-size: 0.74rem; color: #64748b;">🚉 ${gareInfo}</span><br/>`;
      }

      if (isExcluded) {
        html += `<span style="font-size: 0.75rem; color: #dc2626; font-weight: 600;">Zone sous le seuil minimal</span>`;
      } else {
        html += `<span style="font-size: 0.82rem; color: #059669; font-weight: 700;">Score Opportunité: ${score} / 100</span>`;
      }
      html += `</div>`;

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
          `<div style="font-family: var(--font-body); padding: 2px 4px; font-size: 0.78rem; color: #0f172a;">
            <strong>Cabinet de pédicurie-podologie</strong><br/>
            <span style="color: #64748b;">Dép. ${props.dept} (Point anonymisé BAN)</span>
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
          `<div style="font-family: var(--font-body); padding: 4px 6px; font-size: 0.82rem; color: #0f172a;">
            <strong>🚉 ${props.nom}</strong><br/>
            <span style="font-size: 0.75rem; color: #0284c7; font-weight: 600;">${props.mode}</span><br/>
            <span style="font-size: 0.73rem; color: #475569;">${lignes}</span>
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
    if (this.map.getLayer('podologues-circles')) {
      this.map.setLayoutProperty(
        'podologues-circles',
        'visibility',
        visible ? 'visible' : 'none'
      );
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

  public filterByDepartment(dept: string): void {
    if (!this.map.getLayer('zones-fill')) return;
    if (dept === 'all') {
      this.map.setFilter('zones-fill', null);
      this.map.setFilter('zones-borders', null);
      this.map.setFilter('zones-labels', null);
    } else {
      const filter = ['==', ['get', 'departement'], dept] as any;
      this.map.setFilter('zones-fill', filter);
      this.map.setFilter('zones-borders', filter);
      this.map.setFilter('zones-labels', filter);
    }
  }
}
