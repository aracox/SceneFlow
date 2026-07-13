import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useSceneStore } from '../../store/sceneStore';
import type { NamtangNearbyStop } from '../../services/namtangNearby';

function stopTitle(stop: NamtangNearbyStop): string {
  return stop.nameEn || stop.name || stop.nameTh || `Stop ${stop.id}`;
}

function routeNames(stop: NamtangNearbyStop): string {
  const names = stop.passingTrips.slice(0, 6).map((trip) => trip.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'No listed routes';
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

function popupContent(stop: NamtangNearbyStop): HTMLElement {
  const gpsRouteCount = stop.passingTrips.filter((trip) => trip.hasGps).length;
  const root = document.createElement('div');
  root.className = 'sf-popup-body';

  const title = document.createElement('div');
  title.className = 'sf-popup-title';
  title.textContent = stopTitle(stop);
  root.appendChild(title);

  const routes = document.createElement('div');
  routes.className = 'sf-popup-row';
  routes.textContent = routeNames(stop);
  root.appendChild(routes);

  const meta = document.createElement('div');
  meta.className = 'sf-popup-row';
  meta.textContent = `${stop.passingTrips.length} passing route${stop.passingTrips.length === 1 ? '' : 's'} · ${gpsRouteCount} GPS-capable`;
  root.appendChild(meta);

  return root;
}

export default function NearbyBusStopLayer({ map }: { map: maplibregl.Map }) {
  const stops = useSceneStore((s) => s.nearbyBusStops);
  const selectedStopId = useSceneStore((s) => s.selectedNearbyBusStopId);
  const selectNearbyBusStop = useSceneStore((s) => s.selectNearbyBusStop);
  const visible = useSceneStore((s) => s.layers.busStops);

  useEffect(() => {
    const markers: maplibregl.Marker[] = [];
    let activePopup: maplibregl.Popup | null = null;

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
        activePopup?.remove();
        activePopup = new maplibregl.Popup({
          offset: 20,
          closeButton: false,
          closeOnClick: true,
          className: 'sf-popup',
        })
          .setDOMContent(popupContent(stop))
          .setLngLat([stop.location.lon, stop.location.lat])
          .addTo(map);
      });
    }

    return () => {
      activePopup?.remove();
      markers.forEach((marker) => marker.remove());
    };
  }, [map, selectNearbyBusStop, selectedStopId, stops, visible]);

  return null;
}
