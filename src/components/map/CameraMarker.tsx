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
  return `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="9" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <rect x="6.5" y="8.5" width="7" height="5" rx="1" fill="#ffffff"/>
    <path d="M13.5 10 L16.5 8.5 V13.5 L13.5 12 Z" fill="#ffffff"/>
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
