import { create } from 'zustand';
import type { Entity, MovementClip } from '../types/scene';
import {
  CLIP_DURATION_MS,
  LIVE_START_MS,
  SIM_DURATION_MS,
  SIM_END_MS,
  SIM_START_MS,
} from '../data/simWindow';
import {
  MOCK_ACCIDENT_REPLAY_END_MS,
  MOCK_ACCIDENT_REPLAY_START_MS,
  MOCK_ACCIDENT_VEHICLE_IDS,
} from '../data/mockAccident';
import { INITIAL_MAP_CENTER } from '../services/geometryUtils';
import { mockSceneStore } from '../services/mockSceneStore';
import { toMs } from '../services/replayEngine';
import type {
  NamtangLiveBus,
  NamtangNearbyStop,
  NamtangPassingTrip,
} from '../services/namtangNearby';
import type {
  HeatmapComparison,
  HeatmapDisplayStyle,
  HeatmapMetric,
  HeatmapPeriod,
  HeatmapTimeMode,
} from '../data/heatmap';

const LIVE_REPLAY_WINDOW_MS = 10 * 60 * 1000;

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
  | 'piers'
  | 'detections'
  | 'buses'
  | 'busStops';

export type PlaybackSpeed = 1 | 2 | 4 | 8;

/** Basemap under the GeoJSON overlays. 'mock' is the offline custom basemap. */
export type Basemap = 'mock' | 'satellite' | 'streets';

