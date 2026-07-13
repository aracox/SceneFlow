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
const TRUCK_IMAGE = 'live-detection-truck-icon';
const BUS_IMAGE = 'live-detection-bus-icon';
const MOTO_IMAGE = 'live-detection-moto-icon';
const CORRIDOR_SOURCE = 'detection-corridor';
const CORRIDOR_LAYER = 'detection-corridor-line';
const BASE_GLOW_RADIUS = 13;
const BASE_DOT_RADIUS = 5.5;
const BASE_ARROW_ICON_SIZE = 0.5;
const BASE_CAR_ICON_SIZE = 0.65;
// Keep in sync with iconSvg() vehicle case in EntityMarker.tsx
const CAR_ICON_PIXEL_RATIO = 4;
const CAR_BODY_COLOR = '#2563eb';
const CAR_STROKE_COLOR = '#1e293b';
const TRUCK_CAB_COLOR = '#d97706';
const TRUCK_BOX_COLOR = '#f1f5f9';
const MOTO_BODY_COLOR = '#0d9488';

// Display hex per detected body color. Keys must match the detector's
// color-analyst palette (detector/server.py COLOR names); detections without
// a recognized color ("unknown") keep the default class icon.
const VEHICLE_COLOR_HEX: Record<string, string> = {
  white: '#f1f5f9',
  black: '#1f2937',
  gray: '#94a3b8',
  red: '#dc2626',
  blue: '#3b82f6',
  green: '#16a34a',
  yellow: '#eab308',
  orange: '#f97316',
  brown: '#92400e',
  pink: '#ec4899',
};

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const rgb = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

/** icon-image expression: pick the `base` icon variant tinted with the
 * detection's `color` property, falling back to the default `base` image. */
function iconByColor(base: string): maplibregl.ExpressionSpecification {
  return [
    'match',
    ['get', 'color'],
    ...Object.keys(VEHICLE_COLOR_HEX).flatMap((name) => [name, `${base}-${name}`]),
    base,
  ] as unknown as maplibregl.ExpressionSpecification;
}

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

// Detection color by SCENE FLOW entity type.
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

/** Reproduces the mock vehicle icon from EntityMarker.tsx (keep in sync with
 * the iconSvg() vehicle case there). Mock viewBox 15×26 scaled by
 * CAR_ICON_PIXEL_RATIO → 60×104 px canvas. */
