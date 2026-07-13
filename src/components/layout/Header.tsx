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

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export default function Header({ activePage = 'map', onPageChange, onLogout }: HeaderProps) {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));
  const mapCenter = useSceneStore((s) => s.mapCenter);
  const pages: Array<{ key: AppPage; label: string }> = [
    { key: 'map', label: 'Map' },
    { key: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-100 bg-white px-[18px]">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
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
          <div className="text-[17px] font-bold leading-6 text-slate-950">
            SCENE <span className="text-[#3B82F6]">FLOW</span>
          </div>
          <div className="text-[12px] font-medium leading-[18px] text-slate-500">
            Camera-to-Map Visual Intelligence Platform
          </div>
        </div>
      </div>

      {onPageChange && (
        <nav className="flex rounded-full bg-slate-100 p-1">
          {pages.map((page) => (
            <button
              key={page.key}
              type="button"
              onClick={() => onPageChange(page.key)}
              className={`min-h-9 rounded-full px-[18px] text-[13px] font-medium transition duration-300 ${
                activePage === page.key
                  ? 'bg-white text-blue-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                  : 'text-slate-500 active:bg-slate-200'
              }`}
            >
              {page.label}
            </button>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      <span
        className="min-h-9 rounded-full bg-slate-50 px-[14px] py-2 font-mono text-[12px] tabular-nums text-slate-500 ring-1 ring-slate-100"
        title="Map center coordinates"
      >
        Lat {formatCoordinate(mapCenter.lat)} · Lng {formatCoordinate(mapCenter.lng)}
      </span>

      {/* Mock clock */}
      <span className="flex min-h-9 items-center gap-2 rounded-full bg-slate-100 px-[14px] py-2 font-mono text-[13px] tabular-nums text-slate-700">
        <svg
          className="h-4 w-4 text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 7.5V12l3 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {formatClock(simSec * 1000)}
      </span>
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="min-h-11 rounded-full bg-slate-100 px-[18px] text-[13px] font-medium text-slate-600 transition duration-300 active:bg-red-50 active:text-red-600"
        >
          Logout
        </button>
      )}
    </header>
  );
}
