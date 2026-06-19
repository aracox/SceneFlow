import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Camera } from '../../types/scene';
import { useSceneStore, type SceneState } from '../../store/sceneStore';

const STATUS_COLOR: Record<Camera['status'], string> = {
  online: '#1d4ed8',
  warning: '#f59e0b',
  offline: '#94a3b8',
};

function cameraSvg(camera: Camera): string {
  const color = STATUS_COLOR[camera.status];
  // Square CCTV housing + lens cone — deliberately NOT a circle, so it can't be
  // mistaken for the round person/pet entity markers.
  return `<svg width="24" height="22" viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="14" height="12" rx="2.5" fill="${color}" stroke="#ffffff" stroke-width="1.8"/>
    <path d="M16 8.5 L21.5 5.5 V16.5 L16 13.5 Z" fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="8.6" cy="11" r="2.7" fill="#ffffff"/>
    <circle cx="8.6" cy="11" r="1.1" fill="${color}"/>
  </svg>`;
}

interface CameraMarkerProps {
  map: maplibregl.Map;
  camera: Camera;
}

export default function CameraMarker({ map, camera }: CameraMarkerProps) {
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'camera-marker';
    el.innerHTML = cameraSvg(camera);
    el.title = `${camera.camera_id} — ${camera.name} (${camera.status})`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([camera.lng, camera.lat])
      .addTo(map);

    let popup: maplibregl.Popup | null = null;
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      useSceneStore.getState().selectCamera(camera.camera_id);
      popup?.remove();
      popup = new maplibregl.Popup({
        offset: 16,
        closeButton: false,
        className: 'sf-popup',
      })
        .setHTML(
          `<div class="sf-popup-body">
            <div class="sf-popup-title">${camera.camera_id}</div>
            <div class="sf-popup-row">${camera.name}</div>
            <div class="sf-popup-row">status: ${camera.status} · FOV ${camera.fov_deg}°</div>
          </div>`,
        )
        .setLngLat([camera.lng, camera.lat])
        .addTo(map);
    };
    el.addEventListener('click', onClick);

    const update = (s: SceneState) => {
      el.style.display = s.layers.cameras ? '' : 'none';
      el.classList.toggle('selected', s.selectedCameraId === camera.camera_id);
      if (popup && s.selectedCameraId !== camera.camera_id) {
        popup.remove();
        popup = null;
      }
    };
    update(useSceneStore.getState());
    const unsub = useSceneStore.subscribe(update);

    return () => {
      unsub();
      el.removeEventListener('click', onClick);
      popup?.remove();
      marker.remove();
    };
  }, [map, camera]);

  return null;
}
