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
const CAR_LAYER = 'live-detection-car';
const ARROW_IMAGE = 'live-detection-arrowhead';
const CAR_IMAGE = 'live-detection-car-icon';
const CORRIDOR_SOURCE = 'detection-corridor';
const CORRIDOR_LAYER = 'detection-corridor-line';
const BASE_GLOW_RADIUS = 13;
const BASE_DOT_RADIUS = 5.5;
const BASE_ARROW_ICON_SIZE = 0.5;
const BASE_CAR_ICON_SIZE = 0.62;

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
const METERS_PER_DEG_LAT = 111_320;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
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

type CorridorMetrics = {
  coords: [number, number][];
  cum: number[];
  total: number;
  bearing: number;
};

const CORRIDOR_METRICS: Record<string, CorridorMetrics> = Object.fromEntries(
  Object.entries(detectionCorridors).map(([cameraId, coords]) => {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
      cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
    }
    const bearing =
      coords.length >= 2 ? bearingDeg(coords[0], coords[Math.min(coords.length - 1, 5)]) : 0;
    return [cameraId, { coords, cum, total: cum[cum.length - 1] ?? 0, bearing }];
  }),
);

function pointAlongCorridor(corridor: CorridorMetrics, distance: number): [number, number] {
  const { coords, cum, total } = corridor;
  const d = clamp(distance, 0, total);
  let hi = cum.findIndex((m) => m >= d);
  if (hi < 1) hi = Math.max(1, cum.length - 1);
  const lo = hi - 1;
  const segLen = cum[hi] - cum[lo] || 1e-9;
  const t = (d - cum[lo]) / segLen;
  const a = coords[lo];
  const b = coords[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function bearingAlongCorridor(corridor: CorridorMetrics, distance: number): number {
  const { coords, cum, total } = corridor;
  const d = clamp(distance, 0, total);
  let hi = cum.findIndex((m) => m >= d);
  if (hi < 1) hi = Math.max(1, cum.length - 1);
  return bearingDeg(coords[hi - 1], coords[hi]);
}

function offsetCoordinate(base: [number, number], metersEast: number, metersNorth: number): [number, number] {
  const lat = base[1] + metersNorth / METERS_PER_DEG_LAT;
  const lng = base[0] + metersEast / (METERS_PER_DEG_LAT * Math.cos(rad(base[1])));
  return [lng, lat];
}

function signedLaneOffsetM(point: [number, number], base: [number, number], roadBearing: number): number {
  const metersEast = (point[0] - base[0]) * METERS_PER_DEG_LAT * Math.cos(rad(base[1]));
  const metersNorth = (point[1] - base[1]) * METERS_PER_DEG_LAT;
  const perp = rad(roadBearing + 90);
  return metersEast * Math.sin(perp) + metersNorth * Math.cos(perp);
}

function pointInLane(corridor: CorridorMetrics, distance: number, laneOffsetM: number): [number, number] {
  const base = pointAlongCorridor(corridor, distance);
  const perp = rad(bearingAlongCorridor(corridor, distance) + 90);
  return offsetCoordinate(base, Math.sin(perp) * laneOffsetM, Math.cos(perp) * laneOffsetM);
}

function corridorDirection(corridor: CorridorMetrics, travelBearing: number | null): 1 | -1 {
  if (travelBearing == null) return 1;
  const diff = Math.abs(((travelBearing - corridor.bearing + 540) % 360) - 180);
  return diff <= 90 ? 1 : -1;
}

function travelHeadingAlongCorridor(
  corridor: CorridorMetrics,
  direction: 1 | -1,
  distance: number,
): number {
  return (bearingAlongCorridor(corridor, distance) + (direction === 1 ? 0 : 180)) % 360;
}

function isForwardOrNear(from: number, to: number, direction: 1 | -1, toleranceM: number): boolean {
  return direction * (to - from) >= -toleranceM;
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

/** A north-facing top-down car silhouette matching the mock vehicle proportions. */
function makeCarImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const w = 30;
  const h = 52;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';

  ctx.beginPath();
  ctx.roundRect(2, 2, 26, 48, 8);
  ctx.fill();

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.roundRect(6, 10, 18, 8, 3);
  ctx.roundRect(6, 34, 18, 7, 3);
  ctx.fill();

  const img = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: img.data };
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
    if (!map.hasImage(CAR_IMAGE)) {
      map.addImage(CAR_IMAGE, makeCarImage(), { sdf: true });
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
          'circle-radius': BASE_GLOW_RADIUS,
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
        filter: ['all', ['!=', ['get', 'moving'], true], ['!=', ['get', 'type'], 'vehicle']],
        paint: {
          'circle-radius': BASE_DOT_RADIUS,
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
        filter: ['all', ['==', ['get', 'moving'], true], ['!=', ['get', 'type'], 'vehicle']],
        layout: {
          'icon-image': ARROW_IMAGE,
          'icon-size': BASE_ARROW_ICON_SIZE,
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
      // Moving vehicles: a car icon, rotated to the configured travel direction.
      map.addLayer({
        id: CAR_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['==', ['get', 'type'], 'vehicle'],
        layout: {
          'icon-image': CAR_IMAGE,
          'icon-size': BASE_CAR_ICON_SIZE,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': COLOR_BY_TYPE,
          'icon-halo-color': '#ffffff',
          'icon-halo-width': 1.4,
        },
      });
    }

    // YOLO updates are sparse and the projected box foot jitters. For vehicles
    // on a known corridor, keep their detected lane offset and advance each car
    // between detections. Repeated no-progress detections slow a car to a stop.
    type Tween = {
      lng: number;
      lat: number;
      tlng: number; // target
      tlat: number;
      props: Record<string, unknown>;
      lastSeen: number;
      heading: number | null;
      detectorBearing: number | null;
      moving: boolean;
      refLng: number; // position sampled when heading was last evaluated
      refLat: number;
      refTime: number;
      roadDistance: number | null;
      targetRoadDistance: number | null;
      roadDirection: 1 | -1;
      roadSpeedMps: number;
      laneOffsetM: number;
      targetLaneOffsetM: number;
      lastDetectionRoadDistance: number | null;
      lastDetectionTime: number | null;
      lastFrameTime: number;
    };
    const tweens = new Map<string, Tween>();
    const SMOOTH = 0.14; // per-frame catch-up toward the target (0..1)
    const ROAD_CORRECTION = 0.025; // small pull toward fresh YOLO distance
    const ROAD_SPEED_MPS = 10.5; // ~38 km/h, enough to look like traffic flow
    const SPEED_ALPHA = 0.35;
    const LANE_CORRECTION = 0.08;
    const YOLO_BACKTRACK_TOLERANCE_M = 4; // ignore larger reverse jumps from box jitter
    const ROAD_PRUNE_MS = 8000; // keep simulating briefly without fresh detections
    const RAW_PRUNE_MS = 1500; // drop non-road detections quickly
    const HEADING_SAMPLE_MS = 280; // re-evaluate heading at most this often
    const MOVE_EPS_M = 2.0; // movement over a sample below this = "stationary"
    let raf = 0;

    const onFeed = (detections: LiveDetection[]) => {
      type PreparedRoadDetection = {
        detection: LiveDetection;
        detectorBearing: number | null;
        corridor: CorridorMetrics;
        roadDistance: number;
        laneOffsetM: number;
        lng: number;
        lat: number;
      };

      const now = performance.now();
      const roadDetectionsByCamera = new Map<string, PreparedRoadDetection[]>();

      const upsert = (
        key: string,
        d: LiveDetection,
        detectorBearing: number | null,
        corridor: CorridorMetrics | undefined,
        roadDistance: number | null,
        laneOffsetM: number,
        lng: number,
        lat: number,
      ) => {
        const props = {
          key,
          type: d.type,
          cls: d.cls,
          conf: d.conf,
          camera_id: d.camera_id,
          track_id: d.id,
          detector_bearing: detectorBearing,
        };
        const t = tweens.get(key);
        if (t) {
          t.tlng = lng;
          t.tlat = lat;
          t.props = props;
          t.detectorBearing = detectorBearing;
          if (detectorBearing !== null) {
            t.heading = smoothHeading(t.heading, detectorBearing, 0.35);
          }
          if (corridor && roadDistance !== null) {
            const direction = corridorDirection(corridor, detectorBearing);
            const roadHeading = travelHeadingAlongCorridor(
              corridor,
              direction,
              t.roadDistance ?? roadDistance,
            );
            const referenceDistance = t.targetRoadDistance ?? t.roadDistance ?? roadDistance;
            if (t.lastDetectionRoadDistance !== null && t.lastDetectionTime !== null) {
              const dtS = Math.max((now - t.lastDetectionTime) / 1000, 0.1);
              const progressM = direction * (roadDistance - t.lastDetectionRoadDistance);
              const observedSpeed = progressM > 1 ? clamp(progressM / dtS, 0, ROAD_SPEED_MPS) : 0;
              t.roadSpeedMps += (observedSpeed - t.roadSpeedMps) * SPEED_ALPHA;
            }
            if (isForwardOrNear(referenceDistance, roadDistance, direction, YOLO_BACKTRACK_TOLERANCE_M)) {
              t.targetRoadDistance = roadDistance;
            }
            if (t.roadDistance === null) t.roadDistance = roadDistance;
            t.roadDirection = direction;
            t.heading = smoothHeading(t.heading, roadHeading, 0.35);
            t.targetLaneOffsetM = laneOffsetM;
            t.lastDetectionRoadDistance = roadDistance;
            t.lastDetectionTime = now;
          }
          t.lastSeen = now;
        } else {
          const roadDirection = corridor ? corridorDirection(corridor, detectorBearing) : 1;
          tweens.set(key, {
            lng,
            lat,
            tlng: lng,
            tlat: lat,
            props,
            lastSeen: now,
            heading:
              corridor && roadDistance !== null
                ? travelHeadingAlongCorridor(corridor, roadDirection, roadDistance)
                : detectorBearing,
            detectorBearing,
            moving: roadDistance !== null,
            refLng: lng,
            refLat: lat,
            refTime: now,
            roadDistance,
            targetRoadDistance: roadDistance,
            roadDirection,
            roadSpeedMps: ROAD_SPEED_MPS,
            laneOffsetM,
            targetLaneOffsetM: laneOffsetM,
            lastDetectionRoadDistance: roadDistance,
            lastDetectionTime: roadDistance !== null ? now : null,
            lastFrameTime: now,
          });
        }
      };

      for (const d of detections) {
        const detectorBearing = Number.isFinite(d.bearing) ? d.bearing : null;
        const corridor = d.type === 'vehicle' ? CORRIDOR_METRICS[d.camera_id] : undefined;
        const roadDistance =
          corridor && Number.isFinite(d.distance_m)
            ? clamp(d.distance_m, 0, corridor.total)
            : null;
        const roadPoint =
          corridor && roadDistance !== null ? pointAlongCorridor(corridor, roadDistance) : null;
        const laneOffsetM =
          corridor && roadDistance !== null && roadPoint
            ? clamp(
                signedLaneOffsetM([d.lng, d.lat], roadPoint, bearingAlongCorridor(corridor, roadDistance)),
                -7,
                7,
              )
            : 0;
        const lanePoint =
          corridor && roadDistance !== null ? pointInLane(corridor, roadDistance, laneOffsetM) : null;
        const lng = lanePoint?.[0] ?? d.lng;
        const lat = lanePoint?.[1] ?? d.lat;

        if (corridor && roadDistance !== null) {
          const bucket = roadDetectionsByCamera.get(d.camera_id) ?? [];
          bucket.push({ detection: d, detectorBearing, corridor, roadDistance, laneOffsetM, lng, lat });
          roadDetectionsByCamera.set(d.camera_id, bucket);
        } else {
          upsert(d.key, d, detectorBearing, corridor, roadDistance, laneOffsetM, lng, lat);
        }
      }

      for (const [cameraId, roadDetections] of roadDetectionsByCamera) {
        tweens.delete(`${cameraId}:vehicle-flow`); // old singleton key from the previous implementation
        roadDetections.sort((a, b) => {
          const direction = corridorDirection(a.corridor, a.detectorBearing);
          return (b.roadDistance - a.roadDistance) * direction;
        });

        roadDetections.forEach((prepared, index) => {
          upsert(
            `${cameraId}:vehicle-flow:${index}`,
            prepared.detection,
            prepared.detectorBearing,
            prepared.corridor,
            prepared.roadDistance,
            prepared.laneOffsetM,
            prepared.lng,
            prepared.lat,
          );
        });
      }
    };

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    const render = () => {
      const now = performance.now();
      const features: Feature[] = [];
      for (const [key, t] of tweens) {
        const corridor =
          typeof t.props.camera_id === 'string' ? CORRIDOR_METRICS[t.props.camera_id] : undefined;
        const usesRoadSim = corridor !== undefined && t.roadDistance !== null;
        const pruneMs = usesRoadSim ? ROAD_PRUNE_MS : RAW_PRUNE_MS;
        if (now - t.lastSeen > pruneMs) {
          tweens.delete(key);
          continue;
        }
        const dt = clamp((now - t.lastFrameTime) / 1000, 0, 0.12);
        t.lastFrameTime = now;

        if (usesRoadSim) {
          t.roadDistance = t.roadDistance! + t.roadDirection * t.roadSpeedMps * dt;
          if (t.targetRoadDistance !== null) {
            const correctedDistance =
              t.roadDistance + (t.targetRoadDistance - t.roadDistance) * ROAD_CORRECTION;
            if (isForwardOrNear(t.roadDistance, correctedDistance, t.roadDirection, 0)) {
              t.roadDistance = correctedDistance;
            }
          }
          t.laneOffsetM += (t.targetLaneOffsetM - t.laneOffsetM) * LANE_CORRECTION;
          if (t.roadDistance < 0 || t.roadDistance > corridor.total) {
            tweens.delete(key);
            continue;
          }
          const [lng, lat] = pointInLane(corridor, t.roadDistance, t.laneOffsetM);
          t.lng = lng;
          t.lat = lat;
          t.heading = smoothHeading(
            t.heading,
            travelHeadingAlongCorridor(corridor, t.roadDirection, t.roadDistance),
            0.6,
          );
          t.moving = t.roadSpeedMps > 0.5;
        } else {
          t.lng += (t.tlng - t.lng) * SMOOTH;
          t.lat += (t.tlat - t.lat) * SMOOTH;
        }

        // Derive heading + moving from displacement since the last sample.
        if (!usesRoadSim && now - t.refTime >= HEADING_SAMPLE_MS) {
          const moved = haversine([t.refLng, t.refLat], [t.lng, t.lat]);
          if (moved >= MOVE_EPS_M) {
            const motionHeading = bearingDeg([t.refLng, t.refLat], [t.lng, t.lat]);
            t.heading =
              t.detectorBearing !== null
                ? smoothHeading(t.heading, t.detectorBearing, 0.6)
                : smoothHeading(t.heading, motionHeading, 0.6);
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
      for (const id of [CORRIDOR_LAYER, GLOW_LAYER, DOT_LAYER, ARROW_LAYER, CAR_LAYER]) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      }
    };
    const setIconScale = (scale: number) => {
      if (map.getLayer(CAR_LAYER)) {
        map.setLayoutProperty(CAR_LAYER, 'icon-size', BASE_CAR_ICON_SIZE * scale);
      }
      if (map.getLayer(ARROW_LAYER)) {
        map.setLayoutProperty(ARROW_LAYER, 'icon-size', BASE_ARROW_ICON_SIZE * scale);
      }
      if (map.getLayer(DOT_LAYER)) {
        map.setPaintProperty(DOT_LAYER, 'circle-radius', BASE_DOT_RADIUS * scale);
      }
      if (map.getLayer(GLOW_LAYER)) {
        map.setPaintProperty(GLOW_LAYER, 'circle-radius', BASE_GLOW_RADIUS * scale);
      }
    };

    setVisible(useSceneStore.getState().layers.detections);
    setIconScale(useSceneStore.getState().iconScale);
    const unsubFeed = detectionFeed.subscribe(onFeed);
    const unsubStore = useSceneStore.subscribe((s, prev) => {
      if (s.layers.detections !== prev.layers.detections) setVisible(s.layers.detections);
      if (s.iconScale !== prev.iconScale) setIconScale(s.iconScale);
    });
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      unsubFeed();
      unsubStore();
      if (map.getLayer(CAR_LAYER)) map.removeLayer(CAR_LAYER);
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
