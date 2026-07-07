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
import atexit
import json
import math
import os
import re
import signal
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, NamedTuple

# Bound how long an OpenCV/ffmpeg stream read can block, so a stalled HLS feed
# fails fast and the worker reconnects in seconds. Must be set before cv2 opens
# any capture. Values are microseconds.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rw_timeout;5000000|timeout;5000000",
)

import cv2  # type: ignore  # noqa: E402
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from ultralytics import YOLO  # type: ignore  # noqa: E402

from color_analyst import vehicle_color  # noqa: E402

# ── Config ────────────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
CAMERAS_PATH = Path(os.environ.get("CAMERAS", HERE / "cameras.json"))
CACHE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
# Try the model the user asked for first; fall back to a current published
# YOLO-seg weight if that name isn't fetchable by the installed ultralytics.
PRIMARY_MODEL = os.environ.get("MODEL", "yolo26s-seg.pt")
FALLBACK_MODEL = "yolo11s-seg.pt"
CONF = float(os.environ.get("CONF", "0.18"))
IMGSZ = int(os.environ.get("IMGSZ", "960"))
# Tuned BoT-SORT config (static cameras, low infer rate) — keeps track ids
# stable through occlusions so per-track state (color, lanes) doesn't churn.
TRACKER = os.environ.get("TRACKER", str(HERE / "tracker.yaml"))
INFER_FPS = float(os.environ.get("INFER_FPS", "6"))  # inferences per second per camera
STALE_AFTER_S = 3.0  # clients drop a camera's detections older than this
LANE_SPAN_M = 12.0   # fallback full-frame lateral span when no `lanes` config exists

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
            corridor = {"pts": pts, "cum": cum, "total": cum[-1]}
            # Detection distances are measured FROM THE CAMERA, but the
            # corridor starts at the OSM node nearest the camera record, which
            # can sit tens of meters behind it along the road. Anchor distance
            # 0 at the camera's perpendicular projection onto the corridor so
            # near detections land beside the camera icon, not behind it.
            corridor["origin_m"] = _project_along_m(pts, cum, cam["lng"], cam["lat"])
            cam["corridor"] = corridor
            print(
                f"[{cam['camera_id']}] road corridor: {len(pts)} pts, {round(cum[-1])} m, "
                f"camera origin at {round(corridor['origin_m'], 1)} m"
            )
        else:
            cam["corridor"] = None
    return float(cfg.get("near_m", 4)), cameras


def _project_along_m(
    pts: list[list[float]], cum: list[float], lng: float, lat: float
) -> float:
    """Along-polyline distance (m) of the perpendicular projection of a point."""
    east_per_deg = METERS_PER_DEG_LAT * math.cos(math.radians(lat))
    px, py = lng * east_per_deg, lat * METERS_PER_DEG_LAT
    best_along = 0.0
    best_perp = float("inf")
    for i in range(1, len(pts)):
        ax, ay = pts[i - 1][0] * east_per_deg, pts[i - 1][1] * METERS_PER_DEG_LAT
        bx, by = pts[i][0] * east_per_deg, pts[i][1] * METERS_PER_DEG_LAT
        dx, dy = bx - ax, by - ay
        seg_sq = dx * dx + dy * dy or 1e-9
        t = min(max(((px - ax) * dx + (py - ay) * dy) / seg_sq, 0.0), 1.0)
        qx, qy = ax + t * dx, ay + t * dy
        perp = math.hypot(px - qx, py - qy)
        if perp < best_perp:
            best_perp = perp
            best_along = cum[i - 1] + t * (cum[i] - cum[i - 1])
    return best_along


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


