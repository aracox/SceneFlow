import type { LineString } from 'geojson';
import type { PathGeometry } from '../types/scene';
import { MAP_CENTER, offsetCoordinate } from '../services/geometryUtils';

/**
 * All path geometry for the Thailand Digital Valley Pilot site is generated
 * relative to MAP_CENTER in meters east/north, then converted to WGS84
 * [lng, lat]. The site covers roughly 800m x 800m around the center.
 */
const o = (metersEast: number, metersNorth: number): [number, number] =>
  offsetCoordinate(MAP_CENTER, metersEast, metersNorth);

const line = (points: Array<[number, number]>): LineString => ({
  type: 'LineString',
  coordinates: points.map(([east, north]) => o(east, north)),
});

// Road grid layout (meters relative to MAP_CENTER).
const ROAD_NORTH_Y = 220;
const ROAD_CENTRAL_Y = 20;
const ROAD_SOUTH_Y = -180;
const STREET_WEST_X = -260;
const STREET_CENTER_X = -20;
const STREET_EAST_X = 240;
const LANE_OFFSET_M = 3.5;

const H_STOPS = [-380, -200, 0, 200, 380];
const V_STOPS = [-380, -200, 0, 200, 380];

function horizontalLane(north: number, eastbound: boolean): LineString {
  const pts = H_STOPS.map((x): [number, number] => [x, north]);
  return line(eastbound ? pts : [...pts].reverse());
}

function verticalLane(east: number, northbound: boolean): LineString {
  const pts = V_STOPS.map((y): [number, number] => [east, y]);
  return line(northbound ? pts : [...pts].reverse());
}

const roadLane = (
  pathId: string,
  name: string,
  direction: string,
  geometry: LineString,
): PathGeometry => ({
  path_id: pathId,
  path_type: 'road_lane',
  name,
  direction,
  entity_types_allowed: ['vehicle'],
  geometry,
});

