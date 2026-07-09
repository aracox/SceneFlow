import { create } from 'zustand';
import type { Entity, MovementClip } from '../types/scene';
import {
  CLIP_DURATION_MS,
  LIVE_START_MS,
  SIM_DURATION_MS,
  SIM_END_MS,
  SIM_START_MS,
} from '../data/simWindow';
import { mockSceneStore } from '../services/mockSceneStore';
import { toMs } from '../services/replayEngine';

export type LayerKey =
  | 'vehicles'
  | 'people'
  | 'boats'
  | 'waste'
  | 'pets'
  | 'cameras'
  | 'signals'
  | 'zones'
  | 'paths'
  | 'incidents'
  | 'trails'
  | 'detections';

export type PlaybackSpeed = 1 | 2 | 4 | 8;

/** Basemap under the GeoJSON overlays. 'mock' is the offline custom basemap. */
export type Basemap = 'mock' | 'satellite' | 'streets';

/** Map layer toggle that controls a given entity type's markers. */
export function layerKeyForEntity(entity: Entity): LayerKey {
  switch (entity.entity_type) {
    case 'vehicle':
      return 'vehicles';
    case 'person':
      return 'people';
    case 'boat':
      return 'boats';
    case 'floating_waste':
      return 'waste';
    case 'pet':
      return 'pets';
    case 'incident_object':
      return 'incidents';
  }
}

export interface SceneState {
  mode: 'live' | 'replay';
  /** Current mock time shown on the map (epoch ms). */
  simTime: number;
  /** Where the live clock is, kept ticking at 1x even while replaying. */
  liveTime: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  replayStart: number;
  replayEnd: number;
  activeClipId: string | null;
  selectedEntityId: string | null;
  selectedDetectionKey: string | null;
  selectedCameraId: string | null;
  /** Cameras whose events appear in Recent Events; grows as cameras are selected. */
  displayedCameraIds: string[];
  layers: Record<LayerKey, boolean>;
  basemap: Basemap;
  /** Global multiplier for entity icon size (1 = default). */
  iconScale: number;
  clips: MovementClip[];
  lastSavedClipId: string | null;

  tick: (dtMs: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  scrubTo: (timeMs: number) => void;
  selectEntity: (entityId: string | null) => void;
  selectDetection: (detectionKey: string | null) => void;
  selectCamera: (cameraId: string | null) => void;
  toggleLayer: (key: LayerKey) => void;
  setBasemap: (basemap: Basemap) => void;
  setIconScale: (scale: number) => void;
  saveClip: (reason?: string) => MovementClip | null;
  playClip: (clipId: string) => void;
  backToLive: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  mode: 'live',
  simTime: LIVE_START_MS,
  liveTime: LIVE_START_MS,
  isPlaying: true,
  speed: 1,
  replayStart: SIM_START_MS,
  replayEnd: SIM_END_MS,
  activeClipId: null,
  selectedEntityId: null,
  selectedDetectionKey: null,
  selectedCameraId: null,
  // Seed Recent Events with the busiest camera so the feed isn't empty on load.
  displayedCameraIds: [mockSceneStore.getBusiestCameraId() ?? 'ITICM_BMAMI0080'],
  layers: {
    // Default first load to vehicles plus camera coverage. Re-enable other
    // layers from the sidebar when needed.
    vehicles: true,
    people: false,
    boats: false,
    waste: false,
    pets: false,
    cameras: true,
    signals: false,
    zones: false,
    paths: false,
    incidents: false,
    trails: false,
    detections: true,
  },
  basemap: 'streets',
  iconScale: 1,
  clips: mockSceneStore.getMovementClips(),
  lastSavedClipId: null,

  tick: (dtMs) =>
    set((s) => {
      if (s.mode === 'live') {
        if (!s.isPlaying) return {};
        let t = s.simTime + dtMs;
        if (t > SIM_END_MS) t = SIM_START_MS + ((t - SIM_START_MS) % SIM_DURATION_MS);
        return { simTime: t, liveTime: t };
      }
      // Replay mode: the live clock keeps running at 1x in the background.
      const liveTime = Math.min(s.liveTime + dtMs, SIM_END_MS);
      if (!s.isPlaying) return { liveTime };
      const span = Math.max(s.replayEnd - s.replayStart, 1000);
      let t = s.simTime + dtMs * s.speed;
      if (t > s.replayEnd) t = s.replayStart + ((t - s.replayStart) % span);
      return { simTime: t, liveTime };
    }),

  setPlaying: (isPlaying) => set({ isPlaying }),

  setSpeed: (speed) => set({ speed }),

  scrubTo: (timeMs) =>
    set((s) => {
      if (s.mode === 'live') {
        // Scrubbing away from the live edge drops into history replay.
        return {
          mode: 'replay',
          activeClipId: null,
          replayStart: SIM_START_MS,
          replayEnd: SIM_END_MS,
          simTime: Math.min(Math.max(timeMs, SIM_START_MS), SIM_END_MS),
        };
      }
      return { simTime: Math.min(Math.max(timeMs, s.replayStart), s.replayEnd) };
    }),

  selectEntity: (selectedEntityId) =>
    set({ selectedEntityId, selectedDetectionKey: null, selectedCameraId: null }),

  selectDetection: (selectedDetectionKey) =>
    set({ selectedDetectionKey, selectedEntityId: null, selectedCameraId: null }),

  selectCamera: (selectedCameraId) =>
    set((s) => ({
      selectedCameraId,
      selectedDetectionKey: null,
      displayedCameraIds:
        selectedCameraId && !s.displayedCameraIds.includes(selectedCameraId)
          ? [...s.displayedCameraIds, selectedCameraId]
          : s.displayedCameraIds,
    })),

  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  setBasemap: (basemap) => set({ basemap }),

  setIconScale: (iconScale) => set({ iconScale: Math.min(Math.max(iconScale, 0.4), 2.5) }),

  saveClip: (reason) => {
    const s = get();
    if (!s.selectedEntityId) return null;
    const endMs = s.simTime;
    const startMs = Math.max(SIM_START_MS, endMs - CLIP_DURATION_MS);
    const clip = mockSceneStore.createMovementClip(s.selectedEntityId, startMs, endMs, reason);
    set({ clips: [...mockSceneStore.getMovementClips()], lastSavedClipId: clip.clip_id });
    return clip;
  },

  playClip: (clipId) => {
    const clip = mockSceneStore.getClipById(clipId);
    if (!clip) return;
    const start = Math.max(toMs(clip.start_time), SIM_START_MS);
    const end = Math.min(toMs(clip.end_time), SIM_END_MS);
    set({
      mode: 'replay',
      activeClipId: clipId,
      replayStart: start,
      replayEnd: end,
      simTime: start,
      isPlaying: true,
      selectedEntityId: clip.entity_id,
      selectedDetectionKey: null,
      selectedCameraId: null,
    });
  },

  backToLive: () =>
    set((s) => ({
      mode: 'live',
      activeClipId: null,
      simTime: s.liveTime,
      replayStart: SIM_START_MS,
      replayEnd: SIM_END_MS,
      isPlaying: true,
      speed: 1,
    })),
}));
