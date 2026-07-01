"""
SceneFlow YOLO detector service.

Pulls frames from the two real iTIC HLS camera feeds (ITICM_BMAMI0080 /
ITICM_BMAMI0081 at the foot of Taksin Bridge), runs YOLO-seg with persistent
tracking, projects each detection's foot point from image space onto the ground
("cone projection"), and broadcasts the resulting lat/lng detections over a
WebSocket that the React app consumes.

This is the FIRST piece of SceneFlow that does real inference on real video,
intentionally overriding CLAUDE.md's "no backend / no real camera streams"
rule for the live-detection feature.

Run:
    cd detector
    python3 -m pip install -r requirements.txt      # first time
    python3 server.py                                # serves ws://localhost:8000/ws

Env overrides: HOST, PORT, MODEL, CONF, IMGSZ, INFER_FPS, CAMERAS (path to cameras.json).
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import threading
import time
from pathlib import Path
from typing import Any

# Bound how long an OpenCV/ffmpeg stream read can block, so a stalled HLS feed
# fails fast and the worker reconnects in seconds. Must be set before cv2 opens
# any capture. Values are microseconds.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rw_timeout;5000000|timeout;5000000",
)

import cv2  # type: ignore  # noqa: E402
from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from ultralytics import YOLO  # type: ignore  # noqa: E402

# ── Config ────────────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
CAMERAS_PATH = Path(os.environ.get("CAMERAS", HERE / "cameras.json"))
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
# Try the model the user asked for first; fall back to a current published
# YOLO-seg weight if that name isn't fetchable by the installed ultralytics.
PRIMARY_MODEL = os.environ.get("MODEL", "yolo26s-seg.pt")
FALLBACK_MODEL = "yolo11s-seg.pt"
CONF = float(os.environ.get("CONF", "0.18"))
IMGSZ = int(os.environ.get("IMGSZ", "960"))
INFER_FPS = float(os.environ.get("INFER_FPS", "6"))  # inferences per second per camera
STALE_AFTER_S = 3.0  # clients drop a camera's detections older than this
LANE_SPAN_M = 12.0   # max lateral spread across the road for lane placement

# Same constant the frontend uses (src/services/geometryUtils.ts).
METERS_PER_DEG_LAT = 111_320.0

# COCO class name -> SceneFlow entity type. Unmapped classes are dropped.
CLASS_MAP: dict[str, str] = {
    "car": "vehicle",
    "truck": "vehicle",
    "bus": "vehicle",
    "motorcycle": "vehicle",
    "bicycle": "vehicle",
    "person": "person",
    "dog": "pet",
    "cat": "pet",
    "boat": "boat",
}


def _json_safe(o: Any) -> Any:
    """Fallback for json.dumps: coerce numpy scalars (float32/int64) to Python."""
    if hasattr(o, "item"):
        return o.item()
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def load_config() -> tuple[float, list[dict[str, Any]]]:
    cfg = json.loads(CAMERAS_PATH.read_text())
    cameras = cfg["cameras"]
    # Attach an optional road corridor (real centerline the camera looks down) so
    # detections are projected ALONG the road instead of along a straight bearing.
    for cam in cameras:
        road_path = HERE / f"road_{cam['camera_id']}.json"
        if road_path.exists():
            pts = json.loads(road_path.read_text())  # [[lng, lat], ...]
            cum = [0.0]
            for i in range(1, len(pts)):
                a, b = pts[i - 1], pts[i]
                cum.append(cum[-1] + _haversine(a[0], a[1], b[0], b[1]))
            cam["corridor"] = {"pts": pts, "cum": cum, "total": cum[-1]}
            print(f"[{cam['camera_id']}] road corridor: {len(pts)} pts, {round(cum[-1])} m")
        else:
            cam["corridor"] = None
    return float(cfg.get("near_m", 4)), cameras


def _haversine(a_lng: float, a_lat: float, b_lng: float, b_lat: float) -> float:
    R = 6378137.0
    d_lat = math.radians(b_lat - a_lat)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat))
        * math.sin(math.radians(b_lng - a_lng) / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(h))


def point_along_corridor(corridor: dict[str, Any], distance: float) -> tuple[float, float, float]:
    """Point (lng, lat) and local bearing at `distance` m along the polyline."""
    pts, cum, total = corridor["pts"], corridor["cum"], corridor["total"]
    distance = min(max(distance, 0.0), total)
    # Find the segment containing `distance`.
    lo, hi = 0, len(cum) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cum[mid] < distance:
            lo = mid + 1
        else:
            hi = mid
    i = max(1, lo)
    seg_len = cum[i] - cum[i - 1] or 1e-9
    t = (distance - cum[i - 1]) / seg_len
    a, b = pts[i - 1], pts[i]
    lng = a[0] + (b[0] - a[0]) * t
    lat = a[1] + (b[1] - a[1]) * t
    # Local road bearing (clockwise from north).
    y = math.sin(math.radians(b[0] - a[0])) * math.cos(math.radians(b[1]))
    x = math.cos(math.radians(a[1])) * math.sin(math.radians(b[1])) - math.sin(
        math.radians(a[1])
    ) * math.cos(math.radians(b[1])) * math.cos(math.radians(b[0] - a[0]))
    brg = (math.degrees(math.atan2(y, x)) + 360) % 360
    return lng, lat, brg


def offset_coordinate(lat: float, lng: float, meters_east: float, meters_north: float) -> tuple[float, float]:
    """Mirror of geometryUtils.offsetCoordinate: returns (lat, lng)."""
    out_lat = lat + meters_north / METERS_PER_DEG_LAT
    out_lng = lng + meters_east / (METERS_PER_DEG_LAT * math.cos(math.radians(lat)))
    return out_lat, out_lng


def _roi_points(cam: dict[str, Any], frame_w: int, frame_h: int) -> list[tuple[float, float]]:
    """Camera ROI polygon in source-frame pixels. Config points may be 0..1 normalized or pixels."""
    roi = cam.get("roi_polygon")
    if not roi:
        return []
    points: list[tuple[float, float]] = []
    for point in roi:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            continue
        x = float(point[0])
        y = float(point[1])
        if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0:
            x *= frame_w
            y *= frame_h
        points.append((x, y))
    return points


def _point_in_polygon(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test for image-space ROI filtering."""
    inside = False
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (yi > y) != (yj > y):
            x_at_y = (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
            if x < x_at_y:
                inside = not inside
        j = i
    return inside


def in_detection_roi(cam: dict[str, Any], cx: float, foot_y: float, frame_w: int, frame_h: int) -> bool:
    """
    Keep detections whose bottom-center point lands inside the camera's image ROI.
    The bottom-center is less likely than bbox center to include vehicles in
    adjacent roads when boxes overlap the drivable corridor visually.
    """
    polygon = _roi_points(cam, frame_w, frame_h)
    if len(polygon) < 3:
        return True
    return _point_in_polygon(cx, foot_y, polygon)


def project_to_ground(
    cam: dict[str, Any],
    near_m: float,
    cx: float,
    foot_y: float,
    frame_w: int,
    frame_h: int,
) -> dict[str, float]:
    """
    Vertical foot position -> distance from `near_m` (bottom of frame) to
    `range_m` (top of frame). If the camera has a road corridor, that distance is
    walked ALONG the real road centerline (so detections sit on the curving
    road), with horizontal image position giving a small lane offset. The
    returned bearing is the configured traffic travel direction. Otherwise it
    falls back to a straight cone bearing across the camera FOV.
    """
    u = cx / frame_w                       # 0 left .. 1 right
    depth_frac = 1.0 - (foot_y / frame_h)  # 0 at bottom (near) .. 1 at top (far)
    depth_frac = min(max(depth_frac, 0.0), 1.0)
    distance = near_m + depth_frac * (cam["range_m"] - near_m)
    travel_bearing = cam.get("travel_bearing_deg")

    corridor = cam.get("corridor")
    if corridor:
        base_lng, base_lat, road_brg = point_along_corridor(corridor, distance)
        # Offset perpendicular to the road for the detection's lane (image left
        # = left of travel). LANE_SPAN keeps it within the carriageway width.
        lateral = (u - 0.5) * LANE_SPAN_M
        perp = math.radians(road_brg + 90.0)
        lat, lng = offset_coordinate(
            base_lat, base_lng, math.sin(perp) * lateral, math.cos(perp) * lateral
        )
        bearing = (
            float(travel_bearing)
            if travel_bearing is not None
            else road_brg + float(cam.get("bearing_offset_deg", 0.0))
        )
    else:
        camera_bearing = cam["heading_deg"] + (u - 0.5) * cam["fov_deg"]
        bearing = (
            float(travel_bearing)
            if travel_bearing is not None
            else camera_bearing + float(cam.get("bearing_offset_deg", 0.0))
        )
        rad = math.radians(camera_bearing)
        lat, lng = offset_coordinate(
            cam["lat"], cam["lng"], math.sin(rad) * distance, math.cos(rad) * distance
        )

    return {
        "lat": round(lat, 7),
        "lng": round(lng, 7),
        "bearing": round(bearing % 360, 1),
        "distance_m": round(distance, 1),
    }


# ── Shared state (written by camera threads, read by WS handlers) ───────────
STATE: dict[str, dict[str, Any]] = {}
STATE_LOCK = threading.Lock()
STOP = threading.Event()


def camera_worker(cam: dict[str, Any], near_m: float, names: dict[int, str], model_path: str) -> None:
    """Capture + infer loop for a single camera. Reopens the stream on failure."""
    cam_id = cam["camera_id"]
    model = YOLO(model_path)  # one tracker state per camera
    interval = 1.0 / max(INFER_FPS, 0.5)
    last_infer = 0.0

    while not STOP.is_set():
        cap = cv2.VideoCapture(cam["hls_url"], cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print(f"[{cam_id}] could not open stream, retrying in 3s")
            time.sleep(3)
            continue
        print(f"[{cam_id}] stream opened")
        fails = 0
        last_ok = time.time()
        while not STOP.is_set():
            ok, frame = cap.read()
            if not ok or frame is None:
                fails += 1
                # The ffmpeg read timeout (OPENCV_FFMPEG_CAPTURE_OPTIONS) bounds
                # each blocked read; reopen quickly once a few fail or the stream
                # has gone quiet, so a stalled feed recovers in seconds not minutes.
                if fails > 5 or time.time() - last_ok > 12:
                    print(f"[{cam_id}] stream stalled, reopening")
                    with STATE_LOCK:
                        STATE.pop(cam_id, None)  # let clients see the feed dropped
                    break
                time.sleep(0.2)
                continue
            fails = 0
            last_ok = time.time()

            now = time.time()
            if now - last_infer < interval:
                continue  # keep draining the buffer to stay near the live edge
            last_infer = now

            h, w = frame.shape[:2]
            try:
                results = model.track(frame, persist=True, conf=CONF, imgsz=IMGSZ, verbose=False)
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                print(f"[{cam_id}] inference error: {exc}")
                continue

            objects, rejected_roi = _extract_objects(results, names, cam, near_m, w, h)
            with STATE_LOCK:
                STATE[cam_id] = {
                    "ts": now,
                    "frame_w": w,
                    "frame_h": h,
                    "objects": objects,
                    "rejected_roi": rejected_roi,
                }
        cap.release()
    print(f"[{cam_id}] worker stopped")


def _extract_objects(results, names, cam, near_m, w, h) -> tuple[list[dict[str, Any]], int]:
    objects: list[dict[str, Any]] = []
    rejected_roi = 0
    if not results:
        return objects, rejected_roi
    boxes = results[0].boxes
    if boxes is None:
        return objects, rejected_roi
    xyxy = boxes.xyxy.cpu().numpy()
    cls_ids = boxes.cls.cpu().numpy().astype(int)
    confs = boxes.conf.cpu().numpy()
    ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else [None] * len(xyxy)

    for (x1, y1, x2, y2), cid, conf, tid in zip(xyxy, cls_ids, confs, ids):
        cls_name = names.get(int(cid), str(cid))
        ent_type = CLASS_MAP.get(cls_name)
        if ent_type is None:
            continue
        # Cast to Python float: numpy float32 (from boxes.xyxy) propagates into
        # the projected bearing and breaks json.dumps otherwise.
        cx = float((x1 + x2) / 2.0)
        foot_y = float(y2)  # bottom-center of the box ≈ where the object meets the ground
        if not in_detection_roi(cam, cx, foot_y, w, h):
            rejected_roi += 1
            continue
        ground = project_to_ground(cam, near_m, cx, foot_y, w, h)
        objects.append(
            {
                "id": int(tid) if tid is not None else -1,
                "cls": cls_name,
                "type": ent_type,
                "conf": round(float(conf), 2),
                "bbox": [round(float(x1), 1), round(float(y1), 1), round(float(x2), 1), round(float(y2), 1)],
                **ground,
            }
        )
    return objects, rejected_roi


# ── Model + threads bootstrap ───────────────────────────────────────────────
def load_model_path() -> str:
    for candidate in (PRIMARY_MODEL, FALLBACK_MODEL):
        try:
            YOLO(candidate)  # triggers download / load; raises if unavailable
            print(f"Using model: {candidate}")
            return candidate
        except Exception as exc:  # noqa: BLE001
            print(f"Model '{candidate}' unavailable ({exc}); trying next")
    raise SystemExit("No usable YOLO-seg model could be loaded.")


near_m, cameras = load_config()
model_path = load_model_path()
class_names: dict[int, str] = YOLO(model_path).names  # id -> name

threads: list[threading.Thread] = []
for cam in cameras:
    t = threading.Thread(target=camera_worker, args=(cam, near_m, class_names, model_path), daemon=True)
    t.start()
    threads.append(t)


# ── WebSocket server ────────────────────────────────────────────────────────
app = FastAPI(title="SceneFlow Detector")


@app.get("/health")
def health() -> dict[str, Any]:
    with STATE_LOCK:
        return {
            "model": model_path,
            "config": {"conf": CONF, "imgsz": IMGSZ, "infer_fps": INFER_FPS},
            "cameras": [c["camera_id"] for c in cameras],
            "detections": {cid: len(s["objects"]) for cid, s in STATE.items()},
            "rejected_roi": {cid: s.get("rejected_roi", 0) for cid, s in STATE.items()},
            "frames": {
                cid: {
                    "age_s": round(time.time() - s["ts"], 2),
                    "width": s["frame_w"],
                    "height": s["frame_h"],
                }
                for cid, s in STATE.items()
            },
        }


@app.websocket("/ws")
async def ws(socket: WebSocket) -> None:
    await socket.accept()
    print("client connected")
    try:
        while True:
            with STATE_LOCK:
                payload = {
                    "type": "snapshot",
                    "stale_after_s": STALE_AFTER_S,
                    "cameras": {cid: dict(state) for cid, state in STATE.items()},
                }
            await socket.send_text(json.dumps(payload, default=_json_safe))
            await asyncio.sleep(0.1)  # ~10 snapshots/sec
    except WebSocketDisconnect:
        print("client disconnected")


if __name__ == "__main__":
    import uvicorn

    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
    finally:
        STOP.set()
