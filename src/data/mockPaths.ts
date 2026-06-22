import type { LineString } from 'geojson';
import type { PathGeometry } from '../types/scene';
import { MAP_CENTER, offsetCoordinate } from '../services/geometryUtils';
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
 */

const reversedLine = (g: LineString): LineString => ({
  type: 'LineString',
  coordinates: [...g.coordinates].reverse(),
});

/**
 * An out-and-back loop along a real feature: travel to the far end, then return
 * along the same centerline. The line is closed (first point === last), so
 * movement wraps with no visible teleport.
 */
const outAndBack = (g: LineString): LineString => ({
  type: 'LineString',
  coordinates: [...g.coordinates, ...[...g.coordinates].reverse().slice(1)],
});

const lineFromMeters = (points: Array<[number, number]>): LineString => ({
  type: 'LineString',
  coordinates: points.map(([east, north]) => offsetCoordinate(MAP_CENTER, east, north)),
});

const EXPANSION_HALF_SIZE_M = 2000;

// Synthetic expansion routes widen the mock-object latitude/longitude footprint
// to a 4 km x 4 km square around MAP_CENTER. Coordinates are expressed in metres
// from MAP_CENTER, then converted to real [lng, lat] coordinates above.
const expansionRoads: Array<{ id: string; name: string; geometry: LineString }> = [
  {
    id: 'EXP-ROAD-NORTH-EDGE',
    name: 'North 4 km boundary road',
    geometry: lineFromMeters([
      [-EXPANSION_HALF_SIZE_M, 1900],
      [-1200, 2000],
      [-420, 1940],
      [420, 2000],
      [1200, 1940],
      [EXPANSION_HALF_SIZE_M, 1900],
    ]),
  },
  {
    id: 'EXP-ROAD-SOUTH-EDGE',
    name: 'South 4 km boundary road',
    geometry: lineFromMeters([
      [-EXPANSION_HALF_SIZE_M, -1900],
      [-1200, -2000],
      [-420, -1940],
      [420, -2000],
      [1200, -1940],
      [EXPANSION_HALF_SIZE_M, -1900],
    ]),
  },
  {
    id: 'EXP-ROAD-WEST-EDGE',
    name: 'West 4 km boundary road',
    geometry: lineFromMeters([
      [-1900, -EXPANSION_HALF_SIZE_M],
      [-2000, -1200],
      [-1940, -420],
      [-2000, 420],
      [-1940, 1200],
      [-1900, EXPANSION_HALF_SIZE_M],
    ]),
  },
  {
    id: 'EXP-ROAD-EAST-EDGE',
    name: 'East 4 km boundary road',
    geometry: lineFromMeters([
      [1900, -EXPANSION_HALF_SIZE_M],
      [2000, -1200],
      [1940, -420],
      [2000, 420],
      [1940, 1200],
      [1900, EXPANSION_HALF_SIZE_M],
    ]),
  },
  {
    id: 'EXP-ROAD-MID-EW',
    name: 'Midtown east-west expansion road',
    geometry: lineFromMeters([
      [-EXPANSION_HALF_SIZE_M, -120],
      [-1200, -40],
      [-420, 40],
      [420, -30],
      [1200, 60],
      [EXPANSION_HALF_SIZE_M, 120],
    ]),
  },
  {
    id: 'EXP-ROAD-MID-NS',
    name: 'Midtown north-south expansion road',
    geometry: lineFromMeters([
      [-80, -EXPANSION_HALF_SIZE_M],
      [40, -1200],
      [-40, -420],
      [60, 420],
      [-30, 1200],
      [80, EXPANSION_HALF_SIZE_M],
    ]),
  },
  {
    id: 'EXP-ROAD-DIAGONAL-NW-SE',
    name: 'Northwest-southeast expansion diagonal',
    geometry: lineFromMeters([
      [-1800, 1680],
      [-1120, 1080],
      [-420, 420],
      [360, -320],
      [1120, -1040],
      [1800, -1640],
    ]),
  },
  {
    id: 'EXP-ROAD-DIAGONAL-SW-NE',
    name: 'Southwest-northeast expansion diagonal',
    geometry: lineFromMeters([
      [-1800, -1640],
      [-1120, -1040],
      [-360, -320],
      [420, 420],
      [1120, 1080],
      [1800, 1680],
    ]),
  },
];