def _roi_x_extent(polygon: list[tuple[float, float]], y: float) -> tuple[float, float] | None:
    """Horizontal [min_x, max_x] of the ROI polygon at scanline y (pixels)."""
    xs: list[float] = []
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (yi > y) != (yj > y):
            xs.append((xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi)
        j = i
    if len(xs) < 2:
        return None
    return min(xs), max(xs)


def _roi_y_extent(polygon: list[tuple[float, float]], x: float) -> tuple[float, float] | None:
    """Vertical [min_y, max_y] of the ROI polygon at column x (pixels)."""
    ys: list[float] = []
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (xi > x) != (xj > x):
            ys.append((yj - yi) * (x - xi) / ((xj - xi) or 1e-9) + yi)
        j = i
    if len(ys) < 2:
        return None
    return min(ys), max(ys)


def project_side_view(
    cam: dict[str, Any],
    cx: float,
    foot_y: float,
    frame_w: int,
    frame_h: int,
    tid: int = -1,
) -> dict[str, float]:
    """
    Projection for cameras that look ACROSS a road (`view: "side"`), e.g.
    ITICM_BMAMI0072 watching the elevated expressway broadside: the road runs
    left-right through the frame, so the HORIZONTAL image position maps to
    distance along the corridor (`span_m` wide, centered on the camera's
    perpendicular projection) and the VERTICAL foot position maps across the
    lane band (bottom of ROI = lane 0, the carriageway nearest the camera).
    Lanes >= `lanes.oncoming_from` belong to the far carriageway and travel
    opposite to the corridor direction.
    """
    corridor = cam["corridor"]
    lanes_cfg = cam.get("lanes") or {}
    roi = _roi_points(cam, frame_w, frame_h)
    span_m = float(cam.get("span_m", 90.0))
    sign = -1.0 if cam.get("invert_span") else 1.0

    x_extent = _roi_x_extent(roi, foot_y) if len(roi) >= 3 else None
    if x_extent:
        xl, xr = x_extent
        u = min(max((cx - xl) / ((xr - xl) or 1e-9), 0.0), 1.0)
    else:
        u = cx / frame_w
    distance = corridor.get("origin_m", 0.0) + sign * (u - 0.5) * span_m
    distance = min(max(distance, 0.0), corridor["total"])
    base_lng, base_lat, road_brg = point_along_corridor(corridor, distance)

    count = max(int(lanes_cfg.get("count", 1)), 1)
    lane_w = float(lanes_cfg.get("lane_width_m", 3.3))
    c_off = float(lanes_cfg.get("centerline_offset_m", 0.0))
    y_extent = _roi_y_extent(roi, cx) if len(roi) >= 3 else None
    if y_extent:
        yt, yb = y_extent
        vy = min(max((yb - foot_y) / ((yb - yt) or 1e-9), 0.0), 1.0)  # 0 near .. 1 far
    else:
        vy = 1.0 - foot_y / frame_h
    lane_f = vy * count - 0.5
    lane = _stable_lane(cam["camera_id"], tid, lane_f, count)
    # Lane 0 (nearest the camera) sits on the corridor-perpendicular's
    # positive side (bearing+90) unless `lanes.invert` flips it.
    lane_sign = -1.0 if lanes_cfg.get("invert") else 1.0
    lateral = lane_sign * ((count - 1) / 2.0 - lane) * lane_w + c_off
    perp = math.radians(road_brg + 90.0)
    lat, lng = offset_coordinate(
        base_lat, base_lng, math.sin(perp) * lateral, math.cos(perp) * lateral
    )

    oncoming_from = int(lanes_cfg.get("oncoming_from", count))
    bearing = (road_brg + 180.0) % 360 if lane >= oncoming_from else road_brg

    return {
        "lat": round(lat, 7),
        "lng": round(lng, 7),
        "bearing": round(bearing % 360, 1),
        "distance_m": round(distance, 1),
        "lane": int(lane),
        "lane_offset_m": round(lateral, 2),
        "lane_center_offset_m": round(lateral, 2),
    }


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
    tid: int = -1,
) -> dict[str, float]:
    """
    Vertical foot position -> distance from `near_m` (bottom of frame) to
    `range_m` (top of frame), or an optional hyperbolic depth model
    (`cam["depth_model"] == "hyperbolic"`) that maps foot-y to ground distance
    via a projective ground-plane curve instead of a linear one. If the camera
    has a road corridor, that distance is
    walked ALONG the real road centerline (so detections sit on the curving
    road). Horizontal image position maps across the ROI trapezoid's road
    extent at the foot row (perspective-correct: the road narrows with depth)
    onto the configured lane span; detections carry lane / lane_offset_m /
    lane_center_offset_m when the camera has `lanes` config. The returned
    bearing is the configured traffic travel direction. Otherwise it falls
    back to a straight cone bearing across the camera FOV.
    """
    u = cx / frame_w                       # 0 left .. 1 right
    if cam.get("depth_model") == "hyperbolic":
        # Projective ground-plane map calibrated from constant-speed car tracks:
        # distance blows up hyperbolically toward the road horizon instead of
        # growing linearly with image height (see cameras.json horizon_y /
        # depth_scale_m / per-camera near_m).
        y = foot_y / frame_h                        # 0 top .. 1 bottom
        horizon = float(cam.get("horizon_y", 0.0))
        near = float(cam.get("near_m", near_m))     # distance at frame bottom (y=1)
        scale = float(cam.get("depth_scale_m", 0.0))
        denom = y - horizon
        if denom <= 1e-4:                           # at/above horizon (out-of-ROI guard)
            distance = cam["range_m"]
        else:
            distance = near + scale * (1.0 / denom - 1.0 / (1.0 - horizon))
        distance = min(max(distance, 0.0), cam["range_m"])
    else:
        depth_frac = 1.0 - (foot_y / frame_h)  # 0 at bottom (near) .. 1 at top (far)
        depth_frac = min(max(depth_frac, 0.0), 1.0)
        distance = near_m + depth_frac * (cam["range_m"] - near_m)
    travel_bearing = cam.get("travel_bearing_deg")

    lane: int | None = None
    lane_center: float | None = None
    corridor = cam.get("corridor")
    if corridor:
        # Shift camera-relative distance to corridor-relative (see origin_m in
        # load_config); the published distance_m uses the same reference so the
        # frontend's along-corridor mapping stays consistent.
        distance = min(corridor.get("origin_m", 0.0) + distance, corridor["total"])
        base_lng, base_lat, road_brg = point_along_corridor(corridor, distance)
        # Map the horizontal image position across the ROI's road extent at this
        # row (perspective-correct: the road narrows with depth) onto the real
        # carriageway width, instead of assuming the road spans the full frame.
        lanes_cfg = cam.get("lanes")
        roi = _roi_points(cam, frame_w, frame_h)
        extent = _roi_x_extent(roi, foot_y) if len(roi) >= 3 else None
        if lanes_cfg and extent:
            xl, xr = extent
            u_road = min(max((cx - xl) / ((xr - xl) or 1e-9), 0.0), 1.0)
            count = max(int(lanes_cfg.get("count", 1)), 1)
            lane_w = float(lanes_cfg.get("lane_width_m", 3.3))
            sign = -1.0 if lanes_cfg.get("invert") else 1.0
            c_off = float(lanes_cfg.get("centerline_offset_m", 0.0))
            lateral = sign * (u_road - 0.5) * (lane_w * count) + c_off
            lane_f = (lateral - c_off) / lane_w + (count - 1) / 2.0
            lane = _stable_lane(cam["camera_id"], tid, lane_f, count)
            lane_center = (lane - (count - 1) / 2.0) * lane_w + c_off
        else:
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

    out = {
        "lat": round(lat, 7),
        "lng": round(lng, 7),
        "bearing": round(bearing % 360, 1),
        "distance_m": round(distance, 1),
    }
    if corridor and lane is not None and lane_center is not None:
        out["lane"] = int(lane)
        out["lane_offset_m"] = round(lateral, 2)
        out["lane_center_offset_m"] = round(lane_center, 2)
    return out


