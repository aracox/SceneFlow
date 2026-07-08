import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

const STATUS_STYLE: Record<string, string> = {
  tracked: 'bg-emerald-50 text-emerald-700',
  predicted: 'bg-amber-50 text-amber-700',
  lost: 'bg-red-50 text-red-700',
  stopped: 'bg-slate-100 text-slate-600',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 py-1">
      <span className="shrink-0 text-[13px] text-slate-500">{label}</span>
      <span className="truncate text-right text-[13px] font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function EntityDetailPanel() {
  const selectedEntityId = useSceneStore((s) => s.selectedEntityId);
  // Refresh twice per second — detail values don't need 60fps.
  const halfSec = useSceneStore((s) => Math.floor(s.simTime / 500));

  const entity = selectedEntityId ? mockSceneStore.getEntityById(selectedEntityId) : undefined;
  const state = selectedEntityId
    ? mockSceneStore.getRenderState(selectedEntityId, halfSec * 500)
    : null;

  if (!entity) {
    return (
      <section className="border-b border-slate-100 p-[18px]">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-500">
          Entity Detail
        </h2>
        <p className="text-[15px] leading-6 text-slate-500">
          Click an entity on the map to see its live state, source camera and path.
        </p>
      </section>
    );
  }

  const camera = state?.source_camera_id
    ? mockSceneStore.getCameraById(state.source_camera_id)
    : undefined;
  const path = state?.path_id ? mockSceneStore.getPathById(state.path_id) : undefined;
  const zone = state?.zone_id ? mockSceneStore.getZoneById(state.zone_id) : undefined;
  const status = state?.tracking_status ?? entity.current_status;

  return (
    <section className="border-b border-slate-100 p-[18px]">
      <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-500">
        Entity Detail
      </h2>
      <div className="mb-3 flex min-h-11 items-center gap-2">
        <span
          className="h-4 w-4 rounded-full border border-slate-300"
          style={{ backgroundColor: entity.color ?? '#2563eb' }}
        />
        <span className="text-[15px] font-semibold text-slate-900">{entity.entity_id}</span>
        <span className="rounded-full bg-slate-100 px-[14px] py-1.5 text-[12px] font-medium text-slate-600">
          {entity.entity_type}
          {entity.sub_type ? ` · ${entity.sub_type}` : ''}
        </span>
        <span
          className={`ml-auto rounded-full px-[14px] py-1.5 text-[12px] font-medium uppercase ${STATUS_STYLE[status]}`}
        >
          {status}
        </span>
      </div>

      {state ? (
        <div className="divide-y divide-slate-100">
          <Row label="Speed" value={`${state.speed_kmh.toFixed(1)} km/h`} />
          <Row label="Heading" value={`${Math.round(state.heading_deg)}°`} />
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-[13px] text-slate-500">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.round(state.confidence * 100)}%` }}
                />
              </div>
              <span className="text-[13px] font-medium text-slate-800">
                {Math.round(state.confidence * 100)}%
              </span>
            </div>
          </div>
          <Row
            label="Source camera"
            value={camera ? `${camera.camera_id} — ${camera.name}` : '— (predicted)'}
          />
          <Row label="Path / lane" value={path ? path.name : '—'} />
          <Row label="Zone" value={zone ? zone.name : '—'} />
          <Row
            label="Last seen"
            value={new Date(state.observed_at).toLocaleTimeString('en-GB', { hour12: false })}
          />
          <Row
            label="First seen"
            value={new Date(entity.first_seen_at).toLocaleTimeString('en-GB', { hour12: false })}
          />
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">Not visible at the current time.</p>
      )}

      {entity.attributes && Object.keys(entity.attributes).length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-slate-500">
            Attributes
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            {Object.entries(entity.attributes).map(([key, value]) => (
              <div key={key} className="flex min-h-8 justify-between gap-2 py-0.5 text-[13px]">
                <span className="text-slate-500">{key}</span>
                <span className="truncate font-medium text-slate-700">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
