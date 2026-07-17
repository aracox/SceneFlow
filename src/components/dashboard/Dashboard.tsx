import { useEffect, useMemo, useState } from 'react';
import PageSwitch from '../layout/PageSwitch';
import OperationalHotspotHeatmap from './heatmap/OperationalHotspotHeatmap';
import { HeatmapAIInsight } from './heatmap/HeatmapDetails';
import { mockSceneStore } from '../../services/mockSceneStore';
import { detectionFeed, type FeedStatus, type LiveDetection } from '../../services/detectionFeed';
import { useSceneStore } from '../../store/sceneStore';
import { getHeatmapDataset } from '../../data/heatmap';
import type { HeatmapNavigationContext, HeatmapPoint } from '../../data/heatmap';
import type { Entity, SceneEvent } from '../../types/scene';

interface DashboardProps {
  onOpenMap: (context?: HeatmapNavigationContext) => void;
}

type IconName =
  | 'alerts'
  | 'analytics'
  | 'bell'
  | 'calendar'
  | 'camera'
  | 'car'
  | 'clock'
  | 'cube'
  | 'devices'
  | 'fleet'
  | 'map'
  | 'people'
  | 'reports'
  | 'search'
  | 'settings'
  | 'shield'
  | 'trend'
  | 'warning';

interface IconProps {
  name: IconName;
  className?: string;
}

interface KpiCardProps {
  title: string;
  value: string;
  detail: string;
  trend: string;
  tone: 'blue' | 'teal' | 'violet' | 'red' | 'amber';
  icon: IconName;
  data: number[];
}

interface IncidentRow {
  event: SceneEvent;
  index: number;
  location: string;
  zoneId: string;
  owner: string;
  status: string;
}

const NAV_ITEMS: Array<{ label: string; icon: IconName; action?: 'map' }> = [
  { label: 'Overview', icon: 'analytics' },
  { label: 'Map', icon: 'map', action: 'map' },
  { label: 'Incidents', icon: 'warning' },
  { label: 'Search', icon: 'search' },
  { label: 'Analytics', icon: 'trend' },
  { label: 'Reports', icon: 'reports' },
  { label: 'Devices', icon: 'devices' },
  { label: 'Alerts', icon: 'bell' },
  { label: 'Settings', icon: 'settings' },
];

const KPI_TONES = {
  blue: {
    icon: 'from-blue-500 to-blue-600',
    line: '#2563eb',
    delta: 'text-blue-600',
  },
  teal: {
    icon: 'from-teal-500 to-cyan-500',
    line: '#0fbaaa',
    delta: 'text-emerald-600',
  },
  violet: {
    icon: 'from-violet-500 to-indigo-600',
    line: '#7c3aed',
    delta: 'text-violet-600',
  },
  red: {
    icon: 'from-red-500 to-rose-600',
    line: '#ef4444',
    delta: 'text-red-600',
  },
  amber: {
    icon: 'from-amber-500 to-orange-500',
    line: '#f59e0b',
    delta: 'text-amber-600',
  },
};

