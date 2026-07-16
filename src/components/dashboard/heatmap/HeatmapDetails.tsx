import { formatHeatmapValue } from '../../../data/heatmap';
import type { HeatmapComparison, HeatmapMetric, HeatmapPoint, HotspotSeverity } from '../../../data/heatmap';

const severityBadge: Record<HotspotSeverity, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  moderate: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  critical: 'bg-red-50 text-red-700 ring-red-200',
};

const metricLabels: Record<HeatmapMetric, string> = {
  traffic: 'Traffic',
  congestion: 'Congestion',
  incidents: 'Incidents',
  'safety-risk': 'Safety Risk',
};

const comparisonLabels: Record<HeatmapComparison, string> = {
  none: 'comparison',
  'previous-period': 'previous period',
  yesterday: 'yesterday',
  'previous-week': 'last week',
  'normal-baseline': 'baseline',
};

export function metricSummary(point: HeatmapPoint, metric: HeatmapMetric): string {
  switch (metric) {
    case 'traffic':
      return `Traffic volume: ${point.value.toLocaleString('en-US')}`;
    case 'congestion':
      return `Congestion duration: ${point.details.durationMinutes ?? point.value} min`;
    case 'incidents':
      return `Incidents: ${point.details.totalIncidents ?? point.value}`;
    case 'safety-risk':
      return `Safety risk: ${point.value}`;
  }
}

function MetricDetails({ point, metric }: { point: HeatmapPoint; metric: HeatmapMetric }) {
  if (metric === 'traffic') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <DetailStat label="Vehicle count" value={point.value.toLocaleString('en-US')} />
        <DetailStat label="Flow rate" value={`${point.details.flowRate ?? 0} / hr`} />
      </div>
    );
  }
  if (metric === 'congestion') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <DetailStat label="Average speed" value={`${point.details.averageSpeed ?? 0} km/h`} />
        <DetailStat label="Queue length" value={`${point.details.queueLength ?? 0} vehicles`} />
        <DetailStat label="Vehicle density" value={`${point.details.density ?? 0}%`} />
        <DetailStat label="Duration" value={`${point.details.durationMinutes ?? point.value} min`} />
      </div>
    );
  }
  if (metric === 'incidents') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <DetailStat label="Total today" value={`${point.details.totalIncidents ?? point.value}`} />
        <DetailStat label="Active" value={`${point.details.activeIncidents ?? 0}`} />
        <DetailStat label="Critical" value={`${point.details.criticalIncidents ?? 0}`} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <DetailStat label="Accidents" value={`${point.details.accidents ?? 0}`} />
      <DetailStat label="Near misses" value={`${point.details.nearMisses ?? 0}`} />
      <DetailStat label="Sudden stops" value={`${point.details.suddenStops ?? 0}`} />
      <DetailStat label="Wrong way" value={`${point.details.wrongWayMovements ?? 0}`} />
      <DetailStat label="Intrusions" value={`${point.details.restrictedIntrusions ?? 0}`} />
      <DetailStat label="Unsafe proximity" value={`${point.details.unsafeProximityEvents ?? 0}`} />
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-[11px] font-bold text-slate-900">{value}</p>
    </div>
  );
}

interface TopHotspotsProps {
  points: HeatmapPoint[];
  metric: HeatmapMetric;
  comparison: HeatmapComparison;
  selectedHotspotId: string | null;
  onSelect: (hotspotId: string) => void;
}

