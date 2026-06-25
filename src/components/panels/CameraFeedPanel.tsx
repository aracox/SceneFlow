import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { Camera } from '../../types/scene';
import { mockSceneStore } from '../../services/mockSceneStore';
import { cameraStreams } from '../../data/realCameraStreams';
import { useSceneStore } from '../../store/sceneStore';

// Camera shown by default on start/refresh when nothing is selected.
const DEFAULT_CAMERA_ID = 'ITICM_BMAMI0081';

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
  badge: React.ReactNode;
  children: React.ReactNode;
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

const MockCenter = (
  <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium tracking-wide text-white/40">
    MOCK FEED — NO VIDEO
  </div>
);

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
 * HLS natively). Falls back to the placeholder if the camera has no mapped
 * stream or playback hits a fatal error.
 */
function LiveFeed({ camera, timeMs }: { camera: Camera; timeMs: number }) {
  const src = cameraStreams[camera.camera_id];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!src || !video) return;
    setFailed(false);

    // Safari / iOS play HLS natively; everyone else needs hls.js.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {});
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      setFailed(true);
      return;
    }

    const hls = new Hls({ liveDurationInfinity: true, lowLatencyMode: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) setFailed(true);
    });
    return () => hls.destroy();
  }, [src]);

  if (!src || failed) return <FeedPlaceholder camera={camera} timeMs={timeMs} />;

  return (
    <FeedFrame camera={camera} timeMs={timeMs} badge={LiveBadge}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
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
