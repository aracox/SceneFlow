import { MOCK_DATA_ENABLED } from '../config';
import type { EntityRenderState, MovementPoint } from '../types/scene';
import { distanceBetweenCoordinates } from '../services/geometryUtils';
import { isMockAccidentEntity, mockAccidentEntityStartMs } from './mockAccident';
import { SIM_START_MS } from './simWindow';

export type { MovementAssignment } from './mockEntities';

type CompactField = number | number[];

type CompactMovementSeries = {
  stepMs: number;
  startOffsetMs?: number;
  lng: number[];
  lat: number[];
  heading: number[];
  speed: number[];
  confidence: number[];
  path: CompactField;
  zone: CompactField;
  camera: CompactField;
  status: CompactField;
};

type CompactMovementDatabase = {
  schema: 1;
  startMs: number;
  dictionaries: {
    paths: string[];
    zones: string[];
    cameras: string[];
    statuses: MovementPoint['tracking_status'][];
  };
  entities: Record<string, CompactMovementSeries>;
};

let data: CompactMovementDatabase | null = null;
let loadPromise: Promise<void> | null = null;
const pointCache = new Map<string, MovementPoint[]>();
const timesCache = new Map<string, number[]>();
const MAX_INTERPOLATION_JUMP_M = 60;
const COMPACT_MOVEMENT_URL = `${import.meta.env.BASE_URL}generated/mockMovementPoints.generated.json`;

export function loadMockMovementPoints(): Promise<void> {
  if (!MOCK_DATA_ENABLED) return Promise.resolve();
  if (data) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = fetch(COMPACT_MOVEMENT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load mock movement: ${response.status}`);
        return response.json() as Promise<CompactMovementDatabase>;
      })
      .then((nextData) => {
        // The generator bakes its own wall-clock anchor at generation time;
        // everything else in the file is relative (startOffsetMs + index *
        // stepMs). Rebase onto this session's sim window so the data stays
        // aligned with the app no matter when it was generated.
        nextData.startMs = SIM_START_MS;
        data = nextData;
        pointCache.clear();
        timesCache.clear();
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}

export function mockMovementPointsLoaded(): boolean {
  return !MOCK_DATA_ENABLED || data !== null;
}

function fieldAt(field: CompactField, index: number): number {
  return Array.isArray(field) ? field[index] : field;
}

function optionalLookup(values: string[], field: CompactField, index: number): string | undefined {
  const value = fieldAt(field, index);
  return value >= 0 ? values[value] : undefined;
}

function interpolateHeading(a: number, b: number, f: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * f + 360) % 360;
}

function seriesFor(entityId: string): CompactMovementSeries | undefined {
  if (!MOCK_DATA_ENABLED || !data) return undefined;
  return data.entities[entityId];
}

function pointAt(entityId: string, series: CompactMovementSeries, index: number): MovementPoint {
  const db = data!;
  const seriesStartMs = db.startMs + (series.startOffsetMs ?? 0);
  return {
    entity_id: entityId,
    observed_at: new Date(seriesStartMs + index * series.stepMs).toISOString(),
    lng: series.lng[index],
    lat: series.lat[index],
    heading_deg: series.heading[index],
    speed_kmh: series.speed[index],
    path_id: optionalLookup(db.dictionaries.paths, series.path, index),
    zone_id: optionalLookup(db.dictionaries.zones, series.zone, index),
    source_camera_id: optionalLookup(db.dictionaries.cameras, series.camera, index),
    confidence: series.confidence[index],
    tracking_status: db.dictionaries.statuses[fieldAt(series.status, index)] ?? 'tracked',
  };
}

export function getMovementEntityIds(): string[] {
  return MOCK_DATA_ENABLED && data ? Object.keys(data.entities) : [];
}

export function getMovementPointCount(entityId: string): number {
  return seriesFor(entityId)?.lng.length ?? 0;
}

export function getMovementPointAt(entityId: string, index: number): MovementPoint | undefined {
  const series = seriesFor(entityId);
  if (!series || index < 0 || index >= series.lng.length) return undefined;
  return pointAt(entityId, series, index);
}

export function getMovementTimesForEntity(entityId: string): number[] {
  const cached = timesCache.get(entityId);
  if (cached) return cached;
  const series = seriesFor(entityId);
  if (!series) return [];
  const times = Array.from(
    { length: series.lng.length },
    (_unused, index) => data!.startMs + (series.startOffsetMs ?? 0) + index * series.stepMs,
  );
  timesCache.set(entityId, times);
  return times;
}

export function getMovementPointsForEntity(entityId: string): MovementPoint[] {
  const cached = pointCache.get(entityId);
  if (cached) return cached;
  const series = seriesFor(entityId);
  if (!series) return [];
  const points = Array.from({ length: series.lng.length }, (_unused, index) =>
    pointAt(entityId, series, index),
  );
  pointCache.set(entityId, points);
  return points;
}

export function getMovementSliceForEntity(
  entityId: string,
  startMs: number,
  endMs: number,
): MovementPoint[] {
  const series = seriesFor(entityId);
  const db = data;
  if (!series || !db || endMs < db.startMs) return [];
  const seriesStartMs = db.startMs + (series.startOffsetMs ?? 0);
  const effectiveStartMs =
    isMockAccidentEntity(entityId)
      ? Math.max(startMs, mockAccidentEntityStartMs(entityId))
      : startMs;
  const firstIndex = Math.max(0, Math.ceil((effectiveStartMs - seriesStartMs) / series.stepMs));
  const lastIndex = Math.min(
    series.lng.length - 1,
    Math.floor((endMs - seriesStartMs) / series.stepMs),
  );
  if (lastIndex < firstIndex) return [];
  const points: MovementPoint[] = [];
  for (let index = firstIndex; index <= lastIndex; index++) {
    points.push(pointAt(entityId, series, index));
  }
  return points;
}

export function getMovementRenderState(
  entityId: string,
  currentTime: number,
): EntityRenderState | null {
  const series = seriesFor(entityId);
  const db = data;
  if (!series || !db || series.lng.length === 0) return null;
  if (isMockAccidentEntity(entityId) && currentTime < mockAccidentEntityStartMs(entityId)) {
    return null;
  }
  const first = db.startMs + (series.startOffsetMs ?? 0);
  const last = first + (series.lng.length - 1) * series.stepMs;
  const earlyToleranceMs = series.startOffsetMs ? 0 : 2000;
  if (currentTime < first - earlyToleranceMs || currentTime > last + 2000) return null;
  const t = Math.min(Math.max(currentTime, first), last);
  const rawIndex = (t - first) / series.stepMs;
  const lo = Math.min(Math.floor(rawIndex), series.lng.length - 1);
  const hi = Math.min(lo + 1, series.lng.length - 1);
  const span = (hi - lo) * series.stepMs || 1;
  const f = Math.min(Math.max((t - (first + lo * series.stepMs)) / span, 0), 1);
  const a = pointAt(entityId, series, lo);
  const b = pointAt(entityId, series, hi);

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

export const movementPointsByEntity: Record<string, MovementPoint[]> = {};
