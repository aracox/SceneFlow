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
  const [collapsed, setCollapsed] = useState(false);
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

  const collapseControl = () => {
    setPickerOpen(false);
    setCollapsed(true);
  };

  return (
    <div
      ref={controlRef}
      className={`absolute left-[18px] top-[18px] flex items-center gap-2 border border-slate-200/80 bg-white/95 text-[13px] shadow-[0_18px_48px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/60 transition-all duration-300 ${
        collapsed ? 'rounded-full px-3 py-2' : 'rounded-3xl px-3 py-2'
      }`}
    >
      {collapsed ? (
        <>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand detector control"
            title="Expand detector control"
            className="flex min-h-9 items-center gap-2 rounded-full px-1.5 pr-2 font-medium text-slate-600 transition active:scale-[0.98]"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
            Detector
            {detectorConfigured && status === 'open' && (
              <span className="text-slate-400">{count}</span>
            )}
            <svg className="h-4 w-4 text-slate-500" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      ) : (
        <>
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
            className="min-h-11 rounded-full bg-blue-500/95 px-[18px] font-medium text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] transition active:bg-blue-600"
          >
            {jumpLabel}
          </button>
          <button
            type="button"
            onClick={collapseControl}
            aria-label="Collapse detector control"
            title="Collapse detector control"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-slate-500 shadow-sm ring-1 ring-white/60 transition hover:bg-white/95 hover:text-slate-700 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 4 6 8l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-white bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70">
              {LIVE_DETECTION_CAMERAS.map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => jumpToCamera(cam.id)}
                  className="flex min-h-[52px] w-full flex-col justify-center border-b border-slate-100 bg-white px-[18px] text-left transition last:border-b-0 hover:bg-blue-50 active:bg-blue-100"
                >
                  <span className="text-[13px] font-medium text-slate-700">{cam.id}</span>
                  <span className="text-[12px] text-slate-400">{cam.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
