export interface NamtangTrip {
  tripId: number;
  name: string;
  routeLongName?: string;
  tripHeadsign?: string;
  tripHeadsignEn?: string;
  tripHeadsignTh?: string;
  vehicleSubType?: string;
  airCondition?: boolean;
  wheelchairAccessible?: boolean;
  hasGps?: boolean;
  color?: string;
}

export interface NamtangGpsVehicle {
  id: string;
  lat: string;
  lon: string;
  speed?: number;
  heading?: string;
  time?: number;
  received?: number;
  created?: number;
  is_reversed?: boolean;
  is_outside_stop_range?: boolean;
  is_approaching_stop?: boolean;
  is_first_to_arrive?: boolean;
  snapped_lat?: string;
  snapped_lon?: string;
  snapped_heading?: number;
  prev_stop_id?: number;
  prev_stop_name?: string;
  next_stop_id?: number;
  next_stop_name?: string;
  distance_to_next_stop?: string;
}

export interface NamtangPassingTrip extends NamtangTrip {
  gpsPin?: {
    iconUrl?: string | null;
    iconUrlHD?: string | null;
    name?: string;
    newName?: string | null;
  };
  gpsList: NamtangGpsVehicle[];
  waitTime?: number;
}

export interface NamtangNearbyStop {
  id: number;
  name: string;
  nameEn?: string;
  nameTh?: string;
  detail?: string;
  location: {
    lat: number;
    lon: number;
  };
  passingTrips: NamtangTrip[];
  travelTime?: number;
}

interface NamtangNearbyResponse {
  code: number;
  message: string;
  data: NamtangNearbyStop[];
}

interface NamtangPassingTripsResponse {
  code: number;
  message: string;
  data: NamtangPassingTrip[];
}

export interface NamtangLiveBus {
  id: string;
  tripId: number;
  routeName: string;
  routeLongName?: string;
  tripHeadsign?: string;
  vehicleSubType?: string;
  color?: string;
  lat: number;
  lon: number;
  headingDeg: number;
  speedKmh: number | null;
  updatedAtSec: number | null;
  stopId: number;
  stopName: string;
  nextStopId?: number;
  nextStopName?: string;
  waitTimeSec?: number;
  approachingStop: boolean;
  firstToArrive: boolean;
  snapped: boolean;
}

export interface NamtangStopPassingTripDetails {
  tripsByStopId: Record<number, NamtangPassingTrip[]>;
  liveBuses: NamtangLiveBus[];
}

function stopTitle(stop: NamtangNearbyStop): string {
  return stop.nameEn || stop.name || stop.nameTh || `Stop ${stop.id}`;
}

function numberFrom(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function liveBusFromGps(
  stop: NamtangNearbyStop,
  trip: NamtangPassingTrip,
  gps: NamtangGpsVehicle,
): NamtangLiveBus | null {
  const snappedLat = numberFrom(gps.snapped_lat);
  const snappedLon = numberFrom(gps.snapped_lon);
  const rawLat = numberFrom(gps.lat);
  const rawLon = numberFrom(gps.lon);
  const lat = snappedLat ?? rawLat;
  const lon = snappedLon ?? rawLon;
  if (!gps.id || lat === null || lon === null) return null;

  const heading = gps.snapped_heading ?? numberFrom(gps.heading) ?? 0;

  return {
    id: gps.id,
    tripId: trip.tripId,
    routeName: trip.gpsPin?.newName || trip.gpsPin?.name || trip.name,
    routeLongName: trip.routeLongName,
    tripHeadsign: trip.tripHeadsignEn || trip.tripHeadsign,
    vehicleSubType: trip.vehicleSubType,
    color: trip.color,
    lat,
    lon,
    headingDeg: heading,
    speedKmh: gps.speed ?? null,
    updatedAtSec: gps.time ?? gps.received ?? gps.created ?? null,
    stopId: stop.id,
    stopName: stopTitle(stop),
    nextStopId: gps.next_stop_id,
    nextStopName: gps.next_stop_name,
    waitTimeSec: trip.waitTime,
    approachingStop: gps.is_approaching_stop ?? false,
    firstToArrive: gps.is_first_to_arrive ?? false,
    snapped: snappedLat !== null && snappedLon !== null,
  };
}

export async function fetchNearbyBusStops(
  center: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<NamtangNearbyStop[]> {
  const params = new URLSearchParams({
    lat: center.lat.toFixed(6),
    lon: center.lng.toFixed(6),
    locale: 'en',
  });
  const response = await fetch(`/namtang-api/front/nearby?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Namtang nearby request failed: ${response.status}`);
  }
  const payload = (await response.json()) as Partial<NamtangNearbyResponse>;
  if (payload.code !== 200 || !Array.isArray(payload.data)) {
    throw new Error(payload.message || 'Unexpected Namtang nearby response.');
  }
  return payload.data;
}

export async function fetchPassingTrips(
  stopId: number,
  signal?: AbortSignal,
): Promise<NamtangPassingTrip[]> {
  const params = new URLSearchParams({ locale: 'en' });
  const response = await fetch(`/namtang-api/front/passingtrips/${stopId}?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Namtang passing trips request failed: ${response.status}`);
  }
  const payload = (await response.json()) as Partial<NamtangPassingTripsResponse>;
  if (payload.code !== 200 || !Array.isArray(payload.data)) {
    throw new Error(payload.message || 'Unexpected Namtang passing trips response.');
  }
  return payload.data;
}

export async function fetchLiveBusesForStops(
  stops: NamtangNearbyStop[],
  signal?: AbortSignal,
): Promise<NamtangLiveBus[]> {
  const details = await fetchPassingTripDetailsForStops(stops, signal);
  return details.liveBuses;
}

export async function fetchPassingTripDetailsForStops(
  stops: NamtangNearbyStop[],
  signal?: AbortSignal,
): Promise<NamtangStopPassingTripDetails> {
  const results = await Promise.allSettled(
    stops.map(async (stop) => {
      const trips = await fetchPassingTrips(stop.id, signal);
      return { stop, trips };
    }),
  );

  if (signal?.aborted) return { tripsByStopId: {}, liveBuses: [] };

  const tripsByStopId: Record<number, NamtangPassingTrip[]> = {};
  const byVehicleId = new Map<string, NamtangLiveBus>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { stop, trips } = result.value;
    tripsByStopId[stop.id] = trips;
    const liveBuses = trips.flatMap((trip) =>
      trip.gpsList
        .map((gps) => liveBusFromGps(stop, trip, gps))
        .filter((bus): bus is NamtangLiveBus => bus !== null),
    );
    for (const bus of liveBuses) {
      const existing = byVehicleId.get(bus.id);
      if (!existing || (bus.updatedAtSec ?? 0) >= (existing.updatedAtSec ?? 0)) {
        byVehicleId.set(bus.id, bus);
      }
    }
  }

  return {
    tripsByStopId,
    liveBuses: [...byVehicleId.values()].sort((a, b) => a.routeName.localeCompare(b.routeName)),
  };
}
