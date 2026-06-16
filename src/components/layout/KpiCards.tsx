import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

interface Kpi {
  label: string;
  value: string;
  accent: string;
}

export default function KpiCards() {
  // Re-render once per mock second, not per animation frame.
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));

  const live = mockSceneStore.getLiveEntities(simSec * 1000);
  const count = (predicate: (t: string) => boolean) =>
    live.filter((l) => predicate(l.entity.entity_type)).length;

  const cameras = mockSceneStore.getCameras();
  const camerasOnline = cameras.filter((c) => c.status === 'online').length;

  const kpis: Kpi[] = [
    {
      label: 'Live Entities',
      value: String(live.filter((l) => l.entity.entity_type !== 'incident_object').length),
      accent: 'bg-brand-600',
    },
    { label: 'Vehicles', value: String(count((t) => t === 'vehicle')), accent: 'bg-red-500' },
    { label: 'People', value: String(count((t) => t === 'person')), accent: 'bg-blue-500' },
    { label: 'Boats', value: String(count((t) => t === 'boat')), accent: 'bg-sky-500' },
    {
      label: 'Floating Waste',
      value: String(count((t) => t === 'floating_waste')),
      accent: 'bg-teal-500',
    },
    {
      label: 'Active Incidents',
      value: String(count((t) => t === 'incident_object')),
      accent: 'bg-rose-500',
    },
    {
      label: 'Cameras Online',
      value: `${camerasOnline} / ${cameras.length}`,
      accent: 'bg-emerald-500',
    },
  ];

  return (
    <div className="grid shrink-0 grid-cols-7 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
        >
          <span className={`h-8 w-1 rounded-full ${kpi.accent}`} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[11px] font-medium text-slate-500">{kpi.label}</div>
            <div className="text-lg font-bold tabular-nums text-slate-900">{kpi.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
