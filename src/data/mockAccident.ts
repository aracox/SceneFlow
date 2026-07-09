import { LIVE_START_MS } from './simWindow';

export const MOCK_ACCIDENT_ENTITY_ID = 'INCIDENT-ACCIDENT-001';
export const MOCK_ACCIDENT_DELAY_MS = 30_000;
export const MOCK_ACCIDENT_AT_MS = LIVE_START_MS + MOCK_ACCIDENT_DELAY_MS;
export const MOCK_ACCIDENT_VEHICLE_START_MS = LIVE_START_MS;
export const MOCK_ACCIDENT_PEOPLE_DELAY_MS = 8_000;
export const MOCK_ACCIDENT_PEOPLE_AT_MS = MOCK_ACCIDENT_AT_MS + MOCK_ACCIDENT_PEOPLE_DELAY_MS;
export const MOCK_ACCIDENT_REPLAY_START_MS = MOCK_ACCIDENT_AT_MS - 15_000;
export const MOCK_ACCIDENT_REPLAY_END_MS = MOCK_ACCIDENT_PEOPLE_AT_MS + 35_000;
export const MOCK_ACCIDENT_VEHICLE_IDS = [
  'VEH-ACCIDENT-001',
  'VEH-ACCIDENT-002',
  'VEH-ACCIDENT-003',
] as const;
export const MOCK_ACCIDENT_VEHICLE_PROFILES = [
  {
    entityId: MOCK_ACCIDENT_VEHICLE_IDS[0],
    subType: 'sedan',
    color: '#ef4444',
    finalOffsetM: -7,
    headingOffsetDeg: -10,
    approachM: 180,
  },
  {
    entityId: MOCK_ACCIDENT_VEHICLE_IDS[1],
    subType: 'pickup',
    color: '#1f2937',
    finalOffsetM: 0,
    headingOffsetDeg: 8,
    approachM: 150,
  },
  {
    entityId: MOCK_ACCIDENT_VEHICLE_IDS[2],
    subType: 'suv',
    color: '#facc15',
    finalOffsetM: 7,
    headingOffsetDeg: 18,
    approachM: 120,
  },
] as const;
export const MOCK_ACCIDENT_PERSON_IDS = [
  'PERSON-ACCIDENT-001',
  'PERSON-ACCIDENT-002',
  'PERSON-ACCIDENT-003',
  'PERSON-ACCIDENT-004',
  'PERSON-ACCIDENT-005',
] as const;
export const MOCK_ACCIDENT_PEDESTRIAN_PATH_ID = 'PATH-ACCIDENT-PEDESTRIAN-LOOP';
export const MOCK_ACCIDENT_ENTITY_IDS = [
  MOCK_ACCIDENT_ENTITY_ID,
  ...MOCK_ACCIDENT_VEHICLE_IDS,
  ...MOCK_ACCIDENT_PERSON_IDS,
] as const;

export function isMockAccidentEntity(entityId: string): boolean {
  return (MOCK_ACCIDENT_ENTITY_IDS as readonly string[]).includes(entityId);
}

export function isMockAccidentVehicle(entityId: string): boolean {
  return (MOCK_ACCIDENT_VEHICLE_IDS as readonly string[]).includes(entityId);
}

export function isMockAccidentPerson(entityId: string): boolean {
  return (MOCK_ACCIDENT_PERSON_IDS as readonly string[]).includes(entityId);
}

export function mockAccidentEntityStartMs(entityId: string): number {
  if (isMockAccidentVehicle(entityId)) return MOCK_ACCIDENT_VEHICLE_START_MS;
  if (isMockAccidentPerson(entityId)) return MOCK_ACCIDENT_PEOPLE_AT_MS;
  if (entityId === MOCK_ACCIDENT_ENTITY_ID) return MOCK_ACCIDENT_AT_MS;
  return LIVE_START_MS;
}
