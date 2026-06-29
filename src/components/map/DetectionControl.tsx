import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { detectionFeed, type FeedStatus } from '../../services/detectionFeed';
import { mockSceneStore } from '../../services/mockSceneStore';
import { useSceneStore } from '../../store/sceneStore';

// The Taksin Bridge camera the detector runs on. The live detections land here,
// ~3 km from the default scene center, so this button flies there.
const DETECTION_CAMERA_IDS = ['ITICM_BMAMI0080'];

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
  const detectionsOn = useSceneStore((s) => s.layers.detections);

  useEffect(() => detectionFeed.subscribeStatus(setStatus), []);
  useEffect(() => detectionFeed.subscribe((d) => setCount(d.length)), []);

  if (!detectionsOn) return null;

  const flyToDetections = () => {
    const cams = DETECTION_CAMERA_IDS.map((id) => mockSceneStore.getCameraById(id)).filter(
      (c): c is NonNullable<typeof c> => Boolean(c),
    );
    if (cams.length === 0) return;
    const bounds = new maplibregl.LngLatBounds(
      [cams[0].lng, cams[0].lat],
      [cams[0].lng, cams[0].lat],
    );
    for (const c of cams) bounds.extend([c.lng, c.lat]);
    map.fitBounds(bounds, { padding: 160, duration: 1200, maxZoom: 18 });
  };

  return (
    <div className="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] shadow-sm ring-1 ring-slate-200">
      <span className="flex items-center gap-1.5 font-medium text-slate-600">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
        {STATUS_LABEL[status]}
        {status === 'open' && (
          <span className="text-slate-400">· {count} object{count === 1 ? '' : 's'}</span>
        )}
      </span>
      <button
        type="button"
        onClick={flyToDetections}
        className="rounded bg-brand-600 px-2 py-0.5 font-medium text-white hover:bg-brand-700"
      >
        Jump to live detections
      </button>
    </div>
  );
}