export interface MapCenter {
  lat: number;
  lng: number;
}

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
  /** Selected DDS water-level CCTV camera (see src/data/waterLevelCameras.ts). */
  selectedWaterCameraId: string | null;
  /** Current visible map center in WGS84 coordinates. */
  mapCenter: MapCenter;
  /** Namtang stops fetched around the current map center. */
  nearbyBusStops: NamtangNearbyStop[];
  selectedNearbyBusStopId: number | null;
  selectedNearbyLiveBusId: string | null;
  nearbyPassingTripsByStopId: Record<number, NamtangPassingTrip[]>;
  /** Live Namtang GPS vehicles for routes passing nearby stops. */
  nearbyLiveBuses: NamtangLiveBus[];
  /** Cameras whose events appear in Recent Events; grows as cameras are selected. */
  displayedCameraIds: string[];
  layers: Record<LayerKey, boolean>;
  basemap: Basemap;
  /** Global multiplier for entity icon size (1 = default). */
  iconScale: number;
  clips: MovementClip[];
  lastSavedClipId: string | null;
  panelFocusSeq: number;
  selectedHeatmapMetric: HeatmapMetric;
  heatmapTimeMode: HeatmapTimeMode;
  selectedHeatmapPeriod: HeatmapPeriod;
  selectedHotspotId: string | null;
  heatmapComparison: HeatmapComparison;
  heatmapDisplayStyle: HeatmapDisplayStyle;
  heatmapLastUpdatedAt: string;
  selectedSite: string;
  selectedZone: string;

  tick: (dtMs: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  startReplay: () => void;
  playAccidentReplay: () => void;
  scrubTo: (timeMs: number) => void;
  selectEntity: (entityId: string | null) => void;
  selectDetection: (detectionKey: string | null, cameraId?: string | null) => void;
  selectCamera: (cameraId: string | null) => void;
  selectWaterCamera: (cameraId: string | null) => void;
  setMapCenter: (center: MapCenter) => void;
  setNearbyBusStops: (stops: NamtangNearbyStop[]) => void;
  selectNearbyBusStop: (stopId: number | null) => void;
  selectNearbyLiveBus: (busId: string | null) => void;
  setNearbyPassingTripsByStopId: (tripsByStopId: Record<number, NamtangPassingTrip[]>) => void;
  setNearbyLiveBuses: (buses: NamtangLiveBus[]) => void;
  toggleLayer: (key: LayerKey) => void;
  setLayer: (key: LayerKey, visible: boolean) => void;
  setBasemap: (basemap: Basemap) => void;
  setIconScale: (scale: number) => void;
  saveClip: (reason?: string) => MovementClip | null;
  playClip: (clipId: string) => void;
  backToLive: () => void;
  setSelectedHeatmapMetric: (metric: HeatmapMetric) => void;
  setHeatmapTimeMode: (mode: HeatmapTimeMode) => void;
  setSelectedHeatmapPeriod: (period: HeatmapPeriod) => void;
  setSelectedHotspotId: (hotspotId: string | null) => void;
  setHeatmapComparison: (comparison: HeatmapComparison) => void;
  setHeatmapDisplayStyle: (style: HeatmapDisplayStyle) => void;
  refreshHeatmap: () => void;
  setSelectedSite: (siteId: string) => void;
  setSelectedZone: (zoneId: string) => void;
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
  selectedWaterCameraId: null,
  mapCenter: { lat: INITIAL_MAP_CENTER.lat, lng: INITIAL_MAP_CENTER.lng },
  nearbyBusStops: [],
  selectedNearbyBusStopId: null,
  selectedNearbyLiveBusId: null,
  nearbyPassingTripsByStopId: {},
  nearbyLiveBuses: [],
  // Seed Recent Events with the busiest camera so the feed isn't empty on load.
  displayedCameraIds: [mockSceneStore.getBusiestCameraId() ?? 'ITICM_BMAMI0080'],
  layers: {
    // Default first load to the core operational layers. Re-enable other
    // layers from the sidebar when needed.
    vehicles: true,
    people: true,
    boats: false,
    waste: false,
    pets: false,
    cameras: true,
    signals: true,
    zones: false,
    paths: false,
    incidents: true,
    trails: false,
    piers: false,
    detections: true,
    buses: false,
    busStops: false,
  },
  basemap: 'streets',
  iconScale: 1,
  clips: mockSceneStore.getMovementClips(),
  lastSavedClipId: null,
  panelFocusSeq: 0,
  selectedHeatmapMetric: 'traffic',
  heatmapTimeMode: 'live',
  selectedHeatmapPeriod: 'today',
  selectedHotspotId: null,
  heatmapComparison: 'normal-baseline',
  heatmapDisplayStyle: 'density',
  heatmapLastUpdatedAt: new Date().toISOString(),
  selectedSite: 'all-sites',
  selectedZone: 'all-zones',

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

  startReplay: () =>
    set((s) => {
      const replayEnd = Math.min(Math.max(s.liveTime, SIM_START_MS), SIM_END_MS);
      const replayStart = Math.max(SIM_START_MS, replayEnd - LIVE_REPLAY_WINDOW_MS);
      return {
        mode: 'replay',
        activeClipId: null,
        replayStart,
        replayEnd,
        simTime: replayEnd,
        isPlaying: false,
        speed: 1,
      };
    }),

  playAccidentReplay: () =>
    set((s) => ({
      mode: 'replay',
      activeClipId: null,
      replayStart: Math.max(SIM_START_MS, MOCK_ACCIDENT_REPLAY_START_MS),
      replayEnd: Math.min(SIM_END_MS, MOCK_ACCIDENT_REPLAY_END_MS),
      simTime: Math.max(SIM_START_MS, MOCK_ACCIDENT_REPLAY_START_MS),
      isPlaying: true,
      speed: 1,
      selectedEntityId: MOCK_ACCIDENT_VEHICLE_IDS[0],
      selectedDetectionKey: null,
      selectedCameraId: null,
      layers: {
        ...s.layers,
        vehicles: true,
        people: true,
        incidents: true,
      },
    })),

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
    set((s) => ({
      selectedEntityId,
      selectedDetectionKey: null,
      selectedCameraId: selectedEntityId ? null : s.selectedCameraId,
      selectedNearbyBusStopId: null,
      selectedNearbyLiveBusId: null,
      panelFocusSeq: s.panelFocusSeq + 1,
    })),

  selectDetection: (selectedDetectionKey, cameraId) =>
    set((s) => ({
      selectedDetectionKey,
      selectedEntityId: null,
      selectedCameraId: cameraId ?? s.selectedCameraId,
      selectedNearbyBusStopId: null,
      selectedNearbyLiveBusId: null,
      panelFocusSeq: s.panelFocusSeq + 1,
    })),

  selectCamera: (selectedCameraId) =>
    set((s) => ({
      selectedCameraId,
      selectedDetectionKey: null,
      panelFocusSeq: s.panelFocusSeq + 1,
      displayedCameraIds:
        selectedCameraId && !s.displayedCameraIds.includes(selectedCameraId)
          ? [...s.displayedCameraIds, selectedCameraId]
          : s.displayedCameraIds,
    })),

  selectWaterCamera: (selectedWaterCameraId) =>
    set((s) => ({ selectedWaterCameraId, panelFocusSeq: s.panelFocusSeq + 1 })),

  setMapCenter: (mapCenter) => set({ mapCenter }),

  setNearbyBusStops: (nearbyBusStops) => set({ nearbyBusStops }),

  selectNearbyBusStop: (selectedNearbyBusStopId) =>
    set((s) => ({
      selectedNearbyBusStopId,
      selectedNearbyLiveBusId: null,
      selectedEntityId: null,
      selectedDetectionKey: null,
      panelFocusSeq: s.panelFocusSeq + 1,
    })),

  selectNearbyLiveBus: (selectedNearbyLiveBusId) =>
    set((s) => ({
      selectedNearbyLiveBusId,
      selectedNearbyBusStopId: null,
      selectedEntityId: null,
      selectedDetectionKey: null,
      panelFocusSeq: s.panelFocusSeq + 1,
    })),

  setNearbyPassingTripsByStopId: (nearbyPassingTripsByStopId) =>
    set({ nearbyPassingTripsByStopId }),

  setNearbyLiveBuses: (nearbyLiveBuses) => set({ nearbyLiveBuses }),

  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  setLayer: (key, visible) =>
    set((s) => ({ layers: { ...s.layers, [key]: visible } })),

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

  setSelectedHeatmapMetric: (selectedHeatmapMetric) =>
    set({ selectedHeatmapMetric, selectedHotspotId: null }),

  setHeatmapTimeMode: (heatmapTimeMode) =>
    set({
      heatmapTimeMode,
      selectedHeatmapPeriod: 'today',
      heatmapLastUpdatedAt: new Date().toISOString(),
    }),

  setSelectedHeatmapPeriod: (selectedHeatmapPeriod) =>
    set({ selectedHeatmapPeriod, selectedHotspotId: null }),

  setSelectedHotspotId: (selectedHotspotId) => set({ selectedHotspotId }),

  setHeatmapComparison: (heatmapComparison) =>
    set({ heatmapComparison, selectedHotspotId: null }),

  setHeatmapDisplayStyle: (heatmapDisplayStyle) => set({ heatmapDisplayStyle }),

  refreshHeatmap: () => set({ heatmapLastUpdatedAt: new Date().toISOString() }),

  setSelectedSite: (selectedSite) =>
    set({ selectedSite, selectedZone: 'all-zones', selectedHotspotId: null }),

  setSelectedZone: (selectedZone) => set({ selectedZone, selectedHotspotId: null }),
}));
