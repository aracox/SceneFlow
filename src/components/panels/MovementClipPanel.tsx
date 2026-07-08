import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
}

export default function MovementClipPanel() {
  const clips = useSceneStore((s) => s.clips);
  const activeClipId = useSceneStore((s) => s.activeClipId);
  const playClip = useSceneStore((s) => s.playClip);
  const backToLive = useSceneStore((s) => s.backToLive);

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-slate-100 bg-white">
      <div className="flex items-center justify-between px-[18px] pb-2 pt-3">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
          Movement Clips
        </h2>
        <span className="text-[12px] text-slate-400">{clips.length} saved</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {clips.map((clip) => {
          const isActive = clip.clip_id === activeClipId;
          const entity = mockSceneStore.getEntityById(clip.entity_id);
          return (
            <li key={clip.clip_id}>
              <button
                type="button"
                onClick={() => (isActive ? backToLive() : playClip(clip.clip_id))}
                className={`mb-1.5 flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'bg-blue-50'
                    : 'bg-slate-50 active:bg-slate-100'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isActive ? 'bg-blue-500 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  {isActive ? (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      <rect width="8" height="8" rx="1.5" />
                    </svg>
                  ) : (
                    <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
                      <path d="M1 0.7 L8.5 5 L1 9.3 Z" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[13px] font-semibold text-slate-800">{clip.clip_id}</span>
                    <span className="text-[12px] font-medium text-slate-600">
                      {clip.entity_id}
                    </span>
                    {entity && (
                      <span className="text-[12px] text-slate-400">{entity.entity_type}</span>
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-slate-500">
                    {clip.reason}
                  </span>
                  <span className="block font-mono text-[12px] tabular-nums text-slate-400">
                    {formatTime(clip.start_time)} → {formatTime(clip.end_time)} ·{' '}
                    {Math.round((clip.summary?.duration_sec ?? 0) / 60)} min
                    {clip.summary?.distance_m !== undefined &&
                      ` · ${clip.summary.distance_m} m`}
                    {clip.summary?.avg_speed_kmh !== undefined &&
                      ` · ${clip.summary.avg_speed_kmh} km/h avg`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
