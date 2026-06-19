import type { LineString, Polygon } from 'geojson';

/** A real-world object detected by a camera and tracked on the map. */
export interface Entity {
  entity_id: string;
  entity_type: 'vehicle' | 'person' | 'boat' | 'floating_waste' | 'pet' | 'incident_object';
  sub_type?: string;
  color?: string;
  icon?: string;
  first_seen_at: string;
  last_seen_at: string;
  current_status: 'tracked' | 'lost' | 'predicted' | 'stopped';
  attributes?: Record<string, unknown>;
}

export type EntityType = Entity['entity_type'];

/** One time-stamped observation of an entity, always derived from path geometry. */
export interface MovementPoint {
  entity_id: string;
  observed_at: string;
  lng: number;
  lat: number;
  heading_deg: number;
  speed_kmh?: number;
  path_id?: string;
  zone_id?: string;
  source_camera_id?: string;
  confidence: number;
  tracking_status: 'tracked' | 'lost' | 'predicted';
  attributes?: Record<string, unknown>;
}

/** Lane, route, path or waterway geometry that constrains entity movement. */
export interface PathGeometry {
  path_id: string;
  path_type: 'road_lane' | 'shuttle_route' | 'pedestrian_path' | 'waterway';
  name: string;
  direction?: string;
  entity_types_allowed: string[];
  geometry: LineString;
}

export interface Zone {
  zone_id: string;
  zone_type: 'building' | 'parking' | 'pedestrian' | 'waterway' | 'restricted' | 'incident';
  name: string;
  geometry: Polygon;
  properties?: Record<string, unknown>;
}

export interface Camera {
  camera_id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'online' | 'offline' | 'warning';
  direction_deg: number;
  fov_deg: number;
  coverage_polygon: Polygon;
  supported_entity_types: Entity['entity_type'][];
}

export type SignalState = 'green' | 'yellow' | 'red';

export interface TrafficLight {
  light_id: string;
  lat: number;
  lng: number;
  /** Bearing (deg) of the road treated as the "primary" axis at this junction. */
  primary_axis_deg: number;
  /** Per-light cycle offset (s) so junctions are not all synchronized. */
  cycle_offset_s: number;
  road_count: number;
}

export interface MovementClip {
  clip_id: string;
  entity_id: string;
  start_time: string;
  end_time: string;
  clip_type: 'manual_save' | 'incident' | 'auto_detected';
  reason?: string;
  created_at: string;
  summary?: {
    duration_sec: number;
    distance_m?: number;
    avg_speed_kmh?: number;
    source_cameras?: string[];
    zones?: string[];
  };
}

/** Interpolated render state of an entity at a given moment (output of the replay engine). */
export interface EntityRenderState {
  entity_id: string;
  lng: number;
  lat: number;
  heading_deg: number;
  speed_kmh: number;
  confidence: number;
  tracking_status: MovementPoint['tracking_status'];
  path_id?: string;
  zone_id?: string;
  source_camera_id?: string;
  observed_at: string;
}

export interface EntityLiveState {
  entity: Entity;
  state: EntityRenderState;
}

/** Mock detection / incident event shown in the events feed. */
export interface SceneEvent {
  event_id: string;
  observed_at: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  entity_id?: string;
  camera_id?: string;
}
