import type { MovementPoint } from '../types/scene';
import {
  generateMovementPoints,
  generateConvoyMovement,
  hashSeed,
  mulberry32,
  offsetCoordinate,
  pointInPolygon,
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
  MOCK_ACCIDENT_ENTITY_ID,
  MOCK_ACCIDENT_PEDESTRIAN_PATH_ID,
  isMockAccidentEntity,
  isMockAccidentPerson,
} from './mockAccident';
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

function buildAccidentPedestrianPath(): PathGeometry | undefined {
  const placement = incidentPlacements.find((item) => item.entityId === MOCK_ACCIDENT_ENTITY_ID);
  if (!placement) return undefined;
  const center: [number, number] = [placement.lng, placement.lat];
  const headingDeg = placement.headingDeg ?? 0;
  const offsets: Array<[number, number]> = [
    [-10, -13],
    [8, -10],
    [12, 2],
    [5, 13],
    [-11, 9],
    [-10, -13],
  ];
  return {
    path_id: MOCK_ACCIDENT_PEDESTRIAN_PATH_ID,
    path_type: 'pedestrian_path',
    name: 'Accident area walking loop',
    entity_types_allowed: ['person'],
    geometry: {
      type: 'LineString',
      coordinates: offsets.map(([lateralM, forwardM]) =>
        accidentLocalOffset(center, headingDeg, lateralM, forwardM),
      ),
    },
  };
}

function generateIncidentPoints(placement: IncidentPlacement): MovementPoint[] {
  const { entityId, lng, lat } = placement;
  const zone = mockZones.find((z) => pointInPolygon([lng, lat], z.geometry));
  const camera = mockCameras.find((c) => pointInPolygon([lng, lat], c.coverage_polygon));
  const rng = mulberry32(hashSeed(entityId));
  const points: MovementPoint[] = [];
  const startSec =
    isMockAccidentEntity(entityId)
      ? Math.ceil((MOCK_ACCIDENT_AT_MS - SIM_START_MS) / 1000)
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
  const accidentPedestrianPath = buildAccidentPedestrianPath();

  // Group vehicles by lane so they queue behind each other; everything else is
  // simulated independently.
  const convoys = new Map<string, { path: PathGeometry; agents: ConvoyAgent[] }>();

  for (const assignment of movementAssignments) {
    const entity = getEntityById(assignment.entityId);
    if (entity && isMockAccidentPerson(assignment.entityId) && accidentPedestrianPath) {
      const movementDurationSec = Math.max(
        0,
        SIM_DURATION_SEC - Math.ceil((MOCK_ACCIDENT_AT_MS - SIM_START_MS) / 1000),
      );
      byEntity[assignment.entityId] = generateMovementPoints(
        entity,
        accidentPedestrianPath,
        MOCK_ACCIDENT_AT_MS,
        movementDurationSec,
        assignment.speedKmh,
        {
          startDistanceM: assignment.startDistanceM,
          cameras: mockCameras,
          zones: mockZones,
        },
      );
      continue;
    }

    const path = getPathById(assignment.pathId);
    if (!entity || !path) continue;
    const movementStartMs = isMockAccidentEntity(assignment.entityId)
      ? MOCK_ACCIDENT_AT_MS
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
