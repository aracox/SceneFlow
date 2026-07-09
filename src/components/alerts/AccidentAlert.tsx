import { useState } from 'react';
import { MOCK_ACCIDENT_AT_MS, MOCK_ACCIDENT_ENTITY_ID } from '../../data/mockAccident';
import { mockMovementPointsLoaded } from '../../data/mockMovementPoints';
import { useSceneStore } from '../../store/sceneStore';

export default function AccidentAlert() {
  const mode = useSceneStore((s) => s.mode);
  const simTime = useSceneStore((s) => s.simTime);
  const setLayer = useSceneStore((s) => s.setLayer);
  const selectEntity = useSceneStore((s) => s.selectEntity);
  const [dismissed, setDismissed] = useState(false);
  const movementReady = mockMovementPointsLoaded();

  const isActive = mode === 'live' && simTime >= MOCK_ACCIDENT_AT_MS && !dismissed;
  if (!isActive) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-5 z-30 w-[min(460px,calc(100%-32px))] -translate-x-1/2">
      <div className="pointer-events-auto overflow-hidden rounded-3xl bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-red-100">
        <div className="flex items-start gap-4 border-l-[6px] border-red-500 p-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3.5 21 19H3L12 3.5Z"
                fill="currentColor"
                opacity="0.16"
              />
              <path
                d="M12 7.8v5.4M12 16.8h.01"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M12 3.5 21 19H3L12 3.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">
              Critical alert
            </p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-slate-950">
              Vehicle accident detected
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!movementReady}
                onClick={() => {
                  setLayer('incidents', true);
                  setLayer('vehicles', true);
                  setLayer('people', true);
                  selectEntity(MOCK_ACCIDENT_ENTITY_ID);
                  setDismissed(true);
                }}
                className="min-h-10 rounded-full bg-red-500 px-4 text-sm font-semibold text-white transition active:scale-[0.98] active:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {movementReady ? 'View accident' : 'Loading accident…'}
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
            aria-label="Dismiss accident alert"
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
