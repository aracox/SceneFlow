import type { TrafficLight } from '../types/scene';
import { MAP_CENTER, calculateHeading, hashSeed } from '../services/geometryUtils';
import { CYCLE } from '../services/trafficSignals';
import { realRoads } from './realRoads';
import { realTrafficLights } from './realTrafficLights';

/**
 * Traffic lights are REAL Bangkok adaptive-signal locations (see
 * src/data/realTrafficLights.ts, scripts/gen-trafficlights), filtered to the
 * scene area. Each light's "primary axis" is taken from the nearest real road's
 * bearing, so approaching vehicles are classified primary/cross correctly.
 */

const MAX_DIST_M = 2600; // include real signals within this of the scene center

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
function distM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dLat = rad(bLat - aLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Road vertices with their local bearing, for nearest-road axis lookup.
const roadVerts: Array<{ lng: number; lat: number; bearing: number }> = [];
for (const r of realRoads) {
  const c = r.geometry.coordinates as [number, number][];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    roadVerts.push({ lng: c[i][0], lat: c[i][1], bearing: calculateHeading(a, b) });
  }
}

function nearestRoadBearing(lng: number, lat: number): number {
  let best = Infinity;
  let bearing = 0;
  for (const v of roadVerts) {
    const d = distM(lng, lat, v.lng, v.lat);
    if (d < best) {
      best = d;
      bearing = v.bearing;
    }
  }
  return bearing;
}

export const trafficLights: TrafficLight[] = realTrafficLights
  .filter((l) => distM(MAP_CENTER.lng, MAP_CENTER.lat, l.lng, l.lat) < MAX_DIST_M)
  .map((l) => ({
    light_id: l.id,
    lat: l.lat,
    lng: l.lng,
    primary_axis_deg: nearestRoadBearing(l.lng, l.lat),
    cycle_offset_s: hashSeed(l.id) % CYCLE,
    road_count: 2,
  }));
