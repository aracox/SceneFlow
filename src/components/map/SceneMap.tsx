import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import type { Zone } from '../../types/scene';
import { MAP_CENTER, polygonCentroid } from '../../services/geometryUtils';
import { mockSceneStore } from '../../services/mockSceneStore';
import { roadCenterlines } from '../../data/mockPaths';
import { useSceneStore, type LayerKey } from '../../store/sceneStore';
import EntityMarker from './EntityMarker';
import CameraMarker from './CameraMarker';
import TrailLayer from './TrailLayer';

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
      minZoom: 14.5,
      maxZoom: 19.5,
    });
    mapInstance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );

    let labelMarkers: maplibregl.Marker[] = [];
    mapInstance.on('load', () => {
      addStaticLayers(mapInstance);
      labelMarkers = addZoneLabels(mapInstance);
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

  // Apply sidebar layer toggles to map layers and zone labels.
  useEffect(() => {
    if (!map) return;
    const apply = (layers: Record<LayerKey, boolean>) => {
      for (const [key, layerIds] of Object.entries(LAYER_GROUPS)) {
        const visible = layers[key as LayerKey] ? 'visible' : 'none';
        for (const layerId of layerIds ?? []) {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible);
        }
      }
      map.getContainer().classList.toggle('hide-zone-labels', !layers.zones);
    };
    apply(useSceneStore.getState().layers);
    const unsub = useSceneStore.subscribe((s, prev) => {
      if (s.layers !== prev.layers) apply(s.layers);
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
          <TrailLayer map={map} />
        </>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-slate-500 shadow-sm">
        SceneFlow mock basemap — Thailand Digital Valley Pilot · all data simulated
      </div>
    </div>
  );
}
