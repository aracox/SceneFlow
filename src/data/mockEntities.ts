import type { Entity, PathGeometry } from '../types/scene';
import {
  MOCK_ACCIDENT_AT_MS,
  MOCK_ACCIDENT_DELAY_MS,
  MOCK_ACCIDENT_ENTITY_ID,
  MOCK_ACCIDENT_PERSON_IDS,
  MOCK_ACCIDENT_PEDESTRIAN_PATH_ID,
  MOCK_ACCIDENT_PEOPLE_AT_MS,
  MOCK_ACCIDENT_VEHICLE_PROFILES,
  MOCK_ACCIDENT_VEHICLE_START_MS,
} from './mockAccident';
import { SIM_END_MS, SIM_START_MS } from './simWindow';
import { mockPaths } from './mockPaths';
import {
  hashSeed,
  lineLength,
  mulberry32,
  positionAtDistance,
} from '../services/geometryUtils';

/**
 * The fleet (entities + their path assignments) is GENERATED deterministically
 * from the real-feature paths, so the scene scales with the OSM data instead of
 * being hand-listed. A single seeded PRNG drives every choice (hard rule: no
 * Math.random), so output is identical on every run. IDs are zero-padded per
 * type starting at 001.
 */

const firstSeen = new Date(SIM_START_MS).toISOString();
const lastSeen = new Date(SIM_END_MS).toISOString();

export interface MovementAssignment {
  entityId: string;
  pathId: string;
  speedKmh: number;
  startDistanceM: number;
}

export interface IncidentPlacement {
  entityId: string;
  lng: number;
  lat: number;
  headingDeg?: number;
}

// ── Deterministic RNG ──────────────────────────────────────────────
const rng = mulberry32(hashSeed('sceneflow-fleet-v1'));
const rand = (a: number, b: number) => a + (b - a) * rng();
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const pad3 = (n: number) => String(n).padStart(3, '0');

const lanePaths = mockPaths.filter((p) => p.path_type === 'road_lane');
const walkPaths = mockPaths.filter((p) => p.path_type === 'pedestrian_path');
const boatPaths = mockPaths.filter(
  (p) => p.path_type === 'waterway' && p.entity_types_allowed.includes('boat'),
);
const wastePaths = mockPaths.filter(
  (p) => p.path_type === 'waterway' && p.entity_types_allowed.includes('floating_waste'),
);
const shuttlePath = mockPaths.find((p) => p.path_type === 'shuttle_route');

const pathLen = new Map<string, number>(
  mockPaths.map((p) => [p.path_id, lineLength(p.geometry)]),
);

/**
 * Spread `count` placements across `paths`, round-robin, capping each path's
 * density by its length (one slot per `spacingM`). Returns the chosen path plus
 * an evenly-staggered start distance along it.
 */
function spread(
  count: number,
  paths: PathGeometry[],
  spacingM: number,
): Array<{ path: PathGeometry; startDistanceM: number }> {
  if (paths.length === 0) return [];
  const caps = paths.map((p) => Math.max(1, Math.round((pathLen.get(p.path_id) ?? 0) / spacingM)));
  const used = paths.map(() => 0);
  const out: Array<{ path: PathGeometry; startDistanceM: number }> = [];
  let i = 0;
  const guard = paths.length * 5000;
  while (out.length < count && i < guard) {
    const idx = i % paths.length;
    if (used[idx] < caps[idx]) {
      const cap = caps[idx];
      const k = used[idx];
      const len = pathLen.get(paths[idx].path_id) ?? 0;
      // stagger evenly, plus a little jitter on wrap-around passes
      const frac = (k + 0.5) / cap;
      const wrap = Math.floor(k / cap) * 0.13;
      out.push({ path: paths[idx], startDistanceM: ((frac + wrap) % 1) * len });
      used[idx]++;
    }
    i++;
  }
  return out;
}

const entities: Entity[] = [];
const assignments: MovementAssignment[] = [];
const incidents: IncidentPlacement[] = [];

const entity = (
  id: string,
  type: Entity['entity_type'],
  subType: string,
  overrides: Partial<Entity> = {},
): Entity => ({
  entity_id: id,
  entity_type: type,
  sub_type: subType,
  first_seen_at: firstSeen,
  last_seen_at: lastSeen,
  current_status: 'tracked',
  ...overrides,
});

// ── Vehicles ───────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { sub: 'sedan', colors: ['#ef4444', '#3b82f6', '#f1f5f9', '#facc15'], speed: [24, 42] },
  { sub: 'pickup', colors: ['#f1f5f9', '#1f2937', '#64748b'], speed: [22, 36] },
  { sub: 'suv', colors: ['#1f2937', '#475569', '#0f172a'], speed: [24, 40] },
  { sub: 'van', colors: ['#9ca3af', '#e2e8f0'], speed: [20, 34] },
  { sub: 'motorcycle', colors: ['#10b981', '#f97316', '#ef4444', '#8b5cf6'], speed: [28, 50] },
] as const;
const COLOR_NAMES: Record<string, string> = {
  '#ef4444': 'red', '#3b82f6': 'blue', '#f1f5f9': 'white', '#facc15': 'yellow',
  '#1f2937': 'black', '#64748b': 'gray', '#475569': 'slate', '#0f172a': 'black',
  '#9ca3af': 'silver', '#e2e8f0': 'white', '#10b981': 'green', '#f97316': 'orange',
  '#8b5cf6': 'purple',
};

