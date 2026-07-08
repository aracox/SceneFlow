import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

export default function EventPanel() {
  const displayedCameraIds = useSceneStore((s) => s.displayedCameraIds);
  const selectEntity = useSceneStore((s) => s.selectEntity);

  // Events are scoped to the cameras the user is displaying — this changes only
  // when a camera is selected, not as the playback clock advances.
  const events = mockSceneStore.getEventsForCameras(displayedCameraIds, 12);

  return (
    <section className="p-[18px]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
          Recent Events
        </h2>
        <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
          {displayedCameraIds.length} camera{displayedCameraIds.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mb-3 truncate text-[12px] text-slate-400" title={displayedCameraIds.join(', ')}>
        {displayedCameraIds.join(' · ')}
      </p>
      {events.length === 0 ? (
        <p className="text-[13px] text-slate-500">No events for the selected camera(s).</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li key={event.event_id}>
              <button
                type="button"
                onClick={() => event.entity_id && selectEntity(event.entity_id)}
                className="flex min-h-[52px] w-full items-start gap-3 rounded-2xl px-3 py-2 text-left active:bg-slate-100"
              >
                <span
                  className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_DOT[event.severity]}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] leading-5 text-slate-700">{event.message}</span>
                  <span className="font-mono text-[12px] tabular-nums text-slate-400">
                    {new Date(event.observed_at).toLocaleTimeString('en-GB', { hour12: false })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
