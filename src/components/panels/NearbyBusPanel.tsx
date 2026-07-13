import { useEffect, useMemo, useState } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import {
  fetchNearbyBusStops,
  fetchPassingTripDetailsForStops,
  type NamtangNearbyStop,
  type NamtangTrip,
  type NamtangPassingTrip,
} from '../../services/namtangNearby';
import CollapsiblePanelSection from './CollapsiblePanelSection';

const MAX_STOPS = 6;
const MAX_TRIPS = 4;
type DisplayTrip = NamtangTrip & Partial<Pick<NamtangPassingTrip, 'gpsPin' | 'gpsList' | 'waitTime'>>;

function routeLabel(stop: NamtangNearbyStop): string {
  const trips = stop.passingTrips.slice(0, MAX_TRIPS).map((trip) => trip.name).filter(Boolean);
  return trips.length > 0 ? trips.join(', ') : 'No listed routes';
}

function stopTitle(stop: NamtangNearbyStop): string {
  return stop.nameEn || stop.name || stop.nameTh || `Stop ${stop.id}`;
}

function tripTitle(trip: DisplayTrip): string {
  return trip.gpsPin?.newName || trip.gpsPin?.name || trip.name;
}

function tripColor(trip: DisplayTrip): string {
  return trip.color && /^[0-9a-fA-F]{6}$/.test(trip.color) ? `#${trip.color}` : '#64748b';
}

function waitLabel(waitTime: number | undefined): string | null {
  if (!waitTime || waitTime <= 0) return null;
  const minutes = Math.max(1, Math.round(waitTime / 60));
  return `${minutes} min`;
}

