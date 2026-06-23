import { useSceneStore } from '../../store/sceneStore';

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export default function Header() {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));

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

      {/* Mock clock */}
      <span className="font-mono text-sm tabular-nums text-slate-700">
        {formatClock(simSec * 1000)}
      </span>
    </header>
  );
}
