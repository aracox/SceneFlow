import type { LineString, Polygon } from 'geojson';
import type {
  Camera,
  Entity,
  EntityRenderState,
  MovementPoint,
  PathGeometry,
  TrafficLight,
  Zone,
} from '../types/scene';

export const METERS_PER_DEG_LAT = 111_320;

/**
 * Center of the SceneFlow scene — anchored on real iTIC camera ITICM_BMAMI0065
 * ("จุฬา 12 มุ่งหน้าพญาไท", central Bangkok) so the simulation starts on a real
 * CCTV location with real cameras nearby.
 */
export const MAP_CENTER = {
  lat: 13.7428,
  lng: 100.5296,
};

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Offsets a WGS84 center point by meters east / north and returns [lng, lat]. */
export function offsetCoordinate(
  center: { lat: number; lng: number },
  metersEast: number,
  metersNorth: number,
): [number, number] {
  const lat = center.lat + metersNorth / METERS_PER_DEG_LAT;
  const lng =
    center.lng +
    metersEast / (METERS_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));

  return [lng, lat];
}

/** Haversine distance in meters between two [lng, lat] coordinates. */
export function distanceBetweenCoordinates(
  pointA: [number, number],
  pointB: [number, number],
): number {
  const [lng1, lat1] = pointA;
  const [lng2, lat2] = pointB;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Compass bearing in degrees (0 = north, clockwise) from pointA to pointB. */
export function calculateHeading(
  pointA: [number, number],
  pointB: [number, number],
): number {
  const phi1 = toRad(pointA[1]);
  const phi2 = toRad(pointB[1]);
  const dLambda = toRad(pointB[0] - pointA[0]);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Interpolates between two headings along the shortest arc. */
export function interpolateHeading(h1: number, h2: number, t: number): number {
  const delta = ((h2 - h1 + 540) % 360) - 180;
  return (h1 + delta * t + 360) % 360;
}

interface LineMetrics {
  cumulative: number[];
  total: number;
}

const lineMetricsCache = new WeakMap<LineString, LineMetrics>();

/** Cumulative segment lengths of a LineString in meters (memoized per geometry object). */
export function getLineMetrics(line: LineString): LineMetrics {
  const cached = lineMetricsCache.get(line);
  if (cached) return cached;
  const coords = line.coordinates as [number, number][];
  const cumulative: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(
      cumulative[i - 1] + distanceBetweenCoordinates(coords[i - 1], coords[i]),
    );
  }
  const metrics: LineMetrics = { cumulative, total: cumulative[cumulative.length - 1] };
  lineMetricsCache.set(line, metrics);
  return metrics;
}

export function lineLength(line: LineString): number {
  return getLineMetrics(line).total;
}

/**
 * Position and heading at a given distance (meters) along a LineString.
 * Distances beyond the line length wrap around (used for looping movement).
 */
export function positionAtDistance(
  line: LineString,
  meters: number,
): { position: [number, number]; heading: number } {
  const { cumulative, total } = getLineMetrics(line);
  const coords = line.coordinates as [number, number][];
  if (coords.length < 2 || total === 0) {
    return { position: coords[0] ?? [0, 0], heading: 0 };
  }
  const d = ((meters % total) + total) % total;

  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= d) lo = mid;
    else hi = mid;
  }
  const segLen = cumulative[lo + 1] - cumulative[lo] || 1;
  const t = (d - cumulative[lo]) / segLen;
  const a = coords[lo];
  const b = coords[lo + 1];
  return {
    position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    heading: calculateHeading(a, b),
  };
}

/** Position/heading at a normalized progress (0..1) along a LineString. */
export function interpolateAlongLine(
  lineString: LineString,
  progress: number,
): { position: [number, number]; heading: number } {
  const { total } = getLineMetrics(lineString);
  const clamped = Math.min(Math.max(progress, 0), 1);
  // Avoid wrapping back to the start exactly at progress === 1.
  const meters = Math.min(clamped * total, Math.max(total - 0.001, 0));
  return positionAtDistance(lineString, meters);
}

