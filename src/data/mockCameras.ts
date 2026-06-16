import type { Camera } from '../types/scene';
import { MAP_CENTER, offsetCoordinate, sectorPolygon } from '../services/geometryUtils';

interface CameraSpec {
  camera_id: string;
  name: string;
  metersEast: number;
  metersNorth: number;
  status: Camera['status'];
  direction_deg: number;
  fov_deg: number;
  range_m: number;
  supported_entity_types: Camera['supported_entity_types'];
}

const specs: CameraSpec[] = [
  {
    camera_id: 'CAM-ROAD-01',
    name: 'Central Road / Center St Junction',
    metersEast: -35,
    metersNorth: 40,
    status: 'online',
    direction_deg: 100,
    fov_deg: 75,
    range_m: 170,
    supported_entity_types: ['vehicle', 'person', 'incident_object'],
  },
  {
    camera_id: 'CAM-ROAD-02',
    name: 'North Avenue West Approach',
    metersEast: 225,
    metersNorth: 200,
    status: 'online',
    direction_deg: 290,
    fov_deg: 80,
    range_m: 170,
    supported_entity_types: ['vehicle', 'person', 'incident_object'],
  },
  {
    camera_id: 'CAM-PARKING-01',
    name: 'Parking A Overview',
    metersEast: 185,
    metersNorth: 175,
    status: 'online',
    direction_deg: 150,
    fov_deg: 85,
    range_m: 140,
    supported_entity_types: ['vehicle', 'person'],
  },
  {
    camera_id: 'CAM-SHUTTLE-01',
    name: 'Shuttle Stop A Platform',
    metersEast: 28,
    metersNorth: 206,
    status: 'warning',
    direction_deg: 260,
    fov_deg: 70,
    range_m: 130,
    supported_entity_types: ['vehicle', 'person'],
  },
  {
    camera_id: 'CAM-WALK-01',
    name: 'Innovation Plaza Walkway',
    metersEast: -170,
    metersNorth: 10,
    status: 'online',
    direction_deg: 40,
    fov_deg: 90,
    range_m: 140,
    supported_entity_types: ['person', 'pet'],
  },
  {
    camera_id: 'CAM-WATER-01',
    name: 'Khlong South Bank',
    metersEast: -330,
    metersNorth: -180,
    status: 'online',
    direction_deg: 265,
    fov_deg: 75,
    range_m: 150,
    supported_entity_types: ['boat', 'floating_waste', 'incident_object'],
  },
  {
    camera_id: 'CAM-WATER-02',
    name: 'Khlong North Bank',
    metersEast: -328,
    metersNorth: 170,
    status: 'offline',
    direction_deg: 262,
    fov_deg: 75,
    range_m: 150,
    supported_entity_types: ['boat', 'floating_waste', 'incident_object'],
  },
  {
    camera_id: 'CAM-ZONE-01',
    name: 'Park Zone A Entrance',
    metersEast: 90,
    metersNorth: -205,
    status: 'online',
    direction_deg: 160,
    fov_deg: 85,
    range_m: 150,
    supported_entity_types: ['person', 'pet', 'incident_object'],
  },
];

export const mockCameras: Camera[] = specs.map((spec) => {
  const [lng, lat] = offsetCoordinate(MAP_CENTER, spec.metersEast, spec.metersNorth);
  return {
    camera_id: spec.camera_id,
    name: spec.name,
    lat,
    lng,
    status: spec.status,
    direction_deg: spec.direction_deg,
    fov_deg: spec.fov_deg,
    coverage_polygon: sectorPolygon(lng, lat, spec.direction_deg, spec.fov_deg, spec.range_m),
    supported_entity_types: spec.supported_entity_types,
  };
});

export function getCameraById(cameraId: string): Camera | undefined {
  return mockCameras.find((c) => c.camera_id === cameraId);
}
