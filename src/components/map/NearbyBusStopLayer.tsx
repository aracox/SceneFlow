import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useSceneStore } from '../../store/sceneStore';
import type { NamtangNearbyStop } from '../../services/namtangNearby';

function stopTitle(stop: NamtangNearbyStop): string {
  return stop.nameEn || stop.name || stop.nameTh || `Stop ${stop.id}`;
}

function busStopSvg(): string {
  return `<svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M11 14.5 V26" stroke="#475569" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M6.5 26.5 H15.5" stroke="#475569" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="2.5" y="2" width="17" height="12" rx="2.4" fill="#ffffff" stroke="#0f766e" stroke-width="1.8"/>
    <text x="11" y="7.2" text-anchor="middle" font-family="Arial, sans-serif" font-size="4.1" font-weight="700" fill="#0f766e">BUS</text>
    <text x="11" y="11.4" text-anchor="middle" font-family="Arial, sans-serif" font-size="3.7" font-weight="700" fill="#0f766e">STOP</text>
  </svg>`;
}

export default function NearbyBusStopLayer({ map }: { map: maplibregl.Map }) {
  const stops = useSceneStore((s) => s.nearbyBusStops);
  const selectedStopId = useSceneStore((s) => s.selectedNearbyBusStopId);
  const selectNearbyBusStop = useSceneStore((s) => s.selectNearbyBusStop);
  const visible = useSceneStore((s) => s.layers.busStops);

  useEffect(() => {
    const markers: maplibregl.Marker[] = [];

    if (!visible) {
      return () => undefined;
    }

    for (const stop of stops) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'nearby-bus-stop-marker';
      el.classList.toggle('selected', selectedStopId === stop.id);
      el.title = `${stopTitle(stop)} - nearby bus stop`;
      el.innerHTML = busStopSvg();

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([stop.location.lon, stop.location.lat])
        .addTo(map);
      markers.push(marker);

      el.addEventListener('click', (event) => {
        event.stopPropagation();
        selectNearbyBusStop(stop.id);
      });
    }

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [map, selectNearbyBusStop, selectedStopId, stops, visible]);

  return null;
}
