import type { Camera, PathGeometry } from '../types/scene';
import {
  hashSeed,
  lineLength,
  mulberry32,
  positionAtDistance,
  sectorPolygon,
} from '../services/geometryUtils';
import { mockPaths } from './mockPaths';

/**
 * Cameras are GENERATED along the real paths so coverage spans the whole scene:
 * each camera sits on a road / footway / canal and its sector faces along that
 * feature, so entities passing through flip to `tracked`. Deterministic (seeded
 * PRNG, no Math.random); scales with the path data.
 */

const rng = mulberry32(hashSeed('sceneflow-cameras-v1'));
const pad2 = (n: number) => String(n).padStart(2, '0');

// One camera per road uses lane "A" (lane B shares the same centerline, so the
// sector already covers both directions).
const roads = mockPaths.filter((p) => p.path_type === 'road_lane' && p.path_id.endsWith('-A'));
const walks = mockPaths.filter((p) => p.path_type === 'pedestrian_path');
const canals = mockPaths.filter(
  (p) => p.path_type === 'waterway' && p.entity_types_allowed.includes('boat'),
);

const pathLen = new Map<string, number>(mockPaths.map((p) => [p.path_id, lineLength(p.geometry)]));

/** Round-robin slots across paths, density capped by length (one per spacingM). */
function spread(count: number, paths: PathGeometry[], spacingM: number) {
  if (paths.length === 0) return [] as Array<{ path: PathGeometry; distanceM: number }>;
  const caps = paths.map((p) => Math.max(1, Math.round((pathLen.get(p.path_id) ?? 0) / spacingM)));
  const used = paths.map(() => 0);
  const out: Array<{ path: PathGeometry; distanceM: number }> = [];
  let i = 0;
  const guard = paths.length * 4000;
  while (out.length < count && i < guard) {
    const idx = i % paths.length;
    if (used[idx] < caps[idx]) {
      const cap = caps[idx];
      const len = pathLen.get(paths[idx].path_id) ?? 0;
      out.push({ path: paths[idx], distanceM: ((used[idx] + 0.5) / cap) * len });
      used[idx]++;
    }
    i++;
  }
  return out;
}

interface Gen {
  prefix: string;
  slots: ReturnType<typeof spread>;
  fov: number;
  range: number;
  types: Camera['supported_entity_types'];
}

const groups: Gen[] = [
  {
    // One camera per road (longer roads get a second), covering the corridor.
    prefix: 'CAM-ROAD',
    slots: spread(roads.length + 20, roads, 320),
    fov: 95,
    range: 240,
    types: ['vehicle', 'person', 'incident_object'],
  },
  {
    prefix: 'CAM-WALK',
    slots: spread(walks.length, walks, 220),
    fov: 100,
    range: 160,
    types: ['person', 'pet', 'incident_object'],
  },
  {
    prefix: 'CAM-WATER',
    slots: spread(8, canals, 300),
    fov: 90,
    range: 220,
    types: ['boat', 'floating_waste', 'incident_object'],
  },
];

export const mockCameras: Camera[] = groups.flatMap((g) =>
  g.slots.map((slot, idx) => {
    const { position, heading } = positionAtDistance(slot.path.geometry, slot.distanceM);
    const r = rng();
    const status: Camera['status'] = r < 0.06 ? 'offline' : r < 0.18 ? 'warning' : 'online';
    const id = `${g.prefix}-${pad2(idx + 1)}`;
    return {
      camera_id: id,
      name: `${slot.path.name} — ${id}`,
      lat: position[1],
      lng: position[0],
      status,
      direction_deg: heading,
      fov_deg: g.fov,
      coverage_polygon: sectorPolygon(position[0], position[1], heading, g.fov, g.range),
      supported_entity_types: g.types,
    };
  }),
);

export function getCameraById(cameraId: string): Camera | undefined {
  return mockCameras.find((c) => c.camera_id === cameraId);
}
