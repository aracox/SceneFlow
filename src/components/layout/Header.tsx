import { useSceneStore } from '../../store/sceneStore';

export type AppPage = 'map' | 'dashboard';

interface HeaderProps {
  activePage?: AppPage;
  onPageChange?: (page: AppPage) => void;
  onLogout?: () => void;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export default function Header({ activePage = 'map', onPageChange, onLogout }: HeaderProps) {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));
  const pages: Array<{ key: AppPage; label: string }> = [
    { key: 'map', label: 'Map' },
    { key: 'dashboard', label: 'Dashboard' },
  ];

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

      {onPageChange && (
        <nav className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {pages.map((page) => (
            <button
              key={page.key}
              type="button"
              onClick={() => onPageChange(page.key)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                activePage === page.key
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {page.label}
            </button>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      {/* Mock clock */}
      <span className="font-mono text-sm tabular-nums text-slate-700">
        {formatClock(simSec * 1000)}
      </span>
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          Logout
        </button>
      )}
    </header>
  );
}
