import type {
  Camera,
  Entity,
  EntityLiveState,
  EntityRenderState,
  MovementClip,
  MovementPoint,
  PathGeometry,
  SceneEvent,
  Zone,
} from '../types/scene';
import { mockCameras } from '../data/mockCameras';
import { mockClips } from '../data/mockClips';
import { mockEntities } from '../data/mockEntities';
import { movementPointsByEntity } from '../data/mockMovementPoints';
import { mockPaths } from '../data/mockPaths';
import { mockZones } from '../data/mockZones';
import { SIM_START_MS } from '../data/simWindow';
import { computeClipSummary, getEntityStateAt, sliceByTime, toMs } from './replayEngine';

/**
 * Frontend-only mock database for SceneFlow. Holds all entities, paths,
 * zones, cameras, movement points, events and saved clips in memory and
 * exposes a query API shaped like a real scene backend would be.
 */
class MockSceneStore {
  private entities: Entity[] = mockEntities;
  private cameras: Camera[] = mockCameras;
  private paths: PathGeometry[] = mockPaths;
  private zones: Zone[] = mockZones;
  private clips: MovementClip[] = [...mockClips];
  private points: Record<string, MovementPoint[]> = movementPointsByEntity;
  private times: Record<string, number[]> = {};
  private events: SceneEvent[] = [];
  private eventTimes: number[] = [];
  private clipSequence = mockClips.length;

  constructor() {
    for (const [entityId, pts] of Object.entries(this.points)) {
      this.times[entityId] = pts.map((p) => Date.parse(p.observed_at));
    }
    this.buildEvents();
  }

  // ── Static collections ──

  getEntities(): Entity[] {
    return this.entities;
  }

  getCameras(): Camera[] {
    return this.cameras;
  }

  getPaths(): PathGeometry[] {
    return this.paths;
  }

  getZones(): Zone[] {
    return this.zones;
  }

  getEntityById(entityId: string): Entity | undefined {
    return this.entities.find((e) => e.entity_id === entityId);
  }

  getCameraById(cameraId: string): Camera | undefined {
    return this.cameras.find((c) => c.camera_id === cameraId);
  }

  getPathById(pathId: string): PathGeometry | undefined {
    return this.paths.find((p) => p.path_id === pathId);
  }

  getZoneById(zoneId: string): Zone | undefined {
    return this.zones.find((z) => z.zone_id === zoneId);
  }

  // ── Live mode ──

  /** Latest interpolated state of every entity visible at the given mock time. */
  getLiveEntities(currentTime: string | number): EntityLiveState[] {
    const t = toMs(currentTime);
    const result: EntityLiveState[] = [];
    for (const entity of this.entities) {
      const state = this.getRenderState(entity.entity_id, t);
      if (state) result.push({ entity, state });
    }
    return result;
  }

  /** Interpolated render state for one entity at one moment, or null if unseen. */
  getRenderState(entityId: string, currentTime: string | number): EntityRenderState | null {
    const pts = this.points[entityId];
    if (!pts) return null;
    return getEntityStateAt(pts, toMs(currentTime), this.times[entityId]);
  }

  // ── Replay mode ──

  /** Raw movement points for one entity within a time range. */
  getEntityMovement(
    entityId: string,
    startTime: string | number,
    endTime: string | number,
  ): MovementPoint[] {
    const pts = this.points[entityId];
    if (!pts) return [];
    return sliceByTime(pts, this.times[entityId], toMs(startTime), toMs(endTime));
  }

  /** Movement points for all entities (optionally one type) within a time range. */
  getReplayData(
    startTime: string | number,
    endTime: string | number,
    entityType?: Entity['entity_type'],
  ): Record<string, MovementPoint[]> {
    const result: Record<string, MovementPoint[]> = {};
    for (const entity of this.entities) {
      if (entityType && entity.entity_type !== entityType) continue;
      const slice = this.getEntityMovement(entity.entity_id, startTime, endTime);
      if (slice.length > 0) result[entity.entity_id] = slice;
    }
    return result;
  }