const expansionFootways: Array<{ id: string; geometry: LineString }> = [
  {
    id: 'EXP-PATH-NW',
    geometry: lineFromMeters([
      [-1720, 1360],
      [-1420, 1620],
      [-1060, 1460],
      [-1120, 1100],
      [-1520, 1060],
      [-1720, 1360],
    ]),
  },
  {
    id: 'EXP-PATH-NE',
    geometry: lineFromMeters([
      [1060, 1360],
      [1420, 1620],
      [1740, 1360],
      [1540, 1060],
      [1140, 1120],
      [1060, 1360],
    ]),
  },
  {
    id: 'EXP-PATH-SW',
    geometry: lineFromMeters([
      [-1740, -1060],
      [-1420, -1340],
      [-1040, -1160],
      [-1160, -820],
      [-1540, -820],
      [-1740, -1060],
    ]),
  },
  {
    id: 'EXP-PATH-SE',
    geometry: lineFromMeters([
      [1060, -1180],
      [1440, -1440],
      [1760, -1120],
      [1540, -820],
      [1160, -900],
      [1060, -1180],
    ]),
  },
  {
    id: 'EXP-PATH-CENTRAL-WEST',
    geometry: lineFromMeters([
      [-1340, 220],
      [-1040, 420],
      [-760, 180],
      [-880, -140],
      [-1220, -100],
      [-1340, 220],
    ]),
  },
  {
    id: 'EXP-PATH-CENTRAL-EAST',
    geometry: lineFromMeters([
      [760, 220],
      [1080, 440],
      [1380, 180],
      [1240, -160],
      [900, -100],
      [760, 220],
    ]),
  },
];

// Vehicle lanes: every real road becomes two opposite-direction lanes that
// share the centerline (lane B is the reversed line).
const roadLanes: PathGeometry[] = realRoads.flatMap((r) => [
  {
    path_id: `${r.id}-A`,
    path_type: 'road_lane',
    name: `${r.name} — A`,
    direction: 'forward',
    entity_types_allowed: ['vehicle'],
    geometry: r.geometry,
  },
  {
    path_id: `${r.id}-B`,
    path_type: 'road_lane',
    name: `${r.name} — B`,
    direction: 'reverse',
    entity_types_allowed: ['vehicle'],
    geometry: reversedLine(r.geometry),
  },
]);

const expansionRoadLanes: PathGeometry[] = expansionRoads.flatMap((r) => [
  {
    path_id: `${r.id}-A`,
    path_type: 'road_lane',
    name: `${r.name} — A`,
    direction: 'forward',
    entity_types_allowed: ['vehicle'],
    geometry: r.geometry,
  },
  {
    path_id: `${r.id}-B`,
    path_type: 'road_lane',
    name: `${r.name} — B`,
    direction: 'reverse',
    entity_types_allowed: ['vehicle'],
    geometry: reversedLine(r.geometry),
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

const expansionWalkPaths: PathGeometry[] = expansionFootways.map((f) => ({
  path_id: `WALK-${f.id}`,
  path_type: 'pedestrian_path',
  name: `Expansion walkway ${f.id}`,
  direction: 'loop',
  entity_types_allowed: ['person', 'pet'],
  geometry: f.geometry,
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
  ...expansionRoadLanes,
  shuttlePath,
  ...walkPaths,
  ...expansionWalkPaths,
  ...waterPaths,
];

/** Road corridor centerlines, used only for drawing the mock-basemap road surface. */
export const roadCenterlines: Array<{ name: string; geometry: LineString }> = [
  ...realRoads.map((r) => ({ name: r.name, geometry: r.geometry })),
  ...expansionRoads.map((r) => ({ name: r.name, geometry: r.geometry })),
];

export function getPathById(pathId: string): PathGeometry | undefined {
  return mockPaths.find((p) => p.path_id === pathId);
}
