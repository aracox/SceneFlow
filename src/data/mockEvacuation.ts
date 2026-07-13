import type { PathGeometry } from '../types/scene';
import {
  lineLength,
  offsetCoordinate,
  positionAtDistance,
} from '../services/geometryUtils';
import { getPathById } from './mockPaths';
import { LIVE_START_MS } from './simWindow';

export const MOCK_EVACUATION_START_MS = LIVE_START_MS + 150_000;
export const MOCK_EVACUATION_INCIDENT_ID = 'INCIDENT-EVACUATION-001';
export const MOCK_EVACUATION_PATH_ID = 'PATH-RAMA4-BUILDING-EGRESS';
export const MOCK_EVACUATION_BUILDING_NAME = 'Rama IV Office Building';
export const MOCK_EVACUATION_WAIT_AREA = 'Rama IV roadside waiting area';
export const MOCK_EVACUATION_PERSON_IDS = [
  'PERSON-EVAC-001',
  'PERSON-EVAC-002',
  'PERSON-EVAC-003',
  'PERSON-EVAC-004',
  'PERSON-EVAC-005',
  'PERSON-EVAC-006',
  'PERSON-EVAC-007',
  'PERSON-EVAC-008',
  'PERSON-EVAC-009',
  'PERSON-EVAC-010',
] as const;

export function isMockEvacuationPerson(entityId: string): boolean {
  return (MOCK_EVACUATION_PERSON_IDS as readonly string[]).includes(entityId);
}

export function isMockEvacuationIncident(entityId: string): boolean {
  return entityId === MOCK_EVACUATION_INCIDENT_ID;
}

export function mockEvacuationPersonStartMs(personIdx: number): number {
  return MOCK_EVACUATION_START_MS + Math.max(personIdx, 0) * 500;
}

function evacuationLocalOffset(
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

function getMockEvacuationAnchor(): { center: [number, number]; heading: number } | undefined {
  const rama4Path = getPathById('ROAD-06-A') ?? getPathById('ROAD-06-B');
  if (!rama4Path) return undefined;
  const waitDistanceM = Math.min(260, Math.max(lineLength(rama4Path.geometry) * 0.45, 1));
  const { position, heading } = positionAtDistance(rama4Path.geometry, waitDistanceM);
  return { center: [position[0], position[1]], heading };
}

export function getMockEvacuationWaitPoint():
  | { lng: number; lat: number; headingDeg: number }
  | undefined {
  const anchor = getMockEvacuationAnchor();
  if (!anchor) return undefined;
  const [lng, lat] = evacuationLocalOffset(anchor.center, anchor.heading, -6, 0);
  return { lng, lat, headingDeg: anchor.heading };
}

export function buildMockEvacuationPath(personIdx: number): PathGeometry | undefined {
  const anchor = getMockEvacuationAnchor();
  if (!anchor) return undefined;
  const groupOffsetM = (personIdx - (MOCK_EVACUATION_PERSON_IDS.length - 1) / 2) * 1.1;
  const doorwayOffsetM = (personIdx % 5 - 2) * 0.7;
  const offsets: Array<[number, number]> = [
    [-46, -5 + doorwayOffsetM],
    [-34, -4 + doorwayOffsetM],
    [-22, -2 + groupOffsetM * 0.35],
    [-12, groupOffsetM * 0.65],
    [-6, groupOffsetM],
  ];

  return {
    path_id: `${MOCK_EVACUATION_PATH_ID}-${personIdx + 1}`,
    path_type: 'pedestrian_path',
    name: `${MOCK_EVACUATION_BUILDING_NAME} to ${MOCK_EVACUATION_WAIT_AREA}`,
    direction: 'egress',
    entity_types_allowed: ['person'],
    geometry: {
      type: 'LineString',
      coordinates: offsets.map(([lateralM, forwardM]) =>
        evacuationLocalOffset(anchor.center, anchor.heading, lateralM, forwardM),
      ),
    },
  };
}
