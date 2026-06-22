import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import type { Zone } from '../../types/scene';
import { MAP_CENTER, polygonCentroid } from '../../services/geometryUtils';
import { mockSceneStore } from '../../services/mockSceneStore';
import { roadCenterlines } from '../../data/mockPaths';
import { useSceneStore, type LayerKey, type Basemap } from '../../store/sceneStore';
import EntityMarker from './EntityMarker';
import CameraMarker from './CameraMarker';
import TrafficLightMarker from './TrafficLightMarker';
import TrailLayer from './TrailLayer';
import { trafficLights } from '../../data/trafficLights';

/**
 * Clean custom MapLibre style: light land background only. Everything else
 * (water, park, roads, buildings, lanes) is drawn from mock GeoJSON layers,
 * so the prototype needs no external tile or glyph servers.
 */
const baseStyle: StyleSpecification = {
  version: 8,
  name: 'SceneFlow Light',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e9ecf0' },
    },
  ],
};

const zoneFeature = (zone: Zone): Feature => ({
  type: 'Feature',
  properties: { name: zone.name, zone_type: zone.zone_type, ...zone.properties },
  geometry: zone.geometry,
});

const fc = (features: Feature[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Real-world raster basemaps (no API key, no glyph server). These break the
 * project's "offline custom GeoJSON only" rule on purpose: they sit *under* the
 * GeoJSON overlays and are hidden unless the user picks them in the sidebar, so
 * the offline 'mock' basemap stays the default for demos with no network.
 */
const RASTER_BASEMAPS = {
  satellite: {
    layerId: 'satellite-tiles',
    sourceId: 'satellite-src',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  streets: {
    layerId: 'streets-tiles',
    sourceId: 'streets-src',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
  },
} as const;

/**
 * Painted "terrain" layers that mimic a real basemap. Hidden whenever a real
 * raster basemap is active, since the imagery already shows the ground truth.
 */
const TERRAIN_LAYERS = [
  'water-fill',
  'water-line',
  'park-fill',
  'pedestrian-fill',
  'parking-fill',
  'parking-line',
  'road-casing',
  'road-fill',
  'building-fill',
  'building-line',
];

/** Map layer ids controlled by each sidebar layer toggle. */
const LAYER_GROUPS: Partial<Record<LayerKey, string[]>> = {
  zones: [
    'building-fill',
    'building-line',
    'parking-fill',
    'parking-line',
    'pedestrian-fill',
    'park-fill',
    'restricted-fill',
    'restricted-line',
  ],
  incidents: ['incident-zone-fill', 'incident-zone-line'],
  paths: ['lane-lines', 'shuttle-line', 'ped-lines', 'water-lines'],
  cameras: ['camera-coverage-fill', 'camera-coverage-line'],
  trails: ['trail-line'],
};

function addStaticLayers(map: maplibregl.Map): void {
  // Real raster basemaps go in first so they render beneath every overlay.
  // Hidden by default; the basemap effect toggles visibility.
  for (const { layerId, sourceId, tiles, attribution } of Object.values(RASTER_BASEMAPS)) {
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [...tiles],
      tileSize: 256,
      maxzoom: 19,
      attribution,
    });
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      layout: { visibility: 'none' },
    });
  }

  const zones = mockSceneStore.getZones();
  const paths = mockSceneStore.getPaths();
  const cameras = mockSceneStore.getCameras();

  const byType = (type: Zone['zone_type'], extra?: (z: Zone) => boolean) =>
    fc(zones.filter((z) => z.zone_type === type && (extra ? extra(z) : true)).map(zoneFeature));

  map.addSource('zones-water', { type: 'geojson', data: byType('waterway') });
  map.addSource('zones-park', {
    type: 'geojson',
    data: byType('pedestrian', (z) => z.properties?.kind === 'park'),
  });
  map.addSource('zones-pedestrian', {
    type: 'geojson',
    data: byType('pedestrian', (z) => z.properties?.kind !== 'park'),
  });
  map.addSource('zones-parking', { type: 'geojson', data: byType('parking') });
  map.addSource('zones-building', { type: 'geojson', data: byType('building') });
  map.addSource('zones-restricted', { type: 'geojson', data: byType('restricted') });
  map.addSource('zones-incident', { type: 'geojson', data: byType('incident') });

  map.addSource('roads', {
    type: 'geojson',
    data: fc(
      roadCenterlines.map((r) => ({
        type: 'Feature',
        properties: { name: r.name },
        geometry: r.geometry,
      })),
    ),
  });

  const pathFC = (filter: (pathType: string, pathId: string) => boolean) =>
    fc(
      paths
        .filter((p) => filter(p.path_type, p.path_id))
        .map((p) => ({
          type: 'Feature' as const,
          properties: { name: p.name, path_id: p.path_id, path_type: p.path_type },
          geometry: p.geometry,
        })),
    );

  map.addSource('lane-paths', { type: 'geojson', data: pathFC((t) => t === 'road_lane') });
  map.addSource('shuttle-path', { type: 'geojson', data: pathFC((t) => t === 'shuttle_route') });
  map.addSource('ped-paths', { type: 'geojson', data: pathFC((t) => t === 'pedestrian_path') });
  map.addSource('water-paths', { type: 'geojson', data: pathFC((t) => t === 'waterway') });

  map.addSource('camera-coverage', {
    type: 'geojson',
    data: fc(
      cameras.map((c) => ({
        type: 'Feature' as const,
        properties: { camera_id: c.camera_id, status: c.status },
        geometry: c.coverage_polygon,
      })),
    ),
  });

  map.addSource('trail', { type: 'geojson', data: EMPTY_FC });

  // ── Terrain-style base layers (always visible) ──
  map.addLayer({
    id: 'water-fill',
    type: 'fill',
    source: 'zones-water',
    paint: { 'fill-color': '#aecdeb' },
  });
  map.addLayer({
    id: 'water-line',
    type: 'line',
    source: 'zones-water',
    paint: { 'line-color': '#8fb8e0', 'line-width': 1 },
  });
  map.addLayer({
    id: 'park-fill',
    type: 'fill',
    source: 'zones-park',
    paint: { 'fill-color': '#cde8cf' },
  });
  map.addLayer({
    id: 'pedestrian-fill',
    type: 'fill',
    source: 'zones-pedestrian',
    paint: { 'fill-color': '#e3e8ee' },
  });
  map.addLayer({
    id: 'parking-fill',
    type: 'fill',
    source: 'zones-parking',
    paint: { 'fill-color': '#dde3ea' },
  });
  map.addLayer({
    id: 'parking-line',
    type: 'line',
    source: 'zones-parking',
    paint: { 'line-color': '#b8c2cf', 'line-width': 1, 'line-dasharray': [3, 2] },
  });

  // ── Roads ──
  map.addLayer({
    id: 'road-casing',
    type: 'line',
    source: 'roads',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#cfd4da',
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 8, 17, 16, 19, 34],
    },
  });
  map.addLayer({
    id: 'road-fill',
    type: 'line',
    source: 'roads',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 6, 17, 13, 19, 28],
    },
  });

  // ── Buildings and special zones ──
  map.addLayer({
    id: 'building-fill',
    type: 'fill',
    source: 'zones-building',
    paint: { 'fill-color': '#d8dfe9' },
  });
  map.addLayer({
    id: 'building-line',
    type: 'line',
    source: 'zones-building',
    paint: { 'line-color': '#a8b6c8', 'line-width': 1.2 },
  });
  map.addLayer({
    id: 'restricted-fill',
    type: 'fill',
    source: 'zones-restricted',
    paint: { 'fill-color': 'rgba(220, 38, 38, 0.07)' },
  });
  map.addLayer({
    id: 'restricted-line',
    type: 'line',
    source: 'zones-restricted',
    paint: { 'line-color': '#dc2626', 'line-width': 1.4, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'incident-zone-fill',
    type: 'fill',
    source: 'zones-incident',
    paint: { 'fill-color': 'rgba(244, 63, 94, 0.12)' },
  });
  map.addLayer({
    id: 'incident-zone-line',
    type: 'line',
    source: 'zones-incident',
    paint: { 'line-color': '#f43f5e', 'line-width': 1.4, 'line-dasharray': [2, 1.5] },
  });

  // ── Path / lane overlays ──
  map.addLayer({
    id: 'lane-lines',
    type: 'line',
    source: 'lane-paths',
    paint: { 'line-color': '#93c5fd', 'line-width': 1.3, 'line-dasharray': [3, 3] },
  });
  map.addLayer({
    id: 'shuttle-line',
    type: 'line',
    source: 'shuttle-path',
    paint: { 'line-color': '#f59e0b', 'line-width': 2.2, 'line-dasharray': [1.5, 1.5] },
  });
  map.addLayer({
    id: 'ped-lines',
    type: 'line',
    source: 'ped-paths',
    paint: { 'line-color': '#10b981', 'line-width': 1.7, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'water-lines',
    type: 'line',
    source: 'water-paths',
    paint: { 'line-color': '#2563eb', 'line-width': 1.8, 'line-opacity': 0.45 },
  });

  // ── Camera coverage ──
  map.addLayer({
    id: 'camera-coverage-fill',
    type: 'fill',
    source: 'camera-coverage',
    paint: {
      'fill-color': [
        'case',
        ['==', ['get', 'status'], 'offline'],
        'rgba(148, 163, 184, 0.08)',
        'rgba(37, 99, 235, 0.08)',
      ],
    },
  });
  map.addLayer({
    id: 'camera-coverage-line',
    type: 'line',
    source: 'camera-coverage',
    paint: {
      'line-color': [
        'case',
        ['==', ['get', 'status'], 'offline'],
        'rgba(148, 163, 184, 0.5)',
        'rgba(37, 99, 235, 0.35)',
      ],
      'line-width': 1,
    },
  });

  // ── Selected entity trail ──
  map.addLayer({
    id: 'trail-line',
    type: 'line',
    source: 'trail',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fb923c', 'line-width': 3, 'line-opacity': 0.85 },
  });
}

function addZoneLabels(map: maplibregl.Map): maplibregl.Marker[] {
  const markers: maplibregl.Marker[] = [];
  for (const zone of mockSceneStore.getZones()) {
    if (zone.properties?.label === false) continue;
    const el = document.createElement('div');
    el.className = 'zone-label';
    el.textContent = zone.name;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(polygonCentroid(zone.geometry))
      .addTo(map);
    markers.push(marker);
  }
  return markers;
}

function fitToMockPathBounds(map: maplibregl.Map): void {
  const paths = mockSceneStore.getPaths();
  const first = paths[0]?.geometry.coordinates[0];
  if (!first) return;
  const bounds = new maplibregl.LngLatBounds(first as [number, number], first as [number, number]);
  for (const path of paths) {
    for (const coord of path.geometry.coordinates) bounds.extend(coord as [number, number]);
  }
  map.fitBounds(bounds, { padding: 72, duration: 0, maxZoom: 15.2 });
}

export default function SceneMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const mapInstance = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle,
      center: [MAP_CENTER.lng, MAP_CENTER.lat],
      zoom: 16.6,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 19.5,
    });
    mapInstance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    // Compact attribution; auto-shows Esri/OSM credit only when a raster
    // basemap layer is visible, and hides on the offline mock basemap.
    mapInstance.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    let labelMarkers: maplibregl.Marker[] = [];
    mapInstance.on('load', () => {
      addStaticLayers(mapInstance);
      labelMarkers = addZoneLabels(mapInstance);
      fitToMockPathBounds(mapInstance);
      setMap(mapInstance);
    });
    mapInstance.on('click', () => {
      useSceneStore.getState().selectEntity(null);
    });

    return () => {
      labelMarkers.forEach((m) => m.remove());
      mapInstance.remove();
      setMap(null);
    };
  }, []);

  // Apply sidebar layer toggles + basemap selection to map layers/zone labels.
  useEffect(() => {
    if (!map) return;
    const setVisible = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };
    const apply = (layers: Record<LayerKey, boolean>, basemap: Basemap) => {
      const realBasemap = basemap !== 'mock';
      // Raster basemaps: at most one visible.
      setVisible(RASTER_BASEMAPS.satellite.layerId, basemap === 'satellite');
      setVisible(RASTER_BASEMAPS.streets.layerId, basemap === 'streets');
      // Layer-toggle groups; painted terrain is forced off under a real basemap.
      for (const [key, layerIds] of Object.entries(LAYER_GROUPS)) {
        const on = layers[key as LayerKey];
        for (const layerId of layerIds ?? []) {
          setVisible(layerId, on && !(realBasemap && TERRAIN_LAYERS.includes(layerId)));
        }
      }
      // Always-on terrain base (not tied to any toggle).
      for (const layerId of ['water-fill', 'water-line', 'road-casing', 'road-fill']) {
        setVisible(layerId, !realBasemap);
      }
      map.getContainer().classList.toggle('hide-zone-labels', !layers.zones);
    };
    const s0 = useSceneStore.getState();
    apply(s0.layers, s0.basemap);
    const unsub = useSceneStore.subscribe((s, prev) => {
      if (s.layers !== prev.layers || s.basemap !== prev.basemap) apply(s.layers, s.basemap);
    });
    return unsub;
  }, [map]);

  // When a clip starts replaying, ease the camera to the clip entity's start position.
  useEffect(() => {
    if (!map) return;
    const unsub = useSceneStore.subscribe((s, prev) => {
      if (s.activeClipId && s.activeClipId !== prev.activeClipId) {
        const clip = mockSceneStore.getClipById(s.activeClipId);
        if (!clip) return;
        const state = mockSceneStore.getRenderState(clip.entity_id, s.replayStart);
        if (state) map.easeTo({ center: [state.lng, state.lat], zoom: 17.2, duration: 900 });
      }
    });
    return unsub;
  }, [map]);

  const entities = mockSceneStore.getEntities();
  const cameras = mockSceneStore.getCameras();
  const basemap = useSceneStore((s) => s.basemap);
  const basemapLabel =
    basemap === 'satellite'
      ? 'satellite basemap'
      : basemap === 'streets'
        ? 'street basemap'
        : 'mock basemap';

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {map && (
        <>
          {entities.map((entity) => (
            <EntityMarker key={entity.entity_id} map={map} entity={entity} />
          ))}
          {cameras.map((camera) => (
            <CameraMarker key={camera.camera_id} map={map} camera={camera} />
          ))}
          {trafficLights.map((light) => (
            <TrafficLightMarker key={light.light_id} map={map} light={light} />
          ))}
          <TrailLayer map={map} />
        </>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-slate-500 shadow-sm">
        SceneFlow {basemapLabel} — Thailand Digital Valley Pilot · all data simulated
      </div>
    </div>
  );
}
