import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { MAP_CENTER } from '../../../services/geometryUtils';
import { OPERATIONAL_ZONES, formatHeatmapValue } from '../../../data/heatmap';
import type { HeatmapDisplayStyle, HeatmapMetric, HeatmapPoint, HotspotSeverity } from '../../../data/heatmap';
import { HeatmapLegend } from './HeatmapControls';

const SEVERITY_COLORS: Record<HotspotSeverity, { solid: string; glow: string; border: string }> = {
  low: { solid: '#16a34a', glow: 'rgba(22,163,74,0.68)', border: '#15803d' },
  moderate: { solid: '#eab308', glow: 'rgba(234,179,8,0.72)', border: '#a16207' },
  high: { solid: '#ea580c', glow: 'rgba(234,88,12,0.76)', border: '#c2410c' },
  critical: { solid: '#dc2626', glow: 'rgba(220,38,38,0.8)', border: '#b91c1c' },
};

const DASHBOARD_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'SCENE FLOW Dashboard Streets',
  sources: {
    'dashboard-streets': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'dashboard-background',
      type: 'background',
      paint: { 'background-color': '#f8fafc' },
    },
    {
      id: 'dashboard-streets-layer',
      type: 'raster',
      source: 'dashboard-streets',
      paint: {
        'raster-opacity': 0.88,
        'raster-saturation': -0.35,
        'raster-contrast': -0.08,
        'raster-brightness-max': 0.96,
      },
    },
  ],
};

function toFeatureCollection(points: HeatmapPoint[]): FeatureCollection<Point> {
  const features: Array<Feature<Point>> = points.map((point) => ({
    type: 'Feature',
    id: point.id,
    properties: {
      id: point.id,
      intensity: point.intensity,
      severity: point.severity,
      value: point.value,
    },
    geometry: {
      type: 'Point',
      coordinates: [point.longitude, point.latitude],
    },
  }));
  return { type: 'FeatureCollection', features };
}

function HotspotLabel({ point, metric, selected, onClose }: { point: HeatmapPoint; metric: HeatmapMetric; selected: boolean; onClose: () => void }) {
  return (
    <div className={`pointer-events-none absolute z-20 w-max max-w-[150px] -translate-x-1/2 rounded-md border bg-white/95 py-1 pl-2 pr-7 shadow-md backdrop-blur ${selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`} style={{ left: `${OPERATIONAL_ZONES.find((zone) => zone.id === point.zoneId)?.x ?? 50}%`, top: `calc(${OPERATIONAL_ZONES.find((zone) => zone.id === point.zoneId)?.y ?? 50}% + 30px)` }}>
      <p className="truncate text-[10px] font-bold text-slate-900">{point.locationName}</p>
      <p className="text-[9px] font-semibold text-slate-600">{formatHeatmapValue(point, metric)} <span className={point.percentageChange >= 0 ? 'text-red-600' : 'text-emerald-600'}>{point.percentageChange >= 0 ? '+' : ''}{point.percentageChange}%</span></p>
      <p className="text-[8px] font-bold uppercase tracking-wide" style={{ color: SEVERITY_COLORS[point.severity].border }}>{point.severity}</p>
      <button type="button" onClick={onClose} aria-label={`Close ${point.locationName} hotspot label`} className="pointer-events-auto absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[12px] font-bold leading-none text-slate-600 hover:bg-slate-300 hover:text-slate-900">×</button>
    </div>
  );
}

function HotspotArea({ point, style, selected, onSelect }: { point: HeatmapPoint; style: HeatmapDisplayStyle; selected: boolean; onSelect: () => void }) {
  const zone = OPERATIONAL_ZONES.find((item) => item.id === point.zoneId);
  if (!zone) return null;
  const colors = SEVERITY_COLORS[point.severity];
  const diameter = 56 + point.intensity * 0.62;
  const hotspotStyle: CSSProperties = {
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    width: style === 'clusters' ? 38 : diameter,
    height: style === 'clusters' ? 38 : diameter,
    transform: 'translate(-50%, -50%)',
    background: style === 'risk-zones'
      ? colors.glow
      : style === 'clusters'
        ? colors.solid
        : `radial-gradient(circle, ${colors.glow} 0%, ${colors.glow} 22%, transparent 72%)`,
    border: style === 'risk-zones' ? `2px solid ${colors.border}` : selected ? '2px solid #2563eb' : 'none',
    borderRadius: style === 'risk-zones' ? '38% 62% 55% 45% / 45% 42% 58% 55%' : '9999px',
    boxShadow: selected ? '0 0 0 4px rgba(37,99,235,0.2)' : undefined,
    filter: style === 'density' ? 'blur(2px)' : undefined,
    opacity: style === 'density' ? 0.94 : 0.88,
  };

  return (
    <button type="button" onClick={onSelect} aria-label={`Open ${point.locationName} hotspot details`} className="absolute z-10 flex items-center justify-center transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-blue-300/60" style={hotspotStyle}>
      {style === 'clusters' && <span className="text-[10px] font-black text-white drop-shadow">{point.value}</span>}
    </button>
  );
}