# ── Shared state (written by camera threads, read by WS handlers) ───────────
STATE: dict[str, dict[str, Any]] = {}
STATE_LOCK = threading.Lock()
STOP = threading.Event()

# (camera_id, track_id) -> (committed lane, last update ts). Stabilizes a car's
# lane index against bbox jitter at lane boundaries.
LANE_STATE: dict[tuple[str, int], tuple[int, float]] = {}
LANE_MARGIN = 0.15  # extra lane fraction beyond the boundary needed to switch
LANE_STATE_TTL_S = 5.0


def _stable_lane(cam_id: str, tid: int, lane_f: float, count: int) -> int:
    """Quantize continuous lane coordinate `lane_f` (0..count-1) with hysteresis
    keyed by YOLO track id, so boundary jitter doesn't flip a car's lane."""
    instant = min(max(round(lane_f), 0), count - 1)
    if tid < 0:
        return instant
    # LANE_STATE is touched from camera worker threads (one per camera); track
    # ids are namespaced per camera so cross-thread key collisions can't happen
    # and dict ops are GIL-atomic — no extra lock needed.
    now = time.time()
    if len(LANE_STATE) > 256:
        for k in [k for k, (_, ts) in LANE_STATE.items() if now - ts > LANE_STATE_TTL_S]:
            del LANE_STATE[k]
    prev = LANE_STATE.get((cam_id, tid))
    if prev is None:
        lane = instant
    else:
        committed = prev[0]
        if lane_f > committed + 0.5 + LANE_MARGIN:
            lane = min(committed + 1, count - 1)
        elif lane_f < committed - 0.5 - LANE_MARGIN:
            lane = max(committed - 1, 0)
        else:
            lane = committed
    LANE_STATE[(cam_id, tid)] = (lane, now)
    return lane


