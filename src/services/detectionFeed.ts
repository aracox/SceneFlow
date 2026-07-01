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

export type DetectionBBox = [number, number, number, number];

export interface LiveDetection {
  /** Stable key across cameras: `${camera_id}:${id}`. */
  key: string;
  camera_id: string;
  /** Per-camera track id from YOLO (-1 if the tracker produced none). */
  id: number;
  /** COCO class name, e.g. "car". */
  cls: string;
  /** SceneFlow entity type, e.g. "vehicle". */
  type: string;
  conf: number;
  lat: number;
  lng: number;
  bearing: number;
  distance_m: number;
  /** Source-frame YOLO bbox in [x1, y1, x2, y2] pixels. */
  bbox?: DetectionBBox;
  frame_w: number;
  frame_h: number;
}

type CameraSnapshot = {
  ts: number; // detector epoch seconds
  frame_w: number;
  frame_h: number;
  objects: Array<Omit<LiveDetection, 'key' | 'camera_id' | 'frame_w' | 'frame_h'>>;
};

interface SnapshotMessage {
  type: 'snapshot';
  stale_after_s: number;
  cameras: Record<string, CameraSnapshot>;
}

export type FeedStatus = 'connecting' | 'open' | 'closed';

type Listener = (detections: LiveDetection[]) => void;
type StatusListener = (status: FeedStatus) => void;

const DEFAULT_URL = 'ws://localhost:8000/ws';
const WS_URL =
  (import.meta.env.VITE_DETECTOR_WS as string | undefined)?.trim() || DEFAULT_URL;

class DetectionFeed {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private latest: LiveDetection[] = [];
  private status: FeedStatus = 'closed';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refCount = 0;

  /** The most recent detections (possibly empty). */
  getLatest(): LiveDetection[] {
    return this.latest;
  }

  getStatus(): FeedStatus {
    return this.status;
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
    const staleAfter = msg.stale_after_s ?? 3;
    const out: LiveDetection[] = [];
    for (const [cameraId, snap] of Object.entries(msg.cameras)) {
      if (nowS - snap.ts > staleAfter) continue; // camera went quiet
      for (const obj of snap.objects) {
        out.push({
          ...obj,
          key: `${cameraId}:${obj.id}`,
          camera_id: cameraId,
          frame_w: snap.frame_w,
          frame_h: snap.frame_h,
        });
      }
    }
    this.emit(out);
  }

  private emit(detections: LiveDetection[]): void {
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
