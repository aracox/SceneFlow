import type { MovementClip } from '../types/scene';
import { SIM_START_MS } from './simWindow';

const MIN = 60_000;

function seedClip(
  clipId: string,
  entityId: string,
  startOffsetMin: number,
  endOffsetMin: number,
  clipType: MovementClip['clip_type'],
  reason: string,
): MovementClip {
  const startMs = SIM_START_MS + startOffsetMin * MIN;
  const endMs = SIM_START_MS + endOffsetMin * MIN;
  return {
    clip_id: clipId,
    entity_id: entityId,
    start_time: new Date(startMs).toISOString(),
    end_time: new Date(endMs).toISOString(),
    clip_type: clipType,
    reason,
    created_at: new Date(endMs).toISOString(),
  };
}

/** Initial saved clips present in the mock database at startup. */
export const mockClips: MovementClip[] = [
  seedClip('CLIP-0001', 'VEH-002', 5, 10, 'manual_save', 'Vehicle pass through Central Road corridor'),
  seedClip('CLIP-0002', 'BOAT-001', 3, 8, 'auto_detected', 'Boat transit — Waterway Segment A'),
  seedClip('CLIP-0003', 'WASTE-002', 6, 11, 'auto_detected', 'Floating waste drift monitoring'),
  seedClip('CLIP-0004', 'PERSON-004', 8, 13, 'manual_save', 'Pedestrian route review — Innovation Plaza Path'),
];
