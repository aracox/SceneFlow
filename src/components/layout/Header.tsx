import { useState } from 'react';
import { MOCK_ACCIDENT_ENTITY_ID } from '../../data/mockAccident';
import {
  MOCK_EVACUATION_BUILDING_NAME,
  MOCK_EVACUATION_INCIDENT_ID,
  MOCK_EVACUATION_WAIT_AREA,
} from '../../data/mockEvacuation';
import { mockMovementPointsLoaded } from '../../data/mockMovementPoints';
import { useSceneStore } from '../../store/sceneStore';

export type AppPage = 'map' | 'dashboard';

interface HeaderProps {
  activePage?: AppPage;
  onPageChange?: (page: AppPage) => void;
  onLogout?: () => void;
  hasIncidentNotification?: boolean;
  hasEvacuationNotification?: boolean;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export default function Header({
  activePage = 'map',
  onPageChange,
  onLogout,
  hasIncidentNotification = false,
  hasEvacuationNotification = false,
}: HeaderProps) {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));
  const mapCenter = useSceneStore((s) => s.mapCenter);
  const setLayer = useSceneStore((s) => s.setLayer);
  const selectEntity = useSceneStore((s) => s.selectEntity);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const movementReady = mockMovementPointsLoaded();
  const notificationCount =
    (hasEvacuationNotification ? 1 : 0) + (hasIncidentNotification ? 1 : 0);
  const pages: Array<{ key: AppPage; label: string }> = [
    { key: 'map', label: 'Map' },
    { key: 'dashboard', label: 'Dashboard' },
  ];

  const viewIncident = () => {
    if (!movementReady) return;
    setLayer('incidents', true);
    setLayer('vehicles', true);
    setLayer('people', true);
    selectEntity(MOCK_ACCIDENT_ENTITY_ID);
    onPageChange?.('map');
    setNotificationOpen(false);
  };

  const viewEvacuation = () => {
    if (!movementReady) return;
    setLayer('incidents', true);
    setLayer('people', true);
    selectEntity(MOCK_EVACUATION_INCIDENT_ID);
    onPageChange?.('map');
    setNotificationOpen(false);
  };

  return (
    <header className="relative flex h-16 shrink-0 items-center gap-4 border-b border-slate-100 bg-white px-[18px]">
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
      <div className="relative">
        <button
          type="button"
          onClick={() => setNotificationOpen((open) => !open)}
          aria-label="Incident notifications"
          aria-expanded={notificationOpen}
          className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${
            notificationCount > 0
              ? 'bg-amber-50 text-amber-600 active:bg-amber-100'
              : 'bg-slate-100 text-slate-500 active:bg-slate-200'
          }`}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 10.5a5 5 0 0 1 10 0v3.8l1.4 2.4H5.6L7 14.3v-3.8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M10 19a2.2 2.2 0 0 0 4 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
              {notificationCount}
            </span>
          )}
        </button>
        {notificationOpen && (
          <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-slate-100">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-[13px] font-semibold text-slate-900">
                Incident Notification
              </div>
              <div className="text-[12px] text-slate-500">
                Review active operational alerts later.
              </div>
            </div>
            {notificationCount > 0 ? (
              <div className="space-y-1 p-3">
                {hasEvacuationNotification && (
                  <button
                    type="button"
                    disabled={!movementReady}
                    onClick={viewEvacuation}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition active:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M8 21v-4.8L5.6 13l1.8-4.2 3.1 2 2-2.4L16 11"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle cx="11.7" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold leading-5 text-slate-900">
                        Evacuation Movement Detected
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-slate-500">
                        {movementReady
                          ? `10 people from ${MOCK_EVACUATION_BUILDING_NAME} to ${MOCK_EVACUATION_WAIT_AREA}.`
                          : 'Loading evacuation movement data…'}
                      </span>
                    </span>
                  </button>
                )}
                {hasIncidentNotification && (
                  <button
                    type="button"
                    disabled={!movementReady}
                    onClick={viewIncident}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition active:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 3.5 21 19H3L12 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold leading-5 text-slate-900">
                        Vehicle Accident Detected
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-slate-500">
                        {movementReady ? 'Open map and focus incident detail.' : 'Loading incident movement data…'}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-5 text-[13px] text-slate-500">
                No incident notification.
              </div>
            )}
          </div>
        )}
      </div>
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
