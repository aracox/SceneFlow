import { useEffect, useMemo, useState } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import {
  fetchNearbyBusStops,
  fetchPassingTripDetailsForStops,
  type NamtangNearbyStop,
} from '../../services/namtangNearby';
import CollapsiblePanelSection from './CollapsiblePanelSection';

const MAX_STOPS = 6;
const MAX_TRIPS = 4;
const NAMTANG_REFRESH_MS = 30_000;

function routeLabel(stop: NamtangNearbyStop): string {
  const trips = stop.passingTrips.slice(0, MAX_TRIPS).map((trip) => trip.name).filter(Boolean);
  return trips.length > 0 ? trips.join(', ') : 'No listed routes';
}

function stopTitle(stop: NamtangNearbyStop): string {
  return stop.nameEn || stop.name || stop.nameTh || `Stop ${stop.id}`;
}

export default function NearbyBusPanel() {
  const mapCenter = useSceneStore((s) => s.mapCenter);
  const showBuses = useSceneStore((s) => s.layers.buses);
  const showBusStops = useSceneStore((s) => s.layers.busStops);
  const setNearbyBusStops = useSceneStore((s) => s.setNearbyBusStops);
  const selectedStopId = useSceneStore((s) => s.selectedNearbyBusStopId);
  const selectNearbyBusStop = useSceneStore((s) => s.selectNearbyBusStop);
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
    let interval: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      setStatus((current) => (current === 'ready' ? current : 'loading'));
      setLiveStatus((current) => (current === 'ready' || !showBuses ? current : 'loading'));
      setError('');
      try {
        const items = await fetchNearbyBusStops(queryCenter, controller.signal);
        const visibleStops = items.slice(0, MAX_STOPS);
        setStops(visibleStops);
        setNearbyBusStops(visibleStops);
        const currentSelected = useSceneStore.getState().selectedNearbyBusStopId;
        if (!visibleStops.some((stop) => stop.id === currentSelected)) {
          selectNearbyBusStop(null);
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
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setNearbyBusStops([]);
        setNearbyPassingTripsByStopId({});
        setNearbyLiveBuses([]);
        selectNearbyBusStop(null);
        setError(err instanceof Error ? err.message : 'Unable to load nearby bus stops.');
        setStatus('error');
        setLiveStatus('error');
      } finally {
        inFlight = false;
      }
    };

    const timeout = setTimeout(() => {
      void refresh();
      interval = setInterval(() => {
        void refresh();
      }, NAMTANG_REFRESH_MS);
    }, 900);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
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
