import { useState } from 'react';
import {
  MOCK_EVACUATION_BUILDING_NAME,
  MOCK_EVACUATION_INCIDENT_ID,
  MOCK_EVACUATION_START_MS,
  MOCK_EVACUATION_WAIT_AREA,
} from '../../data/mockEvacuation';
import { mockMovementPointsLoaded } from '../../data/mockMovementPoints';
import { useSceneStore } from '../../store/sceneStore';

export default function EvacuationAlert() {
  const mode = useSceneStore((s) => s.mode);
  const simTime = useSceneStore((s) => s.simTime);
  const setLayer = useSceneStore((s) => s.setLayer);
  const selectEntity = useSceneStore((s) => s.selectEntity);
  const [dismissed, setDismissed] = useState(false);
  const movementReady = mockMovementPointsLoaded();

  const isActive = mode === 'live' && simTime >= MOCK_EVACUATION_START_MS && !dismissed;
  if (!isActive) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-5 z-30 w-[min(460px,calc(100%-32px))] -translate-x-1/2">
      <div className="pointer-events-auto overflow-hidden rounded-3xl bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-amber-100">
        <div className="flex items-start gap-4 border-l-[6px] border-amber-500 p-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M8 21v-4.8L5.6 13l1.8-4.2 3.1 2 2-2.4L16 11l-1.6 2.1-1.8-1.3-1.7 2.2 2.7 3.5V21"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="11.7" cy="4.5" r="2" fill="currentColor" opacity="0.22" />
              <circle cx="11.7" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">
              Warning alert
            </p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-slate-950">
              Evacuation movement detected
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              10 people running from {MOCK_EVACUATION_BUILDING_NAME} to {MOCK_EVACUATION_WAIT_AREA}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!movementReady}
                onClick={() => {
                  setLayer('incidents', true);
                  setLayer('people', true);
                  selectEntity(MOCK_EVACUATION_INCIDENT_ID);
                  setDismissed(true);
                }}
                className="min-h-10 rounded-full bg-amber-500 px-4 text-sm font-semibold text-white transition active:scale-[0.98] active:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {movementReady ? 'View evacuation' : 'Loading people…'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="min-h-10 rounded-full bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition active:scale-[0.98] active:bg-slate-200"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss evacuation alert"
            onClick={() => setDismissed(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
