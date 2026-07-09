import { LIVE_START_MS } from './simWindow';

export const MOCK_ACCIDENT_ENTITY_ID = 'INCIDENT-ACCIDENT-001';
export const MOCK_ACCIDENT_VEHICLE_IDS = [
  'VEH-ACCIDENT-001',
  'VEH-ACCIDENT-002',
  'VEH-ACCIDENT-003',
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
export const MOCK_ACCIDENT_DELAY_MS = 30_000;
export const MOCK_ACCIDENT_AT_MS = LIVE_START_MS + MOCK_ACCIDENT_DELAY_MS;

export function isMockAccidentEntity(entityId: string): boolean {
  return (MOCK_ACCIDENT_ENTITY_IDS as readonly string[]).includes(entityId);
}

export function isMockAccidentPerson(entityId: string): boolean {
  return (MOCK_ACCIDENT_PERSON_IDS as readonly string[]).includes(entityId);
}
