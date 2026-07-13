import { useState, type ReactNode } from 'react';
import { useSceneStore, type LayerKey, type Basemap } from '../../store/sceneStore';
import { waterLevelCameras } from '../../data/waterLevelCameras';

const BASEMAP_OPTIONS: Array<{ key: Basemap; label: string }> = [
  { key: 'mock', label: 'Mock' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'streets', label: 'Streets' },
];

const LAYER_TOGGLES: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'vehicles', label: 'Vehicles', color: '#F97171' },
  { key: 'buses', label: 'Buses', color: '#dc2626' },
  { key: 'busStops', label: 'Bus Stops', color: '#0f766e' },
  { key: 'people', label: 'People', color: '#3B82F6' },
  { key: 'boats', label: 'Boats', color: '#0ea5e9' },
  { key: 'waste', label: 'Floating Waste', color: '#34D399' },
  { key: 'pets', label: 'Pets', color: '#b45309' },
  { key: 'cameras', label: 'Cameras', color: '#1d4ed8' },
  { key: 'signals', label: 'Traffic Lights', color: '#22c55e' },
  { key: 'zones', label: 'Zones', color: '#94a3b8' },
  { key: 'paths', label: 'Paths / Lanes', color: '#93c5fd' },
  { key: 'incidents', label: 'Incidents', color: '#f43f5e' },
  { key: 'trails', label: 'Trails', color: '#fb923c' },
  { key: 'detections', label: 'Live Detections', color: '#a855f7' },
];

type SidebarSectionKey = 'basemap' | 'iconSize' | 'mapLayers' | 'waterLevel';

interface SidebarMenuSectionProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}

function SidebarMenuSection({
  title,
  subtitle,
  open,
  onToggle,
  action,
  children,
}: SidebarMenuSectionProps) {
  return (
    <section className="mt-2 px-2">
      <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span
            className={`mt-0.5 text-[12px] text-slate-400 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          >
            &gt;
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold uppercase leading-4 tracking-wide text-slate-500">
              {title}
            </span>
            {subtitle && (
              <span className="mt-0.5 block truncate text-[11px] leading-4 text-slate-400">
                {subtitle}
              </span>
            )}
          </span>
        </button>
        {action && (
          <div onClick={(event) => event.stopPropagation()} className="shrink-0">
            {action}
          </div>
        )}
      </div>
      {open && <div className="pt-2">{children}</div>}
    </section>
  );
}

export default function Sidebar() {
  const layers = useSceneStore((s) => s.layers);
  const toggleLayer = useSceneStore((s) => s.toggleLayer);
  const basemap = useSceneStore((s) => s.basemap);
  const setBasemap = useSceneStore((s) => s.setBasemap);
  const iconScale = useSceneStore((s) => s.iconScale);
  const setIconScale = useSceneStore((s) => s.setIconScale);
  const selectedWaterCameraId = useSceneStore((s) => s.selectedWaterCameraId);
  const selectWaterCamera = useSceneStore((s) => s.selectWaterCamera);
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SidebarSectionKey, boolean>>({
    basemap: true,
    iconSize: true,
    mapLayers: true,
    waterLevel: true,
  });

  const toggleSection = (section: SidebarSectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <nav
      className={`flex shrink-0 flex-col rounded-3xl bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-[width] duration-300 ${
        collapsed ? 'w-14 overflow-hidden' : 'w-60 overflow-y-auto'
      }`}
      aria-label="Primary navigation"
    >
      {collapsed ? (
        <div className="flex justify-center px-2 py-3">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            aria-expanded={false}
            title="Expand sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-slate-100 active:bg-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <SidebarMenuSection
            title="Basemap"
            open={openSections.basemap}
            onToggle={() => toggleSection('basemap')}
            action={
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                aria-expanded
                title="Collapse sidebar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-slate-100 active:bg-slate-100"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M10 4L6 8l4 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            }
          >
            <div className="flex rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {BASEMAP_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBasemap(key)}
                  className={`min-h-9 flex-1 rounded-full px-2 text-[12px] transition-colors ${
                    basemap === key
                      ? 'bg-blue-50 font-medium text-blue-600'
                      : 'text-slate-500 active:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </SidebarMenuSection>

          <SidebarMenuSection
            title="Icon Size"
            open={openSections.iconSize}
            onToggle={() => toggleSection('iconSize')}
          >
          <div className="flex min-h-9 items-center gap-2 px-1 pb-1">
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={iconScale}
              onChange={(e) => setIconScale(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-blue-500"
              aria-label="Entity icon size"
            />
            <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
              {Math.round(iconScale * 100)}%
            </span>
          </div>
          </SidebarMenuSection>

          <SidebarMenuSection
            title="Map Layers"
            open={openSections.mapLayers}
            onToggle={() => toggleSection('mapLayers')}
          >
          <ul className="pb-1">
            {LAYER_TOGGLES.map(({ key, label, color }) => (
              <li key={key}>
                <label className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[14px] text-slate-700 active:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                    className="h-5 w-5 rounded-md accent-blue-500"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
          </SidebarMenuSection>

          <SidebarMenuSection
            title="Drainage and Sewerage Department"
            subtitle="Bangkok flood-risk water-level CCTV"
            open={openSections.waterLevel}
            onToggle={() => toggleSection('waterLevel')}
          >
          <ul className="pb-3">
            {waterLevelCameras.map((camera) => {
              const active = selectedWaterCameraId === camera.id;
              return (
                <li key={camera.id}>
                  <button
                    type="button"
                    onClick={() => selectWaterCamera(active ? null : camera.id)}
                    aria-pressed={active}
                    className={`flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[14px] transition-colors ${
                      active ? 'bg-sky-50 font-medium text-sky-700' : 'text-slate-700 active:bg-slate-100'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
                      <path
                        d="M8 1.5S3 7 3 10.5a5 5 0 0 0 10 0C13 7 8 1.5 8 1.5z"
                        fill={active ? '#0ea5e9' : '#bae6fd'}
                        stroke="#0ea5e9"
                        strokeWidth="1"
                      />
                    </svg>
                    <span className="truncate">{camera.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          </SidebarMenuSection>
        </>
      )}
    </nav>
  );
}