export function TopHotspots({ points, metric, comparison, selectedHotspotId, onSelect }: TopHotspotsProps) {
  const ranked = [...points].sort((left, right) => right.intensity - left.intensity).slice(0, 5);
  return (
    <section className="border-t border-slate-100 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-slate-950">Top Hotspots</h3>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Highest priority</span>
      </div>
      {ranked.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">No hotspots match the selected filters.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {ranked.map((point, index) => (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect(point.id)}
              className={`min-w-0 rounded-lg border p-2.5 text-left transition ${selectedHotspotId === point.id ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">{index + 1}</span>
                <span className="truncate text-[10px] font-bold text-slate-900">{point.locationName}</span>
              </div>
              <p className="mt-2 truncate text-[9px] font-semibold text-slate-600">{metricSummary(point, metric)}</p>
              <p className={`mt-0.5 text-[9px] font-bold ${point.percentageChange > 0 ? 'text-red-600' : point.percentageChange < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                {point.percentageChange > 0 ? '+' : ''}{point.percentageChange}% vs. {comparisonLabels[comparison]}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

interface HotspotDetailDrawerProps {
  point: HeatmapPoint;
  metric: HeatmapMetric;
  comparison: HeatmapComparison;
  onClose: () => void;
  onViewLiveOperations: () => void;
  onViewRelatedIncidents: () => void;
  onCreateInvestigation: () => void;
}

export function HotspotDetailDrawer({ point, metric, comparison, onClose, onViewLiveOperations, onViewRelatedIncidents, onCreateInvestigation }: HotspotDetailDrawerProps) {
  return (
    <aside className="absolute bottom-3 left-3 right-3 top-3 z-30 flex w-auto flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur sm:left-auto sm:w-[330px]" aria-label={`${point.locationName} hotspot details`}>
      <div className="flex items-start justify-between border-b border-slate-100 p-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-blue-600">Hotspot details</p>
          <h3 className="mt-0.5 text-[16px] font-bold text-slate-950">{point.locationName}</h3>
          <p className="text-[10px] font-semibold text-slate-500">Metric: {metricLabels[metric]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close hotspot details" className="flex h-7 w-7 items-center justify-center rounded-full text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ring-1 ${severityBadge[point.severity]}`}>{point.severity}</span>
          <span className={`text-[11px] font-bold ${point.percentageChange >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{point.percentageChange >= 0 ? '+' : ''}{point.percentageChange}% vs. {comparisonLabels[comparison]}</span>
        </div>
        <MetricDetails point={point} metric={metric} />
        <div className="grid grid-cols-2 gap-2">
          <DetailStat label="Current value" value={formatHeatmapValue(point, metric)} />
          <DetailStat label="Previous value" value={`${point.previousValue.toLocaleString('en-US')} ${point.unit}`} />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Operational impact</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-600">{point.operationalImpact}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-blue-600">AI-generated explanation</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-700">{point.description}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Suggested action</p>
          <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-700">{point.suggestedAction}</p>
        </div>
        <p className="text-[9px] font-semibold text-slate-500">Related active incidents: {point.activeIncidentIds.length}</p>
      </div>
      <div className="grid gap-2 border-t border-slate-100 p-3">
        <button type="button" onClick={onViewLiveOperations} className="rounded-md bg-blue-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-700">View Live Operations</button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onViewRelatedIncidents} className="rounded-md border border-slate-200 px-2 py-2 text-[9px] font-bold text-slate-700 hover:bg-slate-50">View Related Incidents</button>
          <button type="button" onClick={onCreateInvestigation} className="rounded-md border border-slate-200 px-2 py-2 text-[9px] font-bold text-slate-700 hover:bg-slate-50">Create Investigation</button>
        </div>
      </div>
    </aside>
  );
}

export function HeatmapAIInsight({ point, metric, evidenceCount = 6 }: { point: HeatmapPoint | null; metric: HeatmapMetric; evidenceCount?: number }) {
  if (!point) {
    return <p className="p-4 text-[11px] text-slate-500">Select a hotspot to generate a focused operational insight.</p>;
  }
  const confidence = Math.min(96, 72 + Math.round(point.intensity / 6));
  const trend = point.percentageChange >= 0 ? `${point.percentageChange}% above` : `${Math.abs(point.percentageChange)}% below`;
  return (
    <div className="m-4 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">AI-generated insight</p>
          <h3 className="mt-1 text-[13px] font-bold text-slate-950">{point.locationName} requires {point.severity === 'critical' ? 'immediate' : 'priority'} attention</h3>
        </div>
        <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Confidence: {confidence}%</span>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-600">
        {metricLabels[metric]} at {point.locationName} is {trend} the selected comparison. {point.description}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-[9px] leading-4">
        <div><p className="font-bold uppercase text-slate-400">Evidence</p><p className="font-semibold text-slate-700">{evidenceCount} cameras and {point.activeIncidentIds.length} active incidents</p></div>
        <div><p className="font-bold uppercase text-slate-400">Impact</p><p className="font-semibold text-slate-700">{point.operationalImpact}</p></div>
        <div><p className="font-bold uppercase text-slate-400">Suggested action</p><p className="font-semibold text-slate-700">{point.suggestedAction}</p></div>
      </div>
    </div>
  );
}
