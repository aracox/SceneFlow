import type { LineString } from 'geojson';
import type { PathGeometry } from '../types/scene';
import { calculateHeading, offsetCoordinate } from '../services/geometryUtils';
import { realRoads } from './realRoads';
import { realWaterways } from './realWaterways';
import { realFootways } from './realFootways';

/**
 * All path geometry follows real OpenStreetMap features near MAP_CENTER (Lat
 * Phrao, Bangkok). Paths are generated from the real-feature arrays so the scene
 * scales automatically when those datasets grow (see scripts/gen-*):
 *   - every road      → two opposite-direction vehicle lanes
 *   - every footway   → one out-and-back pedestrian/pet walkway
 *   - every waterway  → a boat channel + a floating-waste surface-flow path
 *
 * The footprint is widened by pulling real roads over a larger radius (see
 * scripts/gen-roads), NOT by synthesizing straight boundary roads — synthetic
 * lines don't match the basemap, so vehicles on them appear to drive off-road.
 */

const reversedLine = (g: LineString): LineString => ({
  type: 'LineString',
  coordinates: [...g.coordinates].reverse(),
});

/** Half the gap between opposing lanes (m); each lane shifts this far to its right. */
const LANE_HALF_OFFSET_M = 2.6;

/**
 * Shifts a line sideways to the RIGHT of travel direction by `meters`, so the
 * two opposing lanes of a road sit on opposite sides of the centerline instead
 * of overlapping. Offset is per-vertex, perpendicular to the local bearing.
 */
const offsetLine = (g: LineString, meters: number): LineString => {
  const c = g.coordinates as [number, number][];
  return {
    type: 'LineString',
    coordinates: c.map((p, i) => {
      const a = c[Math.max(0, i - 1)];
      const b = c[Math.min(c.length - 1, i + 1)];
      const hdg = (calculateHeading(a, b) * Math.PI) / 180;
      // Right perpendicular of a clockwise-from-north heading, in east/north.
      return offsetCoordinate({ lat: p[1], lng: p[0] }, Math.cos(hdg) * meters, -Math.sin(hdg) * meters);
    }),
  };
};

/**
 * An out-and-back loop along a real feature: travel to the far end, then return
 * along the same centerline. The line is closed (first point === last), so
 * movement wraps with no visible teleport.
 */
const outAndBack = (g: LineString): LineString => ({
  type: 'LineString',
  coordinates: [...g.coordinates, ...[...g.coordinates].reverse().slice(1)],
});

// Vehicle lanes: every real road becomes two opposite-direction lanes that
// share the centerline (lane B is the reversed line).
const roadLanes: PathGeometry[] = realRoads.flatMap((r) => [
  {
    path_id: `${r.id}-A`,
    path_type: 'road_lane',
    name: `${r.name} — A`,
    direction: 'forward',
    entity_types_allowed: ['vehicle'],
    geometry: offsetLine(r.geometry, LANE_HALF_OFFSET_M),
  },
  {
    path_id: `${r.id}-B`,
    path_type: 'road_lane',
    name: `${r.name} — B`,
    direction: 'reverse',
    entity_types_allowed: ['vehicle'],
    geometry: offsetLine(reversedLine(r.geometry), LANE_HALF_OFFSET_M),
  },
]);

// Shuttle: out-and-back loop along the longest road (first entry).
const shuttlePath: PathGeometry = {
  path_id: 'SHUTTLE-LOOP-01',
  path_type: 'shuttle_route',
  name: `${realRoads[0].name} Shuttle Loop`,
  direction: 'loop',
  entity_types_allowed: ['vehicle'],
  geometry: outAndBack(realRoads[0].geometry),
};

// Pedestrian walkways: every footway, walked out-and-back (people + pets).
const walkPaths: PathGeometry[] = realFootways.map((f) => ({
  path_id: `WALK-${f.id}`,
  path_type: 'pedestrian_path',
  name: `Walkway ${f.id}`,
  direction: 'two-way',
  entity_types_allowed: ['person', 'pet'],
  geometry: outAndBack(f.geometry),
}));

// Waterways: each real canal carries a boat channel and a floating-waste flow.
const waterPaths: PathGeometry[] = realWaterways.flatMap((w, i) => {
  const n = String(i + 1).padStart(2, '0');
  const geometry = outAndBack(w.geometry);
  return [
    {
      path_id: `WATERWAY-${n}`,
      path_type: 'waterway',
      name: `${w.name} — navigation channel`,
      direction: 'two-way',
      entity_types_allowed: ['boat'],
      geometry,
    },
    {
      path_id: `WATERFLOW-${n}`,
      path_type: 'waterway',
      name: `${w.name} — surface flow`,
      direction: 'two-way',
      entity_types_allowed: ['floating_waste'],
      geometry,
    },
  ];
});

export const mockPaths: PathGeometry[] = [
  ...roadLanes,
  shuttlePath,
  ...walkPaths,
  ...waterPaths,
];

/** Road corridor centerlines, used only for drawing the mock-basemap road surface. */
export const roadCenterlines: Array<{ name: string; geometry: LineString }> =
  realRoads.map((r) => ({ name: r.name, geometry: r.geometry }));

export function getPathById(pathId: string): PathGeometry | undefined {
  return mockPaths.find((p) => p.path_id === pathId);
}
