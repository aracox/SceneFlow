import { useSceneStore, type PlaybackSpeed } from '../../store/sceneStore';

const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8];

interface TimelineControlProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export default function TimelineControl({
  collapsed = false,
  onCollapsedChange,
}: TimelineControlProps) {
  const mode = useSceneStore((s) => s.mode);
  const simTime = useSceneStore((s) => s.simTime);
  const isPlaying = useSceneStore((s) => s.isPlaying);
  const speed = useSceneStore((s) => s.speed);
  const replayStart = useSceneStore((s) => s.replayStart);
  const replayEnd = useSceneStore((s) => s.replayEnd);
  const activeClipId = useSceneStore((s) => s.activeClipId);
  const { setPlaying, setSpeed, startReplay, scrubTo, backToLive } = useSceneStore.getState();

  const isLive = mode === 'live';
  const rangeStart = replayStart;
  const rangeEnd = replayEnd;
  const modeLabel = isLive ? 'LIVE' : activeClipId ? 'CLIP' : 'REPLAY';

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange?.(false)}
        aria-label="Expand timeline control"
        title="Expand timeline control"
        className="flex min-h-11 items-center gap-3 rounded-full px-[18px] py-2 text-left transition active:scale-[0.98]"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isLive ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        <span className="text-[13px] font-semibold text-slate-700">{modeLabel}</span>
        <span className="font-mono text-[13px] tabular-nums text-slate-500">
          {formatTime(simTime)}
        </span>
        <svg className="h-4 w-4 text-slate-500" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-[18px] py-3">
      {/* Top row: transport controls */}
      <div className="flex items-center gap-3">
        <span
          className={`min-h-9 w-20 shrink-0 rounded-full px-[14px] py-2 text-center text-[12px] font-medium ${
            isLive ? 'bg-emerald-50/85 text-emerald-700' : 'bg-amber-50/85 text-amber-700'
          }`}
        >
          {modeLabel}
        </span>

        {!isLive && (
          <button
            type="button"
            onClick={backToLive}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-emerald-50/85 px-[18px] text-[13px] font-medium text-emerald-700 active:bg-emerald-100/90"
          >
            ● Back to Live
          </button>
        )}

        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] active:scale-[0.98] active:bg-blue-600"
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

        {isLive && (
          <button
            type="button"
            onClick={startReplay}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-slate-100/80 px-[18px] text-[13px] font-medium text-slate-700 active:bg-slate-200/90"
            title="Open the latest 10-minute replay window"
          >
            Replay
          </button>
        )}

        {!isLive && (
          <div className="flex items-center gap-1 rounded-full bg-slate-100/75 p-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`min-h-9 rounded-full px-3 text-[12px] font-medium ${
                  speed === s
                    ? 'bg-white/90 text-blue-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                    : 'text-slate-600 active:bg-slate-200/90'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {isLive && (
          <span className="shrink-0 rounded-full bg-slate-100/80 px-4 py-2 text-center font-mono text-[13px] tabular-nums text-slate-700">
            {formatTime(simTime)}
          </span>
        )}

        <button
          type="button"
          onClick={() => onCollapsedChange?.(true)}
          aria-label="Collapse timeline control"
          title="Collapse timeline control"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/50 text-slate-500 shadow-sm ring-1 ring-white/50 transition hover:bg-white/70 hover:text-slate-700 active:scale-[0.98]"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 4 6 8l4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!isLive && (
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
          <span className="w-24 shrink-0 rounded-full bg-slate-100/80 px-3 py-1.5 text-center font-mono text-[13px] tabular-nums text-slate-700">
            {formatTime(simTime)}
          </span>
        </div>
      )}
    </div>
  );
}
