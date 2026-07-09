import { useState } from 'react';
import { useSceneStore, type LayerKey, type Basemap } from '../../store/sceneStore';

const BASEMAP_OPTIONS: Array<{ key: Basemap; label: string }> = [
  { key: 'mock', label: 'Mock' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'streets', label: 'Streets' },
];

const LAYER_TOGGLES: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'vehicles', label: 'Vehicles', color: '#F97171' },
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

export default function Sidebar() {
  const layers = useSceneStore((s) => s.layers);
  const toggleLayer = useSceneStore((s) => s.toggleLayer);
  const basemap = useSceneStore((s) => s.basemap);
  const setBasemap = useSceneStore((s) => s.setBasemap);
  const iconScale = useSceneStore((s) => s.iconScale);
  const setIconScale = useSceneStore((s) => s.setIconScale);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      className={`flex shrink-0 flex-col rounded-3xl bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-[width] duration-300 ${
        collapsed ? 'w-14 overflow-hidden' : 'w-60 overflow-y-auto'
      }`}
      aria-label="Primary navigation"
    >
      <div
        className={`flex items-center gap-2 px-3 pt-3 ${
          collapsed ? 'justify-center pb-2' : 'justify-between pb-1'
        }`}
      >
        {!collapsed && (
          <div className="text-[11px] font-semibold uppercase leading-4 tracking-wide text-slate-500">
            Navigation
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-500 shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:bg-slate-100"
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>

      {collapsed ? (
        <div className="px-2">
          <button
            type="button"
            title="Live Map"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600"
          >
            LM
          </button>
        </div>
      ) : (
        <>
          <ul className="px-2">
            <li>
              <button
                type="button"
                className="mb-0.5 min-h-9 w-full rounded-full bg-blue-50 px-4 text-left text-[14px] font-medium text-blue-600"
              >
                Live Map
              </button>
            </li>
          </ul>

          <div className="mt-2 border-t border-slate-200 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase leading-4 tracking-wide text-slate-500">
            Basemap
          </div>
          <div className="px-3 pb-1">
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
          </div>

          <div className="mt-2 border-t border-slate-200 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase leading-4 tracking-wide text-slate-500">
            Icon Size
          </div>
          <div className="flex min-h-9 items-center gap-2 px-3 pb-1">
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

          <div className="mt-2 border-t border-slate-200 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase leading-4 tracking-wide text-slate-500">
            Map Layers
          </div>
          <ul className="px-2 pb-3">
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
        </>
      )}
    </nav>
  );
}
