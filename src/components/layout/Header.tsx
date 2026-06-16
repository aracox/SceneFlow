import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export default function Header() {
  const mode = useSceneStore((s) => s.mode);
  const isPlaying = useSceneStore((s) => s.isPlaying);
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));

  const activeIncidents = mockSceneStore
    .getEntities()
    .filter(
      (e) =>
        e.entity_type === 'incident_object' &&
        mockSceneStore.getRenderState(e.entity_id, simSec * 1000) !== null,
    ).length;

  const isLive = mode === 'live';

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <path
              d="M5 22c5-9 8-9 12-4s6 5 10-4"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-slate-900">
            SceneFlow <span className="font-medium text-slate-500">Live Map</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Camera-to-Map Visual Intelligence Platform
          </div>
        </div>
      </div>

      {/* Site selector */}
      <div className="ml-4 flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-slate-400">
          <path
            d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="font-medium">Thailand Digital Valley Pilot</span>
      </div>

      <div className="flex-1" />

      {/* Live / replay indicator + mock clock */}
      <div className="flex items-center gap-3">
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isLive
                ? `bg-emerald-500 ${isPlaying ? 'animate-pulse' : ''}`
                : 'bg-amber-500'
            }`}
          />
          {isLive ? 'LIVE' : 'REPLAY'}
        </span>
        <span className="font-mono text-sm tabular-nums text-slate-700">
          {formatClock(simSec * 1000)}
        </span>
      </div>

      {/* Alerts */}
      <button
        type="button"
        className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        title={`${activeIncidents} active incidents`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" />
        </svg>
        {activeIncidents > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {activeIncidents}
          </span>
        )}
      </button>

      {/* User */}
      <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          A
        </div>
        <span className="text-sm font-medium text-slate-700">Admin</span>
      </div>
    </header>
  );
}