export default function NearbyBusPanel() {
  const mapCenter = useSceneStore((s) => s.mapCenter);
  const showBuses = useSceneStore((s) => s.layers.buses);
  const showBusStops = useSceneStore((s) => s.layers.busStops);
  const setNearbyBusStops = useSceneStore((s) => s.setNearbyBusStops);
  const selectedStopId = useSceneStore((s) => s.selectedNearbyBusStopId);
  const selectNearbyBusStop = useSceneStore((s) => s.selectNearbyBusStop);
  const passingTripsByStopId = useSceneStore((s) => s.nearbyPassingTripsByStopId);
  const setNearbyPassingTripsByStopId = useSceneStore((s) => s.setNearbyPassingTripsByStopId);
  const setNearbyLiveBuses = useSceneStore((s) => s.setNearbyLiveBuses);
  const nearbyLiveBuses = useSceneStore((s) => s.nearbyLiveBuses);
  const [stops, setStops] = useState<NamtangNearbyStop[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const shouldFetchNamtang = showBuses || showBusStops;

  const queryCenter = useMemo(
    () => ({
      lat: Number(mapCenter.lat.toFixed(5)),
      lng: Number(mapCenter.lng.toFixed(5)),
    }),
    [mapCenter.lat, mapCenter.lng],
  );

  const selectedStop = stops.find((stop) => stop.id === selectedStopId) ?? null;
  const selectedTrips: DisplayTrip[] = selectedStop
    ? passingTripsByStopId[selectedStop.id] ?? selectedStop.passingTrips
    : [];

  useEffect(() => {
    if (!shouldFetchNamtang) {
      setStops([]);
      setStatus('idle');
      setLiveStatus('idle');
      setError('');
      setUpdatedAt(null);
      setNearbyBusStops([]);
      setNearbyPassingTripsByStopId({});
      setNearbyLiveBuses([]);
      selectNearbyBusStop(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setStatus((current) => (current === 'ready' ? current : 'loading'));
      setLiveStatus((current) => (current === 'ready' || !showBuses ? current : 'loading'));
      setError('');
      fetchNearbyBusStops(queryCenter, controller.signal)
        .then(async (items) => {
          const visibleStops = items.slice(0, MAX_STOPS);
          setStops(visibleStops);
          setNearbyBusStops(visibleStops);
          setNearbyPassingTripsByStopId({});
          const currentSelected = useSceneStore.getState().selectedNearbyBusStopId;
          if (!visibleStops.some((stop) => stop.id === currentSelected)) {
            selectNearbyBusStop(visibleStops[0]?.id ?? null);
          }
          setUpdatedAt(Date.now());
          setStatus('ready');
          if (!showBuses) {
            setNearbyPassingTripsByStopId({});
            setNearbyLiveBuses([]);
            setLiveStatus('idle');
            return;
          }
          try {
            const details = await fetchPassingTripDetailsForStops(visibleStops, controller.signal);
            if (controller.signal.aborted) return;
            setNearbyPassingTripsByStopId(details.tripsByStopId);
            setNearbyLiveBuses(details.liveBuses);
            setLiveStatus('ready');
          } catch {
            if (controller.signal.aborted) return;
            setNearbyPassingTripsByStopId({});
            setNearbyLiveBuses([]);
            setLiveStatus('error');
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setNearbyBusStops([]);
          setNearbyPassingTripsByStopId({});
          setNearbyLiveBuses([]);
          selectNearbyBusStop(null);
          setError(err instanceof Error ? err.message : 'Unable to load nearby bus stops.');
          setStatus('error');
          setLiveStatus('error');
        });
    }, 900);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    queryCenter,
    selectNearbyBusStop,
    setNearbyBusStops,
    setNearbyLiveBuses,
    setNearbyPassingTripsByStopId,
    shouldFetchNamtang,
    showBuses,
  ]);

  return (
    <CollapsiblePanelSection
      title="Nearby Bus Stops"
      subtitle={
        shouldFetchNamtang
          ? `${queryCenter.lat.toFixed(5)}, ${queryCenter.lng.toFixed(5)}`
          : 'Enable Buses or Bus Stops layer'
      }
    >
      {!shouldFetchNamtang ? (
        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] leading-5 text-slate-500">
          Enable Buses or Bus Stops in Map Layers to load Namtang data.
        </div>
      ) : status === 'error' ? (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-2">
          {stops.map((stop) => (
            <button
              key={stop.id}
              type="button"
              onClick={() => selectNearbyBusStop(stop.id)}
              className={`w-full rounded-md border px-3 py-2 text-left transition ${
                selectedStopId === stop.id
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-slate-100 bg-slate-50 hover:border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-semibold leading-5 text-slate-800">
                    {stopTitle(stop)}
                  </h3>
                  {stop.nameTh && (
                    <p className="truncate text-[11px] leading-4 text-slate-400">{stop.nameTh}</p>
                  )}
                </div>
                {stop.travelTime !== undefined && (
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">
                    {Math.round(stop.travelTime)} min
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                {routeLabel(stop)}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {stop.passingTrips.length} passing route{stop.passingTrips.length === 1 ? '' : 's'}
              </p>
            </button>
          ))}

          {status === 'loading' && stops.length === 0 && (
            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] text-slate-400">
              Loading nearby stops...
            </div>
          )}
          {status === 'ready' && stops.length === 0 && (
            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] text-slate-400">
              No nearby bus stops found.
            </div>
          )}
        </div>
      )}

      {selectedStop && (
        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-semibold leading-5 text-slate-800">
                {stopTitle(selectedStop)}
              </h3>
              <p className="text-[11px] leading-4 text-slate-400">
                Stop {selectedStop.id} · {selectedStop.location.lat.toFixed(6)}, {selectedStop.location.lon.toFixed(6)}
              </p>
            </div>
            {selectedStop.travelTime !== undefined && (
              <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">
                {Math.round(selectedStop.travelTime)} min
              </span>
            )}
          </div>

          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {selectedTrips.map((trip) => {
              const wait = waitLabel(trip.waitTime);
              const gpsList = trip.gpsList ?? [];
              const nextStop = gpsList[0]?.next_stop_name;
              const gpsText = showBuses
                ? `${gpsList.length} live GPS bus${gpsList.length === 1 ? '' : 'es'}`
                : 'GPS-capable';
              return (
                <article key={`${selectedStop.id}-${trip.tripId}`} className="rounded-md bg-slate-50 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tripColor(trip) }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate text-[12px] font-semibold leading-5 text-slate-800">
                          {tripTitle(trip)}
                        </h4>
                        {wait && (
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">
                            {wait}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-4 text-slate-500">
                        {trip.routeLongName || trip.tripHeadsignEn || trip.tripHeadsign || trip.vehicleSubType || 'Route detail unavailable'}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-400">
                        {trip.hasGps ? gpsText : 'No GPS'}
                        {nextStop && ` · next ${nextStop}`}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}

            {liveStatus === 'loading' && selectedTrips.length === 0 && (
              <div className="rounded-md bg-slate-50 px-3 py-3 text-[12px] text-slate-400">
                Loading passing trips...
              </div>
            )}
            {liveStatus === 'ready' && selectedTrips.length === 0 && (
              <div className="rounded-md bg-slate-50 px-3 py-3 text-[12px] text-slate-400">
                No passing trip detail found.
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-2 text-[12px] leading-[18px] text-slate-400">
        Namtang nearby results refresh from the current map center.
        {updatedAt && ` Updated ${new Date(updatedAt).toLocaleTimeString('en-GB', { hour12: false })}.`}
      </p>
      <p className="mt-1 text-[12px] leading-[18px] text-slate-400">
        Live GPS buses: {showBuses ? (liveStatus === 'loading' ? 'loading' : nearbyLiveBuses.length) : 'layer off'}
        {liveStatus === 'error' && ' unavailable'}
      </p>
    </CollapsiblePanelSection>
  );
}
