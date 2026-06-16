import type { Entity } from '../types/scene';
import { SIM_END_MS, SIM_START_MS } from './simWindow';

const firstSeen = new Date(SIM_START_MS).toISOString();
const lastSeen = new Date(SIM_END_MS).toISOString();

const entity = (
  id: string,
  type: Entity['entity_type'],
  subType: string,
  overrides: Partial<Entity> = {},
): Entity => ({
  entity_id: id,
  entity_type: type,
  sub_type: subType,
  first_seen_at: firstSeen,
  last_seen_at: lastSeen,
  current_status: 'tracked',
  ...overrides,
});

export const mockEntities: Entity[] = [
  // ── Vehicles ──
  entity('VEH-001', 'vehicle', 'sedan', {
    color: '#ef4444',
    attributes: { detected_color: 'red', size_class: 'medium', lane_discipline: 'normal' },
  }),
  entity('VEH-002', 'vehicle', 'pickup', {
    color: '#f1f5f9',
    attributes: { detected_color: 'white', size_class: 'large', cargo_visible: true },
  }),
  entity('VEH-003', 'vehicle', 'suv', {
    color: '#1f2937',
    attributes: { detected_color: 'black', size_class: 'large' },
  }),
  entity('VEH-004', 'vehicle', 'sedan', {
    color: '#3b82f6',
    attributes: { detected_color: 'blue', size_class: 'medium' },
  }),
  entity('VEH-005', 'vehicle', 'van', {
    color: '#9ca3af',
    attributes: { detected_color: 'silver', size_class: 'large', fleet_marking: 'delivery' },
  }),
  entity('VEH-006', 'vehicle', 'motorcycle', {
    color: '#10b981',
    attributes: { detected_color: 'green', size_class: 'small' },
  }),

  // ── Shuttle bus (still a vehicle, sub_type "shuttle") ──
  entity('SHUTTLE-001', 'vehicle', 'shuttle', {
    color: '#f59e0b',
    attributes: {
      detected_color: 'orange',
      route: 'TDV Shuttle Loop',
      operator: 'TDV Campus Mobility',
      capacity: 14,
    },
  }),

  // ── People ──
  entity('PERSON-001', 'person', 'pedestrian', {
    attributes: { clothing_color: 'navy', carrying_bag: true },
  }),
  entity('PERSON-002', 'person', 'pedestrian', {
    attributes: { clothing_color: 'white' },
  }),
  entity('PERSON-003', 'person', 'staff', {
    attributes: { clothing_color: 'blue', badge_visible: true },
  }),
  entity('PERSON-004', 'person', 'pedestrian', {
    attributes: { clothing_color: 'gray', umbrella: false },
  }),
  entity('PERSON-005', 'person', 'jogger', {
    attributes: { clothing_color: 'orange', activity: 'jogging' },
  }),
  entity('PERSON-006', 'person', 'pedestrian', {
    attributes: { clothing_color: 'green' },
  }),
  entity('PERSON-007', 'person', 'visitor', {
    attributes: { clothing_color: 'red', group_size: 1 },
  }),
  entity('PERSON-008', 'person', 'security', {
    attributes: { clothing_color: 'black', patrol: 'building-a' },
  }),

  // ── Pets ──
  entity('PET-001', 'pet', 'dog', {
    color: '#b45309',
    attributes: { breed_guess: 'golden retriever', leashed: true },
  }),
  entity('PET-002', 'pet', 'cat', {
    color: '#737373',
    attributes: { breed_guess: 'domestic shorthair', leashed: false },
  }),

  // ── Boats ──
  entity('BOAT-001', 'boat', 'patrol_boat', {
    color: '#0ea5e9',
    attributes: { hull_color: 'blue', length_m_est: 6, operator: 'Canal Patrol' },
  }),
  entity('BOAT-002', 'boat', 'longtail', {
    color: '#8b5cf6',
    attributes: { hull_color: 'purple', length_m_est: 9 },
  }),

  // ── Floating waste ──
  entity('WASTE-001', 'floating_waste', 'plastic_bag_cluster', {
    color: '#14b8a6',
    attributes: { size_est: 'small', material_guess: 'plastic' },
  }),
  entity('WASTE-002', 'floating_waste', 'bottle_cluster', {
    color: '#0d9488',
    attributes: { size_est: 'small', material_guess: 'plastic/glass' },
  }),
  entity('WASTE-003', 'floating_waste', 'foam_box', {
    color: '#2dd4bf',
    attributes: { size_est: 'medium', material_guess: 'styrofoam' },
  }),
  entity('WASTE-004', 'floating_waste', 'mixed_debris', {
    color: '#0f766e',
    attributes: { size_est: 'medium', material_guess: 'mixed' },
  }),

  // ── Incident objects (stationary) ──
  entity('INCIDENT-001', 'incident_object', 'stalled_vehicle', {
    current_status: 'stopped',
    attributes: {
      description: 'Stalled vehicle blocking Central Road westbound lane',
      severity: 'warning',
      reported_by: 'CAM-ROAD-01',
    },
  }),
  entity('INCIDENT-002', 'incident_object', 'road_debris', {
    current_status: 'stopped',
    attributes: {
      description: 'Debris on East Street southbound lane',
      severity: 'info',
      reported_by: 'CAM-ZONE-01',
    },
  }),
  entity('INCIDENT-003', 'incident_object', 'flooding', {
    current_status: 'stopped',
    attributes: {
      description: 'Localized flooding near Khlong west bank',
      severity: 'critical',
      reported_by: 'CAM-WATER-01',
    },
  }),
];

export function getEntityById(entityId: string): Entity | undefined {
  return mockEntities.find((e) => e.entity_id === entityId);
}
