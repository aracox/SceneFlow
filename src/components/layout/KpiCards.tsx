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
      label: 'Live Entities (mock)',
      value: String(live.filter((l) => l.entity.entity_type !== 'incident_object').length),
      accent: 'bg-blue-500',
    },
    { label: 'Vehicles (mock)', value: String(count((t) => t === 'vehicle')), accent: 'bg-[#F97171]' },
    { label: 'People (mock)', value: String(count((t) => t === 'person')), accent: 'bg-blue-500' },
    { label: 'Boats (mock)', value: String(count((t) => t === 'boat')), accent: 'bg-sky-400' },
    {
      label: 'Floating Waste (mock)',
      value: String(count((t) => t === 'floating_waste')),
      accent: 'bg-teal-500',
    },
    {
      label: 'Active Incidents (mock)',
      value: String(count((t) => t === 'incident_object')),
      accent: 'bg-red-500',
    },
    {
      label: 'Cameras Online (mock)',
      value: `${camerasOnline} / ${cameras.length}`,
      accent: 'bg-emerald-400',
    },
  ];

  return (
    <div className="grid shrink-0 grid-cols-7 gap-3 rounded-3xl bg-white">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="flex min-h-[72px] items-center gap-3 rounded-2xl bg-slate-50 px-[18px] py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        >
          <span className={`h-10 w-1.5 rounded-full ${kpi.accent}`} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12px] font-medium leading-[18px] text-slate-500">{kpi.label}</div>
            <div className="text-xl font-semibold leading-7 tabular-nums text-slate-950">{kpi.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
