import { useEffect, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import type { Camera } from '../../types/scene';
import { mockSceneStore } from '../../services/mockSceneStore';
import { cameraStreams } from '../../data/realCameraStreams';
import { useSceneStore } from '../../store/sceneStore';
import { detectionFeed, type LiveDetection } from '../../services/detectionFeed';

// Camera shown by default on start/refresh when nothing is selected — the
// live-detection camera.
const DEFAULT_CAMERA_ID = 'ITICM_BMAMI0080';

const DETECTOR_HTTP_BASE =
  (import.meta.env.VITE_DETECTOR_HTTP as string | undefined) ?? 'http://localhost:8000';

// Cameras served from the detector's local cache relay (detector/server.py
// cache_relay_worker): YOLO and the frontend video both consume the same
// re-segmented local HLS stream, so the box overlay can auto-sync to the
// video via hls.js playingDate instead of a hand-tuned fixed delay.
const CACHED_STREAMS: Record<string, true> = { 'DOH-PER-4-016': true };

const STATUS_DOT: Record<Camera['status'], string> = {
  online: 'bg-emerald-400',
  warning: 'bg-amber-400',
  offline: 'bg-slate-400',
};

/** Shared frame chrome: status dot + id, a top-right badge, name, clock. */
function FeedFrame({
  camera,
  timeMs,
  badge,
  children,
}: {
  camera: Camera;
  timeMs: number;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="camera-feed relative aspect-video overflow-hidden rounded-md border border-slate-300 bg-slate-800">
      {children}
      <div className="absolute left-2 top-1.5 flex items-center gap-1.5 text-[10px] font-medium text-white/90">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[camera.status]}`} />
        {camera.camera_id}
      </div>
      {badge}
      <div className="absolute bottom-1.5 left-2 truncate pr-16 text-[10px] text-white/60">
        {camera.name}
      </div>
      <div className="absolute bottom-1.5 right-2 font-mono text-[10px] tabular-nums text-white/70">
        {new Date(timeMs).toLocaleTimeString('en-GB', { hour12: false })}
      </div>
    </div>
  );
}

const RecBadge = (
  <div className="absolute right-2 top-1.5 flex items-center gap-1 text-[10px] font-semibold text-red-400">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC
  </div>
);

const OfflineBadge = (
  <div className="absolute right-2 top-1.5 text-[10px] font-semibold text-slate-400">
    OFFLINE
  </div>
);

const LiveBadge = (
  <div className="absolute right-2 top-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
  </div>
);

const DelayedBadge = (
  <div
    className="absolute right-2 top-1.5 flex items-center gap-1 text-[10px] font-semibold text-amber-400"
    title="~30 s behind real time — served from the local cache relay so YOLO boxes align with the video"
  >
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> DELAYED
  </div>
);

const MockCenter = (
  <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium tracking-wide text-white/40">
    MOCK FEED — NO VIDEO
  </div>
);

function hasDrawableBox(d: LiveDetection): d is LiveDetection & {
  bbox: [number, number, number, number];
} {
  return (
    d.frame_w > 0 &&
    d.frame_h > 0 &&
    Array.isArray(d.bbox) &&
    d.bbox.length === 4 &&
    d.bbox.every(Number.isFinite)
  );
}

type FilteredDetection = LiveDetection & { bbox: [number, number, number, number] };

function getFeedDetections(cameraId: string): FilteredDetection[] {
  return detectionFeed
    .getLatest()
    .filter((d): d is FilteredDetection => d.camera_id === cameraId && hasDrawableBox(d));
}

const MAX_TRIM_S = 10;
const clampTrim = (v: number) => Math.min(MAX_TRIM_S, Math.max(-MAX_TRIM_S, v));

/** Initial per-camera box trim: localStorage override, else 0. */
function readInitialTrim(cameraId: string): number {
  const stored = Number(localStorage.getItem(`sf-box-trim-${cameraId}`));
  return clampTrim(Number.isFinite(stored) ? stored : 0);
}

/**
 * Renders the buffered detection snapshot whose timeline best matches what's
 * currently on screen. When `syncMs` is available (cached-stream cameras),
 * the video and the detector share one clock (same host stamps both the
 * ffmpeg PROGRAM-DATE-TIME and the detection `ts`), so we pick the snapshot
 * whose server timestamp is closest to the video's current playingDate
 * (+ the user's manual trim). Otherwise we fall back to legacy behavior:
 * render the freshest snapshot at least `trimS` seconds old.
 */
function DetectionBoxesOverlay({
  cameraId,
  trimS,
  syncMs,
}: {
  cameraId: string;
  trimS: number;
  syncMs: number | null;
}) {
  const [detections, setDetections] = useState<FilteredDetection[]>(() => getFeedDetections(cameraId));
  // Ring buffer of recent detection snapshots: atMs is arrival (wall-clock)
  // time, tsMs is the server-side frame time the snapshot came from.
  const bufferRef = useRef<Array<{ atMs: number; tsMs: number; items: FilteredDetection[] }>>([]);

  useEffect(() => {
    bufferRef.current = [];

    const unsubscribe = detectionFeed.subscribe((items) => {
      const filtered = items.filter((d): d is FilteredDetection => (
        d.camera_id === cameraId && hasDrawableBox(d)
      ));

      const atMs = performance.now();
      const tsMs = filtered.length > 0 ? Math.max(...filtered.map((d) => d.ts)) * 1000 : Date.now();
      const buffer = bufferRef.current;
      buffer.push({ atMs, tsMs, items: filtered });
      const cutoff = atMs - 30_000;
      while (buffer.length > 0 && buffer[0].atMs < cutoff) buffer.shift();
    });

    const interval = setInterval(() => {
      const buffer = bufferRef.current;
      if (buffer.length === 0) {
        setDetections([]);
        return;
      }

      if (syncMs != null) {
        const target = syncMs + trimS * 1000;
        let closest = buffer[0];
        let closestDiff = Math.abs(closest.tsMs - target);
        for (let i = 1; i < buffer.length; i++) {
          const diff = Math.abs(buffer[i].tsMs - target);
          if (diff < closestDiff) {
            closest = buffer[i];
            closestDiff = diff;
          }
        }
        setDetections(closestDiff <= 5000 ? closest.items : []);
        return;
      }

      const threshold = performance.now() - Math.max(trimS, 0) * 1000;
      let picked: FilteredDetection[] = [];
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].atMs <= threshold) {
          picked = buffer[i].items;
          break;
        }
      }
      setDetections(picked);
    }, 150);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [cameraId, trimS, syncMs]);

  if (detections.length === 0) return null;

  const frame = detections.find((d) => d.frame_w > 0 && d.frame_h > 0);
  if (!frame) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      viewBox={`0 0 ${frame.frame_w} ${frame.frame_h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {detections.map((d) => {
        const [x1, y1, x2, y2] = d.bbox;
        const width = Math.max(1, x2 - x1);
        const height = Math.max(1, y2 - y1);
        return (
          <rect
            key={d.key}
            x={x1}
            y={y1}
            width={width}
            height={height}
            fill="rgba(16,185,129,0.08)"
            stroke="#34d399"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

/** Placeholder tile — used for offline cameras and as the live-feed fallback. */
function FeedPlaceholder({ camera, timeMs }: { camera: Camera; timeMs: number }) {
  return (
    <FeedFrame
      camera={camera}
      timeMs={timeMs}
      badge={camera.status === 'offline' ? OfflineBadge : RecBadge}
    >
      {MockCenter}
    </FeedFrame>
  );
}

/**
 * Live HLS tile. Plays the camera's real iTIC stream via hls.js (Safari plays
 * HLS natively). Cameras in `CACHED_STREAMS` play the detector's local cache
 * relay instead (same re-segmented timeline the YOLO worker reads), falling
 * back to the direct upstream stream if the cache relay is unreachable.
 * Falls back to the placeholder if there's no stream to play or playback of
 * the upstream stream hits a fatal error.
 */
function LiveFeed({ camera, timeMs }: { camera: Camera; timeMs: number }) {
  const upstreamSrc = cameraStreams[camera.camera_id];
  const cachedSrc = CACHED_STREAMS[camera.camera_id]
    ? `${DETECTOR_HTTP_BASE}/cache/${camera.camera_id}/index.m3u8`
    : undefined;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [activeSrc, setActiveSrc] = useState<string | undefined>(cachedSrc ?? upstreamSrc);
  const [failed, setFailed] = useState(false);
  const [trimS, setTrimS] = useState(() => readInitialTrim(camera.camera_id));
  // hls.js playingDate (server-stamped PROGRAM-DATE-TIME of the currently
  // playing fragment), in epoch ms. Drives DetectionBoxesOverlay's auto-sync;
  // stays null on the Safari-native playback path.
  const [syncMs, setSyncMs] = useState<number | null>(null);

  const adjustTrim = (next: number) => {
    const clamped = clampTrim(next);
    setTrimS(clamped);
    localStorage.setItem(`sf-box-trim-${camera.camera_id}`, clamped.toFixed(2));
  };

  // Reset to the cached src (if any) whenever the camera changes.
  useEffect(() => {
    setActiveSrc(cachedSrc ?? upstreamSrc);
  }, [camera.camera_id, cachedSrc, upstreamSrc]);

  useEffect(() => {
    const video = videoRef.current;
    setSyncMs(null);
    if (!activeSrc || !video) return;
    setFailed(false);

    // Prefer hls.js everywhere it works (desktop Safari included): it honors
    // liveSyncDuration and exposes playingDate, both required for the cached
    // streams' box-overlay sync. Native HLS is only the fallback for browsers
    // without MSE (iOS Safari) — Safari's native player picks its own live
    // position (~7 s behind edge), which would desync boxes from the video.
    if (!Hls.isSupported()) {
      if (!video.canPlayType('application/vnd.apple.mpegurl')) {
        setFailed(true);
        return;
      }
      video.src = activeSrc;
      video.play().catch(() => {});
      // Safari exposes the PROGRAM-DATE-TIME anchor via getStartDate();
      // currentTime is relative to it, giving the same clock hls.js's
      // playingDate provides.
      const nativeSync = setInterval(() => {
        const start = (video as HTMLVideoElement & { getStartDate?: () => Date })
          .getStartDate?.();
        const startMs = start?.getTime();
        const next =
          startMs !== undefined && Number.isFinite(startMs)
            ? startMs + video.currentTime * 1000
            : null;
        setSyncMs((prev) => {
          if (prev == null || next == null) return prev === next ? prev : next;
          return Math.abs(next - prev) > 250 ? next : prev;
        });
      }, 500);
      return () => {
        clearInterval(nativeSync);
        video.removeAttribute('src');
        video.load();
      };
    }

    const hls = new Hls({
      liveDurationInfinity: true,
      // Cached-relay streams: hold the same latency behind the local cache edge
      // as the detector's segment reader (cameras.json target_latency_s), so
      // the box overlay's playingDate sync lands near trim 0. liveSyncDuration
      // only takes effect with lowLatencyMode off and a liveMaxLatencyDuration
      // companion — without them hls.js falls back to count-based positioning
      // near the edge (~5 s), ahead of the detector, and boxes can never match.
      ...(cachedSrc && activeSrc === cachedSrc
        ? { lowLatencyMode: false, liveSyncDuration: 19, liveMaxLatencyDuration: 32 }
        : { lowLatencyMode: true }),
    });
    hlsRef.current = hls;
    if (import.meta.env.DEV) {
      // Debug handle for headless sync diagnostics (see docs in repo history).
      (window as unknown as Record<string, unknown>).__sfHls = hls;
    }
    hls.loadSource(activeSrc);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return;
      if (cachedSrc && activeSrc === cachedSrc) {
        // Cache relay unreachable — fall back to the direct upstream stream.
        setActiveSrc(upstreamSrc);
        return;
      }
      setFailed(true);
    });

    const syncInterval = setInterval(() => {
      const next = hls.playingDate?.getTime() ?? null;
      // Discipline cached-stream playback to the same wall-clock rule the
      // detector's segment reader uses (content stamped now - 18 s): hls.js
      // positions itself relative to the playlist EDGE, so any skew in the
      // relay's PROGRAM-DATE-TIME anchor (upstream backlog at relay start,
      // reconnects) would otherwise park the video on content the detector
      // hasn't processed yet — and the box overlay would stay empty.
      if (next != null && cachedSrc && activeSrc === cachedSrc && video.readyState >= 2) {
        const drift = next - (Date.now() - 18_000);
        if (Math.abs(drift) > 2_500) {
          video.currentTime = Math.max(0, video.currentTime - drift / 1000);
          return; // re-read playingDate on the next tick after the seek settles
        }
      }
      setSyncMs((prev) => {
        if (prev == null || next == null) return prev === next ? prev : next;
        return Math.abs(next - prev) > 250 ? next : prev;
      });
    }, 500);

    return () => {
      clearInterval(syncInterval);
      hls.destroy();
      hlsRef.current = null;
    };
  }, [activeSrc, cachedSrc, upstreamSrc]);

  if (!activeSrc || failed) return <FeedPlaceholder camera={camera} timeMs={timeMs} />;

  const isDelayed = cachedSrc !== undefined && activeSrc === cachedSrc;

  return (
    <FeedFrame camera={camera} timeMs={timeMs} badge={isDelayed ? DelayedBadge : LiveBadge}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <DetectionBoxesOverlay cameraId={camera.camera_id} trimS={trimS} syncMs={syncMs} />
      {CACHED_STREAMS[camera.camera_id] && (
        <div className="absolute left-2 top-6 z-20 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white/80 pointer-events-auto">
          <span>sync {trimS >= 0 ? '+' : '−'}{Math.abs(trimS).toFixed(1)}s</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              adjustTrim(trimS - 0.5);
            }}
          >
            −
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              adjustTrim(trimS + 0.5);
            }}
          >
            +
          </button>
        </div>
      )}
    </FeedFrame>
  );
}

export default function CameraFeedPanel() {
  const selectedCameraId = useSceneStore((s) => s.selectedCameraId);
  const selectedEntityId = useSceneStore((s) => s.selectedEntityId);
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));

  const cameras = mockSceneStore.getCameras();
  const picked: Camera[] = [];
  const add = (camera?: Camera) => {
    if (camera && !picked.some((c) => c.camera_id === camera.camera_id)) picked.push(camera);
  };

  add(selectedCameraId ? mockSceneStore.getCameraById(selectedCameraId) : undefined);
  if (selectedEntityId) {
    const state = mockSceneStore.getRenderState(selectedEntityId, simSec * 1000);
    if (state?.source_camera_id) add(mockSceneStore.getCameraById(state.source_camera_id));
  }
  // Default camera shown on start/refresh when nothing is selected.
  add(mockSceneStore.getCameraById(DEFAULT_CAMERA_ID));
  // Prefer online cameras that actually have a mapped live stream.
  for (const camera of cameras) {
    if (picked.length >= 1) break;
    if (camera.status === 'online' && cameraStreams[camera.camera_id]) add(camera);
  }
  for (const camera of cameras) {
    if (picked.length >= 1) break;
    if (camera.status === 'online') add(camera);
  }

  return (
    <section className="border-b border-slate-200 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Camera Feeds
      </h2>
      <div className="space-y-2">
        {picked.slice(0, 1).map((camera) =>
          camera.status === 'offline' ? (
            <FeedPlaceholder key={camera.camera_id} camera={camera} timeMs={simSec * 1000} />
          ) : (
            <LiveFeed key={camera.camera_id} camera={camera} timeMs={simSec * 1000} />
          ),
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Live HLS feed via the iTIC Foundation traffic-camera network.
      </p>
    </section>
  );
}