const OWNERS = ['Alex Morgan', 'Jamie Lee', 'Sam Patel', 'Taylor Kim', 'Nora Chen'];
const LOCATIONS = [
  { name: 'Transit Hub Gate B', zoneId: 'gate-b' },
  { name: 'Medical Center ER', zoneId: 'er-drop-off' },
  { name: 'Logistics Yard Zone 3', zoneId: 'logistics-yard' },
  { name: 'Retail Zone Entry', zoneId: 'retail-zone' },
  { name: 'Main Road North', zoneId: 'internal-junction' },
];
const STATUS_BY_SEVERITY: Record<SceneEvent['severity'], string> = {
  critical: 'New',
  warning: 'Acknowledged',
  info: 'Investigating',
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatShortTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAgo(observedAt: string, nowMs: number): string {
  const elapsedSec = Math.max(0, Math.round((nowMs - Date.parse(observedAt)) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  return `${Math.round(elapsedSec / 60)}m ago`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function statusText(status: FeedStatus): string {
  switch (status) {
    case 'open':
      return 'LIVE';
    case 'connecting':
      return 'SYNC';
    case 'closed':
      return 'LOCAL';
    default:
      return 'LOCAL';
  }
}

function severityClass(severity: SceneEvent['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 text-red-600';
    case 'warning':
      return 'bg-amber-50 text-amber-700';
    case 'info':
      return 'bg-blue-50 text-blue-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'New':
      return 'bg-red-50 text-red-600';
    case 'Acknowledged':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-blue-50 text-blue-600';
  }
}

function compactMessage(message: string): string {
  return message
    .replace(/^Critical: /, '')
    .replace(/^Warning: /, '')
    .replace(/^Info: /, '')
    .replace(/ detected by .+$/, '')
    .replace(/ near .+$/, '');
}

function trendPoints(values: number[], width = 112, height = 34): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / spread) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function Icon({ name, className = 'h-5 w-5' }: IconProps) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'alerts':
      return (
        <svg {...common}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.4 4.2 2.9 17.3A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.7L13.6 4.2a1.8 1.8 0 0 0-3.2 0Z" />
        </svg>
      );
    case 'analytics':
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4" />
          <path d="M12 15V8" />
          <path d="M16 15v-6" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M7 10.5a5 5 0 0 1 10 0v3.8l1.5 2.5h-13l1.5-2.5v-3.8Z" />
          <path d="M10 19a2.2 2.2 0 0 0 4 0" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <path d="M7 3v3" />
          <path d="M17 3v3" />
          <rect x="4" y="5" width="16" height="16" rx="3" />
          <path d="M4 10h16" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...common}>
          <path d="M4 8h11a3 3 0 0 1 3 3v5H4z" />
          <path d="m18 12 3-2v7l-3-2" />
          <path d="M8 8l1.2-3h4L15 8" />
        </svg>
      );
    case 'car':
      return (
        <svg {...common}>
          <path d="m5 12 1.7-4.1A3 3 0 0 1 9.5 6h5a3 3 0 0 1 2.8 1.9L19 12" />
          <path d="M4 12h16v6H4z" />
          <path d="M7 18v2" />
          <path d="M17 18v2" />
          <path d="M7.5 15h.01" />
          <path d="M16.5 15h.01" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case 'cube':
      return (
        <svg {...common}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
          <path d="M12 12 4 7.5" />
          <path d="m12 12 8-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
    case 'devices':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="12" height="9" rx="2" />
          <path d="M8 19h9" />
          <path d="M10 14v5" />
          <rect x="17" y="10" width="4" height="7" rx="1.2" />
        </svg>
      );
    case 'fleet':
      return (
        <svg {...common}>
          <path d="M7 17h10" />
          <circle cx="8" cy="18" r="1.7" />
          <circle cx="17" cy="18" r="1.7" />
          <path d="M5 17V8h9l3 4h2v5" />
          <path d="M14 8v4h3" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <path d="m8 5-5 2v13l5-2 8 2 5-2V5l-5 2Z" />
          <path d="M8 5v13" />
          <path d="M16 7v13" />
        </svg>
      );
    case 'people':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M3.5 20a5.6 5.6 0 0 1 11 0" />
          <path d="M14.8 15.8A4.7 4.7 0 0 1 21 20" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v5h4" />
          <path d="M10 13h5" />
          <path d="M10 17h5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.8 1.8 0 0 0-2.1.4l-.1.1h-3.8l-.1-.1a1.8 1.8 0 0 0-2.1-.4l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9v-.1L5.6 12l2-2.9V9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.8 1.8 0 0 0 2.1-.4l.1-.1h3.8l.1.1a1.8 1.8 0 0 0 2.1.4l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9v.1l2 2.9-2 2.9Z" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5.4c0 4.3-2.8 7.5-7 9.6-4.2-2.1-7-5.3-7-9.6V6Z" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      );
    case 'trend':
      return (
        <svg {...common}>
          <path d="M4 17 9 12l4 4 7-9" />
          <path d="M15 7h5v5" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
          <path d="M10.3 4.5 3 18.2A1.8 1.8 0 0 0 4.6 21h14.8a1.8 1.8 0 0 0 1.6-2.8L13.7 4.5a1.9 1.9 0 0 0-3.4 0Z" />
        </svg>
      );
  }
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  return (
    <svg className="h-[34px] w-28 overflow-visible" viewBox="0 0 112 34" fill="none" aria-hidden="true">
      <polyline points={trendPoints(data)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({ title, value, detail, trend, tone, icon, data }: KpiCardProps) {
  const theme = KPI_TONES[tone];
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${theme.icon} text-white shadow-sm`}>
          <Icon name={icon} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-4 text-slate-500">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-[26px] font-bold leading-8 tabular-nums text-slate-950">{value}</p>
            <span className={`text-[11px] font-semibold ${theme.delta}`}>{trend}</span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Sparkline data={data} color={theme.line} />
      </div>
    </article>
  );
}

function MiniTrendChart() {
  const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];
  const vehicles = [22, 46, 71, 58, 84, 63, 79];
  const people = [14, 31, 49, 42, 57, 38, 52];
  const incidents = [8, 12, 18, 11, 20, 10, 15];

  return (
    <div className="h-full">
      <div className="mb-3 flex items-center gap-5 text-[11px] font-medium text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-blue-600" /> Vehicles</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-teal-500" /> People</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-red-500" /> Incidents</span>
      </div>
      <svg className="h-[150px] w-full" viewBox="0 0 420 150" fill="none" aria-hidden="true">
        {[25, 55, 85, 115].map((y) => (
          <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <polyline points={trendPoints(vehicles, 420, 120)} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={trendPoints(people, 420, 120)} fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={trendPoints(incidents, 420, 120)} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {vehicles.map((value, index) => {
          const x = (index / (vehicles.length - 1)) * 420;
          const y = 120 - ((value - 22) / 62) * 116 - 2;
          return <circle key={index} cx={x} cy={y} r="3" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />;
        })}
      </svg>
      <div className="grid grid-cols-7 text-center text-[11px] text-slate-500">
        {hours.map((hour) => <span key={hour}>{hour}</span>)}
      </div>
    </div>
  );
}

function DonutChart() {
  return (
    <div className="flex min-h-32 items-center gap-6">
      <div className="relative h-32 w-32 shrink-0">
        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="16" />
          <circle cx="60" cy="60" r="45" fill="none" stroke="#22c55e" strokeWidth="16" strokeDasharray="268 283" strokeLinecap="round" />
          <circle cx="60" cy="60" r="45" fill="none" stroke="#f59e0b" strokeWidth="16" strokeDasharray="9 283" strokeDashoffset="-270" strokeLinecap="round" />
          <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" strokeWidth="16" strokeDasharray="5 283" strokeDashoffset="-282" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-slate-950">95.6%</span>
          <span className="text-[11px] font-semibold uppercase text-slate-500">SLA</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-[12px]">
        <div className="flex justify-between gap-4"><span className="text-slate-500">Within SLA</span><b className="tabular-nums text-slate-900">95.6%</b></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">At Risk</span><b className="tabular-nums text-slate-900">3.1%</b></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Missed</span><b className="tabular-nums text-slate-900">1.3%</b></div>
      </div>
    </div>
  );
}

export default function Dashboard({ onOpenMap }: DashboardProps) {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));
  const clips = useSceneStore((s) => s.clips);
  const [detections, setDetections] = useState<LiveDetection[]>(() => detectionFeed.getLatest());
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(() => detectionFeed.getStatus());
  const [incidentFilterZoneId, setIncidentFilterZoneId] = useState<string | null>(null);
  const [investigationPoint, setInvestigationPoint] = useState<HeatmapPoint | null>(null);
  const selectedHeatmapMetric = useSceneStore((state) => state.selectedHeatmapMetric);
  const heatmapTimeMode = useSceneStore((state) => state.heatmapTimeMode);
  const selectedHeatmapPeriod = useSceneStore((state) => state.selectedHeatmapPeriod);
  const heatmapComparison = useSceneStore((state) => state.heatmapComparison);
  const heatmapLastUpdatedAt = useSceneStore((state) => state.heatmapLastUpdatedAt);
  const selectedHotspotId = useSceneStore((state) => state.selectedHotspotId);
  const selectedSite = useSceneStore((state) => state.selectedSite);
  const selectedZone = useSceneStore((state) => state.selectedZone);

  useEffect(() => {
    const unsubscribe = detectionFeed.subscribe(setDetections);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = detectionFeed.subscribeStatus(setFeedStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  const simMs = simSec * 1000;
  const liveEntities = mockSceneStore.getLiveEntities(simMs);
  const cameras = mockSceneStore.getCameras();
  const events = mockSceneStore.getEventsBefore(simMs, 8);
  const onlineCameras = cameras.filter((camera) => camera.status === 'online').length;
  const warningCameras = cameras.filter((camera) => camera.status === 'warning').length;
  const incidentCount = liveEntities.filter((item) => item.entity.entity_type === 'incident_object').length;
  const criticalCount = Math.max(1, events.filter((event) => event.severity === 'critical').length);
  const warningCount = Math.max(warningCameras, events.filter((event) => event.severity === 'warning').length);

  const detectionByCamera = useMemo(() => {
    const grouped = new Map<string, LiveDetection[]>();
    for (const detection of detections) {
      const group = grouped.get(detection.camera_id) ?? [];
      group.push(detection);
      grouped.set(detection.camera_id, group);
    }
    return grouped;
  }, [detections]);

  const rows = useMemo<IncidentRow[]>(
    () =>
      events.slice(0, 5).map((event, index) => ({
        event,
        index,
        location: LOCATIONS[index % LOCATIONS.length].name,
        zoneId: LOCATIONS[index % LOCATIONS.length].zoneId,
        owner: OWNERS[index % OWNERS.length],
        status: STATUS_BY_SEVERITY[event.severity],
      })),
    [events],
  );
  const visibleRows = incidentFilterZoneId
    ? rows.filter((row) => row.zoneId === incidentFilterZoneId)
    : rows;

  const heatmapDataset = useMemo(
    () => getHeatmapDataset(
      selectedHeatmapMetric,
      heatmapTimeMode,
      selectedHeatmapPeriod,
      heatmapComparison,
      heatmapLastUpdatedAt,
    ),
    [heatmapComparison, heatmapLastUpdatedAt, heatmapTimeMode, selectedHeatmapMetric, selectedHeatmapPeriod],
  );
  const visibleHeatmapPoints = useMemo(
    () => heatmapDataset.points.filter((point) =>
      (selectedSite === 'all-sites' || point.siteId === selectedSite) &&
      (selectedZone === 'all-zones' || point.zoneId === selectedZone)),
    [heatmapDataset.points, selectedSite, selectedZone],
  );
  const selectedHeatmapPoint = visibleHeatmapPoints.find((point) => point.id === selectedHotspotId)
    ?? [...visibleHeatmapPoints].sort((left, right) => right.intensity - left.intensity)[0]
    ?? null;

  const createInvestigation = (point: HeatmapPoint) => {
    setInvestigationPoint(point);
    window.requestAnimationFrame(() => {
      document.getElementById('time-machine-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const countsByType = useMemo(() => {
    const counts = new Map<Entity['entity_type'], number>();
    for (const item of liveEntities) {
      counts.set(item.entity.entity_type, (counts.get(item.entity.entity_type) ?? 0) + 1);
    }
    return counts;
  }, [liveEntities]);

  const kpis: KpiCardProps[] = [
    {
      title: 'Camera Health',
      value: `${formatNumber(onlineCameras)} / ${formatNumber(cameras.length)}`,
      detail: `${Math.round((onlineCameras / Math.max(1, cameras.length)) * 100)}% online`,
      trend: `${warningCameras} warning`,
      tone: 'blue',
      icon: 'camera',
      data: [6, 7, 7, 8, 7, 8, 8, onlineCameras],
    },
    {
      title: 'Live Tracked Entities',
      value: formatNumber(liveEntities.length + detections.length),
      detail: `${liveEntities.length} scene objects + ${detections.length} detections`,
      trend: '+18%',
      tone: 'teal',
      icon: 'people',
      data: [9, 11, 10, 13, 12, 15, 14, liveEntities.length + detections.length],
    },
    {
      title: 'Active Incidents',
      value: formatNumber(incidentCount),
      detail: `${clips.filter((clip) => clip.clip_type === 'incident').length} saved incident clips`,
      trend: `${criticalCount} critical`,
      tone: 'violet',
      icon: 'shield',
      data: [1, 2, 1, 2, 3, 2, 3, incidentCount],
    },
    {
      title: 'Critical Alerts',
      value: formatNumber(criticalCount),
      detail: 'Requires immediate action',
      trend: 'Now',
      tone: 'red',
      icon: 'alerts',
      data: [0, 1, 1, 2, 1, 3, 2, criticalCount],
    },
    {
      title: 'SLA At Risk',
      value: formatNumber(warningCount),
      detail: 'Open warnings in scene timeline',
      trend: '+6 min',
      tone: 'amber',
      icon: 'clock',
      data: [1, 1, 2, 2, 3, 2, 3, warningCount],
    },
  ];

  const objectStats = [
    { label: 'Detected People', value: countsByType.get('person') ?? 0, icon: 'people' as IconName, tone: 'text-teal-600', delta: '+16%' },
    { label: 'Vehicles', value: (countsByType.get('vehicle') ?? 0) + detections.filter((d) => d.type === 'vehicle').length, icon: 'car' as IconName, tone: 'text-blue-600', delta: '+18%' },
    { label: 'Boats', value: countsByType.get('boat') ?? 0, icon: 'fleet' as IconName, tone: 'text-sky-600', delta: '+8%' },
    { label: 'Floating Waste', value: countsByType.get('floating_waste') ?? 0, icon: 'cube' as IconName, tone: 'text-amber-600', delta: '-4%' },
    { label: 'Incident Objects', value: countsByType.get('incident_object') ?? 0, icon: 'warning' as IconName, tone: 'text-red-600', delta: '+2%' },
  ];

  if (cameras.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-slate-950">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">No camera records are loaded.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-slate-50 text-slate-900 md:grid-cols-[168px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-[70px] shrink-0 items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <svg width="19" height="19" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M6 21c5-9 8-9 12-4s6 5 10-4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[17px] font-bold leading-6 text-slate-950">
            Scene<span className="text-blue-600">Flow</span>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action === 'map' ? () => onOpenMap() : undefined}
              className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] font-semibold transition ${
                index === 0
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="m-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sites</p>
          <button type="button" className="mt-2 flex h-9 w-full items-center justify-between rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600">
            All Sites
            <span className="text-slate-400">v</span>
          </button>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex h-[70px] shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5">
          <PageSwitch
            activePage="dashboard"
            onPageChange={(page) => {
              if (page === 'map') onOpenMap();
            }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[25px] font-bold leading-8 text-slate-950">Operational Intelligence Dashboard</h1>
            <p className="text-[12px] font-medium text-slate-500">Live spatial, temporal, and actionable scene intelligence</p>
          </div>
          <div className="hidden h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 xl:flex">
            <Icon name="calendar" className="h-4 w-4 text-slate-500" />
            {formatDate(simMs)}
          </div>
          <div className="flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 font-mono text-[13px] font-semibold tabular-nums text-slate-800">
            {formatClock(simMs)}
          </div>
          <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {statusText(feedStatus)}
          </div>
          <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50" aria-label="Notifications">
            <Icon name="bell" className="h-5 w-5" />
            <span className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">3</span>
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50" aria-label="Settings">
            <Icon name="settings" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.title} {...kpi} />
            ))}
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(380px,1fr)]">
            <OperationalHotspotHeatmap
              onOpenMap={onOpenMap}
              onFilterIncidents={(point) => setIncidentFilterZoneId(point.zoneId)}
              onCreateInvestigation={createInvestigation}
            />

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="flex h-11 items-center justify-between border-b border-slate-200 px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-[14px] font-bold text-slate-950">Priority Incident Queue</h2>
                  {incidentFilterZoneId && <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-600">Filtered</span>}
                </div>
                <button type="button" onClick={() => setIncidentFilterZoneId(null)} className="text-[12px] font-bold text-blue-600">{incidentFilterZoneId ? 'Clear' : 'View all'}</button>
              </div>
              <div className="grid grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_80px_90px_92px] border-b border-slate-100 px-4 py-2 text-[10px] font-bold text-slate-400">
                <span>#</span>
                <span>Incident</span>
                <span>Location</span>
                <span>Detected</span>
                <span>Owner</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleRows.map(({ event, index, location, owner, status }) => (
                  <div key={event.event_id} className="grid min-h-[58px] grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_80px_90px_92px] items-center px-4 py-2 text-[11px]">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${event.severity === 'critical' ? 'bg-red-500' : event.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-600'}`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-slate-900">{compactMessage(event.message)}</span>
                      <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold capitalize ${severityClass(event.severity)}`}>{event.severity}</span>
                    </span>
                    <span className="text-slate-600">{location}</span>
                    <span className="font-mono text-slate-700">{formatShortTime(Date.parse(event.observed_at))}<br /><span className="text-[10px] text-slate-400">({formatAgo(event.observed_at, simMs)})</span></span>
                    <span className="text-slate-600">{owner}</span>
                    <span className={`justify-self-start rounded px-2 py-1 text-[10px] font-bold ${statusClass(status)}`}>{status}</span>
                  </div>
                ))}
                {visibleRows.length === 0 && (
                  <div className="px-4 py-8 text-center text-[11px] text-slate-500">No active incidents are linked to this hotspot.</div>
                )}
              </div>
              <HeatmapAIInsight point={selectedHeatmapPoint} metric={selectedHeatmapMetric} evidenceCount={Math.max(4, detectionByCamera.size)} />
            </div>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(240px,0.8fr)_minmax(300px,1fr)_minmax(360px,1.2fr)_minmax(260px,0.8fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-bold text-slate-950">Incident Timeline</h2><button className="text-[12px] font-bold text-blue-600" type="button">View all</button></div>
              <div className="space-y-3">
                {events.slice(0, 5).map((event) => (
                  <div key={event.event_id} className="grid grid-cols-[52px_18px_minmax(0,1fr)_68px] items-start gap-2 text-[11px]">
                    <span className="font-mono text-slate-500">{formatShortTime(Date.parse(event.observed_at))}</span>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${event.severity === 'critical' ? 'bg-red-500' : event.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <span className="min-w-0"><b className="block truncate text-slate-900">{compactMessage(event.message)}</b><span className="text-slate-500">{event.camera_id ?? 'Scene timeline'}</span></span>
                    <span className={`justify-self-end rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${severityClass(event.severity)}`}>{event.severity}</span>
                  </div>
                ))}
              </div>
            </div>

            <div id="time-machine-panel" className={`rounded-lg border bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition ${investigationPoint ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-bold text-slate-950">Time Machine, Cross-Camera Search</h2>{investigationPoint && <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-600">Investigation created</span>}</div>
              <div className="mt-3 flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-500">
                <Icon name="search" className="h-4 w-4" />
                <span className="truncate">{investigationPoint ? `Investigate ${investigationPoint.locationName} ${selectedHeatmapMetric}` : 'White Sedan ABC-1234'}</span>
                <button type="button" className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-[12px] font-bold text-white">Search</button>
              </div>
              <p className="mt-3 text-[11px] font-semibold text-slate-600">{investigationPoint ? `Scope: ${investigationPoint.locationName} · ${investigationPoint.activeIncidentIds.length} related incidents · ${investigationPoint.severity} severity` : 'Path: Transit Hub Gate B → Main Road → Exit Gate C'}</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {['CAM TB-02', 'CAM RD-14', 'CAM RD-21', 'CAM EX-03'].map((camera, index) => (
                  <div key={camera} className={`rounded-md border ${index === 3 ? 'border-blue-500' : 'border-slate-200'} bg-slate-100 p-1`}>
                    <div className="flex aspect-[4/3] items-center justify-center rounded bg-gradient-to-br from-slate-300 to-slate-500 text-white">
                      <Icon name="car" className="h-7 w-7" />
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-600">{formatTime(simMs - (3 - index) * 48000)}</p>
                    <p className="truncate text-[10px] font-semibold text-slate-500">{camera}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] font-semibold text-slate-600">Confidence: 92% <span className="ml-2 inline-block h-1.5 w-32 rounded-full bg-gradient-to-r from-blue-600 to-emerald-400 align-middle" /></div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-[14px] font-bold text-slate-950">Operational Trends</h2><button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600">Today</button></div>
              <MiniTrendChart />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-[14px] font-bold text-slate-950">Response Performance</h2><button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600">Today</button></div>
              <div className="mb-3 grid grid-cols-3 gap-3 border-b border-slate-100 pb-3 text-[11px]">
                <div><p className="text-slate-500">Avg. Act Time</p><b className="text-lg tabular-nums text-slate-950">2m 18s</b><span className="ml-1 text-emerald-600">-12%</span></div>
                <div><p className="text-slate-500">Resolve Time</p><b className="text-lg tabular-nums text-slate-950">18m</b><span className="ml-1 text-emerald-600">-8%</span></div>
                <div><p className="text-slate-500">Compliance</p><b className="text-lg tabular-nums text-slate-950">95.6%</b><span className="ml-1 text-emerald-600">+4%</span></div>
              </div>
              <DonutChart />
            </div>
          </section>

          <section className="mt-4 grid grid-cols-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:grid-cols-2 xl:grid-cols-5">
            {objectStats.map((stat) => (
              <div key={stat.label} className="flex min-h-[70px] items-center gap-3 border-r border-slate-100 px-5 last:border-r-0">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 ${stat.tone}`}>
                  <Icon name={stat.icon} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-500">{stat.label}</p>
                  <p className="text-xl font-bold tabular-nums text-slate-950">{formatNumber(stat.value)} <span className={`ml-2 text-[11px] font-bold ${stat.delta.startsWith('-') ? 'text-red-500' : 'text-emerald-600'}`}>{stat.delta}</span></p>
                </div>
              </div>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