function makeCarImage(
  bodyColor = CAR_BODY_COLOR,
): { width: number; height: number; data: Uint8ClampedArray } {
  const k = CAR_ICON_PIXEL_RATIO;
  const w = 15 * k; // 60
  const h = 26 * k; // 104
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Body
  ctx.beginPath();
  ctx.roundRect(1 * k, 1 * k, 13 * k, 24 * k, 4 * k);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1 * k;
  ctx.strokeStyle = CAR_STROKE_COLOR;
  ctx.stroke();

  // Front window
  ctx.beginPath();
  ctx.roundRect(3 * k, 5 * k, 9 * k, 4 * k, 1.5 * k);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();

  // Rear window
  ctx.beginPath();
  ctx.roundRect(3 * k, 17 * k, 9 * k, 3.5 * k, 1.5 * k);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();

  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

/** Truck icon: cab + windshield + cargo box, front (cab) pointing NORTH.
 * Mock viewBox 15×34 scaled by CAR_ICON_PIXEL_RATIO → 60×136 px canvas. */
function makeTruckImage(
  cabColor = TRUCK_CAB_COLOR,
  boxColor = TRUCK_BOX_COLOR,
): { width: number; height: number; data: Uint8ClampedArray } {
  const k = CAR_ICON_PIXEL_RATIO;
  const w = 15 * k; // 60
  const h = 34 * k; // 136
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Cab
  ctx.beginPath();
  ctx.roundRect(2 * k, 1 * k, 11 * k, 8 * k, 2.5 * k);
  ctx.fillStyle = cabColor;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1 * k;
  ctx.strokeStyle = CAR_STROKE_COLOR;
  ctx.stroke();

  // Windshield
  ctx.beginPath();
  ctx.roundRect(3.5 * k, 2.5 * k, 8 * k, 3 * k, 1 * k);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();

  // Cargo box
  ctx.beginPath();
  ctx.roundRect(1 * k, 10.5 * k, 13 * k, 22.5 * k, 2 * k);
  ctx.fillStyle = boxColor;
  ctx.fill();
  ctx.lineWidth = 1 * k;
  ctx.strokeStyle = CAR_STROKE_COLOR;
  ctx.stroke();

  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

/** Bus icon: long passenger body + window row, front pointing NORTH.
 * Mock viewBox 16×38 scaled by CAR_ICON_PIXEL_RATIO → 64×152 px canvas. */
function makeBusImage(
  bodyColor = '#f59e0b',
): { width: number; height: number; data: Uint8ClampedArray } {
  const k = CAR_ICON_PIXEL_RATIO;
  const w = 16 * k; // 64
  const h = 38 * k; // 152
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Passenger body
  ctx.beginPath();
  ctx.roundRect(1 * k, 1 * k, 14 * k, 36 * k, 3 * k);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1 * k;
  ctx.strokeStyle = CAR_STROKE_COLOR;
  ctx.stroke();

  // Windshield
  ctx.beginPath();
  ctx.roundRect(3 * k, 3 * k, 10 * k, 4 * k, 1.5 * k);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fill();

  // Side window row
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  for (const y of [10, 16, 22]) {
    ctx.beginPath();
    ctx.roundRect(3 * k, y * k, 10 * k, 3.5 * k, 1 * k);
    ctx.fill();
  }

  // Rear marker window
  ctx.beginPath();
  ctx.roundRect(5 * k, 30 * k, 6 * k, 3 * k, 1 * k);
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fill();

  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

/** Motorcycle/bicycle icon: narrow body, two wheels, rider dot, front pointing
 * NORTH. Mock viewBox 9×18 scaled by CAR_ICON_PIXEL_RATIO → 36×72 px canvas. */
function makeMotoImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const k = CAR_ICON_PIXEL_RATIO;
  const w = 9 * k; // 36
  const h = 18 * k; // 72
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Body
  ctx.beginPath();
  ctx.roundRect(3 * k, 2 * k, 3 * k, 14 * k, 1.5 * k);
  ctx.fillStyle = MOTO_BODY_COLOR;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1 * k;
  ctx.strokeStyle = CAR_STROKE_COLOR;
  ctx.stroke();

  // Front wheel
  ctx.beginPath();
  ctx.roundRect(3.5 * k, 0.5 * k, 2 * k, 3 * k, 1 * k);
  ctx.fillStyle = CAR_STROKE_COLOR;
  ctx.fill();

  // Rear wheel
  ctx.beginPath();
  ctx.roundRect(3.5 * k, 14.5 * k, 2 * k, 3 * k, 1 * k);
  ctx.fillStyle = CAR_STROKE_COLOR;
  ctx.fill();

  // Rider
  ctx.beginPath();
  ctx.arc(4.5 * k, 9 * k, 2.2 * k, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

/**
 * Draws live YOLO detections streamed from the detector service (see
 * detector/server.py) on the map. Live feed consumers drop non-vehicles, so
 * traffic-camera detections render with class-specific icons keyed off `cls`
 * (car; truck; bus; motorcycle/bicycle), tinted with the detector-analyzed body
 * color (`color`) when one is known.
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
      map.addImage(CAR_IMAGE, makeCarImage(), { pixelRatio: CAR_ICON_PIXEL_RATIO });
    }
    if (!map.hasImage(TRUCK_IMAGE)) {
      map.addImage(TRUCK_IMAGE, makeTruckImage(), { pixelRatio: CAR_ICON_PIXEL_RATIO });
    }
    if (!map.hasImage(BUS_IMAGE)) {
      map.addImage(BUS_IMAGE, makeBusImage(), { pixelRatio: CAR_ICON_PIXEL_RATIO });
    }
    if (!map.hasImage(MOTO_IMAGE)) {
      map.addImage(MOTO_IMAGE, makeMotoImage(), { pixelRatio: CAR_ICON_PIXEL_RATIO });
    }
    // One tinted variant per detected body color. Buses get a full-body tint,
    // while trucks keep a lightened cargo box so the shape still reads clearly.
    for (const [name, hex] of Object.entries(VEHICLE_COLOR_HEX)) {
      if (!map.hasImage(`${CAR_IMAGE}-${name}`)) {
        map.addImage(`${CAR_IMAGE}-${name}`, makeCarImage(hex), {
          pixelRatio: CAR_ICON_PIXEL_RATIO,
        });
      }
      if (!map.hasImage(`${TRUCK_IMAGE}-${name}`)) {
        map.addImage(`${TRUCK_IMAGE}-${name}`, makeTruckImage(hex, lighten(hex, 0.45)), {
          pixelRatio: CAR_ICON_PIXEL_RATIO,
        });
      }
      if (!map.hasImage(`${BUS_IMAGE}-${name}`)) {
        map.addImage(`${BUS_IMAGE}-${name}`, makeBusImage(hex), {
          pixelRatio: CAR_ICON_PIXEL_RATIO,
        });
      }
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
      // Moving vehicles: mock vehicle icon, rotated to the actual direction of travel.
      map.addLayer({
        id: CAR_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['==', ['get', 'type'], 'vehicle'],
        layout: {
          'icon-image': [
            'match',
            ['get', 'cls'],
            'bus',
            iconByColor(BUS_IMAGE),
            'truck',
            iconByColor(TRUCK_IMAGE),
            ['motorcycle', 'bicycle'],
            MOTO_IMAGE,
            iconByColor(CAR_IMAGE),
          ] as unknown as maplibregl.ExpressionSpecification,
          'icon-size': BASE_CAR_ICON_SIZE,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    // YOLO updates are sparse and the projected box foot jitters. For vehicles
    // on a known corridor, keep their detected lane offset and advance each car
    // between detections. Repeated no-progress detections slow a car to a stop.
    //
    // Identity is YOLO-track-id-based (detector/tracker.yaml keeps ids stable
    // through occlusions), so per-car properties — above all the analyzed
    // color — stay glued to the same physical car. The earlier lane-rank slot
    // scheme handed a marker to a DIFFERENT car whenever ranks shifted, which
    // read as cars changing color. Re-id duplicates (old id ghost + new id)
    // are handled by per-lane over-count pruning against the live detection
    // count (see the render loop).
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
      bucket: string | null; // `${cameraId}|L${lane}` for road vehicles
      lastDetectionRoadDistance: number | null;
      lastDetectionTime: number | null;
      lastFrameTime: number;
    };
    const tweens = new Map<string, Tween>();
    // Live detection count per lane bucket, used to fast-prune surplus slots.
    const bucketLiveCounts = new Map<string, number>();
    const SMOOTH = 0.14; // per-frame catch-up toward the target (0..1)
    const ROAD_CORRECTION = 0.025; // small pull toward fresh YOLO distance
    const ROAD_SPEED_MPS = 10.5; // ~38 km/h, enough to look like traffic flow
    const SPEED_ALPHA = 0.35;
    const LANE_CORRECTION = 0.08;
    const YOLO_BACKTRACK_TOLERANCE_M = 4; // ignore larger reverse jumps from box jitter
    const FALLBACK_LANE_WIDTH_M = 3.3; // when the detector doesn't send lane fields
    const FALLBACK_LANE_COUNT = 3;
    // Sanity clamp on lateral offsets. Wide enough for the 9-lane Rama IV
    // dual carriageway ITICM_BMAMI0072 watches broadside (±13.2 m of lane
    // centers around the median-centered corridor).
    const MAX_LANE_OFFSET_M = 15;
    // Fast-prune road slots beyond the live per-lane count. Long enough to
    // ride out multi-snapshot detection blips (conf dips, brief occlusion) —
    // at 1200 ms cars visibly vanished mid-track and popped back in.
    const GHOST_GRACE_MS = 3000;
    const ROAD_PRUNE_MS = 8000; // keep simulating briefly without fresh detections
    const RAW_PRUNE_MS = 1500; // drop non-road detections quickly
    const HEADING_SAMPLE_MS = 280; // re-evaluate heading at most this often
    const MOVE_EPS_M = 2.0; // movement over a sample below this = "stationary"
    let raf = 0;
    let historyFeatures: Feature[] | null = null;
    let historyRequestSeq = 0;
    let lastHistoryBucket = -1;

    const featureFromDetection = (d: LiveDetection): Feature | null => {
      if (d.id < 0) return null;
      const detectorBearing = Number.isFinite(d.bearing) ? d.bearing : null;
      const corridor = d.type === 'vehicle' ? CORRIDOR_METRICS[d.camera_id] : undefined;
      const roadDistance =
        corridor && Number.isFinite(d.distance_m)
          ? clamp(d.distance_m, 0, corridor.total)
          : null;
      let lng = d.lng;
      let lat = d.lat;
      let heading = detectorBearing ?? 0;
      let moving = detectorBearing !== null;
      if (corridor && roadDistance !== null) {
        const rawLaneOffsetM = clamp(
          Number.isFinite(d.lane_offset_m) ? d.lane_offset_m! : 0,
          -MAX_LANE_OFFSET_M,
          MAX_LANE_OFFSET_M,
        );
        const laneOffsetM = clamp(
          Number.isFinite(d.lane_center_offset_m) ? d.lane_center_offset_m! : rawLaneOffsetM,
          -MAX_LANE_OFFSET_M,
          MAX_LANE_OFFSET_M,
        );
        [lng, lat] = pointInLane(corridor, roadDistance, laneOffsetM);
        heading = travelHeadingAlongCorridor(
          corridor,
          corridorDirection(corridor, detectorBearing),
          roadDistance,
        );
        moving = true;
      }
      return {
        type: 'Feature',
        properties: {
          key: d.key,
          type: d.type,
          cls: d.cls,
          conf: d.conf,
          color: typeof d.color === 'string' ? d.color : 'unknown',
          camera_id: d.camera_id,
          track_id: d.id,
          detector_bearing: detectorBearing,
          heading,
          moving,
          replay: true,
        },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      };
    };

    const updateHistory = () => {
      const state = useSceneStore.getState();
      if (state.mode !== 'replay') {
        if (historyFeatures !== null || lastHistoryBucket !== -1) historyRequestSeq += 1;
        historyFeatures = null;
        lastHistoryBucket = -1;
        return;
      }
      const bucket = Math.floor(state.simTime / 250);
      if (bucket === lastHistoryBucket) return;
      lastHistoryBucket = bucket;
      const requestSeq = ++historyRequestSeq;
      detectionFeed
        .fetchHistoryAt(state.simTime, 0.45)
        .then((detections) => {
          if (requestSeq !== historyRequestSeq) return;
          historyFeatures = detections
            .map(featureFromDetection)
            .filter((feature): feature is Feature => feature !== null);
          tweens.clear();
          bucketLiveCounts.clear();
        })
        .catch(() => {
          if (requestSeq === historyRequestSeq) historyFeatures = [];
        });
    };

    const onFeed = (detections: LiveDetection[]) => {
      if (useSceneStore.getState().mode !== 'live') return;
      const now = performance.now();
      // Live detection count per lane this snapshot (for over-count pruning).
      const laneCounts = new Map<string, number>();

      const upsert = (
        key: string,
        d: LiveDetection,
        detectorBearing: number | null,
        corridor: CorridorMetrics | undefined,
        roadDistance: number | null,
        laneOffsetM: number,
        lng: number,
        lat: number,
        bucket: string | null = null,
      ) => {
        // Always a string: 'match' on a missing/null property would fail to
        // evaluate and drop the icon entirely.
        const incomingColor = typeof d.color === 'string' ? d.color : 'unknown';
        const t = tweens.get(key);
        const prevColor = t?.props.color;
        const props = {
          key,
          type: d.type,
          cls: d.cls,
          conf: d.conf,
          // Lock the first known analyst color. The detector starts many
          // tracks as "unknown" while votes settle; freezing that would leave
          // visible cars on the default blue icon forever.
          color:
            typeof prevColor === 'string' && prevColor !== 'unknown'
              ? prevColor
              : incomingColor,
          camera_id: d.camera_id,
          track_id: d.id,
          detector_bearing: detectorBearing,
        };
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
          t.bucket = bucket;
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
            bucket,
            lastDetectionRoadDistance: roadDistance,
            lastDetectionTime: roadDistance !== null ? now : null,
            lastFrameTime: now,
          });
        }
      };

      for (const d of detections) {
        // Unconfirmed detections (no tracker id) all share the `<camera>:-1`
        // key and would collapse into one teleporting marker — leave them to
        // the video box overlay and only map confirmed tracks.
        if (d.id < 0) continue;
        const detectorBearing = Number.isFinite(d.bearing) ? d.bearing : null;
        const corridor = d.type === 'vehicle' ? CORRIDOR_METRICS[d.camera_id] : undefined;
        const roadDistance =
          corridor && Number.isFinite(d.distance_m)
            ? clamp(d.distance_m, 0, corridor.total)
            : null;
        // Prefer the detector's perspective-corrected lane fields; fall back to
        // re-deriving the offset from the raw point for older detectors.
        const rawLaneOffsetM =
          corridor && roadDistance !== null
            ? clamp(
                Number.isFinite(d.lane_offset_m)
                  ? d.lane_offset_m!
                  : signedLaneOffsetM(
                      [d.lng, d.lat],
                      pointAlongCorridor(corridor, roadDistance),
                      bearingAlongCorridor(corridor, roadDistance),
                    ),
                -MAX_LANE_OFFSET_M,
                MAX_LANE_OFFSET_M,
              )
            : 0;
        const lane = Number.isInteger(d.lane)
          ? d.lane!
          : clamp(
              Math.round(rawLaneOffsetM / FALLBACK_LANE_WIDTH_M + (FALLBACK_LANE_COUNT - 1) / 2),
              0,
              FALLBACK_LANE_COUNT - 1,
            );
        // Render at the lane center so a lane reads as one clean stream.
        const laneOffsetM =
          corridor && roadDistance !== null
            ? clamp(
                Number.isFinite(d.lane_center_offset_m) ? d.lane_center_offset_m! : rawLaneOffsetM,
                -MAX_LANE_OFFSET_M,
                MAX_LANE_OFFSET_M,
              )
            : 0;
        const lanePoint =
          corridor && roadDistance !== null ? pointInLane(corridor, roadDistance, laneOffsetM) : null;
        const lng = lanePoint?.[0] ?? d.lng;
        const lat = lanePoint?.[1] ?? d.lat;

        if (corridor && roadDistance !== null) {
          const bucketKey = `${d.camera_id}|L${lane}`;
          laneCounts.set(bucketKey, (laneCounts.get(bucketKey) ?? 0) + 1);
          upsert(d.key, d, detectorBearing, corridor, roadDistance, laneOffsetM, lng, lat, bucketKey);
        } else {
          upsert(d.key, d, detectorBearing, corridor, roadDistance, laneOffsetM, lng, lat);
        }
      }

      // Lanes that just emptied (for cameras still reporting road traffic) drop
      // to a live count of 0 so their leftover tweens fast-prune instead of
      // ghost-simulating for the full road prune window.
      const camerasInFeed = new Set<string>();
      for (const bucketKey of laneCounts.keys()) {
        camerasInFeed.add(bucketKey.slice(0, bucketKey.lastIndexOf('|')));
      }
      for (const bucketKey of bucketLiveCounts.keys()) {
        const cameraId = bucketKey.slice(0, bucketKey.lastIndexOf('|'));
        if (camerasInFeed.has(cameraId) && !laneCounts.has(bucketKey)) {
          bucketLiveCounts.set(bucketKey, 0);
        }
      }
      for (const [bucketKey, count] of laneCounts) {
        bucketLiveCounts.set(bucketKey, count);
      }
    };

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    const render = () => {
      const now = performance.now();
      updateHistory();

      // Over-count pruning: a lane holding more tweens than live detections
      // has ghosts (cars that left, or a re-id's abandoned old track id) —
      // drop the stalest surplus after a short grace. This replaces the old
      // rank-slot ghost check now that tweens are keyed by track id.
      const byBucket = new Map<string, Tween[]>();
      for (const t of tweens.values()) {
        if (t.bucket !== null) {
          const list = byBucket.get(t.bucket) ?? [];
          list.push(t);
          byBucket.set(t.bucket, list);
        }
      }
      for (const [bucket, list] of byBucket) {
        const liveCount = bucketLiveCounts.get(bucket);
        if (liveCount === undefined || list.length <= liveCount) continue;
        list.sort((a, b) => b.lastSeen - a.lastSeen);
        for (const t of list.slice(liveCount)) {
          if (now - t.lastSeen > GHOST_GRACE_MS) tweens.delete(t.props.key as string);
        }
      }

      const features: Feature[] = [];
      if (historyFeatures !== null) {
        const visible = useSceneStore.getState().layers.detections;
        source?.setData(
          visible ? { type: 'FeatureCollection', features: historyFeatures } : EMPTY_FC,
        );
        raf = requestAnimationFrame(render);
        return;
      }
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
    const detectionClickLayers = [CAR_LAYER, ARROW_LAYER, DOT_LAYER];
    const onDetectionClick = (event: maplibregl.MapLayerMouseEvent) => {
      event.preventDefault();
      const properties = event.features?.[0]?.properties;
      const key = properties?.key;
      const cameraId = properties?.camera_id;
      if (typeof key === 'string') {
        useSceneStore.getState().selectDetection(
          key,
          typeof cameraId === 'string' ? cameraId : undefined,
        );
      }
    };
    const onDetectionMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onDetectionMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    setVisible(useSceneStore.getState().layers.detections);
    setIconScale(useSceneStore.getState().iconScale);
    for (const layerId of detectionClickLayers) {
      map.on('click', layerId, onDetectionClick);
      map.on('mouseenter', layerId, onDetectionMouseEnter);
      map.on('mouseleave', layerId, onDetectionMouseLeave);
    }
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
      // Skip layer teardown once the map is destroyed: on unmount React runs
      // SceneMap's cleanup (map.remove()) before this one, leaving map.style
      // undefined.
      if (!map.style) return;
      for (const layerId of detectionClickLayers) {
        if (map.getLayer(layerId)) {
          map.off('click', layerId, onDetectionClick);
          map.off('mouseenter', layerId, onDetectionMouseEnter);
          map.off('mouseleave', layerId, onDetectionMouseLeave);
        }
      }
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
