import type { Camera } from '../../types/scene';
import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

const STATUS_DOT: Record<Camera['status'], string> = {
  online: 'bg-emerald-400',
  warning: 'bg-amber-400',
  offline: 'bg-slate-400',
};

function FeedPlaceholder({ camera, timeMs }: { camera: Camera; timeMs: number }) {
  return (
    <div className="camera-feed relative aspect-video overflow-hidden rounded-md border border-slate-300 bg-slate-800">
      <div className="absolute left-2 top-1.5 flex items-center gap-1.5 text-[10px] font-medium text-white/90">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[camera.status]}`} />
        {camera.camera_id}
      </div>
      {camera.status !== 'offline' ? (
        <div className="absolute right-2 top-1.5 flex items-center gap-1 text-[10px] font-semibold text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC
        </div>
      ) : (
        <div className="absolute right-2 top-1.5 text-[10px] font-semibold text-slate-400">
          OFFLINE
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium tracking-wide text-white/40">
        MOCK FEED — NO VIDEO
      </div>
      <div className="absolute bottom-1.5 left-2 truncate pr-16 text-[10px] text-white/60">
        {camera.name}
      </div>
      <div className="absolute bottom-1.5 right-2 font-mono text-[10px] tabular-nums text-white/70">
        {new Date(timeMs).toLocaleTimeString('en-GB', { hour12: false })}
      </div>
    </div>
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
  for (const camera of cameras) {
    if (picked.length >= 2) break;
    if (camera.status === 'online') add(camera);
  }

  return (
    <section className="border-b border-slate-200 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Camera Feeds
      </h2>
      <div className="space-y-2">
        {picked.slice(0, 2).map((camera) => (
          <FeedPlaceholder key={camera.camera_id} camera={camera} timeMs={simSec * 1000} />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Placeholder feeds only — this prototype uses no real camera streams.
      </p>
    </section>
  );
}
