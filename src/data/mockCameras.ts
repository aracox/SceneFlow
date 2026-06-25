import type { Camera } from '../types/scene';
import { calculateHeading, hashSeed, mulberry32, sectorPolygon } from '../services/geometryUtils';
import { realCameras } from './realCameras';
import { realRoads } from './realRoads';

/**
 * Cameras are REAL iTIC Foundation / Longdo Map CCTV locations (see
 * src/data/realCameras.ts, scripts/gen-cameras). Each camera is drawn at its
 * true position; its coverage cone is oriented toward the nearest real road
 * within range (so it covers traffic near the relocated scene center), else a
 * deterministic default heading. Cones are narrow CCTV wedges.
 */

const FOV_DEG = 50;
const RANGE_M = 120;
const ORIENT_MAX_M = 400; // point at the nearest road only if within this distance
const ALL_TYPES: Camera['supported_entity_types'] = [
  'vehicle',
  'person',
  'pet',
  'boat',
  'floating_waste',
  'incident_object',
];

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
function distM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dLat = rad(bLat - aLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Flatten road vertices once for nearest-point lookups.
const roadPoints: Array<[number, number]> = realRoads.flatMap(
  (r) => r.geometry.coordinates as [number, number][],
);

/** Heading from a camera toward the nearest road vertex, or null if too far. */
function headingToNearestRoad(lng: number, lat: number): number | null {
  let best = Infinity;
  let bestPt: [number, number] | null = null;
  for (const p of roadPoints) {
    const d = distM(lng, lat, p[0], p[1]);
    if (d < best) {
      best = d;
      bestPt = p;
    }
  }
  if (!bestPt || best > ORIENT_MAX_M) return null;
  return calculateHeading([lng, lat], bestPt);
}

// Manual heading overrides (degrees) for cameras whose real view direction is
// known but can't be inferred from the pilot-site roads (they sit far from the
// synthetic road network, so headingToNearestRoad would otherwise fall back to
// a seeded-random heading). ITICM_BMAMI0081 is at the foot of Taksin Bridge,
// view directions matched to each camera's live feed. ITICM_BMAMI0081 faces
// due west (270°); ITICM_BMAMI0080 (also at the Taksin Bridge / Sathorn U-turn)
// faces east-southeast (120°).
const HEADING_OVERRIDES: Record<string, number> = {
  ITICM_BMAMI0081: 270,
  ITICM_BMAMI0080: 120,
};

export const mockCameras: Camera[] = realCameras.map((c) => {
  const rng = mulberry32(hashSeed(c.id));
  const r = rng();
  const status: Camera['status'] = r < 0.05 ? 'offline' : r < 0.15 ? 'warning' : 'online';
  const heading =
    HEADING_OVERRIDES[c.id] ?? headingToNearestRoad(c.lng, c.lat) ?? Math.floor(rng() * 360);
  return {
    camera_id: c.id,
    name: c.name || c.id,
    lat: c.lat,
    lng: c.lng,
    status,
    direction_deg: heading,
    fov_deg: FOV_DEG,
    coverage_polygon: sectorPolygon(c.lng, c.lat, heading, FOV_DEG, RANGE_M),
    supported_entity_types: ALL_TYPES,
  };
});

export function getCameraById(cameraId: string): Camera | undefined {
  return mockCameras.find((c) => c.camera_id === cameraId);
}