spread(520, lanePaths, 75).forEach((slot, idx) => {
  const t = pick(VEHICLE_TYPES);
  const color = pick(t.colors);
  const id = `VEH-${pad3(idx + 1)}`;
  entities.push(
    entity(id, 'vehicle', t.sub, {
      color,
      attributes: { detected_color: COLOR_NAMES[color] ?? 'unknown' },
    }),
  );
  assignments.push({
    entityId: id,
    pathId: slot.path.path_id,
    speedKmh: Math.round(rand(t.speed[0], t.speed[1])),
    startDistanceM: slot.startDistanceM,
  });
});

// ── Shuttles ───────────────────────────────────────────────────────
if (shuttlePath) {
  const SHUTTLES = 4;
  const len = pathLen.get(shuttlePath.path_id) ?? 0;
  for (let i = 0; i < SHUTTLES; i++) {
    const id = `SHUTTLE-${pad3(i + 1)}`;
    entities.push(
      entity(id, 'vehicle', 'shuttle', {
        color: '#f59e0b',
        attributes: { detected_color: 'orange', route: shuttlePath.name, capacity: 14 },
      }),
    );
    assignments.push({
      entityId: id,
      pathId: shuttlePath.path_id,
      speedKmh: Math.round(rand(15, 20)),
      startDistanceM: (i / SHUTTLES) * len,
    });
  }
}

// ── People ─────────────────────────────────────────────────────────
const PERSON_TYPES = [
  { sub: 'pedestrian', speed: [3.6, 5.2] },
  { sub: 'commuter', speed: [4.2, 5.6] },
  { sub: 'staff', speed: [3.8, 5.0] },
  { sub: 'visitor', speed: [3.2, 4.6] },
  { sub: 'jogger', speed: [7.5, 9.5] },
  { sub: 'security', speed: [3.8, 4.8] },
] as const;
const CLOTHING = ['navy', 'white', 'gray', 'green', 'red', 'black', 'blue', 'orange'];

spread(150, walkPaths, 45).forEach((slot, idx) => {
  const t = pick(PERSON_TYPES);
  const id = `PERSON-${pad3(idx + 1)}`;
  entities.push(
    entity(id, 'person', t.sub, { attributes: { clothing_color: pick(CLOTHING) } }),
  );
  assignments.push({
    entityId: id,
    pathId: slot.path.path_id,
    speedKmh: Math.round(rand(t.speed[0], t.speed[1]) * 10) / 10,
    startDistanceM: slot.startDistanceM,
  });
});

// ── Pets ───────────────────────────────────────────────────────────
const PET_TYPES = [
  { sub: 'dog', color: '#b45309', speed: [5, 7] },
  { sub: 'cat', color: '#737373', speed: [4, 6] },
] as const;

spread(40, walkPaths, 120).forEach((slot, idx) => {
  const t = pick(PET_TYPES);
  const id = `PET-${pad3(idx + 1)}`;
  entities.push(
    entity(id, 'pet', t.sub, { color: t.color, attributes: { leashed: rng() > 0.4 } }),
  );
  assignments.push({
    entityId: id,
    pathId: slot.path.path_id,
    speedKmh: Math.round(rand(t.speed[0], t.speed[1]) * 10) / 10,
    startDistanceM: slot.startDistanceM,
  });
});

// ── Boats ──────────────────────────────────────────────────────────
const BOAT_TYPES = [
  { sub: 'patrol_boat', color: '#0ea5e9', speed: [8, 12] },
  { sub: 'longtail', color: '#8b5cf6', speed: [7, 11] },
  { sub: 'barge', color: '#64748b', speed: [5, 8] },
] as const;

spread(8, boatPaths, 130).forEach((slot, idx) => {
  const t = pick(BOAT_TYPES);
  const id = `BOAT-${pad3(idx + 1)}`;
  entities.push(
    entity(id, 'boat', t.sub, { color: t.color, attributes: { hull_color: t.sub } }),
  );
  assignments.push({
    entityId: id,
    pathId: slot.path.path_id,
    speedKmh: Math.round(rand(t.speed[0], t.speed[1])),
    startDistanceM: slot.startDistanceM,
  });
});

// ── Floating waste ─────────────────────────────────────────────────
const WASTE_TYPES = [
  { sub: 'plastic_bag_cluster', color: '#14b8a6' },
  { sub: 'bottle_cluster', color: '#0d9488' },
  { sub: 'foam_box', color: '#2dd4bf' },
  { sub: 'mixed_debris', color: '#0f766e' },
] as const;

