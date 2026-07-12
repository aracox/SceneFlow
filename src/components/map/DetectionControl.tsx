import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { detectionFeed, type FeedStatus } from '../../services/detectionFeed';
import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';
import { DETECTOR_WS_URL } from '../../config';

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
  const detectorConfigured = DETECTOR_WS_URL.length > 0;
  const [status, setStatus] = useState<FeedStatus>(detectionFeed.getStatus());
  const [count, setCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const detectionsOn = useSceneStore((s) => s.layers.detections);
  const selectCamera = useSceneStore((s) => s.selectCamera);

  useEffect(() => {
    if (!detectorConfigured) return undefined;
    return detectionFeed.subscribeStatus(setStatus);
  }, [detectorConfigured]);

  useEffect(() => {
    if (!detectorConfigured) return undefined;
    return detectionFeed.subscribe((d) => setCount(d.length));
  }, [detectorConfigured]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!controlRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpen]);

  if (!detectionsOn) return null;

  const statusLabel = detectorConfigured ? STATUS_LABEL[status] : 'Live video only';
  const statusDot = detectorConfigured ? STATUS_DOT[status] : 'bg-blue-400';
  const jumpLabel = detectorConfigured ? 'Jump to live detections' : 'Jump to live cameras';

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
      className="absolute left-[18px] top-[18px] flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-[13px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-slate-100 backdrop-blur"
    >
      <span className="flex min-h-9 items-center gap-2 font-medium text-slate-600">
        <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
        {statusLabel}
        {detectorConfigured && status === 'open' && (
          <span className="text-slate-400">· {count} object{count === 1 ? '' : 's'}</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setPickerOpen((open) => !open)}
        className="min-h-11 rounded-full bg-blue-500 px-[18px] font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition active:bg-blue-600"
      >
        {jumpLabel}
      </button>
      {pickerOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-slate-100">
          {LIVE_DETECTION_CAMERAS.map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => jumpToCamera(cam.id)}
              className="flex min-h-[52px] w-full flex-col justify-center px-[18px] text-left active:bg-blue-50"
            >
              <span className="text-[13px] font-medium text-slate-700">{cam.id}</span>
              <span className="text-[12px] text-slate-400">{cam.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
