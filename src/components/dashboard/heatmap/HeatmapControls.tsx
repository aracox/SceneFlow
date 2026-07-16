import { HEATMAP_LEGENDS, HEATMAP_METRICS, OPERATIONAL_ZONES } from '../../../data/heatmap';
import type {
  HeatmapComparison,
  HeatmapDisplayStyle,
  HeatmapMetric,
  HeatmapPeriod,
  HeatmapTimeMode,
} from '../../../data/heatmap';
import { useSceneStore } from '../../../store/sceneStore';

const controlClass = 'h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function HeatmapMetricTabs() {
  const selectedMetric = useSceneStore((state) => state.selectedHeatmapMetric);
  const setSelectedMetric = useSceneStore((state) => state.setSelectedHeatmapMetric);

  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Heatmap metric">
      {HEATMAP_METRICS.map((metric) => (
        <button
          key={metric.id}
          type="button"
          role="tab"
          aria-selected={selectedMetric === metric.id}
          onClick={() => setSelectedMetric(metric.id)}
          className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${
            selectedMetric === metric.id
              ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {metric.label}
        </button>
      ))}
    </div>
  );
}

function ControlLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="min-w-[104px] flex-1">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function HeatmapFilterBar() {
  const metric = useSceneStore((state) => state.selectedHeatmapMetric);
  const timeMode = useSceneStore((state) => state.heatmapTimeMode);
  const period = useSceneStore((state) => state.selectedHeatmapPeriod);
  const comparison = useSceneStore((state) => state.heatmapComparison);
  const displayStyle = useSceneStore((state) => state.heatmapDisplayStyle);
  const selectedSite = useSceneStore((state) => state.selectedSite);
  const selectedZone = useSceneStore((state) => state.selectedZone);
  const setMetric = useSceneStore((state) => state.setSelectedHeatmapMetric);
  const setTimeMode = useSceneStore((state) => state.setHeatmapTimeMode);
  const setPeriod = useSceneStore((state) => state.setSelectedHeatmapPeriod);
  const setComparison = useSceneStore((state) => state.setHeatmapComparison);
  const setDisplayStyle = useSceneStore((state) => state.setHeatmapDisplayStyle);
  const setSelectedSite = useSceneStore((state) => state.setSelectedSite);
  const setSelectedZone = useSceneStore((state) => state.setSelectedZone);
  const zones = selectedSite === 'all-sites'
    ? OPERATIONAL_ZONES
    : OPERATIONAL_ZONES.filter((zone) => zone.siteId === selectedSite);

  return (
    <div className="flex flex-wrap gap-2 border-y border-slate-100 bg-slate-50/70 px-4 py-2.5">
      <ControlLabel label="Metric">
        <select className={`${controlClass} w-full`} value={metric} onChange={(event) => setMetric(event.target.value as HeatmapMetric)}>
          {HEATMAP_METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </ControlLabel>
      <ControlLabel label="Time Mode">
        <select className={`${controlClass} w-full`} value={timeMode} onChange={(event) => setTimeMode(event.target.value as HeatmapTimeMode)}>
          <option value="live">Live</option>
          <option value="historical">Historical</option>
        </select>
      </ControlLabel>
      <ControlLabel label="Period">
        <select className={`${controlClass} w-full`} value={period} disabled={timeMode === 'live'} onChange={(event) => setPeriod(event.target.value as HeatmapPeriod)}>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last-7-days">Last 7 Days</option>
          <option value="last-30-days">Last 30 Days</option>
          <option value="custom-range">Custom Range</option>
        </select>
      </ControlLabel>
      <ControlLabel label="Site">
        <select className={`${controlClass} w-full`} value={selectedSite} onChange={(event) => setSelectedSite(event.target.value)}>
          <option value="all-sites">All Sites</option>
          <option value="central-campus">Central Campus</option>
          <option value="medical-campus">Medical Campus</option>
          <option value="logistics-campus">Logistics Campus</option>
        </select>
      </ControlLabel>
      <ControlLabel label="Zone">
        <select className={`${controlClass} w-full`} value={selectedZone} onChange={(event) => setSelectedZone(event.target.value)}>
          <option value="all-zones">All Zones</option>
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
      </ControlLabel>
      <ControlLabel label="Compare With">
        <select className={`${controlClass} w-full`} value={comparison} onChange={(event) => setComparison(event.target.value as HeatmapComparison)}>
          <option value="none">None</option>
          <option value="previous-period">Previous Period</option>
          <option value="yesterday">Yesterday</option>
          <option value="previous-week">Previous Week</option>
          <option value="normal-baseline">Normal Baseline</option>
        </select>
      </ControlLabel>
      <ControlLabel label="Display Style">
        <select className={`${controlClass} w-full`} value={displayStyle} onChange={(event) => setDisplayStyle(event.target.value as HeatmapDisplayStyle)}>
          <option value="density">Density</option>
          <option value="clusters">Clusters</option>
          <option value="risk-zones">Risk Zones</option>
        </select>
      </ControlLabel>
      {timeMode === 'historical' && period === 'custom-range' && (
        <div className="flex min-w-[230px] flex-[1.4] items-end gap-2">
          <input aria-label="Custom range start" type="date" className={`${controlClass} w-full`} defaultValue="2026-07-09" />
          <span className="pb-2 text-[10px] text-slate-400">to</span>
          <input aria-label="Custom range end" type="date" className={`${controlClass} w-full`} defaultValue="2026-07-16" />
        </div>
      )}
    </div>
  );
}

const severityColors = {
  low: 'bg-emerald-500',
  moderate: 'bg-yellow-400',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

export function HeatmapLegend({ metric }: { metric: HeatmapMetric }) {
  return (
    <div className="absolute bottom-3 left-3 z-20 rounded-lg border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">Intensity</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {HEATMAP_LEGENDS[metric].map((item) => (
          <span key={item.severity} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-600">
            <span className={`h-2 w-2 rounded-full ${severityColors[item.severity]}`} />
            <span className="capitalize text-slate-800">{item.severity}</span> {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
