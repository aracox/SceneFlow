/**
 * Live detection feed: a singleton WebSocket client that connects to the Python
 * YOLO detector service (see detector/server.py) and exposes the latest
 * ground-projected detections from the Taksin Bridge cameras.
 *
 * Detections arrive over the wire already converted to lat/lng (cone projection
 * in the detector), so consumers just draw them. This is the only live external
 * data path in the app; everything else is mock. Following the app's
 * performance pattern, the map layer subscribes here and mutates MapLibre
 * imperatively rather than going through React state.
 */

import { DETECTOR_HTTP_BASE, DETECTOR_WS_URL } from '../config';

export type DetectionBBox = [number, number, number, number];

export interface LiveDetection {
  /** Stable key across cameras: `${camera_id}:${id}`. */
  key: string;
  camera_id: string;
  /** Per-camera track id from YOLO (-1 if the tracker produced none). */
  id: number;
  /** COCO class name, e.g. "car". */
  cls: string;
  /** SCENE FLOW entity type, e.g. "vehicle". */
  type: string;
  conf: number;
  /**
   * Coarse vehicle body color from the detector's color analyst (cars,
   * trucks and buses only), e.g. "red" — one of the fixed car-industry
   * palette names, or absent/"unknown" when sampling was unreliable.
   */
  color?: string;
  lat: number;
  lng: number;
  bearing: number;
  distance_m: number;
  /** 0-based lane index across the carriageway (present when the camera has lane config). */
  lane?: number;
  /** Signed lateral offset from the road centerline, meters (left of travel negative). */
  lane_offset_m?: number;
  /** Center of the detected lane, same sign convention as lane_offset_m. */
  lane_center_offset_m?: number;
  /** Source-frame YOLO bbox in [x1, y1, x2, y2] pixels. */
  bbox?: DetectionBBox;
  /** Small JPEG data URL cropped from the source frame around the object. */
  crop_image?: string;
  frame_w: number;
  frame_h: number;
  /**
   * Server-side content time of the frame (program-date-time based for
   * cache-relay cameras; wall-clock at inference otherwise), in seconds.
   */
  ts: number;
}

type CameraSnapshot = {
  ts: number; // detector epoch seconds
  frame_w: number;
  frame_h: number;
  /** Per-camera stale window override (detector/cameras.json stale_after_s). */
  stale_after_s?: number;
  /** PROGRAM-DATE-TIME-based content time of the frame (cache-relay cameras only). */
  content_ts?: number;
  objects: Array<Omit<LiveDetection, 'key' | 'camera_id' | 'frame_w' | 'frame_h' | 'ts'>>;
};

interface SnapshotMessage {
  type: 'snapshot';
  stale_after_s: number;
  cameras: Record<string, CameraSnapshot>;
}

interface HistoryMessage {
  detections: LiveDetection[];
}

export type FeedStatus = 'connecting' | 'open' | 'closed';

type Listener = (detections: LiveDetection[]) => void;
type StatusListener = (status: FeedStatus) => void;

const WS_URL = DETECTOR_WS_URL;
const HTTP_URL = DETECTOR_HTTP_BASE || (WS_URL ? historyUrlFromWs(WS_URL) : '');

function historyUrlFromWs(wsUrl: string): string {
  const url = new URL(wsUrl, window.location.href);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/history';
  url.search = '';
  url.hash = '';
  return url.toString();
}

class DetectionFeed {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private latest: LiveDetection[] = [];
  private lastByKey = new Map<string, LiveDetection>();
  private status: FeedStatus = 'closed';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refCount = 0;

  /** The most recent detections (possibly empty). */
  getLatest(): LiveDetection[] {
    return this.latest;
  }

  getLastKnown(key: string): LiveDetection | undefined {
    return this.lastByKey.get(key);
  }

  getStatus(): FeedStatus {
    return this.status;
  }

  async fetchHistoryAt(atMs: number, toleranceS = 0.45): Promise<LiveDetection[]> {
    if (!HTTP_URL) return [];
    const url = new URL(HTTP_URL, window.location.href);
    url.searchParams.set('at_s', String(atMs / 1000));
    url.searchParams.set('tolerance_s', String(toleranceS));
    const response = await fetch(url);
    if (!response.ok) return [];
    const msg = (await response.json()) as HistoryMessage;
    const detections = msg.detections
      .filter((detection) => detection.type === 'vehicle')
      .map((detection) => ({
        ...detection,
        key: detection.key ?? `${detection.camera_id}:${detection.id}`,
      }));
    for (const detection of detections) {
      this.lastByKey.set(detection.key, detection);
    }
    return detections;
  }

  /** Subscribe to detection updates; connects on first subscriber. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.latest);
    this.retain();
    return () => {
      this.listeners.delete(listener);
      this.release();
    };
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private retain(): void {
    this.refCount += 1;
    if (this.refCount === 1) this.connect();
  }

  private release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.disconnect();
  }

  private connect(): void {
    if (this.socket) return;
    if (!WS_URL) {
      this.setStatus('closed');
      return;
    }
    this.setStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => this.setStatus('open');
    socket.onmessage = (ev) => this.handleMessage(ev.data);
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      this.socket = null;
      this.setStatus('closed');
      this.emit([]); // clear stale markers while disconnected
      if (this.refCount > 0) this.scheduleReconnect();
    };
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('closed');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.refCount === 0) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private handleMessage(data: string): void {
    let msg: SnapshotMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type !== 'snapshot') return;

    const nowS = Date.now() / 1000;
    const out: LiveDetection[] = [];
    for (const [cameraId, snap] of Object.entries(msg.cameras)) {
      const staleAfter = snap.stale_after_s ?? msg.stale_after_s ?? 3;
      if (nowS - snap.ts > staleAfter) continue; // camera went quiet (wall time)
      for (const obj of snap.objects) {
        if (obj.type !== 'vehicle') continue;
        out.push({
          ...obj,
          key: `${cameraId}:${obj.id}`,
          camera_id: cameraId,
          frame_w: snap.frame_w,
          frame_h: snap.frame_h,
          ts: snap.content_ts ?? snap.ts,
        });
      }
    }
    this.emit(out);
  }

  private emit(detections: LiveDetection[]): void {
    for (const detection of detections) {
      this.lastByKey.set(detection.key, detection);
    }
    this.latest = detections;
    for (const l of this.listeners) l(detections);
  }

  private setStatus(status: FeedStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }
}

export const detectionFeed = new DetectionFeed();
