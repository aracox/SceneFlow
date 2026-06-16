import type { Polygon } from 'geojson';
import type { Zone } from '../types/scene';
import { MAP_CENTER, offsetCoordinate } from '../services/geometryUtils';

const o = (metersEast: number, metersNorth: number): [number, number] =>
  offsetCoordinate(MAP_CENTER, metersEast, metersNorth);

const poly = (points: Array<[number, number]>): Polygon => ({
  type: 'Polygon',
  coordinates: [[...points.map(([e, n]) => o(e, n)), o(points[0][0], points[0][1])]],
});

/** Axis-aligned rectangle in meters relative to MAP_CENTER. */
const rect = (x1: number, y1: number, x2: number, y2: number): Polygon =>
  poly([
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ]);

export const mockZones: Zone[] = [
  // ── Buildings ──
  {
    zone_id: 'ZONE-BLDG-A',
    zone_type: 'building',
    name: 'TDV Pilot Building A',
    geometry: rect(-150, 60, -40, 170),
    properties: { floors: 6, label: true },
  },
  {
    zone_id: 'ZONE-BLDG-B',
    zone_type: 'building',
    name: 'TDV Pilot Building B',
    geometry: rect(50, 60, 160, 170),
    properties: { floors: 4, label: true },
  },
  {
    zone_id: 'ZONE-BLDG-HUB',
    zone_type: 'building',
    name: 'Innovation Hub',
    geometry: rect(-70, -120, 70, -50),
    properties: { floors: 3, label: true },
  },

  // ── Parking areas ──
  {
    zone_id: 'ZONE-PARKING-A',
    zone_type: 'parking',
    name: 'Parking A',
    geometry: rect(180, 60, 330, 160),
    properties: { capacity: 120, label: true },
  },
  {
    zone_id: 'ZONE-PARKING-B',
    zone_type: 'parking',
    name: 'Parking B',
    geometry: rect(-340, -120, -200, -40),
    properties: { capacity: 80, label: true },
  },

  // ── Pedestrian zones ──
  {
    zone_id: 'ZONE-PLAZA',
    zone_type: 'pedestrian',
    name: 'Innovation Plaza',
    geometry: rect(-150, -30, -30, 40),
    properties: { kind: 'plaza', label: true },
  },
  {
    zone_id: 'ZONE-STOP-A',
    zone_type: 'pedestrian',
    name: 'Shuttle Stop A',
    geometry: rect(-20, 196, 20, 214),
    properties: { kind: 'shuttle_stop', label: true },
  },
  {
    zone_id: 'ZONE-STOP-B',
    zone_type: 'pedestrian',
    name: 'Shuttle Stop B',
    geometry: rect(200, -210, 240, -186),
    properties: { kind: 'shuttle_stop', label: true },
  },
  {
    zone_id: 'ZONE-PARK-A',
    zone_type: 'pedestrian',
    name: 'Park Zone A',
    geometry: rect(80, -350, 340, -210),
    properties: { kind: 'park', label: true },
  },

  // ── Waterway ──
  {
    zone_id: 'ZONE-WATER-A',
    zone_type: 'waterway',
    name: 'Waterway Segment A',
    geometry: rect(-385, -380, -335, 380),
    properties: { flow_direction: 'north', label: true },
  },

  // ── Restricted ──
  {
    zone_id: 'ZONE-RESTRICTED-R1',
    zone_type: 'restricted',
    name: 'Restricted Zone R1',
    geometry: rect(280, 240, 360, 330),
    properties: { reason: 'Utility substation — no public access', label: true },
  },

  // ── Incident ──
  {
    zone_id: 'ZONE-INCIDENT-01',
    zone_type: 'incident',
    name: 'Incident Zone — Central Road',
    geometry: rect(-70, 0, -25, 38),
    properties: { related_entity: 'INCIDENT-001', label: false },
  },
];

export function getZoneById(zoneId: string): Zone | undefined {
  return mockZones.find((z) => z.zone_id === zoneId);
}