function SimplifiedBaseMap() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="minor-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1000" height="600" fill="#f8fafc" />
      <rect width="1000" height="600" fill="url(#minor-grid)" opacity="0.55" />
      <path d="M90 485 C260 430 335 330 490 280 S760 220 920 92" fill="none" stroke="#cbd5e1" strokeWidth="44" strokeLinecap="round" />
      <path d="M90 485 C260 430 335 330 490 280 S760 220 920 92" fill="none" stroke="#ffffff" strokeWidth="34" strokeLinecap="round" />
      <path d="M135 110 C300 205 390 285 505 420 S720 520 900 470" fill="none" stroke="#cbd5e1" strokeWidth="36" strokeLinecap="round" />
      <path d="M135 110 C300 205 390 285 505 420 S720 520 900 470" fill="none" stroke="#ffffff" strokeWidth="27" strokeLinecap="round" />
      <path d="M510 45 L500 555" fill="none" stroke="#d8e0ea" strokeWidth="24" />
      <path d="M510 45 L500 555" fill="none" stroke="#ffffff" strokeWidth="17" />
      {OPERATIONAL_ZONES.map((zone) => (
        <g key={zone.id}>
          <rect x={(zone.x - zone.width / 2) * 10} y={(zone.y - zone.height / 2) * 6} width={zone.width * 10} height={zone.height * 6} rx="10" fill={zone.id === 'parking' ? '#e2e8f0' : '#eef2f7'} stroke="#cbd5e1" strokeWidth="2" />
          <text x={zone.x * 10} y={(zone.y - zone.height / 2) * 6 + 16} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">{zone.name}</text>
        </g>
      ))}
    </svg>
  );
}

function MapLoadingSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50" aria-label="Loading street map" role="status">
      <div className="w-full max-w-[280px] px-6 text-center">
        <p className="text-[11px] font-bold text-slate-600">Loading street map</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <span className="dashboard-map-loading-bar block h-full w-2/5 rounded-full bg-blue-500" />
        </div>
        <p className="mt-2 text-[9px] font-medium text-slate-400">Preparing operational heatmap layers…</p>
      </div>
    </div>
  );
}

function createHotspotLabelElement(
  point: HeatmapPoint,
  metric: HeatmapMetric,
  selected: boolean,
  onSelect: (hotspotId: string) => void,
  onClose: () => void,
): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `dashboard-hotspot-marker${selected ? ' selected' : ''}`;
  const content = document.createElement('button');
  content.type = 'button';
  content.className = 'dashboard-hotspot-content';
  content.setAttribute('aria-label', `Open ${point.locationName} hotspot details`);
  const title = document.createElement('strong');
  title.textContent = point.locationName;
  const value = document.createElement('span');
  value.textContent = `${formatHeatmapValue(point, metric)} · ${point.percentageChange >= 0 ? '+' : ''}${point.percentageChange}%`;
  const severity = document.createElement('small');
  severity.textContent = point.severity;
  severity.style.color = SEVERITY_COLORS[point.severity].border;
  content.append(title, value, severity);
  content.addEventListener('click', (event) => {
    event.stopPropagation();
    onSelect(point.id);
  });
  element.append(content);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'dashboard-hotspot-close';
  closeButton.setAttribute('aria-label', `Close ${point.locationName} hotspot label`);
  closeButton.textContent = '×';
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
  });
  element.append(closeButton);
  return element;
}

interface HeatmapLayerProps {
  points: HeatmapPoint[];
  metric: HeatmapMetric;
  displayStyle: HeatmapDisplayStyle;
  selectedHotspotId: string | null;
  onSelectHotspot: (hotspotId: string | null) => void;
}

