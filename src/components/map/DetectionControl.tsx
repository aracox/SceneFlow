import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { detectionFeed, type FeedStatus } from '../../services/detectionFeed';
import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

// Cameras the detector runs live detection on. The jump button opens a picker
// over these; both sit well outside the default scene center.
const LIVE_DETECTION_CAMERAS: Array<{ id: string; label: string }> = [
  { id: 'DOH-PER-4-016', label: 'Chaengwattana Rd · Pak Kret' },
  { id: 'ITICM_BMAMI0080', label: 'Taksin Bridge · Sathon' },
  { id: 'ITICM_BMAMI0072', label: 'Rama IV Rd · Khlong Toei' },
];

const STATUS_LABEL: Record<FeedStatus, string> = {
  connecting: 'Detector: connecting…',
  open: 'Detector: live',
  closed: 'Detector: offline',
};

const STATUS_DOT: Record<FeedStatus, string> = {
  connecting: 'bg-amber-400 animate-pulse',
  open: 'bg-emerald-400 animate-pulse',
  closed: 'bg-slate-400',
};

/** Floating control: feed status + a button that flies to the live detections. */
export default function DetectionControl({ map }: { map: maplibregl.Map }) {
  const [status, setStatus] = useState<FeedStatus>(detectionFeed.getStatus());
  const [count, setCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const detectionsOn = useSceneStore((s) => s.layers.detections);
  const selectCamera = useSceneStore((s) => s.selectCamera);

  useEffect(() => detectionFeed.subscribeStatus(setStatus), []);
  useEffect(() => detectionFeed.subscribe((d) => setCount(d.length)), []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!controlRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpen]);

  if (!detectionsOn) return null;

  const jumpToCamera = (cameraId: string) => {
    setPickerOpen(false);
    const cam = mockSceneStore.getCameraById(cameraId);
    if (!cam) return;
    selectCamera(cameraId);
    map.flyTo({ center: [cam.lng, cam.lat], zoom: 16, duration: 1200 });
  };

  return (
    <div
      ref={controlRef}
      className="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] shadow-sm ring-1 ring-slate-200"
    >
      <span className="flex items-center gap-1.5 font-medium text-slate-600">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
        {STATUS_LABEL[status]}
        {status === 'open' && (
          <span className="text-slate-400">· {count} object{count === 1 ? '' : 's'}</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setPickerOpen((open) => !open)}
        className="rounded bg-brand-600 px-2 py-0.5 font-medium text-white hover:bg-brand-700"
      >
        Jump to live detections
      </button>
      {pickerOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-slate-200">
          {LIVE_DETECTION_CAMERAS.map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => jumpToCamera(cam.id)}
              className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-brand-50"
            >
              <span className="font-medium text-slate-700">{cam.id}</span>
              <span className="text-[10px] text-slate-400">{cam.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
