import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useSceneStore } from '../../store/sceneStore';

const SOURCE_ID = 'selected-bus-route';
const CASING_LAYER_ID = 'selected-bus-route-casing';
const LINE_LAYER_ID = 'selected-bus-route-line';

const EMPTY_ROUTE: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function routeFeature(coordinates: [number, number][]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    ],
  };
}

export default function SelectedBusRouteLayer({ map }: { map: maplibregl.Map }) {
  const selectedBusId = useSceneStore((s) => s.selectedNearbyLiveBusId);
  const buses = useSceneStore((s) => s.nearbyLiveBuses);
  const visible = useSceneStore((s) => s.layers.buses);

  useEffect(() => {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: EMPTY_ROUTE,
      });
    }

    if (!map.getLayer(CASING_LAYER_ID)) {
      map.addLayer({
        id: CASING_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 18, 9],
          'line-opacity': 0.9,
        },
      });
    }

    if (!map.getLayer(LINE_LAYER_ID)) {
      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#166534',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4, 18, 6.5],
          'line-opacity': 0.95,
        },
      });
    }

    return () => {
      if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
      if (map.getLayer(CASING_LAYER_ID)) map.removeLayer(CASING_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  useEffect(() => {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const selectedBus = selectedBusId
      ? buses.find((bus) => bus.id === selectedBusId)
      : undefined;
    const routeShape = visible ? selectedBus?.routeShape : undefined;
    source.setData(routeShape && routeShape.length >= 2 ? routeFeature(routeShape) : EMPTY_ROUTE);
  }, [buses, map, selectedBusId, visible]);

  return null;
}
