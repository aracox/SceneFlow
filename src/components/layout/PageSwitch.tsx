import type { AppPage } from './Header';

interface PageSwitchProps {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
}

const PAGES: Array<{ key: AppPage; label: string }> = [
  { key: 'map', label: 'Map' },
  { key: 'dashboard', label: 'Dashboard' },
];

export default function PageSwitch({ activePage, onPageChange }: PageSwitchProps) {
  return (
    <nav className="flex h-7 shrink-0 items-center rounded-full bg-slate-100 p-1 shadow-inner shadow-slate-200/50">
      {PAGES.map((page) => {
        const isActive = activePage === page.key;
        return (
          <button
            key={page.key}
            type="button"
            disabled={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onPageChange(page.key)}
            className={`flex h-5 w-[74px] items-center justify-center rounded-full text-[10px] font-bold transition ${
              isActive
                ? 'cursor-default bg-white text-blue-600 shadow-[0_5px_11px_rgba(15,23,42,0.12)]'
                : 'text-slate-500 active:scale-[0.98] active:bg-slate-200'
            }`}
          >
            {page.label}
          </button>
        );
      })}
    </nav>
  );
}
