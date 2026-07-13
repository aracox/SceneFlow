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
import { incidentPlacements, mockEntities } from '../data/mockEntities';
import {
  getMovementPointAt,
  getMovementPointCount,
  getMovementPointsForEntity,
  getMovementRenderState,
  getMovementSliceForEntity,
} from '../data/mockMovementPoints';
import { mockPaths } from '../data/mockPaths';
import { mockZones } from '../data/mockZones';
import { MOCK_ACCIDENT_AT_MS, MOCK_ACCIDENT_ENTITY_ID } from '../data/mockAccident';
import { MOCK_EVACUATION_INCIDENT_ID, MOCK_EVACUATION_START_MS } from '../data/mockEvacuation';
import { SIM_DURATION_MS, SIM_START_MS } from '../data/simWindow';
import { MOCK_DATA_ENABLED } from '../config';
import { distanceBetweenCoordinates } from './geometryUtils';
import { computeClipSummary, toMs } from './replayEngine';

/**
 * Frontend-only mock database for SCENE FLOW. Holds all entities, paths,
 * zones, cameras, movement points, events and saved clips in memory and
 * exposes a query API shaped like a real scene backend would be.
 */
class MockSceneStore {
  // With mock data off we keep cameras (for the live-detection feature) but drop
  // simulated entities, so the map shows a clean live-only view.
  private entities: Entity[] = MOCK_DATA_ENABLED ? mockEntities : [];
  private cameras: Camera[] = mockCameras;
  private paths: PathGeometry[] = mockPaths;
  private zones: Zone[] = mockZones;
  private clips: MovementClip[] = MOCK_DATA_ENABLED ? [...mockClips] : [];
  private events: SceneEvent[] = [];
  private eventTimes: number[] = [];
  private clipSequence = MOCK_DATA_ENABLED ? mockClips.length : 0;

  constructor() {
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

  /** Camera geographically closest to a coordinate (used to attribute events). */
  private nearestCamera(lng: number, lat: number): Camera | undefined {
    let best: Camera | undefined;
    let bestDist = Infinity;
    for (const camera of this.cameras) {
      const d = distanceBetweenCoordinates([lng, lat], [camera.lng, camera.lat]);
      if (d < bestDist) {
        bestDist = d;
        best = camera;
      }
    }
    return best;
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
    return getMovementRenderState(entityId, toMs(currentTime));
  }

  // ── Replay mode ──

  /** Raw movement points for one entity within a time range. */
  getEntityMovement(
    entityId: string,
    startTime: string | number,
    endTime: string | number,
  ): MovementPoint[] {
    return getMovementSliceForEntity(entityId, toMs(startTime), toMs(endTime));
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
      summary: computeClipSummary(getMovementPointsForEntity(entityId), startMs, endMs),
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
   * Events attributed to any of the given cameras, newest first. Independent of
   * the playback clock — the feed changes only when the displayed-camera set
   * changes (i.e. on user selection), not as time advances.
   */
  getEventsForCameras(cameraIds: Iterable<string>, limit = 12): SceneEvent[] {
    const set = cameraIds instanceof Set ? cameraIds : new Set(cameraIds);
    const result: SceneEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && result.length < limit; i--) {
      const ev = this.events[i];
      if (ev.camera_id && set.has(ev.camera_id)) result.push(ev);
    }
    return result;
  }

  /** Camera with the most attributed events — a sensible non-empty default. */
  getBusiestCameraId(): string | undefined {
    const counts = new Map<string, number>();
    for (const ev of this.events) {
      if (ev.camera_id) counts.set(ev.camera_id, (counts.get(ev.camera_id) ?? 0) + 1);
    }
    let best: string | undefined;
    let bestCount = 0;
    for (const [id, n] of counts) {
      if (n > bestCount) {
        bestCount = n;
        best = id;
      }
    }
    return best;
  }

  /**
   * Derives detection events from the movement data (camera handoffs) plus
   * seeded incident reports, so the events feed reflects what is on the map.
   */
  private buildEvents(): void {
    if (!MOCK_DATA_ENABLED) return;

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
      let previousCamera: string | undefined;
      const pointCount = getMovementPointCount(entity.entity_id);
      for (let i = 0; i < pointCount; i += 5) {
        const p = getMovementPointAt(entity.entity_id, i);
        if (!p) continue;
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

    // Incident reports, derived from the real incident entities on the map:
    // real id, description and severity, attributed to the nearest camera and
    // spread deterministically across the sim window.
    const placementById = new Map(incidentPlacements.map((p) => [p.entityId, p]));
    const incidents = this.entities.filter((e) => e.entity_type === 'incident_object');
    incidents.forEach((incident, idx) => {
      const placement = placementById.get(incident.entity_id);
      const attrs = incident.attributes ?? {};
      const description = String(attrs.description ?? incident.sub_type?.replace(/_/g, ' ') ?? 'incident');
      const severity = (attrs.severity as SceneEvent['severity']) ?? 'warning';
      const camera = placement ? this.nearestCamera(placement.lng, placement.lat) : undefined;
      const at =
        incident.entity_id === MOCK_ACCIDENT_ENTITY_ID
          ? MOCK_ACCIDENT_AT_MS
          : incident.entity_id === MOCK_EVACUATION_INCIDENT_ID
            ? MOCK_EVACUATION_START_MS
          : SIM_START_MS + Math.floor(((idx + 1) / (incidents.length + 1)) * SIM_DURATION_MS * 0.9);
      const where = camera ? ` (near ${camera.name})` : '';
      push(at, severity, `${incident.entity_id} reported: ${description}${where}`, incident.entity_id, camera?.camera_id);
    });

    // Camera status events from the real camera fleet — offline cameras first,
    // then a couple of degraded (warning) ones, using their true ids and names.
    const offline = this.cameras.filter((c) => c.status === 'offline');
    const warning = this.cameras.filter((c) => c.status === 'warning').slice(0, 3);
    offline.forEach((camera, i) => {
      push(SIM_START_MS + (3 + i * 5) * 60_000, 'warning', `${camera.camera_id} went offline — ${camera.name}`, undefined, camera.camera_id);
    });
    warning.forEach((camera, i) => {
      push(SIM_START_MS + (5 + i * 4) * 60_000, 'info', `${camera.camera_id} reporting degraded video quality`, undefined, camera.camera_id);
    });

    this.events.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    this.eventTimes = this.events.map((e) => Date.parse(e.observed_at));
  }
}

export const mockSceneStore = new MockSceneStore();
