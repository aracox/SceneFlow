import { useEffect, useState } from 'react';
import { SIM_END_MS, SIM_START_MS } from '../../data/simWindow';
import { useSceneStore, type PlaybackSpeed } from '../../store/sceneStore';

const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8];

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export default function TimelineControl() {
  const mode = useSceneStore((s) => s.mode);
  const simTime = useSceneStore((s) => s.simTime);
  const isPlaying = useSceneStore((s) => s.isPlaying);
  const speed = useSceneStore((s) => s.speed);
  const replayStart = useSceneStore((s) => s.replayStart);
  const replayEnd = useSceneStore((s) => s.replayEnd);
  const activeClipId = useSceneStore((s) => s.activeClipId);
  const selectedEntityId = useSceneStore((s) => s.selectedEntityId);
  const lastSavedClipId = useSceneStore((s) => s.lastSavedClipId);
  const { setPlaying, setSpeed, scrubTo, saveClip, backToLive } = useSceneStore.getState();

  const [reason, setReason] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!lastSavedClipId) return;
    setSavedNotice(`Saved ${lastSavedClipId}`);
    const timer = setTimeout(() => setSavedNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [lastSavedClipId]);

  const rangeStart = mode === 'live' ? SIM_START_MS : replayStart;
  const rangeEnd = mode === 'live' ? SIM_END_MS : replayEnd;
  const isLive = mode === 'live';

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4 py-3">
      {/* Top row: transport controls */}
      <div className="flex items-center gap-3">
        <span
          className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${
            isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {isLive ? 'LIVE' : activeClipId ? 'CLIP' : 'REPLAY'}
        </span>

        {!isLive && (
          <button
            type="button"
            onClick={backToLive}
            className="shrink-0 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            ● Back to Live
          </button>
        )}

        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-700"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
              <rect x="1" y="0" width="3.2" height="12" rx="1" />
              <rect x="6.8" y="0" width="3.2" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
              <path d="M1.5 0.8 L10.5 6 L1.5 11.2 Z" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                speed === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Clip reason (optional)"
          className="w-36 min-w-0 rounded-md border border-slate-200 px-2 py-1 text-xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => saveClip(reason || undefined)}
          disabled={!selectedEntityId}
          title={selectedEntityId ? 'Save the last 5 minutes for the selected entity' : 'Select an entity first'}
          className="shrink-0 whitespace-nowrap rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save 5-minute clip
        </button>
        {savedNotice && (
          <span className="text-xs font-medium text-emerald-600">{savedNotice}</span>
        )}
      </div>

      {/* Bottom row: time range scrubber */}
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-500">
          {formatTime(rangeStart)}
        </span>
        <input
          type="range"
          min={rangeStart}
          max={rangeEnd}
          step={500}
          value={Math.min(Math.max(simTime, rangeStart), rangeEnd)}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-brand-600"
        />
        <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
          {formatTime(rangeEnd)}
        </span>
        <span className="w-20 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums text-slate-700">
          {formatTime(simTime)}
        </span>
      </div>
    </div>
  );
}
