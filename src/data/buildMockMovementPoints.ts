import type { MovementPoint } from '../types/scene';
import {
  generateMovementPoints,
  generateConvoyMovement,
  hashSeed,
  lineLength,
  mulberry32,
  offsetCoordinate,
  pointInPolygon,
  positionAtDistance,
  type ConvoyAgent,
} from '../services/geometryUtils';
import { mockCameras } from './mockCameras';
import {
  getEntityById,
  incidentPlacements,
  movementAssignments,
  type IncidentPlacement,
} from './mockEntities';
import { getPathById } from './mockPaths';
import { mockZones } from './mockZones';
import {
  MOCK_ACCIDENT_AT_MS,
  MOCK_ACCIDENT_CRUISE_KMH,
  MOCK_ACCIDENT_ENTITY_ID,
  MOCK_ACCIDENT_PEDESTRIAN_PATH_ID,
  MOCK_ACCIDENT_PERSON_EXITS,
  MOCK_ACCIDENT_PERSON_IDS,
  MOCK_ACCIDENT_VEHICLE_PROFILES,
  isMockAccidentEntity,
  isMockAccidentPerson,
  isMockAccidentVehicle,
  mockAccidentEntityStartMs,
  mockAccidentPersonStartMs,
} from './mockAccident';
import {
  MOCK_EVACUATION_PERSON_IDS,
  MOCK_EVACUATION_START_MS,
  buildMockEvacuationPath,
  isMockEvacuationIncident,
  isMockEvacuationPerson,
  mockEvacuationPersonStartMs,
} from './mockEvacuation';
import { trafficLights } from './trafficLights';
import { signalIsStop } from '../services/trafficSignals';
import type { PathGeometry, TrafficLight } from '../types/scene';
import { SIM_DURATION_SEC, SIM_START_MS } from './simWindow';