export const mockPaths: PathGeometry[] = [
  // ── Horizontal road corridors (two opposite-direction lanes each) ──
  roadLane('LANE-N1-E', 'North Avenue — eastbound lane', 'eastbound', horizontalLane(ROAD_NORTH_Y - LANE_OFFSET_M, true)),
  roadLane('LANE-N1-W', 'North Avenue — westbound lane', 'westbound', horizontalLane(ROAD_NORTH_Y + LANE_OFFSET_M, false)),
  roadLane('LANE-N2-E', 'Central Road — eastbound lane', 'eastbound', horizontalLane(ROAD_CENTRAL_Y - LANE_OFFSET_M, true)),
  roadLane('LANE-N2-W', 'Central Road — westbound lane', 'westbound', horizontalLane(ROAD_CENTRAL_Y + LANE_OFFSET_M, false)),
  roadLane('LANE-N3-E', 'South Road — eastbound lane', 'eastbound', horizontalLane(ROAD_SOUTH_Y - LANE_OFFSET_M, true)),
  roadLane('LANE-N3-W', 'South Road — westbound lane', 'westbound', horizontalLane(ROAD_SOUTH_Y + LANE_OFFSET_M, false)),

  // ── Vertical road corridors (two opposite-direction lanes each) ──
  roadLane('LANE-V1-N', 'West Street — northbound lane', 'northbound', verticalLane(STREET_WEST_X + LANE_OFFSET_M, true)),
  roadLane('LANE-V1-S', 'West Street — southbound lane', 'southbound', verticalLane(STREET_WEST_X - LANE_OFFSET_M, false)),
  roadLane('LANE-V2-N', 'Center Street — northbound lane', 'northbound', verticalLane(STREET_CENTER_X + LANE_OFFSET_M, true)),
  roadLane('LANE-V2-S', 'Center Street — southbound lane', 'southbound', verticalLane(STREET_CENTER_X - LANE_OFFSET_M, false)),
  roadLane('LANE-V3-N', 'East Street — northbound lane', 'northbound', verticalLane(STREET_EAST_X + LANE_OFFSET_M, true)),
  roadLane('LANE-V3-S', 'East Street — southbound lane', 'southbound', verticalLane(STREET_EAST_X - LANE_OFFSET_M, false)),

  // ── Shuttle loop route ──
  {
    path_id: 'SHUTTLE-LOOP-01',
    path_type: 'shuttle_route',
    name: 'TDV Shuttle Loop',
    direction: 'clockwise',
    entity_types_allowed: ['vehicle'],
    geometry: line([
      [-256, -173],
      [-10, -173],
      [236, -173],
      [236, 20],
      [236, 213],
      [-10, 213],
      [-256, 213],
      [-256, 20],
      [-256, -173],
    ]),
  },

  // ── Pedestrian paths ──
  {
    path_id: 'PED-01',
    path_type: 'pedestrian_path',
    name: 'Building A Walkway Loop',
    direction: 'loop',
    entity_types_allowed: ['person', 'pet'],
    geometry: line([
      [-160, 45],
      [-160, 185],
      [-25, 185],
      [-25, 45],
      [-160, 45],
    ]),
  },
  {
    path_id: 'PED-02',
    path_type: 'pedestrian_path',
    name: 'Innovation Plaza Path',
    direction: 'two-way',
    entity_types_allowed: ['person', 'pet'],
    geometry: line([
      [-140, -35],
      [-60, -42],
      [20, -38],
      [100, -30],
      [165, -60],
      [200, -120],
    ]),
  },
  {
    path_id: 'PED-03',
    path_type: 'pedestrian_path',
    name: 'Lakeside Promenade',
    direction: 'two-way',
    entity_types_allowed: ['person', 'pet'],
    geometry: line([
      [-320, -300],
      [-322, -150],
      [-312, 0],
      [-305, 150],
      [-298, 290],
    ]),
  },

  // ── Pet-friendly park paths ──
  {
    path_id: 'PARK-01',
    path_type: 'pedestrian_path',
    name: 'Park Zone A — Outer Loop',
    direction: 'loop',
    entity_types_allowed: ['pet', 'person'],
    geometry: line([
      [100, -320],
      [220, -330],
      [320, -315],
      [325, -245],
      [210, -228],
      [105, -240],
      [100, -320],
    ]),
  },
  {
    path_id: 'PARK-02',
    path_type: 'pedestrian_path',
    name: 'Park Zone A — Meadow Trail',
    direction: 'two-way',
    entity_types_allowed: ['pet', 'person'],
    geometry: line([
      [140, -300],
      [180, -280],
      [230, -290],
      [270, -265],
      [300, -275],
    ]),
  },

  // ── Waterway (boats) ──
  {
    path_id: 'WATERWAY-01',
    path_type: 'waterway',
    name: 'Khlong Segment A — navigation channel',
    direction: 'two-way',
    entity_types_allowed: ['boat'],
    geometry: line([
      [-360, -380],
      [-366, -250],
      [-356, -120],
      [-362, 30],
      [-354, 180],
      [-360, 380],
    ]),
  },

  // ── Water flow path (floating waste drifts slowly northward) ──
  {
    path_id: 'WATERFLOW-01',
    path_type: 'waterway',
    name: 'Khlong Segment A — surface flow',
    direction: 'northbound',
    entity_types_allowed: ['floating_waste'],
    geometry: line([
      [-352, -380],
      [-358, -240],
      [-349, -100],
      [-355, 60],
      [-347, 210],
      [-352, 380],
    ]),
  },
];

/** Road corridor centerlines, used only for drawing the base-map road surface. */
export const roadCenterlines: Array<{ name: string; geometry: LineString }> = [
  { name: 'North Avenue', geometry: horizontalLane(ROAD_NORTH_Y, true) },
  { name: 'Central Road', geometry: horizontalLane(ROAD_CENTRAL_Y, true) },
  { name: 'South Road', geometry: horizontalLane(ROAD_SOUTH_Y, true) },
  { name: 'West Street', geometry: verticalLane(STREET_WEST_X, true) },
  { name: 'Center Street', geometry: verticalLane(STREET_CENTER_X, true) },
  { name: 'East Street', geometry: verticalLane(STREET_EAST_X, true) },
];

export function getPathById(pathId: string): PathGeometry | undefined {
  return mockPaths.find((p) => p.path_id === pathId);
}
