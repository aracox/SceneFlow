import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { detectionFeed, type LiveDetection } from '../../services/detectionFeed';
import { detectionCorridors } from '../../data/detectionCorridors';
import { useSceneStore } from '../../store/sceneStore';

const SOURCE_ID = 'live-detections';
const GLOW_LAYER = 'live-detection-glow';
const DOT_LAYER = 'live-detection-dot';
const ARROW_LAYER = 'live-detection-arrow';
const ARROW_IMAGE = 'live-detection-arrowhead';
const CORRIDOR_SOURCE = 'detection-corridor';
const CORRIDOR_LAYER = 'detection-corridor-line';

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

const CORRIDOR_FC: FeatureCollection = {
  type: 'FeatureCollection',
  features: Object.entries(detectionCorridors).map(
    ([cameraId, coords]): Feature => ({
      type: 'Feature',
      properties: { camera_id: cameraId },
      geometry: { type: 'LineString', coordinates: coords },
    }),
  ),
};

// Detection color by SceneFlow entity type.
const COLOR_BY_TYPE: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'type'],
  'vehicle',
  '#a855f7',
  'person',
  '#2563eb',
  'pet',
  '#b45309',
  'boat',
  '#0ea5e9',
  '#a855f7',
];

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
function haversine(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Bearing from a to b, degrees clockwise from north. */
function bearingDeg(a: [number, number], b: [number, number]): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** Smooth a heading toward `next` along the shortest arc. */
function smoothHeading(prev: number | null, next: number, alpha: number): number {
  if (prev == null) return next;
  const diff = ((next - prev + 540) % 360) - 180;
  return (prev + diff * alpha + 360) % 360;
}

/** A small upward-pointing (north) chevron, added as an SDF image so it can be
 * tinted per entity type and rotated to each car's heading. */
function makeArrowImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const s = 48;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(s / 2, 5); // tip (north)
  ctx.lineTo(s - 9, s - 7);
  ctx.lineTo(s / 2, s - 17); // notch
  ctx.lineTo(9, s - 7);
  ctx.closePath();
  ctx.fill();
  const img = ctx.getImageData(0, 0, s, s);
  return { width: s, height: s, data: img.data };
}

/**
 * Draws live YOLO detections streamed from the detector service (see
 * detector/server.py) on the map. Moving cars render as an arrow pointing in
 * their actual direction of travel (derived from how the tracked position moves,
 * NOT the road's static bearing); stationary ones render as a dot.
 *
 * Updates MapLibre imperatively (bypassing React), driven by WebSocket pushes
 * smoothed over the animation clock.
 */
