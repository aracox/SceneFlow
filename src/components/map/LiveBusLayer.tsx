import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useSceneStore } from '../../store/sceneStore';
import type { NamtangLiveBus } from '../../services/namtangNearby';

function liveBusSvg(): string {
  return `<svg width="12" height="24" viewBox="0 0 24 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3.5" y="3" width="17" height="42" rx="4.5" fill="#ff3131" stroke="#111827" stroke-width="1.2"/>
    <rect x="5.5" y="6.2" width="13" height="7.2" rx="2" fill="#496978" stroke="#111827" stroke-width="0.8"/>
    <path d="M12 6.3 V13.3" stroke="#111827" stroke-width="0.6" opacity="0.65"/>
    <rect x="5.3" y="14.8" width="13.4" height="27" rx="1.5" fill="#ff3131" stroke="#991b1b" stroke-width="0.8"/>
    <rect x="9.1" y="22.5" width="5.8" height="15.5" rx="1.2" fill="#ff3b3b" stroke="#111827" stroke-width="0.7"/>
    <circle cx="12" cy="28" r="1.5" fill="none" stroke="#111827" stroke-width="0.6"/>
    <circle cx="12" cy="32" r="1.5" fill="none" stroke="#111827" stroke-width="0.6"/>
    <circle cx="12" cy="36" r="1.5" fill="none" stroke="#111827" stroke-width="0.6"/>
    <path d="M9.5 19.3 H14.5 M9.5 20.8 H14.5 M9.5 39.7 H14.5 M9.5 41.2 H14.5" stroke="#111827" stroke-width="0.55" stroke-linecap="round"/>
    <rect x="8.8" y="1.5" width="6.4" height="2.8" rx="0.6" fill="#ff3131" stroke="#111827" stroke-width="0.7"/>
    <rect x="1.7" y="9.4" width="2" height="4" rx="0.8" fill="#111827"/>
    <rect x="20.3" y="9.4" width="2" height="4" rx="0.8" fill="#111827"/>
    <rect x="3.8" y="18" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <rect x="19" y="18" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <rect x="3.8" y="26" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <rect x="19" y="26" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <path d="M4.1 42.4 H8.2 V45 H5.4 Q4.5 44.5 4.1 42.4Z" fill="#fff7d6"/>
    <path d="M15.8 42.4 H19.9 Q19.5 44.5 18.6 45 H15.8 Z" fill="#fff7d6"/>
  </svg>`;
}

function ageLabel(updatedAtSec: number | null): string {
  if (!updatedAtSec) return 'unknown age';
  const ageSec = Math.max(0, Math.round(Date.now() / 1000 - updatedAtSec));
  if (ageSec < 60) return `${ageSec}s ago`;
  return `${Math.round(ageSec / 60)}m ago`;
}

function popupContent(bus: NamtangLiveBus): HTMLElement {
  const root = document.createElement('div');
  root.className = 'sf-popup-body';

  const title = document.createElement('div');
  title.className = 'sf-popup-title';
  title.textContent = `${bus.routeName} live bus`;
  root.appendChild(title);

  const route = document.createElement('div');
  route.className = 'sf-popup-row';
  route.textContent = bus.routeLongName || bus.tripHeadsign || bus.vehicleSubType || `Trip ${bus.tripId}`;
  root.appendChild(route);

  const speed = document.createElement('div');
  speed.className = 'sf-popup-row';
  speed.textContent = `speed ${bus.speedKmh === null ? '-' : `${bus.speedKmh} km/h`} · ${ageLabel(bus.updatedAtSec)}`;
  root.appendChild(speed);

  const stop = document.createElement('div');
  stop.className = 'sf-popup-row';
  stop.textContent = bus.nextStopName
    ? `next stop ${bus.nextStopName}`
    : `near ${bus.stopName}`;
  root.appendChild(stop);

  return root;
}

export default function LiveBusLayer({ map }: { map: maplibregl.Map }) {
  const buses = useSceneStore((s) => s.nearbyLiveBuses);
  const visible = useSceneStore((s) => s.layers.buses);

  useEffect(() => {
    const markers: maplibregl.Marker[] = [];
    let activePopup: maplibregl.Popup | null = null;

    if (!visible) {
      return () => undefined;
    }

    for (const bus of buses) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'live-bus-marker';
      el.title = `${bus.routeName} live bus`;
      el.innerHTML = liveBusSvg();

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([bus.lon, bus.lat])
        .setRotation(bus.headingDeg)
        .addTo(map);
      markers.push(marker);

      el.addEventListener('click', (event) => {
        event.stopPropagation();
        activePopup?.remove();
        activePopup = new maplibregl.Popup({
          offset: 20,
          closeButton: false,
          closeOnClick: true,
          className: 'sf-popup',
        })
          .setDOMContent(popupContent(bus))
          .setLngLat([bus.lon, bus.lat])
          .addTo(map);
      });
    }

    return () => {
      activePopup?.remove();
      markers.forEach((marker) => marker.remove());
    };
  }, [map, buses, visible]);

  return null;
}
