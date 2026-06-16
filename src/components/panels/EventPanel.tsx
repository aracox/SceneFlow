import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-brand-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

export default function EventPanel() {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));
  const selectEntity = useSceneStore((s) => s.selectEntity);

  const events = mockSceneStore.getEventsBefore(simSec * 1000, 10);

  return (
    <section className="p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Recent Events
      </h2>
      {events.length === 0 ? (
        <p className="text-xs text-slate-500">No events yet at this point in the timeline.</p>
      ) : (
        <ul className="space-y-1">
          {events.map((event) => (
            <li key={event.event_id}>
              <button
                type="button"
                onClick={() => event.entity_id && selectEntity(event.entity_id)}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[event.severity]}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-slate-700">{event.message}</span>
                  <span className="font-mono text-[10px] tabular-nums text-slate-400">
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
