import type { MovementPoint } from '../types/scene';
import {
  generateMovementPoints,
  generateConvoyMovement,
  hashSeed,
  mulberry32,
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
import { trafficLights } from './trafficLights';
import { signalIsStop } from '../services/trafficSignals';
import type { PathGeometry, TrafficLight } from '../types/scene';
import { SIM_DURATION_SEC, SIM_START_MS } from './simWindow';

// Stop-lines per path: where a traffic light's node coincides with a path
// vertex (exact, since lights sit on real road nodes). Cached per path.
const R_EARTH = 6378137;
const toRad = (d: number) => (d * Math.PI) / 180;
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
    for (let i = 0; i < coords.length; i++) {
      if (Math.abs(coords[i][0] - light.lng) < 1e-7 && Math.abs(coords[i][1] - light.lat) < 1e-7) {
        result.push({ distanceM: cum[i], light });
      }
    }
  }
  stopsByPath.set(path.path_id, result);
  return result;
}

export type { MovementAssignment } from './mockEntities';

function generateIncidentPoints(placement: IncidentPlacement): MovementPoint[] {
  const { entityId, lng, lat } = placement;
  const zone = mockZones.find((z) => pointInPolygon([lng, lat], z.geometry));
  const camera = mockCameras.find((c) => pointInPolygon([lng, lat], c.coverage_polygon));
  const rng = mulberry32(hashSeed(entityId));
  const points: MovementPoint[] = [];
  for (let t = 0; t <= SIM_DURATION_SEC; t += 15) {
    points.push({
      entity_id: entityId,
      observed_at: new Date(SIM_START_MS + t * 1000).toISOString(),
      lng,
      lat,
      heading_deg: 0,
      speed_kmh: 0,
      zone_id: zone?.zone_id,
      source_camera_id: camera?.camera_id,
      confidence: Math.round((0.86 + rng() * 0.1) * 100) / 100,
      tracking_status: 'tracked',
    });
  }
  return points;
}

function buildAllMovementPoints(): Record<string, MovementPoint[]> {
  const byEntity: Record<string, MovementPoint[]> = {};

  // Group vehicles by lane so they queue behind each other; everything else is
  // simulated independently.
  const convoys = new Map<string, { path: PathGeometry; agents: ConvoyAgent[] }>();

  for (const assignment of movementAssignments) {
    const entity = getEntityById(assignment.entityId);
    const path = getPathById(assignment.pathId);
    if (!entity || !path) continue;

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
      SIM_START_MS,
      SIM_DURATION_SEC,
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

/**
 * Full mock movement database: 30 minutes of points, 1 point per second per
 * moving entity, generated in memory at app startup from path geometry.
 */
export const movementPointsByEntity: Record<string, MovementPoint[]> = buildAllMovementPoints();
