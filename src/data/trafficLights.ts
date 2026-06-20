import type { TrafficLight } from '../types/scene';
import { MAP_CENTER, calculateHeading, hashSeed } from '../services/geometryUtils';
import { CYCLE } from '../services/trafficSignals';
import { realRoads } from './realRoads';

/**
 * Traffic lights are placed at real road intersections — points where two or
 * more OSM roads share a node (preserved exactly through densification). The set
 * is deterministic and scales with the road data. Lights are capped to the most
 * connected / central junctions so only meaningful intersections are signalled.
 */

const MAX_LIGHTS = 15;
const MAX_DIST_M = 950;

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
function distM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dLat = rad(bLat - aLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Junction {
  lng: number;
  lat: number;
  roads: Map<number, number>; // roadIndex -> vertex index
}

const byKey = new Map<string, Junction>();
realRoads.forEach((road, rIdx) => {
  road.geometry.coordinates.forEach(([lng, lat], i) => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    let j = byKey.get(key);
    if (!j) {
      j = { lng, lat, roads: new Map() };
      byKey.set(key, j);
    }
    if (!j.roads.has(rIdx)) j.roads.set(rIdx, i);
  });
});

function primaryAxis(j: Junction): number {
  const rIdx = [...j.roads.keys()].sort((a, b) => a - b)[0];
  const coords = realRoads[rIdx].geometry.coordinates;
  const i = j.roads.get(rIdx)!;
  const a = coords[Math.max(0, i - 1)] as [number, number];
  const b = coords[Math.min(coords.length - 1, i + 1)] as [number, number];
  return calculateHeading(a, b);
}

const junctions = [...byKey.entries()]
  .filter(([, j]) => j.roads.size >= 2)
  .map(([key, j]) => ({
    key,
    j,
    dist: distM(MAP_CENTER.lng, MAP_CENTER.lat, j.lng, j.lat),
  }))
  .filter((x) => x.dist < MAX_DIST_M)
  .sort((a, b) => b.j.roads.size - a.j.roads.size || a.dist - b.dist)
  .slice(0, MAX_LIGHTS);

export const trafficLights: TrafficLight[] = junctions.map(({ key, j }, idx) => ({
  light_id: `SIGNAL-${String(idx + 1).padStart(2, '0')}`,
  lng: j.lng,
  lat: j.lat,
  primary_axis_deg: primaryAxis(j),
  cycle_offset_s: hashSeed(key) % CYCLE,
  road_count: j.roads.size,
}));
