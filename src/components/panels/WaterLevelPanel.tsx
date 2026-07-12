import { useEffect, useState } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { getWaterLevelCamera } from '../../data/waterLevelCameras';

// DDS still-image feeds refresh roughly every few seconds upstream; re-request
// with a cache-busting param on this cadence to approximate a live view.
const REFRESH_MS = 5000;

export default function WaterLevelPanel() {
  const selectedWaterCameraId = useSceneStore((s) => s.selectedWaterCameraId);
  const selectWaterCamera = useSceneStore((s) => s.selectWaterCamera);
  const camera = selectedWaterCameraId ? getWaterLevelCamera(selectedWaterCameraId) : undefined;

  const [bust, setBust] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [errored, setErrored] = useState(false);

  // Reset refresh/error state whenever the selected camera changes.
  useEffect(() => {
    setBust(0);
    setErrored(false);
  }, [selectedWaterCameraId]);

  useEffect(() => {
    if (!camera) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => setBust((b) => b + 1), REFRESH_MS);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [camera]);

  if (!camera) return null;

  const src = `${camera.imageUrl}?t=${bust}`;

  return (
    <section className="border-b border-slate-100 p-[18px]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
          Water Level — {camera.name}
        </h2>
        <button
          type="button"
          onClick={() => selectWaterCamera(null)}
          aria-label="Close water-level feed"
          title="Close"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-md border border-slate-300 bg-slate-800">
        {errored ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium tracking-wide text-white/40">
            FEED UNAVAILABLE
          </div>
        ) : (
          <img
            key={camera.id}
            src={src}
            alt={`Water level CCTV — ${camera.name}`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setErrored(true)}
            onLoad={() => setErrored(false)}
          />
        )}
        <div className="absolute left-2 top-1.5 flex items-center gap-1.5 text-[10px] font-medium text-white/90">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          {camera.id}
        </div>
        <div className="absolute right-2 top-1.5 flex items-center gap-1 text-[10px] font-semibold text-sky-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> LIVE
        </div>
        <div className="absolute bottom-1.5 left-2 truncate pr-16 text-[10px] text-white/60">
          {camera.name} · {camera.nameThai}
        </div>
        <div className="absolute bottom-1.5 right-2 font-mono text-[10px] tabular-nums text-white/70">
          {new Date(now).toLocaleTimeString('en-GB', { hour12: false })}
        </div>
      </div>

      <p className="mt-2 text-[12px] leading-[18px] text-slate-400">
        Flood-risk CCTV via the Bangkok Department of Drainage and Sewerage.
      </p>
    </section>
  );
}