export default function DetectionLayer({ map }: { map: maplibregl.Map }) {
  useEffect(() => {
    if (!map.hasImage(ARROW_IMAGE)) {
      map.addImage(ARROW_IMAGE, makeArrowImage(), { sdf: true });
    }

    if (!map.getSource(CORRIDOR_SOURCE)) {
      map.addSource(CORRIDOR_SOURCE, { type: 'geojson', data: CORRIDOR_FC });
      map.addLayer({
        id: CORRIDOR_LAYER,
        type: 'line',
        source: CORRIDOR_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a855f7',
          'line-width': 3,
          'line-opacity': 0.35,
          'line-dasharray': [2, 1.5],
        },
      });
    }

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: GLOW_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 13,
          'circle-color': COLOR_BY_TYPE,
          'circle-opacity': 0.16,
          'circle-blur': 0.6,
        },
      });
      // Stationary detections: a dot (direction unknown).
      map.addLayer({
        id: DOT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!=', ['get', 'moving'], true],
        paint: {
          'circle-radius': 5.5,
          'circle-color': COLOR_BY_TYPE,
          'circle-opacity': 0.95,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      // Moving detections: an arrow pointing along the real direction of travel.
      map.addLayer({
        id: ARROW_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['==', ['get', 'moving'], true],
        layout: {
          'icon-image': ARROW_IMAGE,
          'icon-size': 0.5,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': COLOR_BY_TYPE,
          'icon-halo-color': '#ffffff',
          'icon-halo-width': 1.5,
        },
      });
    }

    // Inference only lands ~6 detections/sec, so applying raw positions makes
    // markers teleport. Instead we tween each track toward its latest position
    // every animation frame, matched by track key, and derive its heading from
    // how that smoothed position moves over time.
    type Tween = {
      lng: number;
      lat: number;
      tlng: number; // target
      tlat: number;
      props: Record<string, unknown>;
      lastSeen: number;
      heading: number | null;
      moving: boolean;
      refLng: number; // position sampled when heading was last evaluated
      refLat: number;
      refTime: number;
    };
    const tweens = new Map<string, Tween>();
    const SMOOTH = 0.14; // per-frame catch-up toward the target (0..1)
    const PRUNE_MS = 1500; // drop a track not seen for this long
    const HEADING_SAMPLE_MS = 280; // re-evaluate heading at most this often
    const MOVE_EPS_M = 2.0; // movement over a sample below this = "stationary"
    let raf = 0;

    const onFeed = (detections: LiveDetection[]) => {
      const now = performance.now();
      for (const d of detections) {
        const props = {
          key: d.key,
          type: d.type,
          cls: d.cls,
          conf: d.conf,
          camera_id: d.camera_id,
          track_id: d.id,
        };
        const t = tweens.get(d.key);
        if (t) {
          t.tlng = d.lng;
          t.tlat = d.lat;
          t.props = props;
          t.lastSeen = now;
        } else {
          tweens.set(d.key, {
            lng: d.lng,
            lat: d.lat,
            tlng: d.lng,
            tlat: d.lat,
            props,
            lastSeen: now,
            heading: null,
            moving: false,
            refLng: d.lng,
            refLat: d.lat,
            refTime: now,
          });
        }
      }
    };

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    const render = () => {
      const now = performance.now();
      const features: Feature[] = [];
      for (const [key, t] of tweens) {
        if (now - t.lastSeen > PRUNE_MS) {
          tweens.delete(key);
          continue;
        }
        t.lng += (t.tlng - t.lng) * SMOOTH;
        t.lat += (t.tlat - t.lat) * SMOOTH;

        // Derive heading + moving from displacement since the last sample.
        if (now - t.refTime >= HEADING_SAMPLE_MS) {
          const moved = haversine([t.refLng, t.refLat], [t.lng, t.lat]);
          if (moved >= MOVE_EPS_M) {
            t.heading = smoothHeading(t.heading, bearingDeg([t.refLng, t.refLat], [t.lng, t.lat]), 0.6);
            t.moving = true;
          } else {
            t.moving = false;
          }
          t.refLng = t.lng;
          t.refLat = t.lat;
          t.refTime = now;
        }

        features.push({
          type: 'Feature',
          properties: { ...t.props, heading: t.heading ?? 0, moving: t.moving },
          geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
        });
      }
      const visible = useSceneStore.getState().layers.detections;
      source?.setData(visible ? { type: 'FeatureCollection', features } : EMPTY_FC);
      raf = requestAnimationFrame(render);
    };

    const setVisible = (visible: boolean) => {
      for (const id of [CORRIDOR_LAYER, GLOW_LAYER, DOT_LAYER, ARROW_LAYER]) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      }
    };

    setVisible(useSceneStore.getState().layers.detections);
    const unsubFeed = detectionFeed.subscribe(onFeed);
    const unsubStore = useSceneStore.subscribe((s, prev) => {
      if (s.layers.detections !== prev.layers.detections) setVisible(s.layers.detections);
    });
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      unsubFeed();
      unsubStore();
      if (map.getLayer(ARROW_LAYER)) map.removeLayer(ARROW_LAYER);
      if (map.getLayer(DOT_LAYER)) map.removeLayer(DOT_LAYER);
      if (map.getLayer(GLOW_LAYER)) map.removeLayer(GLOW_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      if (map.getLayer(CORRIDOR_LAYER)) map.removeLayer(CORRIDOR_LAYER);
      if (map.getSource(CORRIDOR_SOURCE)) map.removeSource(CORRIDOR_SOURCE);
    };
  }, [map]);

  return null;
}
