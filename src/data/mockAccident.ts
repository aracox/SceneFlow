import { LIVE_START_MS, SIM_START_MS } from './simWindow';

export const MOCK_ACCIDENT_ENTITY_ID = 'INCIDENT-ACCIDENT-001';
export const MOCK_ACCIDENT_DELAY_MS = 30_000;
export const MOCK_ACCIDENT_AT_MS = LIVE_START_MS + MOCK_ACCIDENT_DELAY_MS;
// Accident vehicles drive the lane for the whole sim window, so scrubbing
// anywhere in replay shows them cruising as normal traffic long before the
// crash — the pile-up is just the last few seconds of a 30-minute drive.
export const MOCK_ACCIDENT_VEHICLE_START_MS = SIM_START_MS;
export const MOCK_ACCIDENT_CRUISE_KMH = 36;
// First occupant steps out this long after impact; the rest follow staggered.
export const MOCK_ACCIDENT_PEOPLE_DELAY_MS = 5_000;
export const MOCK_ACCIDENT_PERSON_STAGGER_MS = 2_500;
export const MOCK_ACCIDENT_PEOPLE_AT_MS = MOCK_ACCIDENT_AT_MS + MOCK_ACCIDENT_PEOPLE_DELAY_MS;
export const MOCK_ACCIDENT_REPLAY_START_MS = MOCK_ACCIDENT_AT_MS - 20_000;
export const MOCK_ACCIDENT_VEHICLE_IDS = [
  'VEH-ACCIDENT-001',
  'VEH-ACCIDENT-002',
  'VEH-ACCIDENT-003',
] as const;
// Three-car rear-end pile-up on one lane. finalOffsetM orders the cars along
// the path (the +7 m SUV leads, the −7 m sedan trails). stopDelayS is when
// each car comes to rest relative to impact: the lead SUV brakes hard and
// stops 2 s BEFORE impact (it is the cause), the pickup brakes late and
// slams into it at impact, the trailing sedan skids in 1 s later.
// headingOffsetDeg is the crash yaw once the car has stopped.
export const MOCK_ACCIDENT_VEHICLE_PROFILES = [
  {
    entityId: MOCK_ACCIDENT_VEHICLE_IDS[0],
    subType: 'sedan',
    color: '#ef4444',
    finalOffsetM: -7,
    headingOffsetDeg: -10,
    stopDelayS: 1,
    brakeDurS: 1.5,
  },
  {
    entityId: MOCK_ACCIDENT_VEHICLE_IDS[1],
    subType: 'pickup',
    color: '#1f2937',
    finalOffsetM: 0,
    headingOffsetDeg: 8,
    stopDelayS: 0,
    brakeDurS: 2,
  },
  {
    entityId: MOCK_ACCIDENT_VEHICLE_IDS[2],
    subType: 'suv',
    color: '#facc15',
    finalOffsetM: 7,
    headingOffsetDeg: 18,
    stopDelayS: -2,
    brakeDurS: 3,
  },
] as const;
export const MOCK_ACCIDENT_PERSON_IDS = [
  'PERSON-ACCIDENT-001',
  'PERSON-ACCIDENT-002',
  'PERSON-ACCIDENT-003',
  'PERSON-ACCIDENT-004',
  'PERSON-ACCIDENT-005',
] as const;
// Which car each person exits and on which side (+1 right / −1 left of the
// travel direction). Order matches MOCK_ACCIDENT_PERSON_IDS; exit times are
// staggered by index so occupants step out one after another.
export const MOCK_ACCIDENT_PERSON_EXITS = [
  { carIdx: 1, side: 1 },
  { carIdx: 0, side: 1 },
  { carIdx: 2, side: 1 },
  { carIdx: 1, side: -1 },
  { carIdx: 0, side: -1 },
] as const;
export const MOCK_ACCIDENT_PEDESTRIAN_PATH_ID = 'PATH-ACCIDENT-PEDESTRIAN-LOOP';
export const MOCK_ACCIDENT_REPLAY_END_MS =
  MOCK_ACCIDENT_PEOPLE_AT_MS +
  (MOCK_ACCIDENT_PERSON_IDS.length - 1) * MOCK_ACCIDENT_PERSON_STAGGER_MS +
  35_000;
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

export function mockAccidentPersonStartMs(personIdx: number): number {
  return MOCK_ACCIDENT_PEOPLE_AT_MS + Math.max(personIdx, 0) * MOCK_ACCIDENT_PERSON_STAGGER_MS;
}

export function mockAccidentEntityStartMs(entityId: string): number {
  if (isMockAccidentVehicle(entityId)) return MOCK_ACCIDENT_VEHICLE_START_MS;
  if (isMockAccidentPerson(entityId)) {
    return mockAccidentPersonStartMs(
      (MOCK_ACCIDENT_PERSON_IDS as readonly string[]).indexOf(entityId),
    );
  }
  if (entityId === MOCK_ACCIDENT_ENTITY_ID) return MOCK_ACCIDENT_AT_MS;
  return LIVE_START_MS;
}
