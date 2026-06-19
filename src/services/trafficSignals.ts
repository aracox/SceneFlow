import type { SignalState, TrafficLight } from '../types/scene';

/**
 * Deterministic two-phase signal cycle (seconds), as a pure function of time.
 * Phase A: primary-axis green, then yellow. Phase B: cross-axis green, then
 * yellow. A vehicle's approach is "primary" if its heading aligns (within 45°)
 * with the junction's primary axis, else "cross".
 */
export const PRIMARY_GREEN = 20;
export const YELLOW = 4;
export const CROSS_GREEN = 20;
export const CYCLE = PRIMARY_GREEN + YELLOW + CROSS_GREEN + YELLOW; // 48s

/** Smallest absolute axis difference (0–90°), treating headings as undirected. */
function axisDiff(aDeg: number, bDeg: number): number {
  const d = Math.abs(((aDeg - bDeg) % 180) + 180) % 180;
  return d > 90 ? 180 - d : d;
}

function cycleTime(light: TrafficLight, tSec: number): number {
  return (((tSec + light.cycle_offset_s) % CYCLE) + CYCLE) % CYCLE;
}

/** Whether an approach on `bearingDeg` must stop (red or yellow) at time tSec. */
export function signalIsStop(light: TrafficLight, bearingDeg: number, tSec: number): boolean {
  const tc = cycleTime(light, tSec);
  const isPrimary = axisDiff(bearingDeg, light.primary_axis_deg) <= 45;
  if (isPrimary) return !(tc < PRIMARY_GREEN); // go only during primary green
  const crossStart = PRIMARY_GREEN + YELLOW;
  return !(tc >= crossStart && tc < crossStart + CROSS_GREEN);
}

/** Marker display colour: the state of the PRIMARY axis at time tSec. */
export function signalDisplay(light: TrafficLight, tSec: number): SignalState {
  const tc = cycleTime(light, tSec);
  if (tc < PRIMARY_GREEN) return 'green';
  if (tc < PRIMARY_GREEN + YELLOW) return 'yellow';
  return 'red';
}
