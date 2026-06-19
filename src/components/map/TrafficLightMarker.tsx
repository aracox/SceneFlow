import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { SignalState, TrafficLight } from '../../types/scene';
import { signalDisplay } from '../../services/trafficSignals';
import { SIM_START_MS } from '../../data/simWindow';
import { useSceneStore, type SceneState } from '../../store/sceneStore';

const LIT: Record<SignalState, string> = { red: '#ef4444', yellow: '#f59e0b', green: '#22c55e' };
const DIM = '#1e293b';

function trafficSvg(state: SignalState): string {
  const lamp = (cy: number, on: boolean, color: string) =>
    `<circle cx="7" cy="${cy}" r="2.3" fill="${on ? color : DIM}"${on ? ` stroke="${color}" stroke-width="1.4" stroke-opacity="0.4"` : ''}/>`;
  return `<svg width="14" height="30" viewBox="0 0 14 30" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1" width="11" height="28" rx="3" fill="#0f172a" stroke="#ffffff" stroke-width="1.2"/>
    ${lamp(7, state === 'red', LIT.red)}
    ${lamp(15, state === 'yellow', LIT.yellow)}
    ${lamp(23, state === 'green', LIT.green)}
  </svg>`;
}

interface Props {
  map: maplibregl.Map;
  light: TrafficLight;
}

export default function TrafficLightMarker({ map, light }: Props) {
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'signal-marker';
    el.title = `${light.light_id} · traffic signal`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([light.lng, light.lat])
      .addTo(map);

    let lastState: SignalState | null = null;
    let lastVisible: boolean | null = null;

    const update = (s: SceneState) => {
      const visible = s.layers.signals;
      if (visible !== lastVisible) {
        el.style.display = visible ? '' : 'none';
        lastVisible = visible;
      }
      if (!visible) return;
      const tSec = (s.simTime - SIM_START_MS) / 1000;
      const state = signalDisplay(light, tSec);
      if (state !== lastState) {
        el.innerHTML = trafficSvg(state);
        lastState = state;
      }
    };
    update(useSceneStore.getState());
    const unsub = useSceneStore.subscribe(update);

    return () => {
      unsub();
      marker.remove();
    };
  }, [map, light]);

  return null;
}
