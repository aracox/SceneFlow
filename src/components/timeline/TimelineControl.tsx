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
  const { setPlaying, setSpeed, scrubTo, backToLive } = useSceneStore.getState();

  const rangeStart = mode === 'live' ? SIM_START_MS : replayStart;
  const rangeEnd = mode === 'live' ? SIM_END_MS : replayEnd;
  const isLive = mode === 'live';

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-[18px] py-3">
      {/* Top row: transport controls */}
      <div className="flex items-center gap-3">
        <span
          className={`min-h-9 w-20 shrink-0 rounded-full px-[14px] py-2 text-center text-[12px] font-medium ${
            isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {isLive ? 'LIVE' : activeClipId ? 'CLIP' : 'REPLAY'}
        </span>

        {!isLive && (
          <button
            type="button"
            onClick={backToLive}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-[18px] text-[13px] font-medium text-emerald-700 active:bg-emerald-100"
          >
            ● Back to Live
          </button>
        )}

        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:scale-[0.98] active:bg-blue-600"
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

        {!isLive && (
          <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`min-h-9 rounded-full px-3 text-[12px] font-medium ${
                  speed === s
                    ? 'bg-white text-blue-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                    : 'text-slate-600 active:bg-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />
      </div>

      {/* Bottom row: time range scrubber */}
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-right font-mono text-[13px] tabular-nums text-slate-500">
          {formatTime(rangeStart)}
        </span>
        <input
          type="range"
          min={rangeStart}
          max={rangeEnd}
          step={500}
          value={Math.min(Math.max(simTime, rangeStart), rangeEnd)}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-blue-500"
        />
        <span className="w-16 shrink-0 font-mono text-[13px] tabular-nums text-slate-500">
          {formatTime(rangeEnd)}
        </span>
        <span className="w-24 shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-center font-mono text-[13px] tabular-nums text-slate-700">
          {formatTime(simTime)}
        </span>
      </div>
    </div>
  );
}