# Corridor tracker for side-view cameras (view: "side"). YOLO's IoU tracker
# rarely confirms tracks on a broadside view — cars cross the frame ~35 px per
# inference at 6 fps and detections flicker, so consecutive boxes seldom
# overlap and nearly every detection publishes id -1 (which clients drop from
# the map). Along a corridor we have a much stronger signal than IoU: the
# 1-D distance along the road. Each camera keeps per-direction tracks of
# (distance, speed); a detection matches the track whose predicted position is
# nearest (within SYN_MATCH_M), else it starts a new synthetic id. Ids start
# at 1_000_000 so they can never collide with YOLO track ids.
SYN_TRACKS: dict[str, dict[int, dict[str, float]]] = {}  # cam -> id -> state
SYN_NEXT: dict[str, int] = {}
SYN_MATCH_M = 12.0     # max |detection - predicted| to reuse a track
SYN_TTL_S = 2.5        # drop tracks not matched for this long
SYN_DEFAULT_SPEED = 14.0  # m/s along the corridor until measured (~50 km/h)
SYN_SPEED_ALPHA = 0.4


def _assign_corridor_ids(cam: dict[str, Any], entries: list[dict[str, Any]]) -> None:
    """
    Replace vehicle ids with corridor-matched synthetic ids (side-view cams).
    `entries` are _extract_objects working dicts carrying distance_m/lane and
    a travel direction sign. Same threading story as LANE_STATE: one worker
    thread per camera, so per-camera state needs no lock.
    """
    cam_id = cam["camera_id"]
    now = time.time()
    tracks = SYN_TRACKS.setdefault(cam_id, {})
    for tid in [t for t, s in tracks.items() if now - s["ts"] > SYN_TTL_S]:
        del tracks[tid]

    candidates = []  # (error_m, entry_idx, track_id)
    for i, e in enumerate(entries):
        for tid, s in tracks.items():
            if s["direction"] != e["direction"] or abs(s["lane"] - e["lane"]) > 1:
                continue
            predicted = s["distance"] + s["speed"] * (now - s["ts"]) * s["direction"]
            err = abs(e["distance_m"] - predicted)
            if err <= SYN_MATCH_M:
                candidates.append((err, i, tid))
    candidates.sort()
    used_entries: set[int] = set()
    used_tracks: set[int] = set()
    for err, i, tid in candidates:
        if i in used_entries or tid in used_tracks:
            continue
        used_entries.add(i)
        used_tracks.add(tid)
        s = tracks[tid]
        dt = max(now - s["ts"], 1e-3)
        observed = (entries[i]["distance_m"] - s["distance"]) / dt * s["direction"]
        if 0.0 <= observed <= 40.0:
            s["speed"] += (observed - s["speed"]) * SYN_SPEED_ALPHA
        s["distance"] = entries[i]["distance_m"]
        s["lane"] = entries[i]["lane"]
        s["ts"] = now
        entries[i]["id"] = tid

    for i, e in enumerate(entries):
        if i in used_entries:
            continue
        tid = SYN_NEXT.get(cam_id, 1_000_000)
        SYN_NEXT[cam_id] = tid + 1
        tracks[tid] = {
            "distance": e["distance_m"],
            "speed": SYN_DEFAULT_SPEED,
            "ts": now,
            "lane": e["lane"],
            "direction": e["direction"],
        }
        e["id"] = tid


# Popen handles for running cache-relay ffmpeg processes, so shutdown can
# terminate them (see _cleanup_relay_procs / atexit below).
RELAY_PROCS: list[subprocess.Popen] = []