export function HeatmapLayer({ points, metric, displayStyle, selectedHotspotId, onSelectHotspot }: HeatmapLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pointsRef = useRef(points);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [dismissedHotspotIds, setDismissedHotspotIds] = useState<Set<string>>(() => new Set());
  const selectHotspot = (hotspotId: string | null) => {
    if (hotspotId) {
      setDismissedHotspotIds((current) => {
        if (!current.has(hotspotId)) return current;
        const next = new Set(current);
        next.delete(hotspotId);
        return next;
      });
    }
    onSelectHotspot(hotspotId);
  };
  const onSelectRef = useRef(selectHotspot);
  pointsRef.current = points;
  onSelectRef.current = selectHotspot;

  const dismissHotspot = (hotspotId: string) => {
    setDismissedHotspotIds((current) => new Set(current).add(hotspotId));
    if (selectedHotspotId === hotspotId) onSelectHotspot(null);
  };

  useEffect(() => {
    setDismissedHotspotIds(new Set());
  }, [metric]);

  const selectedPoint = points.find((point) => point.id === selectedHotspotId);
  const fallbackLabels = useMemo(() => {
    const ranked = [...points]
      .sort((left, right) => right.intensity - left.intensity)
      .slice(0, 3)
      .filter((point) => !dismissedHotspotIds.has(point.id));
    if (selectedPoint && !dismissedHotspotIds.has(selectedPoint.id) && !ranked.some((point) => point.id === selectedPoint.id)) ranked.push(selectedPoint);
    return ranked;
  }, [dismissedHotspotIds, points, selectedPoint]);

  const fitPoints = (duration = 0) => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
    map.fitBounds(bounds, { padding: 72, duration, maxZoom: 17.2 });
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let tileErrorCount = 0;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DASHBOARD_MAP_STYLE,
      center: [MAP_CENTER.lng, MAP_CENTER.lat],
      zoom: 16.1,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      minZoom: 13,
      maxZoom: 19,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.addSource('dashboard-hotspots', {
        type: 'geojson',
        data: toFeatureCollection(pointsRef.current),
      });
      map.addLayer({
        id: 'dashboard-heatmap-density',
        type: 'heatmap',
        source: 'dashboard-hotspots',
        maxzoom: 20,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 100, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 13, 1.05, 18, 1.65],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 13, 22, 16, 48, 19, 82],
          'heatmap-opacity': 0.88,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(34,197,94,0)',
            0.12, 'rgba(22,163,74,0.66)',
            0.34, 'rgba(234,179,8,0.76)',
            0.56, 'rgba(234,88,12,0.82)',
            0.78, 'rgba(220,38,38,0.88)',
            1, 'rgba(153,27,27,0.94)',
          ],
        },
      });
      map.addLayer({
        id: 'dashboard-severity-glow',
        type: 'circle',
        source: 'dashboard-hotspots',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, ['interpolate', ['linear'], ['get', 'intensity'], 0, 14, 100, 28],
            19, ['interpolate', ['linear'], ['get', 'intensity'], 0, 34, 100, 74],
          ],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#dc2626', 'high', '#ea580c', 'moderate', '#eab308', '#16a34a'],
          'circle-opacity': 0.68,
          'circle-blur': 0.78,
        },
      });
      map.addLayer({
        id: 'dashboard-clusters',
        type: 'circle',
        source: 'dashboard-hotspots',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0, 10, 100, 22],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#ef4444', 'high', '#f97316', 'moderate', '#facc15', '#22c55e'],
          'circle-opacity': 0.92,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'dashboard-risk-zones',
        type: 'circle',
        source: 'dashboard-hotspots',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0, 18, 100, 42],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#ef4444', 'high', '#f97316', 'moderate', '#facc15', '#22c55e'],
          'circle-opacity': 0.3,
          'circle-stroke-color': ['match', ['get', 'severity'], 'critical', '#dc2626', 'high', '#ea580c', 'moderate', '#ca8a04', '#16a34a'],
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'dashboard-selected-hotspot',
        type: 'circle',
        source: 'dashboard-hotspots',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 17,
          'circle-color': 'rgba(255,255,255,0.14)',
          'circle-stroke-color': '#2563eb',
          'circle-stroke-width': 4,
        },
      });
      map.addLayer({
        id: 'dashboard-hotspot-hit',
        type: 'circle',
        source: 'dashboard-hotspots',
        paint: {
          'circle-radius': 24,
          'circle-color': 'rgba(0,0,0,0)',
        },
      });
      const bounds = new maplibregl.LngLatBounds();
      pointsRef.current.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 72, duration: 0, maxZoom: 17.2 });
      setMapLoaded(true);
    });
    map.on('idle', () => {
      if (tileErrorCount < 3) setMapStatus('ready');
    });
    map.on('error', () => {
      tileErrorCount += 1;
      if (tileErrorCount >= 3) setMapStatus('fallback');
    });
    map.on('click', 'dashboard-hotspot-hit', (event) => {
      const hotspotId = event.features?.[0]?.properties?.id;
      if (typeof hotspotId === 'string') onSelectRef.current(hotspotId);
    });
    map.on('mouseenter', 'dashboard-hotspot-hit', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'dashboard-hotspot-hit', () => {
      map.getCanvas().style.cursor = '';
    });
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('dashboard-hotspots') as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(points));
  }, [mapLoaded, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setLayoutProperty('dashboard-heatmap-density', 'visibility', displayStyle === 'clusters' ? 'none' : 'visible');
    map.setLayoutProperty('dashboard-severity-glow', 'visibility', displayStyle === 'density' ? 'visible' : 'none');
    map.setLayoutProperty('dashboard-clusters', 'visibility', displayStyle === 'clusters' ? 'visible' : 'none');
    map.setLayoutProperty('dashboard-risk-zones', 'visibility', displayStyle === 'risk-zones' ? 'visible' : 'none');
    map.setPaintProperty('dashboard-heatmap-density', 'heatmap-opacity', displayStyle === 'risk-zones' ? 0.62 : 0.88);
  }, [displayStyle, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setFilter('dashboard-selected-hotspot', ['==', ['get', 'id'], selectedHotspotId ?? '']);
    if (selectedPoint) {
      map.easeTo({ center: [selectedPoint.longitude, selectedPoint.latitude], zoom: Math.max(map.getZoom(), 17), duration: 650 });
    }
  }, [mapLoaded, selectedHotspotId, selectedPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const ranked = [...points]
      .sort((left, right) => right.intensity - left.intensity)
      .slice(0, 3)
      .filter((point) => !dismissedHotspotIds.has(point.id));
    if (selectedPoint && !dismissedHotspotIds.has(selectedPoint.id) && !ranked.some((point) => point.id === selectedPoint.id)) ranked.push(selectedPoint);
    const markers = ranked.map((point) => new maplibregl.Marker({
      element: createHotspotLabelElement(
        point,
        metric,
        point.id === selectedHotspotId,
        (hotspotId) => onSelectRef.current(hotspotId),
        () => dismissHotspot(point.id),
      ),
      anchor: 'bottom',
      offset: [0, -18],
    }).setLngLat([point.longitude, point.latitude]).addTo(map));
    return () => markers.forEach((marker) => marker.remove());
  }, [dismissedHotspotIds, mapLoaded, metric, points, selectedHotspotId, selectedPoint]);

  const pointKey = points.map((point) => point.id).join('|');
  useEffect(() => {
    if (!mapLoaded) return;
    fitPoints(500);
  }, [mapLoaded, pointKey]);

  return (
    <div className="relative h-[390px] overflow-hidden bg-slate-100">
      {mapStatus === 'loading' && <MapLoadingSkeleton />}
      {mapStatus === 'fallback' && (
        <div className="absolute inset-0">
          <SimplifiedBaseMap />
          {points.map((point) => (
            <HotspotArea key={point.id} point={point} style={displayStyle} selected={point.id === selectedHotspotId} onSelect={() => selectHotspot(point.id)} />
          ))}
          {fallbackLabels.map((point) => <HotspotLabel key={point.id} point={point} metric={metric} selected={point.id === selectedHotspotId} onClose={() => dismissHotspot(point.id)} />)}
        </div>
      )}
      <div ref={containerRef} className={`absolute inset-0 transition-opacity duration-300 ${mapStatus === 'ready' ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-label="Real street map with mock operational heatmap" />
      <HeatmapLegend metric={metric} />
      <button type="button" onClick={() => fitPoints(500)} className="absolute right-12 top-3 z-20 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-bold text-slate-600 shadow-md hover:bg-slate-50">Fit hotspots</button>
      <div className={`pointer-events-none absolute bottom-3 right-3 z-20 rounded-md px-2 py-1 text-[8px] font-semibold shadow ${mapStatus === 'ready' ? 'bg-white/95 text-slate-600' : 'bg-slate-900/75 text-white'}`}>
        {mapStatus === 'ready' ? 'OpenStreetMap · Mock heatmap data' : mapStatus === 'loading' ? 'Loading real map…' : 'Offline map fallback · Mock heatmap data'}
      </div>
    </div>
  );
}
