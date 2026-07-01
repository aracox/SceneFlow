import { useSceneStore, type LayerKey, type Basemap } from '../../store/sceneStore';

const BASEMAP_OPTIONS: Array<{ key: Basemap; label: string }> = [
  { key: 'mock', label: 'Mock' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'streets', label: 'Streets' },
];

const LAYER_TOGGLES: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'vehicles', label: 'Vehicles', color: '#ef4444' },
  { key: 'people', label: 'People', color: '#2563eb' },
  { key: 'boats', label: 'Boats', color: '#0ea5e9' },
  { key: 'waste', label: 'Floating Waste', color: '#14b8a6' },
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

  return (
    <nav className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Navigation
      </div>
      <ul className="px-2">
        <li>
          <button
            type="button"
            className="mb-0.5 w-full rounded-md bg-brand-50 px-3 py-1.5 text-left text-sm font-semibold text-brand-700"
          >
            Live Map
          </button>
        </li>
      </ul>

      <div className="mt-3 border-t border-slate-100 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Basemap
      </div>
      <div className="px-3 pb-1">
        <div className="flex rounded-md border border-slate-200 p-0.5">
          {BASEMAP_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setBasemap(key)}
              className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors ${
                basemap === key
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Icon Size
      </div>
      <div className="flex items-center gap-2 px-3 pb-1">
        <input
          type="range"
          min={0.4}
          max={2.5}
          step={0.1}
          value={iconScale}
          onChange={(e) => setIconScale(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-brand-600"
          aria-label="Entity icon size"
        />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">
          {Math.round(iconScale * 100)}%
        </span>
      </div>

      <div className="mt-3 border-t border-slate-100 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Map Layers
      </div>
      <ul className="px-2 pb-4">
        {LAYER_TOGGLES.map(({ key, label, color }) => (
          <li key={key}>
            <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => toggleLayer(key)}
                className="h-3.5 w-3.5 accent-brand-600"
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
    </nav>
  );
}