def _terminate_relay(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def _cleanup_relay_procs() -> None:
    for proc in list(RELAY_PROCS):
        _terminate_relay(proc)
        if proc in RELAY_PROCS:
            RELAY_PROCS.remove(proc)


atexit.register(_cleanup_relay_procs)


def _handle_term(signum, _frame) -> None:
    # SIGTERM/SIGINT bypass atexit by default, which leaks relay ffmpeg
    # children into the shared cache dir (multiple writers corrupt the
    # PROGRAM-DATE-TIME timeline). Stop workers, kill relays, then exit.
    STOP.set()
    _cleanup_relay_procs()
    raise SystemExit(0)


signal.signal(signal.SIGTERM, _handle_term)
signal.signal(signal.SIGINT, _handle_term)


class CacheSegment(NamedTuple):
    filename: str
    pdt: float       # PROGRAM-DATE-TIME, epoch seconds
    duration: float  # EXTINF seconds


def parse_cache_playlist(playlist_path: str) -> list[CacheSegment]:
    """
    Parse a local cache-relay playlist (our own ffmpeg -hls_flags
    +program_date_time output) into ordered segments. Expected per-segment
    shape:
        #EXTINF:2.400000,
        #EXT-X-PROGRAM-DATE-TIME:2026-07-05T13:16:33.850+0700
        index0.ts
    Segments missing a PDT line are skipped. A torn read mid-write (the relay
    is actively appending) must not raise - we just return what parsed so far.
    """
    segments: list[CacheSegment] = []
    try:
        lines = Path(playlist_path).read_text().splitlines()
    except OSError:
        return segments

    duration: float | None = None
    pdt: float | None = None
    for line in lines:
        line = line.strip()
        if line.startswith("#EXTINF:"):
            try:
                duration = float(line[len("#EXTINF:"):].rstrip(",").split(",")[0])
            except ValueError:
                duration = None
            pdt = None
        elif line.startswith("#EXT-X-PROGRAM-DATE-TIME:"):
            raw = line[len("#EXT-X-PROGRAM-DATE-TIME:"):]
            try:
                pdt = datetime.strptime(raw, "%Y-%m-%dT%H:%M:%S.%f%z").timestamp()
            except ValueError:
                pdt = None
        elif line and not line.startswith("#"):
            # Filename line, terminating this segment's entry.
            if duration is not None and pdt is not None:
                segments.append(CacheSegment(line, pdt, duration))
            duration = None
            pdt = None
    return segments


def cache_relay_worker(cam: dict[str, Any]) -> None:
    """
    Re-segments an upstream HLS camera (`cam["hls_url"]`) into a local ~2s
    playlist with PROGRAM-DATE-TIME under CACHE_ROOT/<camera_id>/ via
    `ffmpeg -c copy`, so YOLO (camera_worker) and the browser video consume
    the identical local stream — a shared timeline, so boxes line up with
    the visible frame. Served over HTTP at /cache/<camera_id>/index.m3u8.
    """
    cam_id = cam["camera_id"]
    cache_dir = os.path.join(CACHE_ROOT, cam_id)
    os.makedirs(cache_dir, exist_ok=True)
    for name in os.listdir(cache_dir):
        if name.endswith(".ts") or name.endswith(".m3u8"):
            try:
                os.remove(os.path.join(cache_dir, name))
            except OSError:
                pass

    playlist = os.path.join(cache_dir, "index.m3u8")
    while not STOP.is_set():
        proc = subprocess.Popen(
            [
                "ffmpeg", "-loglevel", "error",
                # Start at the newest upstream segment: ingesting the upstream
                # backlog instantly would anchor the PROGRAM-DATE-TIME timeline
                # ~30 s later than the content's true broadcast time, skewing
                # the shared clock the box-overlay sync relies on.
                "-live_start_index", "-1",
                "-i", cam["hls_url"],
                "-c", "copy",
                "-f", "hls",
                "-hls_time", "2",
                "-hls_list_size", "30",
                "-hls_flags", "delete_segments+program_date_time",
                "index.m3u8",
            ],
            cwd=cache_dir,
        )
        RELAY_PROCS.append(proc)
        last_mtime = 0.0
        last_advance = time.time()
        stalled = False
        while not STOP.is_set():
            if STOP.wait(5):  # returns True immediately once STOP is set
                break
            if proc.poll() is not None:
                print(f"[{cam_id}] cache relay exited, restarting")
                break
            try:
                mtime = os.path.getmtime(playlist)
            except OSError:
                mtime = last_mtime
            now = time.time()
            if mtime != last_mtime:
                last_mtime = mtime
                last_advance = now
            elif now - last_advance > 30:
                print(f"[{cam_id}] cache relay stalled, restarting")
                stalled = True
                break

        if stalled:
            proc.kill()
        _terminate_relay(proc)
        if proc in RELAY_PROCS:
            RELAY_PROCS.remove(proc)
        if STOP.is_set():
            break
        time.sleep(3)
    print(f"[{cam_id}] cache relay stopped")


def camera_worker(cam: dict[str, Any], near_m: float, names: dict[int, str], model_path: str) -> None:
    """Capture + infer loop for a single camera. Reopens the stream on failure."""
    cam_id = cam["camera_id"]
    model = YOLO(model_path)  # one tracker state per camera
    interval = 1.0 / max(INFER_FPS, 0.5)
    last_infer = 0.0
    anchor_wall = None
    anchor_pts = None
    prev_pts = None

    while not STOP.is_set():
        source = cam["hls_url"]
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        anchor_wall = None
        anchor_pts = None
        prev_pts = None
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

            # Long-segment HLS (9.6 s segments) arrives in bursts; pacing
            # consumption to ~1x real time keeps detections streaming
            # continuously at a stable latency instead of bursting at the
            # live edge (see cameras.json pace_to_realtime/target_latency_s).
            if cam.get("pace_to_realtime", False):
                pts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
                # discontinuity / reconnect / bad PTS -> re-anchor
                if pts <= 0 or (prev_pts is not None and pts < prev_pts - 1.0):
                    anchor_wall = None
                if anchor_wall is None:
                    anchor_wall, anchor_pts = time.time(), pts
                prev_pts = pts
                sched = anchor_wall + (pts - anchor_pts)
                buffer_s = sched - time.time()  # content held ahead of 1x playback
                target_latency = float(cam.get("target_latency_s", 18.0))
                if buffer_s > target_latency + 2.0:
                    # excess backlog (startup / reconnect): bleed down to target without inferring
                    anchor_wall = time.time() - (pts - anchor_pts) + target_latency
                    last_ok = time.time()
                    continue
                if buffer_s > 0:
                    time.sleep(min(buffer_s, 0.5))
                last_ok = time.time()  # paced sleeps must not trip the stall heuristic

            now = time.time()
            if now - last_infer < interval:
                continue  # keep draining the buffer to stay near the live edge
            last_infer = now

            h, w = frame.shape[:2]
            try:
                results = model.track(
                    frame, persist=True, conf=CONF, imgsz=IMGSZ, tracker=TRACKER, verbose=False
                )
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
                    "stale_after_s": float(cam.get("stale_after_s", STALE_AFTER_S)),
                }
        cap.release()
    print(f"[{cam_id}] worker stopped")