/** Ray-casting point-in-polygon test against the outer ring. */
export function pointInPolygon(point: [number, number], polygon: Polygon): boolean {
  const [x, y] = point;
  const ring = polygon.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Builds a camera coverage sector polygon from position, direction, FOV and radius. */
export function sectorPolygon(
  lng: number,
  lat: number,
  directionDeg: number,
  fovDeg: number,
  radiusM: number,
): Polygon {
  const center = { lat, lng };
  const coords: [number, number][] = [[lng, lat]];
  const steps = 16;
  for (let s = 0; s <= steps; s++) {
    const angle = directionDeg - fovDeg / 2 + (fovDeg * s) / steps;
    coords.push(
      offsetCoordinate(center, radiusM * Math.sin(toRad(angle)), radiusM * Math.cos(toRad(angle))),
    );
  }
  coords.push([lng, lat]);
  return { type: 'Polygon', coordinates: [coords] };
}

/** Deterministic string hash, used to seed per-entity randomness. */
export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Small deterministic PRNG so mock data is stable within a session. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findCoveringCamera(
  position: [number, number],
  entityType: Entity['entity_type'],
  cameras: Camera[],
): Camera | undefined {
  for (const camera of cameras) {
    if (camera.status === 'offline') continue;
    if (!camera.supported_entity_types.includes(entityType)) continue;
    if (pointInPolygon(position, camera.coverage_polygon)) return camera;
  }
  return undefined;
}

export interface GenerateMovementOptions {
  startDistanceM?: number;
  intervalSec?: number;
  cameras?: Camera[];
  zones?: Zone[];
  /** Stop-line distances (m) along this path where a traffic light controls flow. */
  trafficStops?: Array<{ distanceM: number; light: TrafficLight }>;
  /** Whether an approach on `bearingDeg` must hold at `tSec`. */
  signalIsStop?: (light: TrafficLight, bearingDeg: number, tSec: number) => boolean;
}

/** A vehicle creeps to this many metres before the stop line and holds. */
const STOP_LINE_GAP_M = 5;

function normalizedPathDistance(distanceM: number, totalM: number): number {
  return totalM > 0 ? ((distanceM % totalM) + totalM) % totalM : 0;
}

function distanceAheadOnLoop(fromM: number, targetM: number, totalM: number): number {
  return totalM > 0 ? ((targetM - fromM) % totalM + totalM) % totalM : 0;
}

function clipStepForStopLines(
  stepM: number,
  distanceM: number,
  headingDeg: number,
  tSec: number,
  totalM: number,
  stops: Array<{ distanceM: number; light: TrafficLight }>,
  isStop?: (light: TrafficLight, bearingDeg: number, tSec: number) => boolean,
): number {
  if (!isStop || stops.length === 0 || totalM <= 0 || stepM <= 0) return stepM;
  const dMod = normalizedPathDistance(distanceM, totalM);
  let clippedStep = stepM;
  for (const s of stops) {
    const ahead = distanceAheadOnLoop(dMod, s.distanceM, totalM);
    if (
      ahead <= clippedStep + STOP_LINE_GAP_M &&
      isStop(s.light, headingDeg, tSec)
    ) {
      clippedStep = Math.min(clippedStep, Math.max(0, ahead - STOP_LINE_GAP_M));
    }
  }
  return clippedStep;
}

/**
 * Generates a time series of movement points for an entity by walking along
 * the assigned path geometry at the given speed. Movement wraps around the
 * end of the line, so entities loop through their lane / route / waterway.
 * This is the single source of truth for all mock movement — no random
 * screen coordinates anywhere.
 */
export function generateMovementPoints(
  entity: Entity,
  path: PathGeometry,
  startTime: number,
  durationSec: number,
  speed: number,
  options: GenerateMovementOptions = {},
): MovementPoint[] {
  const interval = options.intervalSec ?? 1;
  const cameras = options.cameras ?? [];
  const zones = options.zones ?? [];
  const stops = options.trafficStops ?? [];
  const isStop = options.signalIsStop;
  const total = lineLength(path.geometry);
  const rng = mulberry32(hashSeed(entity.entity_id));
  const phase = rng() * Math.PI * 2;
  let distance = options.startDistanceM ?? 0;
  const points: MovementPoint[] = [];

  for (let t = 0; t <= durationSec; t += interval) {
    // Gentle, deterministic speed variation (±12%) so movement looks organic.
    let v = speed <= 0 ? 0 : speed * (0.88 + 0.12 * (1 + Math.sin(t / 40 + phase)));
    const { position, heading } = positionAtDistance(path.geometry, distance);

    // Traffic lights: if a red/yellow/all-red stop line is within this step
    // ahead, creep to the line and hold before crossing.
    let step = clipStepForStopLines(
      (v / 3.6) * interval,
      distance,
      heading,
      t,
      total,
      stops,
      isStop,
    );
    v = interval > 0 ? (step / interval) * 3.6 : 0;
    if (step <= 0.02) v = 0;

    const camera = findCoveringCamera(position, entity.entity_type, cameras);
    const tracked = camera !== undefined;
    const confidence = tracked ? 0.78 + rng() * 0.2 : 0.42 + rng() * 0.16;
    const zone = zones.find((z) => pointInPolygon(position, z.geometry));

    points.push({
      entity_id: entity.entity_id,
      observed_at: new Date(startTime + t * 1000).toISOString(),
      lng: position[0],
      lat: position[1],
      heading_deg: Math.round(heading * 10) / 10,
      speed_kmh: Math.round(v * 10) / 10,
      path_id: path.path_id,
      zone_id: zone?.zone_id,
      source_camera_id: camera?.camera_id,
      confidence: Math.round(confidence * 100) / 100,
      tracking_status: tracked ? 'tracked' : 'predicted',
    });

    distance += step;
  }
  return points;
}

export interface ConvoyAgent {
  entity: Entity;
  speedKmh: number;
  startDistanceM: number;
}

export interface ConvoyOptions extends GenerateMovementOptions {
  /** Minimum gap (m) a follower keeps behind the car ahead on the same lane. */
  minGapM?: number;
}

/**
 * Co-simulates several vehicles sharing ONE lane so they queue instead of
 * overlapping: each step, a car advances at most up to `minGapM` behind the
 * nearest car ahead (positions compared modulo lane length, so following works
 * across the end-of-lane wrap), and also holds at signal stop lines. Returns a
 * points series per entity. Deterministic — same inputs, same output.
 */
export function generateConvoyMovement(
  path: PathGeometry,
  startTime: number,
  durationSec: number,
  agents: ConvoyAgent[],
  options: ConvoyOptions = {},
): Record<string, MovementPoint[]> {
  const interval = options.intervalSec ?? 1;
  const cameras = options.cameras ?? [];
  const zones = options.zones ?? [];
  const stops = options.trafficStops ?? [];
  const isStop = options.signalIsStop;
  const minGap = options.minGapM ?? 9;
  const total = lineLength(path.geometry);

  const cars = agents.map((a) => {
    const rng = mulberry32(hashSeed(a.entity.entity_id));
    return {
      entity: a.entity,
      speed: a.speedKmh,
      distance: a.startDistanceM,
      rng,
      phase: rng() * Math.PI * 2,
      step: 0,
      points: [] as MovementPoint[],
    };
  });

  for (let t = 0; t <= durationSec; t += interval) {
    const mods = cars.map((c) => normalizedPathDistance(c.distance, total));
    const headings = cars.map((c) => positionAtDistance(path.geometry, c.distance).heading);
    const steps = cars.map((c, i) => {
      const freeSpeed =
        c.speed <= 0 ? 0 : c.speed * (0.88 + 0.12 * (1 + Math.sin(t / 40 + c.phase)));
      return clipStepForStopLines(
        (freeSpeed / 3.6) * interval,
        c.distance,
        headings[i],
        t,
        total,
        stops,
        isStop,
      );
    });

    // Propagate queue constraints backward through the lane. Each follower may
    // move only up to the already-clipped projected position of the nearest car
    // ahead, leaving `minGap` metres. A few relaxation passes are enough for
    // queues that form behind a red stop line.
    if (cars.length > 1 && total > 0) {
      for (let pass = 0; pass < cars.length; pass++) {
        let changed = false;
        for (let i = 0; i < cars.length; i++) {
          for (let j = 0; j < cars.length; j++) {
            if (i === j) continue;
            const gap = distanceAheadOnLoop(mods[i], mods[j], total);
            if (gap <= 0) continue;
            const maxStep = Math.max(0, gap + steps[j] - minGap);
            if (steps[i] > maxStep) {
              steps[i] = maxStep;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
    }

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const { position, heading } = positionAtDistance(path.geometry, c.distance);
      const step = steps[i];
      let v = interval > 0 ? (step / interval) * 3.6 : 0;

      if (step <= 0.02) v = 0;

      const camera = findCoveringCamera(position, c.entity.entity_type, cameras);
      const tracked = camera !== undefined;
      const confidence = tracked ? 0.78 + c.rng() * 0.2 : 0.42 + c.rng() * 0.16;
      const zone = zones.find((z) => pointInPolygon(position, z.geometry));
      c.points.push({
        entity_id: c.entity.entity_id,
        observed_at: new Date(startTime + t * 1000).toISOString(),
        lng: position[0],
        lat: position[1],
        heading_deg: Math.round(heading * 10) / 10,
        speed_kmh: Math.round(v * 10) / 10,
        path_id: path.path_id,
        zone_id: zone?.zone_id,
        source_camera_id: camera?.camera_id,
        confidence: Math.round(confidence * 100) / 100,
        tracking_status: tracked ? 'tracked' : 'predicted',
      });
      c.step = step;
    }

    for (const c of cars) c.distance += c.step;
  }

  const out: Record<string, MovementPoint[]> = {};
  for (const c of cars) out[c.entity.entity_id] = c.points;
  return out;
}

/** Max spatial gap between two consecutive points before interpolation is skipped (path wrap). */
const MAX_INTERPOLATION_JUMP_M = 60;

/**
 * Interpolated entity render state at a moment in time:
 * finds the movement points before and after `currentTime`, then linearly
 * interpolates position / speed / confidence and blends heading along the
 * shortest arc. Returns null when the entity has no data near that time.
 */
export function getPositionAtTime(
  points: MovementPoint[],
  currentTime: number,
  times?: number[],
): EntityRenderState | null {
  if (points.length === 0) return null;
  const ts = times ?? points.map((p) => Date.parse(p.observed_at));
  const first = ts[0];
  const last = ts[ts.length - 1];
  if (currentTime < first - 2000 || currentTime > last + 2000) return null;
  const t = Math.min(Math.max(currentTime, first), last);

  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[Math.min(hi, points.length - 1)];
  const span = ts[Math.min(hi, ts.length - 1)] - ts[lo] || 1;
  const f = Math.min(Math.max((t - ts[lo]) / span, 0), 1);

  const jump = distanceBetweenCoordinates([a.lng, a.lat], [b.lng, b.lat]);
  if (jump > MAX_INTERPOLATION_JUMP_M) {
    return {
      entity_id: a.entity_id,
      lng: a.lng,
      lat: a.lat,
      heading_deg: a.heading_deg,
      speed_kmh: a.speed_kmh ?? 0,
      confidence: a.confidence,
      tracking_status: a.tracking_status,
      path_id: a.path_id,
      zone_id: a.zone_id,
      source_camera_id: a.source_camera_id,
      observed_at: new Date(t).toISOString(),
    };
  }

  const speedA = a.speed_kmh ?? 0;
  const speedB = b.speed_kmh ?? 0;
  return {
    entity_id: a.entity_id,
    lng: a.lng + (b.lng - a.lng) * f,
    lat: a.lat + (b.lat - a.lat) * f,
    heading_deg: interpolateHeading(a.heading_deg, b.heading_deg, f),
    speed_kmh: speedA + (speedB - speedA) * f,
    confidence: a.confidence + (b.confidence - a.confidence) * f,
    tracking_status: a.tracking_status,
    path_id: a.path_id,
    zone_id: a.zone_id,
    source_camera_id: a.source_camera_id,
    observed_at: new Date(t).toISOString(),
  };
}

/** Centroid of a polygon's outer ring, used to place zone labels. */
export function polygonCentroid(polygon: Polygon): [number, number] {
  const ring = polygon.coordinates[0];
  let lng = 0;
  let lat = 0;
  const n = Math.max(ring.length - 1, 1);
  for (let i = 0; i < n; i++) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return [lng / n, lat / n];
}
