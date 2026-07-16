import { useEffect, useMemo, useState } from 'react';
import { getHeatmapDataset, OPERATIONAL_ZONES } from '../../../data/heatmap';
import type { HeatmapNavigationContext, HeatmapPoint } from '../../../data/heatmap';
import { useSceneStore } from '../../../store/sceneStore';
import { HeatmapFilterBar, HeatmapMetricTabs } from './HeatmapControls';
import { HeatmapLayer } from './HeatmapCanvas';
import { HotspotDetailDrawer, TopHotspots } from './HeatmapDetails';

interface OperationalHotspotHeatmapProps {
  onOpenMap: (context?: HeatmapNavigationContext) => void;
  onFilterIncidents: (point: HeatmapPoint) => void;
  onCreateInvestigation: (point: HeatmapPoint) => void;
}

function formatElapsed(updatedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 1000));
  return seconds === 0 ? 'just now' : `${seconds} second${seconds === 1 ? '' : 's'} ago`;
}

export default function OperationalHotspotHeatmap({ onOpenMap, onFilterIncidents, onCreateInvestigation }: OperationalHotspotHeatmapProps) {
  const metric = useSceneStore((state) => state.selectedHeatmapMetric);
  const timeMode = useSceneStore((state) => state.heatmapTimeMode);
  const period = useSceneStore((state) => state.selectedHeatmapPeriod);
  const comparison = useSceneStore((state) => state.heatmapComparison);
  const displayStyle = useSceneStore((state) => state.heatmapDisplayStyle);
  const lastUpdatedAt = useSceneStore((state) => state.heatmapLastUpdatedAt);
  const selectedSite = useSceneStore((state) => state.selectedSite);
  const selectedZone = useSceneStore((state) => state.selectedZone);
  const selectedHotspotId = useSceneStore((state) => state.selectedHotspotId);
  const refreshHeatmap = useSceneStore((state) => state.refreshHeatmap);
  const setSelectedHotspotId = useSceneStore((state) => state.setSelectedHotspotId);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (timeMode !== 'live') return;
    const refreshTimer = window.setInterval(refreshHeatmap, 10_000);
    return () => window.clearInterval(refreshTimer);
  }, [refreshHeatmap, timeMode]);

  const dataset = useMemo(
    () => getHeatmapDataset(metric, timeMode, period, comparison, lastUpdatedAt),
    [comparison, lastUpdatedAt, metric, period, timeMode],
  );
  const points = useMemo(
    () => dataset.points.filter((point) =>
      (selectedSite === 'all-sites' || point.siteId === selectedSite) &&
      (selectedZone === 'all-zones' || point.zoneId === selectedZone)),
    [dataset.points, selectedSite, selectedZone],
  );
  const selectedPoint = points.find((point) => point.id === selectedHotspotId) ?? null;

  useEffect(() => {
    if (selectedHotspotId && !points.some((point) => point.id === selectedHotspotId)) {
      setSelectedHotspotId(null);
    }
  }, [points, selectedHotspotId, setSelectedHotspotId]);

  const openMapForPoint = (point: HeatmapPoint) => {
    onOpenMap({ zone: point.zoneId, metric, period, site: point.siteId });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold text-slate-950">Operational Hotspot Heatmap</h2>
            {timeMode === 'live' ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live data</span>
            ) : (
              <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-bold text-violet-700">Historical</span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">Spatial concentration of traffic, congestion, incidents, and safety risks</p>
          <p className="mt-1 text-[9px] font-semibold text-slate-400">Updated {formatElapsed(lastUpdatedAt, now)}</p>
        </div>
        <HeatmapMetricTabs />
      </div>
      <HeatmapFilterBar />
      <div className="relative">
        <HeatmapLayer points={points} metric={metric} displayStyle={displayStyle} selectedHotspotId={selectedHotspotId} onSelectHotspot={setSelectedHotspotId} />
        {selectedPoint && (
          <HotspotDetailDrawer
            point={selectedPoint}
            metric={metric}
            comparison={comparison}
            onClose={() => setSelectedHotspotId(null)}
            onViewLiveOperations={() => openMapForPoint(selectedPoint)}
            onViewRelatedIncidents={() => onFilterIncidents(selectedPoint)}
            onCreateInvestigation={() => onCreateInvestigation(selectedPoint)}
          />
        )}
      </div>
      <TopHotspots points={points} metric={metric} comparison={comparison} selectedHotspotId={selectedHotspotId} onSelect={setSelectedHotspotId} />
      <div className="sr-only" aria-live="polite">
        {points.length} hotspots shown across {new Set(points.map((point) => point.siteId)).size} sites. Available zones: {OPERATIONAL_ZONES.map((zone) => zone.name).join(', ')}.
      </div>
    </div>
  );
}