def cache_segment_worker(cam: dict[str, Any], near_m: float, names: dict[int, str], model_path: str) -> None:
    """
    Reads the cache-relay's local playlist (see cache_relay_worker) and runs
    YOLO on each closed segment FILE once its PROGRAM-DATE-TIME is
    `target_latency_s` old, instead of opening the growing index.m3u8 with
    cv2 (which bursts and stalls). File reads never block, so this yields
    continuous detections at an exact, stable latency behind broadcast.
    """
    cam_id = cam["camera_id"]
    model = YOLO(model_path)  # one tracker state per camera
    interval = 1.0 / max(INFER_FPS, 0.5)
    target = float(cam.get("target_latency_s", 18.0))
    cache_dir = os.path.join(CACHE_ROOT, cam_id)
    playlist = os.path.join(cache_dir, "index.m3u8")

    # Keyed by (filename, pdt): the relay's ffmpeg restarts numbering at
    # index0.ts after a stall-restart, so filenames alone would collide with
    # the previous run and the reader would skip every new segment.
    processed: set[tuple[str, float]] = set()
    last_infer_content = 0.0

    print(f"[{cam_id}] cache segment reader started (target latency {target}s)")

    while not STOP.is_set():
        if not os.path.isfile(playlist):
            STOP.wait(1.0)
            continue

        segments = parse_cache_playlist(playlist)

        if len(processed) > 400:
            # Bounded set: rebuild from what's still in the playlist rather
            # than tracking exact insertion order.
            current_keys = {(s.filename, s.pdt) for s in segments}
            processed = processed & current_keys

        now = time.time()
        eligible = [
            s for s in segments
            if (s.filename, s.pdt) not in processed and s.pdt + s.duration <= now - target
        ]
        if not eligible:
            STOP.wait(0.5)
            continue

        for seg in eligible:
            if STOP.is_set():
                break
            path = os.path.join(cache_dir, seg.filename)
            if not os.path.isfile(path):
                processed.add((seg.filename, seg.pdt))  # fell out of the rolling window
                continue
            try:
                cap = cv2.VideoCapture(path, cv2.CAP_FFMPEG)
                try:
                    fps = cap.get(cv2.CAP_PROP_FPS)
                    if fps <= 0:
                        fps = 25.0
                    frame_index = 0
                    while not STOP.is_set():
                        ok, frame = cap.read()
                        if not ok or frame is None:
                            break
                        content_t = seg.pdt + frame_index / fps
                        frame_index += 1
                        if content_t - last_infer_content < interval:
                            continue
                        last_infer_content = content_t
                        now = time.time()

                        h, w = frame.shape[:2]
                        try:
                            results = model.track(
                                frame, persist=True, conf=CONF, imgsz=IMGSZ,
                                tracker=TRACKER, verbose=False
                            )
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
                                "stale_after_s": float(cam.get("stale_after_s", STALE_AFTER_S)),
                                "content_ts": content_t,
                            }
                finally:
                    cap.release()
            except Exception as exc:  # noqa: BLE001 - a corrupt segment must not wedge the loop
                print(f"[{cam_id}] segment {seg.filename} processing error: {exc}")
            processed.add((seg.filename, seg.pdt))
    print(f"[{cam_id}] cache segment reader stopped")


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
    frame = getattr(results[0], "orig_img", None)  # BGR frame for color sampling

    side_view = cam.get("view") == "side" and cam.get("corridor") is not None
    oncoming_from = int((cam.get("lanes") or {}).get("oncoming_from", 99))
    corridor_entries: list[dict[str, Any]] = []

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
        tid_int = int(tid) if tid is not None else -1
        if side_view:
            ground = project_side_view(cam, cx, foot_y, w, h, tid_int)
        else:
            ground = project_to_ground(cam, near_m, cx, foot_y, w, h, tid_int)
        obj = {
            "id": tid_int,
            "cls": cls_name,
            "type": ent_type,
            "conf": round(float(conf), 2),
            "_bbox_f": (float(x1), float(y1), float(x2), float(y2)),
            "bbox": [round(float(x1), 1), round(float(y1), 1), round(float(x2), 1), round(float(y2), 1)],
            **ground,
        }
        objects.append(obj)
        if side_view and ent_type == "vehicle":
            # Corridor tracking replaces YOLO ids entirely on side views —
            # a single identity space, matched by road position.
            obj["direction"] = 1 if obj["lane"] < oncoming_from else -1
            corridor_entries.append(obj)

    if corridor_entries:
        _assign_corridor_ids(cam, corridor_entries)

    # Color runs after identity assignment so per-track color voting sticks
    # to the corridor-matched ids on side-view cameras.
    for obj in objects:
        x1, y1, x2, y2 = obj.pop("_bbox_f")
        obj.pop("direction", None)
        obj["color"] = vehicle_color(
            cam["camera_id"], obj["id"], obj["cls"], frame, x1, y1, x2, y2, obj["conf"]
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
    if cam.get("cache_relay"):
        relay_thread = threading.Thread(target=cache_relay_worker, args=(cam,), daemon=True)
        relay_thread.start()
        threads.append(relay_thread)
        worker_fn = cache_segment_worker
    else:
        worker_fn = camera_worker
    t = threading.Thread(target=worker_fn, args=(cam, near_m, class_names, model_path), daemon=True)
    t.start()
    threads.append(t)


# ── WebSocket server ────────────────────────────────────────────────────────
app = FastAPI(title="SceneFlow Detector")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


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


@app.get("/cache/{cam_id}/{filename}")
def cache_file(cam_id: str, filename: str):
    if not re.fullmatch(r"[A-Za-z0-9._-]+", cam_id) or not re.fullmatch(r"[A-Za-z0-9._-]+", filename) or ".." in filename:
        raise HTTPException(404)
    path = os.path.join(CACHE_ROOT, cam_id, filename)
    if not os.path.isfile(path):
        raise HTTPException(404)
    media = "application/vnd.apple.mpegurl" if filename.endswith(".m3u8") else "video/mp2t"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "no-store"})


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
        _cleanup_relay_procs()