  // ── Movement clips ──

  createMovementClip(
    entityId: string,
    startTime: string | number,
    endTime: string | number,
    reason?: string,
  ): MovementClip {
    const startMs = Math.max(toMs(startTime), SIM_START_MS);
    const endMs = toMs(endTime);
    this.clipSequence += 1;
    const clip: MovementClip = {
      clip_id: `CLIP-${String(this.clipSequence).padStart(4, '0')}`,
      entity_id: entityId,
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      clip_type: 'manual_save',
      reason: reason?.trim() || 'Manual 5-minute movement clip',
      created_at: new Date().toISOString(),
      summary: computeClipSummary(this.points[entityId] ?? [], startMs, endMs),
    };
    this.clips = [clip, ...this.clips];
    return clip;
  }

  getMovementClips(): MovementClip[] {
    return this.clips;
  }

  getClipById(clipId: string): MovementClip | undefined {
    return this.clips.find((c) => c.clip_id === clipId);
  }

  /** Clip metadata plus the movement points needed to replay it. */
  getClipReplay(clipId: string): { clip: MovementClip; points: MovementPoint[] } | null {
    const clip = this.getClipById(clipId);
    if (!clip) return null;
    return {
      clip,
      points: this.getEntityMovement(clip.entity_id, clip.start_time, clip.end_time),
    };
  }

  // ── Events ──

  /** Most recent events at or before the given mock time, newest first. */
  getEventsBefore(currentTime: string | number, limit = 10): SceneEvent[] {
    const t = toMs(currentTime);
    const result: SceneEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && result.length < limit; i--) {
      if (this.eventTimes[i] <= t) result.push(this.events[i]);
    }
    return result;
  }

  /**
   * Derives detection events from the movement data (camera handoffs) plus
   * seeded incident reports, so the events feed reflects what is on the map.
   */
  private buildEvents(): void {
    let seq = 0;
    const push = (
      observedAtMs: number,
      severity: SceneEvent['severity'],
      message: string,
      entityId?: string,
      cameraId?: string,
    ) => {
      seq += 1;
      this.events.push({
        event_id: `EVT-${String(seq).padStart(4, '0')}`,
        observed_at: new Date(observedAtMs).toISOString(),
        severity,
        message,
        entity_id: entityId,
        camera_id: cameraId,
      });
    };

    for (const entity of this.entities) {
      if (entity.entity_type === 'incident_object') continue;
      const pts = this.points[entity.entity_id] ?? [];
      let previousCamera: string | undefined;
      for (let i = 0; i < pts.length; i += 5) {
        const p = pts[i];
        if (p.source_camera_id && p.source_camera_id !== previousCamera) {
          const camera = this.getCameraById(p.source_camera_id);
          push(
            Date.parse(p.observed_at),
            'info',
            `${entity.entity_id} detected by ${camera?.name ?? p.source_camera_id}`,
            entity.entity_id,
            p.source_camera_id,
          );
        }
        previousCamera = p.source_camera_id;
      }
    }

    push(SIM_START_MS + 2 * 60_000, 'warning', 'INCIDENT-001 reported: stalled vehicle on Central Road', 'INCIDENT-001', 'CAM-ROAD-01');
    push(SIM_START_MS + 6 * 60_000, 'info', 'INCIDENT-002 reported: debris on East Street', 'INCIDENT-002', 'CAM-ZONE-01');
    push(SIM_START_MS + 9 * 60_000, 'critical', 'INCIDENT-003 reported: flooding near Khlong west bank', 'INCIDENT-003', 'CAM-WATER-01');
    push(SIM_START_MS + 4 * 60_000, 'warning', 'CAM-WATER-02 went offline', undefined, 'CAM-WATER-02');
    push(SIM_START_MS + 12 * 60_000, 'warning', 'CAM-SHUTTLE-01 reporting degraded video quality', undefined, 'CAM-SHUTTLE-01');

    this.events.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    this.eventTimes = this.events.map((e) => Date.parse(e.observed_at));
  }
}

export const mockSceneStore = new MockSceneStore();