spread(30, wastePaths, 50).forEach((slot, idx) => {
  const t = pick(WASTE_TYPES);
  const id = `WASTE-${pad3(idx + 1)}`;
  entities.push(
    entity(id, 'floating_waste', t.sub, { color: t.color, attributes: { size_est: pick(['small', 'medium']) } }),
  );
  assignments.push({
    entityId: id,
    pathId: slot.path.path_id,
    speedKmh: Math.round(rand(0.8, 2.2) * 10) / 10,
    startDistanceM: slot.startDistanceM,
  });
});

// ── Incident objects (stationary, placed on real roads) ────────────
const INCIDENT_TYPES = [
  { sub: 'stalled_vehicle', severity: 'warning' },
  { sub: 'road_debris', severity: 'info' },
  { sub: 'flooding', severity: 'critical' },
  { sub: 'fallen_object', severity: 'warning' },
] as const;

spread(32, lanePaths, 520).forEach((slot, idx) => {
  const t = pick(INCIDENT_TYPES);
  const id = `INCIDENT-${pad3(idx + 1)}`;
  const { position } = positionAtDistance(slot.path.geometry, slot.startDistanceM);
  entities.push(
    entity(id, 'incident_object', t.sub, {
      current_status: 'stopped',
      attributes: { description: `${t.sub.replace('_', ' ')} on ${slot.path.name}`, severity: t.severity },
    }),
  );
  incidents.push({ entityId: id, lng: position[0], lat: position[1] });
});

const accidentPath = lanePaths[0];
if (accidentPath) {
  const accidentDistanceM = (pathLen.get(accidentPath.path_id) ?? 0) * 0.58;
  const { position, heading } = positionAtDistance(accidentPath.geometry, accidentDistanceM);
  entities.push(
    entity(MOCK_ACCIDENT_ENTITY_ID, 'incident_object', 'vehicle_accident', {
      current_status: 'stopped',
      first_seen_at: new Date(MOCK_ACCIDENT_AT_MS).toISOString(),
      color: '#dc2626',
      attributes: {
        description: `vehicle accident on ${accidentPath.name}`,
        severity: 'critical',
        trigger: 'mock_after_30_seconds',
      },
    }),
  );
  incidents.push({
    entityId: MOCK_ACCIDENT_ENTITY_ID,
    lng: position[0],
    lat: position[1],
    headingDeg: heading,
  });

  MOCK_ACCIDENT_VEHICLE_PROFILES.forEach((vehicle) => {
    entities.push(
      entity(vehicle.entityId, 'vehicle', vehicle.subType, {
        current_status: 'stopped',
        first_seen_at: new Date(MOCK_ACCIDENT_VEHICLE_START_MS).toISOString(),
        color: vehicle.color,
        attributes: {
          detected_color: COLOR_NAMES[vehicle.color] ?? 'unknown',
          incident_id: MOCK_ACCIDENT_ENTITY_ID,
          accident_final_offset_m: vehicle.finalOffsetM,
          accident_heading_offset_deg: vehicle.headingOffsetDeg,
          accident_approach_m: vehicle.approachM,
          state: 'hit_and_stuck',
        },
      }),
    );
    assignments.push({
      entityId: vehicle.entityId,
      pathId: accidentPath.path_id,
      speedKmh: Math.round((vehicle.approachM / (MOCK_ACCIDENT_DELAY_MS / 1000)) * 3.6 * 10) / 10,
      startDistanceM: accidentDistanceM + vehicle.finalOffsetM,
    });
  });

  const accidentPeople = [
    { sub: 'pedestrian', clothing: 'navy', speedKmh: 3.2, offsetM: 0 },
    { sub: 'staff', clothing: 'white', speedKmh: 3.6, offsetM: 6 },
    { sub: 'security', clothing: 'black', speedKmh: 3.0, offsetM: 12 },
    { sub: 'visitor', clothing: 'red', speedKmh: 3.4, offsetM: 18 },
    { sub: 'commuter', clothing: 'blue', speedKmh: 3.8, offsetM: 24 },
  ] as const;
  accidentPeople.forEach((person, idx) => {
    const personId = MOCK_ACCIDENT_PERSON_IDS[idx];
    entities.push(
      entity(personId, 'person', person.sub, {
        first_seen_at: new Date(MOCK_ACCIDENT_PEOPLE_AT_MS).toISOString(),
        attributes: {
          clothing_color: person.clothing,
          incident_id: MOCK_ACCIDENT_ENTITY_ID,
          behavior: 'walking_around_accident',
        },
      }),
    );
    assignments.push({
      entityId: personId,
      pathId: MOCK_ACCIDENT_PEDESTRIAN_PATH_ID,
      speedKmh: person.speedKmh,
      startDistanceM: person.offsetM,
    });
  });
}

export const mockEntities: Entity[] = entities;
export const movementAssignments: MovementAssignment[] = assignments;
export const incidentPlacements: IncidentPlacement[] = incidents;

export function getEntityById(entityId: string): Entity | undefined {
  return mockEntities.find((e) => e.entity_id === entityId);
}
