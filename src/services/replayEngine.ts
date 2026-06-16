import type { EntityRenderState, MovementClip, MovementPoint } from '../types/scene';
import { distanceBetweenCoordinates, getPositionAtTime } from './geometryUtils';

/** Accepts ISO strings or epoch milliseconds anywhere a time is passed in. */
export function toMs(time: string | number): number {
  return typeof time === 'number' ? time : Date.parse(time);
}

/**
 * Core replay interpolation: given the current replay time, finds the
 * movement points before and after it and returns a smooth render state
 * (interpolated lng/lat, shortest-arc heading, speed and confidence).
 * `times` is an optional pre-parsed timestamp array for fast binary search.
 */
export function getEntityStateAt(
  points: MovementPoint[],
  currentTime: number,
  times?: number[],
): EntityRenderState | null {
  return getPositionAtTime(points, currentTime, times);
}

/** Index of the first point with timestamp >= t (binary search). */
function lowerBound(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Slice of movement points within [startMs, endMs]. */
export function sliceByTime(
  points: MovementPoint[],
  times: number[],
  startMs: number,
  endMs: number,
): MovementPoint[] {
  if (points.length === 0 || endMs < times[0] || startMs > times[times.length - 1]) {
    return [];
  }
  const from = lowerBound(times, startMs);
  const to = lowerBound(times, endMs + 1);
  return points.slice(from, to);
}

/** Jumps larger than this between consecutive points are path wrap-arounds, not travel. */
const WRAP_JUMP_M = 60;

/** Computes a saved clip's summary (duration, distance, avg speed, cameras, zones). */
export function computeClipSummary(
  points: MovementPoint[],
  startMs: number,
  endMs: number,
): MovementClip['summary'] {
  const times = points.map((p) => Date.parse(p.observed_at));
  const slice = sliceByTime(points, times, startMs, endMs);

  let distance = 0;
  const cameras = new Set<string>();
  const zones = new Set<string>();
  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    if (p.source_camera_id) cameras.add(p.source_camera_id);
    if (p.zone_id) zones.add(p.zone_id);
    if (i > 0) {
      const prev = slice[i - 1];
      const step = distanceBetweenCoordinates([prev.lng, prev.lat], [p.lng, p.lat]);
      if (step < WRAP_JUMP_M) distance += step;
    }
  }

  const durationSec = Math.round((endMs - startMs) / 1000);
  return {
    duration_sec: durationSec,
    distance_m: Math.round(distance),
    avg_speed_kmh: durationSec > 0 ? Math.round((distance / durationSec) * 3.6 * 10) / 10 : 0,
    source_cameras: [...cameras],
    zones: [...zones],
  };
}
