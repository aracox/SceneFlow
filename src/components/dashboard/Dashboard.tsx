import { useEffect, useMemo, useState } from 'react';
import { mockSceneStore } from '../../services/mockSceneStore';
import { detectionFeed, type FeedStatus, type LiveDetection } from '../../services/detectionFeed';
import { useSceneStore } from '../../store/sceneStore';
import type { SceneEvent } from '../../types/scene';

interface DashboardProps {
  onOpenMap: () => void;
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function statusText(status: FeedStatus): string {
  switch (status) {
    case 'open':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'closed':
      return 'Offline';
    default:
      return 'Unknown';
  }
}

function statusClass(status: FeedStatus): string {
  switch (status) {
    case 'open':
      return 'bg-emerald-50 text-emerald-700';
    case 'connecting':
      return 'bg-amber-50 text-amber-700';
    case 'closed':
      return 'bg-red-50 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function severityClass(severity: SceneEvent['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 text-red-700';
    case 'warning':
      return 'bg-amber-50 text-amber-700';
    case 'info':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function severityAccentClass(severity: SceneEvent['severity']): string {
  switch (severity) {
    case 'critical':
      return 'border-l-red-500 bg-red-50/60';
    case 'warning':
      return 'border-l-amber-400 bg-amber-50/60';
    case 'info':
      return 'border-l-blue-500 bg-blue-50/60';
    default:
      return 'border-l-emerald-400 bg-slate-50';
  }
}

export default function Dashboard({ onOpenMap }: DashboardProps) {
  const simSec = useSceneStore((s) => Math.floor(s.simTime / 1000));
  const clips = useSceneStore((s) => s.clips);
  const [detections, setDetections] = useState<LiveDetection[]>(() => detectionFeed.getLatest());
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(() => detectionFeed.getStatus());

  useEffect(() => {
    const unsubscribe = detectionFeed.subscribe(setDetections);
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const unsubscribe = detectionFeed.subscribeStatus(setFeedStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  const simMs = simSec * 1000;
  const liveEntities = mockSceneStore.getLiveEntities(simMs);
  const cameras = mockSceneStore.getCameras();
  const events = mockSceneStore.getEventsBefore(simMs, 8);

  const detectionByCamera = useMemo(() => {
    const grouped = new Map<string, LiveDetection[]>();
    for (const detection of detections) {
      const group = grouped.get(detection.camera_id) ?? [];
      group.push(detection);
      grouped.set(detection.camera_id, group);
    }
    return grouped;
  }, [detections]);

  const mockVehicleCount = liveEntities.filter((item) => item.entity.entity_type === 'vehicle').length;
  const detectorVehicleCount = detections.filter((detection) => detection.type === 'vehicle').length;
  const vehicleCount = mockVehicleCount + detectorVehicleCount;
  const incidentCount = liveEntities.filter((item) => item.entity.entity_type === 'incident_object').length;
  const onlineCameras = cameras.filter((camera) => camera.status === 'online').length;
  const liveDetectionCameras = [...detectionByCamera.values()].filter((group) => group.length > 0).length;

  if (cameras.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-slate-950">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">No camera records are loaded.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-white p-[18px]">
      <section className="mb-5 overflow-hidden rounded-3xl bg-slate-50 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-blue-500 to-sky-500 px-6 py-5 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">SceneFlow Ops</p>
            <h1 className="mt-1 text-[32px] font-bold leading-10">Dashboard</h1>
          </div>
          <div className="min-h-11 rounded-full bg-white/15 px-4 py-2 font-mono text-[13px] text-white ring-1 ring-white/25">
            {formatTime(simMs)}
          </div>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-4 gap-[18px]">
        <div className="rounded-2xl bg-slate-50 p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="mb-3 h-1.5 w-12 rounded-full bg-emerald-400" />
          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Live Vehicles</p>
          <p className="mt-2 text-[32px] font-bold leading-10 tabular-nums text-slate-950">{vehicleCount}</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            {mockVehicleCount} mock + {detectorVehicleCount} detector
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="mb-3 h-1.5 w-12 rounded-full bg-blue-500" />
          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Detector Status</p>
          <div className="mt-3 flex min-h-11 items-center gap-2">
            <span className={`rounded-full px-[14px] py-1.5 text-[12px] font-medium ${statusClass(feedStatus)}`}>
              {statusText(feedStatus)}
            </span>
            <span className="text-[15px] tabular-nums text-slate-700">{detections.length} objects</span>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">{liveDetectionCameras} cameras reporting</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="mb-3 h-1.5 w-12 rounded-full bg-sky-400" />
          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Camera Fleet</p>
          <p className="mt-2 text-[32px] font-bold leading-10 tabular-nums text-slate-950">
            {onlineCameras} / {cameras.length}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">Online cameras</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="mb-3 h-1.5 w-12 rounded-full bg-[#F97171]" />
          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Open Issues</p>
          <p className="mt-2 text-[32px] font-bold leading-10 tabular-nums text-[#F97171]">{incidentCount}</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">Active incident objects</p>
        </div>
      </section>

      <section className="grid grid-cols-[1fr_320px] gap-[18px]">
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-[18px] py-4">
            <div>
              <h2 className="text-xl font-semibold leading-7 text-slate-950">Recent Events</h2>
              <p className="text-[13px] leading-5 text-slate-500">Mock operational events from the scene timeline</p>
            </div>
            <span className="rounded-full bg-blue-50 px-[14px] py-1.5 font-mono text-[13px] text-blue-700">
              {formatTime(simMs)}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <div
                key={event.event_id}
                className={`min-h-[52px] border-l-[3px] px-[18px] py-3 ${severityAccentClass(event.severity)}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-[14px] py-1.5 text-[12px] font-medium uppercase ${severityClass(event.severity)}`}>
                    {event.severity}
                  </span>
                  <span className="font-mono text-[13px] text-slate-400">
                    {formatTime(Date.parse(event.observed_at))}
                  </span>
                </div>
                <p className="text-[15px] leading-6 text-slate-700">{event.message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-[18px]">
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-slate-100">
            <div className="border-b border-slate-100 bg-slate-50 px-[18px] py-4">
              <h2 className="text-xl font-semibold leading-7 text-slate-950">Dashboard Actions</h2>
              <p className="text-[13px] leading-5 text-slate-500">Open operational views</p>
            </div>
            <div className="p-[18px]">
              <button
                type="button"
                onClick={onOpenMap}
                className="min-h-12 w-full rounded-full bg-blue-500 px-6 text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition duration-300 active:scale-[0.98] active:bg-blue-600"
              >
                Open map
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <h2 className="border-b border-slate-200 pb-3 text-xl font-semibold leading-7 text-slate-950">
              Replay Clips
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[32px] font-bold leading-10 tabular-nums text-slate-950">{clips.length}</p>
                <p className="text-[13px] leading-5 text-slate-500">Saved clips</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[32px] font-bold leading-10 tabular-nums text-[#F97171]">
                  {clips.filter((clip) => clip.clip_type === 'incident').length}
                </p>
                <p className="text-[13px] leading-5 text-slate-500">Incident clips</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
