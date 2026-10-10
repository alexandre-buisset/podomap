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
    const mapStyle = {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
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
    // Empty source for zones
    this.map.addSource('zones-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'code_insee',
    });

    // Empty source for podologues
    this.map.addSource('podologues-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // 1. Zones Fill Choropleth Layer (direct color property computed client-side)
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
          0.35,
          0.72,
        ],
      },
    });

    // 2. Zones Borders Layer
    this.map.addLayer({
      id: 'zones-borders',
      type: 'line',
      source: 'zones-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.2,
        'line-opacity': 0.5,
      },
    });

    // 3. Highlight Border for Selected / Hovered Zone
    this.map.addLayer({
      id: 'zones-highlight',
      type: 'line',
      source: 'zones-source',
      paint: {
        'line-color': '#38bdf8',
        'line-width': [
          'case',
          ['==', ['get', 'code_insee'], ''],
          0,
          3.5,
        ],
        'line-opacity': 0.95,
      },
    });

    // 4. Podologues Points Layer
    this.map.addLayer({
      id: 'podologues-circles',
      type: 'circle',
      source: 'podologues-source',
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': 4.5,
        'circle-color': '#06b6d4',
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

      let html = `<div style="font-family: var(--font-body); padding: 4px 6px;">
        <strong style="font-size: 0.9rem; color: #0f172a;">${props.nom} (${props.departement})</strong><br/>
        <span style="font-size: 0.78rem; color: #475569;">Population: ${pop} hab.</span><br/>`;

      if (isExcluded) {
        html += `<span style="font-size: 0.75rem; color: #dc2626; font-weight: 600;">Zone sous le seuil minimal</span>`;
      } else {
        html += `<span style="font-size: 0.8rem; color: #059669; font-weight: 700;">Score Opportunité: ${score} / 100</span>`;
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
    const source = this.map.getSource('podologues-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojson as any);
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
    } else {
      const filter = ['==', ['get', 'departement'], dept] as any;
      this.map.setFilter('zones-fill', filter);
      this.map.setFilter('zones-borders', filter);
    }
  }
}