// Stop-lines per path: a real traffic light controls a lane where the light is
// within STOP_SNAP_M of the path. Cached per path.
const R_EARTH = 6378137;
const toRad = (d: number) => (d * Math.PI) / 180;
const STOP_SNAP_M = 28; // a light controls a lane if it passes within this distance
function segMeters(a: number[], b: number[]): number {
  const dLat = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(toRad(b[0] - a[0]) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
const stopsByPath = new Map<string, Array<{ distanceM: number; light: TrafficLight }>>();
function trafficStopsFor(path: PathGeometry): Array<{ distanceM: number; light: TrafficLight }> {
  if (path.path_type !== 'road_lane' && path.path_type !== 'shuttle_route') return [];
  const cached = stopsByPath.get(path.path_id);
  if (cached) return cached;
  const coords = path.geometry.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + segMeters(coords[i - 1], coords[i]);
  const result: Array<{ distanceM: number; light: TrafficLight }> = [];
  for (const light of trafficLights) {
    // Snap the light to the closest vertex on this path; control it if near enough.
    let bestD = Infinity;
    let bestI = -1;
    for (let i = 0; i < coords.length; i++) {
      const d = segMeters(coords[i], [light.lng, light.lat]);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestI >= 0 && bestD <= STOP_SNAP_M) result.push({ distanceM: cum[bestI], light });
  }
  stopsByPath.set(path.path_id, result);
  return result;
}

export type { MovementAssignment } from './mockEntities';

function accidentLocalOffset(
  center: [number, number],
  headingDeg: number,
  lateralM: number,
  forwardM: number,
): [number, number] {
  const rad = (headingDeg * Math.PI) / 180;
  const eastM = Math.sin(rad) * forwardM + Math.cos(rad) * lateralM;
  const northM = Math.cos(rad) * forwardM - Math.sin(rad) * lateralM;
  return offsetCoordinate({ lng: center[0], lat: center[1] }, eastM, northM);
}

// Waypoints (lateralM, forwardM) circling the wreck clockwise, in the
// accident's local frame (forward = crash heading).
const ACCIDENT_WALK_RING: Array<[number, number]> = [
  [0, 14],
  [5, 9],
  [6, 0],
  [5, -9],
  [0, -14],
  [-5, -9],
  [-6, 0],
  [-5, 9],
];

/**
 * A person's walking path: starts at their car's door, steps away from the
 * wreck, then loops the walk ring. The path closes back at the step-out
 * point so the modulo wrap in movement generation stays seamless.
 */
function buildAccidentPersonPath(personIdx: number): PathGeometry | undefined {
  const placement = incidentPlacements.find((item) => item.entityId === MOCK_ACCIDENT_ENTITY_ID);
  if (!placement) return undefined;
  const center: [number, number] = [placement.lng, placement.lat];
  const headingDeg = placement.headingDeg ?? 0;
  const exit = MOCK_ACCIDENT_PERSON_EXITS[personIdx];
  const car = MOCK_ACCIDENT_VEHICLE_PROFILES[exit.carIdx];

  const door: [number, number] = [exit.side * 1.4, car.finalOffsetM];
  const stepOut: [number, number] = [exit.side * 3.8, car.finalOffsetM + 0.5];
  // Enter the ring at the point nearest the step-out side and walk one full
  // clockwise lap.
  const entryIdx = exit.side > 0 ? 2 : 6;
  const ring = [
    ...ACCIDENT_WALK_RING.slice(entryIdx),
    ...ACCIDENT_WALK_RING.slice(0, entryIdx),
  ];
  const offsets: Array<[number, number]> = [door, stepOut, ...ring, stepOut];

  return {
    path_id: `${MOCK_ACCIDENT_PEDESTRIAN_PATH_ID}-${personIdx + 1}`,
    path_type: 'pedestrian_path',
    name: 'Accident scene walking loop',
    entity_types_allowed: ['person'],
    geometry: {
      type: 'LineString',
      coordinates: offsets.map(([lateralM, forwardM]) =>
        accidentLocalOffset(center, headingDeg, lateralM, forwardM),
      ),
    },
  };
}

function generateEvacuationPersonPoints(
  entityId: string,
  speedKmh: number,
  personIdx: number,
): MovementPoint[] {
  const entity = getEntityById(entityId);
  const path = buildMockEvacuationPath(personIdx);
  if (!entity || !path) return [];
  const points: MovementPoint[] = [];
  const startMs = mockEvacuationPersonStartMs(personIdx);
  const startSec = Math.ceil((startMs - SIM_START_MS) / 1000);
  const pathLengthM = lineLength(path.geometry);
  const speedMps = speedKmh / 3.6;
  const rng = mulberry32(hashSeed(entityId));

  for (let t = startSec; t <= SIM_DURATION_SEC; t += 1) {
    const elapsedSec = Math.max(0, t - startSec);
    const distanceM = Math.min(elapsedSec * speedMps, pathLengthM);
    const waiting = distanceM >= pathLengthM;
    const { position, heading } = positionAtDistance(path.geometry, distanceM);
    const camera = mockCameras.find(
      (c) =>
        c.status !== 'offline' &&
        c.supported_entity_types.includes('person') &&
        pointInPolygon(position, c.coverage_polygon),
    );
    const zone = mockZones.find((z) => pointInPolygon(position, z.geometry));

    points.push({
      entity_id: entity.entity_id,
      observed_at: new Date(SIM_START_MS + t * 1000).toISOString(),
      lng: position[0],
      lat: position[1],
      heading_deg: heading,
      speed_kmh: waiting ? 0 : speedKmh,
      path_id: path.path_id,
      zone_id: zone?.zone_id,
      source_camera_id: camera?.camera_id,
      confidence: Math.round((camera ? 0.82 + rng() * 0.12 : 0.5 + rng() * 0.08) * 100) / 100,
      tracking_status: camera ? 'tracked' : 'predicted',
    });
  }

  return points;
}

/**
 * Scripted pile-up drive: the car cruises the lane for the whole sim window
 * (distance back-computed so it reaches its crash position on time), brakes
 * over `brakeDurS` seconds, and comes to rest exactly `stopDelayS` seconds
 * relative to impact, taking on its crash-yaw heading once stopped.
 * positionAtDistance wraps modulo path length, so the pre-crash history is
 * ordinary laps of the lane loop.
 */
function generateAccidentVehiclePoints(
  entityId: string,
  path: PathGeometry,
  finalDistanceM: number,
  headingOffsetDeg: number,
  stopDelayS: number,
  brakeDurS: number,
): MovementPoint[] {
  const points: MovementPoint[] = [];
  const impactSec = Math.round((MOCK_ACCIDENT_AT_MS - SIM_START_MS) / 1000);
  const stopSec = impactSec + stopDelayS;
  const brakeStartSec = stopSec - brakeDurS;
  const cruiseMps = MOCK_ACCIDENT_CRUISE_KMH / 3.6;
  const brakeTravelM = (cruiseMps * brakeDurS) / 2;
  const rng = mulberry32(hashSeed(entityId));

  for (let t = 0; t <= SIM_DURATION_SEC; t += 1) {
    let distanceM: number;
    let speedMps: number;
    if (t >= stopSec) {
      distanceM = finalDistanceM;
      speedMps = 0;
    } else if (t >= brakeStartSec) {
      // Linear deceleration to rest at stopSec; remaining travel is the
      // area under the speed ramp.
      const remainS = stopSec - t;
      distanceM = finalDistanceM - (cruiseMps * remainS * remainS) / (2 * brakeDurS);
      speedMps = (cruiseMps * remainS) / brakeDurS;
    } else {
      distanceM = finalDistanceM - brakeTravelM - cruiseMps * (brakeStartSec - t);
      speedMps = cruiseMps;
    }
    const { position, heading } = positionAtDistance(path.geometry, distanceM);
    const camera = mockCameras.find(
      (c) =>
        c.status !== 'offline' &&
        c.supported_entity_types.includes('vehicle') &&
        pointInPolygon(position, c.coverage_polygon),
    );
    const zone = mockZones.find((z) => pointInPolygon(position, z.geometry));

    points.push({
      entity_id: entityId,
      observed_at: new Date(SIM_START_MS + t * 1000).toISOString(),
      lng: position[0],
      lat: position[1],
      heading_deg: t >= stopSec ? (heading + headingOffsetDeg + 360) % 360 : heading,
      speed_kmh: Math.round(speedMps * 3.6 * 10) / 10,
      path_id: path.path_id,
      zone_id: zone?.zone_id,
      source_camera_id: camera?.camera_id,
      confidence: Math.round((camera ? 0.82 + rng() * 0.12 : 0.48 + rng() * 0.08) * 100) / 100,
      tracking_status: camera ? 'tracked' : 'predicted',
    });
  }

  return points;
}

function generateIncidentPoints(placement: IncidentPlacement): MovementPoint[] {
  const { entityId, lng, lat } = placement;
  const zone = mockZones.find((z) => pointInPolygon([lng, lat], z.geometry));
  const camera = mockCameras.find((c) => pointInPolygon([lng, lat], c.coverage_polygon));
  const rng = mulberry32(hashSeed(entityId));
  const points: MovementPoint[] = [];
  const visibleAtMs = isMockEvacuationIncident(entityId)
    ? MOCK_EVACUATION_START_MS
    : mockAccidentEntityStartMs(entityId);
  const startSec =
    isMockAccidentEntity(entityId) || isMockEvacuationIncident(entityId)
      ? Math.ceil((visibleAtMs - SIM_START_MS) / 1000)
      : 0;
  for (let t = startSec; t <= SIM_DURATION_SEC; t += 15) {
    points.push({
      entity_id: entityId,
      observed_at: new Date(SIM_START_MS + t * 1000).toISOString(),
      lng,
      lat,
      heading_deg: placement.headingDeg ?? 0,
      speed_kmh: 0,
      zone_id: zone?.zone_id,
      source_camera_id: camera?.camera_id,
      confidence: Math.round((0.86 + rng() * 0.1) * 100) / 100,
      tracking_status: 'tracked',
    });
  }
  return points;
}

export function buildAllMovementPoints(): Record<string, MovementPoint[]> {
  const byEntity: Record<string, MovementPoint[]> = {};

  // Group vehicles by lane so they queue behind each other; everything else is
  // simulated independently.
  const convoys = new Map<string, { path: PathGeometry; agents: ConvoyAgent[] }>();

  for (const assignment of movementAssignments) {
    const entity = getEntityById(assignment.entityId);
    if (!entity) continue;

    if (isMockEvacuationPerson(assignment.entityId)) {
      const personIdx = (MOCK_EVACUATION_PERSON_IDS as readonly string[]).indexOf(
        assignment.entityId,
      );
      byEntity[assignment.entityId] = generateEvacuationPersonPoints(
        assignment.entityId,
        assignment.speedKmh,
        personIdx,
      );
      continue;
    }

    if (isMockAccidentPerson(assignment.entityId)) {
      const personIdx = (MOCK_ACCIDENT_PERSON_IDS as readonly string[]).indexOf(
        assignment.entityId,
      );
      const personPath = buildAccidentPersonPath(personIdx);
      if (!personPath) continue;
      const personStartMs = mockAccidentPersonStartMs(personIdx);
      const movementDurationSec = Math.max(
        0,
        SIM_DURATION_SEC - Math.ceil((personStartMs - SIM_START_MS) / 1000),
      );
      byEntity[assignment.entityId] = generateMovementPoints(
        entity,
        personPath,
        personStartMs,
        movementDurationSec,
        assignment.speedKmh,
        {
          startDistanceM: 0,
          cameras: mockCameras,
          zones: mockZones,
        },
      );
      continue;
    }

    const path = getPathById(assignment.pathId);
    if (!path) continue;

    if (isMockAccidentVehicle(assignment.entityId)) {
      const headingOffsetDeg = Number(entity.attributes?.accident_heading_offset_deg ?? 0);
      const stopDelayS = Number(entity.attributes?.accident_stop_delay_s ?? 0);
      const brakeDurS = Math.max(Number(entity.attributes?.accident_brake_dur_s ?? 2), 0.5);
      byEntity[assignment.entityId] = generateAccidentVehiclePoints(
        assignment.entityId,
        path,
        assignment.startDistanceM,
        headingOffsetDeg,
        stopDelayS,
        brakeDurS,
      );
      continue;
    }
    const movementStartMs = isMockAccidentEntity(assignment.entityId)
      ? mockAccidentEntityStartMs(assignment.entityId)
      : SIM_START_MS;
    const movementDurationSec = Math.max(
      0,
      SIM_DURATION_SEC - Math.ceil((movementStartMs - SIM_START_MS) / 1000),
    );

    if (entity.entity_type === 'vehicle') {
      let convoy = convoys.get(path.path_id);
      if (!convoy) {
        convoy = { path, agents: [] };
        convoys.set(path.path_id, convoy);
      }
      convoy.agents.push({
        entity,
        speedKmh: assignment.speedKmh,
        startDistanceM: assignment.startDistanceM,
      });
      continue;
    }

    byEntity[assignment.entityId] = generateMovementPoints(
      entity,
      path,
      movementStartMs,
      movementDurationSec,
      assignment.speedKmh,
      { startDistanceM: assignment.startDistanceM, cameras: mockCameras, zones: mockZones },
    );
  }

  for (const { path, agents } of convoys.values()) {
    const pts = generateConvoyMovement(path, SIM_START_MS, SIM_DURATION_SEC, agents, {
      cameras: mockCameras,
      zones: mockZones,
      trafficStops: trafficStopsFor(path),
      signalIsStop,
      minGapM: 9,
    });
    Object.assign(byEntity, pts);
  }

  for (const placement of incidentPlacements) {
    byEntity[placement.entityId] = generateIncidentPoints(placement);
  }

  return byEntity;
}
