import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { distanceBetweenCoordinates } from '../../services/geometryUtils';
import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore, type SceneState } from '../../store/sceneStore';

const TRAIL_SECONDS = 45;
const UPDATE_INTERVAL_MS = 400;
const WRAP_JUMP_M = 60;

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Draws a short movement trail behind the selected entity (or the clip
 * entity during clip replay) by querying recent movement points from the
 * mock database and appending the current interpolated position.
 */
export default function TrailLayer({ map }: { map: maplibregl.Map }) {
  useEffect(() => {
    let lastUpdate = 0;
    let lastEntityId: string | null = null;

    const setTrail = (data: FeatureCollection) => {
      const source = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
      source?.setData(data);
    };

    const update = (s: SceneState) => {
      const entityId =
        s.mode === 'replay' && s.activeClipId ? s.selectedEntityId : s.selectedEntityId;

      if (!entityId || !s.layers.trails) {
        if (lastEntityId !== null) {
          setTrail(EMPTY_FC);
          lastEntityId = null;
        }
        return;
      }

      const now = performance.now();
      if (entityId === lastEntityId && now - lastUpdate < UPDATE_INTERVAL_MS) return;
      lastUpdate = now;
      lastEntityId = entityId;

      const from = Math.max(s.simTime - TRAIL_SECONDS * 1000, s.replayStart);
      const points = mockSceneStore.getEntityMovement(entityId, from, s.simTime);
      const current = mockSceneStore.getRenderState(entityId, s.simTime);

      let coords = points.map((p): [number, number] => [p.lng, p.lat]);
      if (current) coords.push([current.lng, current.lat]);

      // Walk backwards from the head of the trail and cut it at any path
      // wrap-around jump, so the trail never draws across the map.
      for (let i = coords.length - 1; i > 0; i--) {
        if (distanceBetweenCoordinates(coords[i - 1], coords[i]) > WRAP_JUMP_M) {
          coords = coords.slice(i);
          break;
        }
      }

      if (coords.length < 2) {
        setTrail(EMPTY_FC);
        return;
      }
      const feature: Feature = {
        type: 'Feature',
        properties: { entity_id: entityId },
        geometry: { type: 'LineString', coordinates: coords },
      };
      setTrail({ type: 'FeatureCollection', features: [feature] });
    };

    update(useSceneStore.getState());
    const unsub = useSceneStore.subscribe(update);
    return () => {
      unsub();
      setTrail(EMPTY_FC);
    };
  }, [map]);

  return null;
}
