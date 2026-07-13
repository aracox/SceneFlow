import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useSceneStore } from '../../store/sceneStore';

interface PierStop {
  id: string;
  name: string;
  nameThai: string;
  lat: number;
  lng: number;
}

interface PierPayload {
  schema: number;
  piers: PierStop[];
}

function pierSvg(size: number): string {
  const width = Math.round(size);
  const height = Math.round(size * 1.2);
  return `<svg width="${width}" height="${height}" viewBox="0 0 24 29" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 27c4.7-5.2 7-9.2 7-13a7 7 0 1 0-14 0c0 3.8 2.3 7.8 7 13z" fill="#0284c7" stroke="#ffffff" stroke-width="1.6"/>
    <path d="M7.2 16.6h9.6M8.6 13.2h6.8M9.5 9.8h5M10.5 6.7v9.9M13.5 6.7v9.9" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function pierPopup(pier: PierStop): string {
  return `
    <div class="sf-popup-title">${pier.name}</div>
    <div class="sf-popup-row">${pier.nameThai}</div>
    <div class="sf-popup-row">Pier ID ${pier.id}</div>
  `;
}

export default function PierLayer({ map }: { map: maplibregl.Map }) {
  const visible = useSceneStore((s) => s.layers.piers);
  const iconScale = useSceneStore((s) => s.iconScale);
  const [piers, setPiers] = useState<PierStop[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/generated/namtangPiers.generated.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Pier data unavailable: ${response.status}`);
        return response.json() as Promise<PierPayload>;
      })
      .then((payload) => {
        if (!cancelled) setPiers(Array.isArray(payload.piers) ? payload.piers : []);
      })
      .catch(() => {
        if (!cancelled) setPiers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const markers: maplibregl.Marker[] = [];
    if (!visible || piers.length === 0) {
      return () => undefined;
    }

    const size = 24 * iconScale;
    for (const pier of piers) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pier-marker';
      el.title = `${pier.name} · ${pier.nameThai}`;
      el.innerHTML = pierSvg(size);
      el.addEventListener('click', (event) => event.stopPropagation());

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pier.lng, pier.lat])
        .setPopup(
          new maplibregl.Popup({
            className: 'sf-popup',
            closeButton: false,
            offset: 18,
          }).setHTML(pierPopup(pier)),
        )
        .addTo(map);
      markers.push(marker);
    }

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [iconScale, map, piers, visible]);

  return null;
}
