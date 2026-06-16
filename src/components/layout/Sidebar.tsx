import { useState } from 'react';
import { useSceneStore, type LayerKey } from '../../store/sceneStore';

const NAV_ITEMS = [
  'Live Map',
  'Entities',
  'Cameras',
  'Zones',
  'Movement Clips',
  'Replay',
  'Analytics',
  'Settings',
];

const LAYER_TOGGLES: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'vehicles', label: 'Vehicles', color: '#ef4444' },
  { key: 'people', label: 'People', color: '#2563eb' },
  { key: 'boats', label: 'Boats', color: '#0ea5e9' },
  { key: 'waste', label: 'Floating Waste', color: '#14b8a6' },
  { key: 'pets', label: 'Pets', color: '#b45309' },
  { key: 'cameras', label: 'Cameras', color: '#1d4ed8' },
  { key: 'zones', label: 'Zones', color: '#94a3b8' },
  { key: 'paths', label: 'Paths / Lanes', color: '#93c5fd' },
  { key: 'incidents', label: 'Incidents', color: '#f43f5e' },
  { key: 'trails', label: 'Trails', color: '#fb923c' },
];

export default function Sidebar() {
  const layers = useSceneStore((s) => s.layers);
  const toggleLayer = useSceneStore((s) => s.toggleLayer);
  const [activeNav, setActiveNav] = useState('Live Map');

  return (
    <nav className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Navigation
      </div>
      <ul className="px-2">
        {NAV_ITEMS.map((item) => (
          <li key={item}>
            <button
              type="button"
              onClick={() => setActiveNav(item)}
              className={`mb-0.5 w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                activeNav === item
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>

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
