import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Entity } from '../../types/scene';
import { mockSceneStore } from '../../services/mockSceneStore';
import { layerKeyForEntity, useSceneStore, type SceneState } from '../../store/sceneStore';

/** Entity types whose icons rotate to follow heading. */
const ROTATABLE = new Set(['vehicle', 'boat', 'floating_waste']);

function iconSvg(entity: Entity): string {
  const color = entity.color ?? '#2563eb';
  if (entity.entity_type === 'vehicle' && entity.sub_type === 'shuttle') {
    return `<svg width="18" height="34" viewBox="0 0 18 34" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="16" height="32" rx="4" fill="${color}" stroke="#92400e" stroke-width="1.2"/>
      <rect x="3.5" y="5" width="11" height="5" rx="1.5" fill="rgba(255,255,255,0.85)"/>
      <rect x="3.5" y="13" width="11" height="3" fill="rgba(255,255,255,0.55)"/>
      <rect x="3.5" y="19" width="11" height="3" fill="rgba(255,255,255,0.55)"/>
    </svg>`;
  }
  switch (entity.entity_type) {
    case 'vehicle':
      return `<svg width="15" height="26" viewBox="0 0 15 26" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="13" height="24" rx="4" fill="${color}" stroke="#1e293b" stroke-width="1"/>
        <rect x="3" y="5" width="9" height="4" rx="1.5" fill="rgba(255,255,255,0.75)"/>
        <rect x="3" y="17" width="9" height="3.5" rx="1.5" fill="rgba(255,255,255,0.45)"/>
      </svg>`;
    case 'person':
      return `<svg width="12" height="14" viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="7.2" r="6.2" fill="#3b82f6" stroke="#ffffff" stroke-width="1.8"/>
        <path d="M3 27 V22.2 C3 15.8 7.2 12.8 12 12.8 C16.8 12.8 21 15.8 21 22.2 V27 Z" fill="#2563eb" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>`;
    case 'pet':
      return `<svg width="13" height="13" viewBox="0 0 13 13" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6.5" cy="6.5" r="4.8" fill="${color}" stroke="#ffffff" stroke-width="1.6"/>
        <circle cx="6.5" cy="5.2" r="1.2" fill="rgba(255,255,255,0.8)"/>
      </svg>`;
    case 'boat':
      return `<svg width="16" height="28" viewBox="0 0 16 28" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1 L14 12 L13 25 Q8 28 3 25 L2 12 Z" fill="${color}" stroke="#0c4a6e" stroke-width="1"/>
        <rect x="5.5" y="12" width="5" height="6" rx="1" fill="rgba(255,255,255,0.7)"/>
      </svg>`;
    case 'floating_waste':
      return `<svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="9" height="9" rx="2.5" fill="${color}" stroke="#0f766e" stroke-width="1" transform="rotate(10 6 6)"/>
      </svg>`;
    case 'incident_object':
      return `<div class="incident-pulse-marker" aria-hidden="true">
        <span class="incident-pulse-ring incident-pulse-ring-outer"></span>
        <span class="incident-pulse-ring incident-pulse-ring-inner"></span>
        <span class="incident-pulse-core"></span>
      </div>`;
  }
}

function popupHtml(entity: Entity): string {
  const state = mockSceneStore.getRenderState(
    entity.entity_id,
    useSceneStore.getState().simTime,
  );
  const speed = state ? `${state.speed_kmh.toFixed(1)} km/h` : '—';
  const confidence = state ? `${Math.round(state.confidence * 100)}%` : '—';
  return `<div class="sf-popup-body">
    <div class="sf-popup-title">${entity.entity_id}</div>
    <div class="sf-popup-row">${entity.entity_type}${entity.sub_type ? ` · ${entity.sub_type}` : ''}</div>
    <div class="sf-popup-row">speed ${speed} · confidence ${confidence}</div>
  </div>`;
}

interface EntityMarkerProps {
  map: maplibregl.Map;
  entity: Entity;
}

/**
 * One DOM marker per entity. Position/rotation/opacity are updated
 * imperatively from store subscriptions so the 60fps animation never goes
 * through React rendering.
 */
export default function EntityMarker({ map, entity }: EntityMarkerProps) {
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'entity-marker';
    el.dataset.entityId = entity.entity_id;
    // Inner wrapper carries the global icon scale (and the predicted/selected
    // styling) so it composes with MapLibre's transform on the root element.
    const inner = document.createElement('div');
    inner.className = 'entity-marker-inner';
    inner.innerHTML = iconSvg(entity);
    el.appendChild(inner);
    let appliedScale = NaN;

    const marker = new maplibregl.Marker({
      element: el,
      rotationAlignment: ROTATABLE.has(entity.entity_type) ? 'map' : 'viewport',
      pitchAlignment: 'map',
      anchor: 'center',
    });
    let added = false;
    let popup: maplibregl.Popup | null = null;

    const update = (s: SceneState) => {
      const layerOn = s.layers[layerKeyForEntity(entity)];
      const state = layerOn
        ? mockSceneStore.getRenderState(entity.entity_id, s.simTime)
        : null;

      if (!state) {
        if (added) {
          marker.remove();
          added = false;
        }
        popup?.remove();
        popup = null;
        return;
      }

      marker.setLngLat([state.lng, state.lat]);
      if (ROTATABLE.has(entity.entity_type)) marker.setRotation(state.heading_deg);

      const isSelected = s.selectedEntityId === entity.entity_id;
      const isClipReplay = s.mode === 'replay' && s.activeClipId !== null;
      const isClipEntity = isClipReplay && s.selectedEntityId === entity.entity_id;

      // Confidence drives opacity; surrounding entities are dimmed during clip replay.
      let opacity = 0.45 + 0.55 * Math.min(Math.max(state.confidence, 0), 1);
      if (isClipReplay && !isClipEntity) opacity = 0.15;
      el.style.opacity = String(opacity);
      inner.classList.toggle('predicted', state.tracking_status === 'predicted');
      inner.classList.toggle('selected', isSelected);
      if (s.iconScale !== appliedScale) {
        appliedScale = s.iconScale;
        // Baseline icons render at 65% of their drawn size, so the slider's
        // 100% is a sensible default rather than oversized.
        inner.style.transform = `scale(${s.iconScale * 0.65})`;
      }

      if (!added) {
        marker.addTo(map);
        added = true;
      }

      if (popup) {
        if (isSelected) popup.setLngLat([state.lng, state.lat]);
        else {
          popup.remove();
          popup = null;
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      useSceneStore.getState().selectEntity(entity.entity_id);
      popup?.remove();
      popup = new maplibregl.Popup({
        offset: 20,
        closeButton: false,
        closeOnClick: false,
        className: 'sf-popup',
      })
        .setHTML(popupHtml(entity))
        .setLngLat(marker.getLngLat())
        .addTo(map);
    };
    el.addEventListener('click', onClick);

    update(useSceneStore.getState());
    const unsub = useSceneStore.subscribe(update);

    return () => {
      unsub();
      el.removeEventListener('click', onClick);
      popup?.remove();
      marker.remove();
    };
  }, [map, entity]);

  return null;
}
