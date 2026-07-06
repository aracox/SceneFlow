"""
Vehicle color analyst: classifies a detected car/truck/bus into one coarse
car-industry paint color, published as `color` on each detection.

Approach (see git history for the full design rationale):
- Sample an UPPER-CENTRAL patch of the bbox (roof + top of hood/trunk). The
  cameras are elevated 3/4 views, so the top of the box is painted body; the
  mid strip is windshield glass and the bottom third is bumper, under-car
  shadow and road — all excluded by construction. Seg masks are deliberately
  not used: masks.data comes at letterboxed model resolution and aligning it
  to the orig frame costs more than the patch buys.
- Classify PER PIXEL in HSV and take the majority vote, not median-then-
  classify: hue is circular and the patch is bimodal (paint + glass/glare), so
  a median between a red body and blue-reflecting glass would land on a color
  present nowhere. With the vote, highlights vote "white" and glass votes
  "blue"/"gray" but paint wins whenever it dominates the patch.
- Stabilize per (camera_id, track_id) with a small ring-buffer vote +
  hysteresis (same shape as server.py's LANE_STATE) so the published color
  doesn't flicker frame to frame.
- Every unreliable path (tiny box, low conf, low pixel agreement, dark/blown
  scene) resolves to "unknown" — a missing color beats a confidently wrong one.
"""

from __future__ import annotations

import time
from collections import Counter, deque

import cv2  # type: ignore
import numpy as np

# Coarse car-industry palette. Silver is folded into "gray" (splitting them on
# V alone is unreliable under blown tropical highlights); violet/magenta folds
# into "red". Keep in sync with VEHICLE_COLOR_HEX in
# src/components/map/DetectionLayer.tsx.
COLOR_LABELS = [
    "white", "black", "gray", "red", "orange", "yellow",
    "green", "blue", "brown", "pink",
]
_IDX = {name: i for i, name in enumerate(COLOR_LABELS)}

# Classes that get a color; motorcycles/bicycles are too small and occluded
# for reliable paint sampling.
COLOR_CLASSES = {"car", "truck", "bus"}

MIN_CONF = 0.25      # both iTIC cameras see distant traffic: boxes ~24-60 px
MIN_BOX_H = 24       # tall at conf 0.2-0.4, so gates are looser than ideal-
MIN_PIXELS = 40      # camera defaults; AGREE_FRAC still guards reliability
AGREE_FRAC = 0.40    # top color must win at least this fraction of pixels

# Night guard. Under the street LEDs every car reads as a confident wrong
# color (the cast is saturated, so the achromatic split can't catch it). The
# reliable tell on these feeds is the SCENE's chromatic fraction: colored
# artificial light saturates 24-46% of night pixels, while the washed-out
# daytime concrete scene sits at 5-8% — so past this threshold we publish
# "unknown" instead of a color.
CAST_CHROMA_S = 60
CAST_CHROMA_V = 60
CAST_MAX_FRAC = 0.15


def scene_is_castlit(frame: np.ndarray) -> bool:
    """True when the frame is dominated by colored (night) lighting."""
    hsv = cv2.cvtColor(frame[::16, ::16], cv2.COLOR_BGR2HSV)
    chromatic = (hsv[..., 1] >= CAST_CHROMA_S) & (hsv[..., 2] >= CAST_CHROMA_V)
    return float(chromatic.mean()) >= CAST_MAX_FRAC


def classify_patch(hsv: np.ndarray) -> tuple[str, float]:
    """
    Per-pixel palette vote over an HSV patch (OpenCV ranges: H 0-180, S/V
    0-255). Returns (top color, agreement fraction). Rules are ordered —
    first match wins per pixel:
      1. blown highlight -> white (before hue is ever consulted, so an
         overexposed yellow/white car can't read yellow)
      2. very dark -> black
      3. low saturation -> white/gray by value (silver folds into gray)
      4. chromatic hue bins; brown is dark moderate-saturation orange and is
         tested before red/orange so bronze doesn't read orange, while pure
         red hues are never demoted to brown (maroon stays red).
    """
    h = hsv[..., 0].reshape(-1).astype(np.int16)
    s = hsv[..., 1].reshape(-1).astype(np.int16)
    v = hsv[..., 2].reshape(-1).astype(np.int16)
    labels = np.full(h.shape, -1, dtype=np.int8)

    def assign(mask: np.ndarray, name: str) -> None:
        labels[(labels == -1) & mask] = _IDX[name]

    assign((v >= 230) & (s < 70), "white")            # blown highlight
    assign(v < 50, "black")
    assign((s < 40) & (v >= 185), "white")            # achromatic, bright
    assign(s < 40, "gray")                            # achromatic, mid (incl. silver)
    # Chromatic (s >= 40, v >= 50) — hue bins, first match wins.
    assign((h >= 8) & (h <= 28) & (v < 130) & (s >= 50), "brown")
    # Pink before red. Two pink populations (Bangkok's pink taxis span both):
    # pale/pastel pink = red hue, VERY bright and weakly saturated (washed-out
    # red cars measure v ~175 / s 65-75 on these feeds, so both floors sit
    # above that); hot pink/rose/magenta = the 141-172 hue band, which needs
    # s >= 110 for the same reason (sun-hazed dark red drifts to hue ~166-171
    # at s ~70 and must stay red).
    assign(((h <= 10) | (h >= 173)) & (v >= 200) & (s < 85), "pink")
    assign((h <= 10) | (h >= 173), "red")
    assign(h <= 24, "orange")
    assign((h <= 34) & (s >= 70), "yellow")
    assign(h <= 34, "gray")                           # pale/cream, not yellow
    assign(h <= 85, "green")
    # Blue needs strong saturation: dark gray/black paint in shade reflects
    # the blue sky at s ~40-90 and would otherwise read as a confident blue
    # (verified on both iTIC feeds); real blue paint in daylight is s > 100.
    assign((h <= 140) & (s >= 100), "blue")           # cyan..blue..indigo
    assign(h <= 140, "gray")                          # weak sky reflection
    assign((h <= 172) & (s >= 110), "pink")           # magenta/rose/hot pink
    assign(h >= 165, "red")                           # washed-out rose-red
    assign(h <= 172, "gray")                          # weak violet

    counts = np.bincount(labels[labels >= 0], minlength=len(COLOR_LABELS))
    total = int(counts.sum())
    if total == 0:
        return "unknown", 0.0
    top = int(counts.argmax())
    return COLOR_LABELS[top], counts[top] / total


def sample_color(
    frame: np.ndarray, x1: float, y1: float, x2: float, y2: float, conf: float
) -> str:
    """One-frame color estimate for a vehicle bbox on a BGR frame."""
    if conf < MIN_CONF:
        return "unknown"
    bw, bh = x2 - x1, y2 - y1
    if bh < MIN_BOX_H:
        return "unknown"
    # Tall boxes (close 3/4 views): upper-central patch = roof + top of hood.
    # Short boxes (distant front/rear views) sample LOWER — the 0.45-0.75 band
    # is body panel below the glass; the upper band would be windshield, whose
    # sky reflection reads blue and whose dark glass reads black (verified
    # offline: white 7->21, false black 15->3 on the same day footage).
    fx1, fx2, fy1, fy2 = (0.25, 0.75, 0.45, 0.75) if bh < 60 else (0.20, 0.80, 0.12, 0.45)
    frame_h, frame_w = frame.shape[:2]
    px1 = max(int(round(x1 + fx1 * bw)), 0)
    px2 = min(int(round(x1 + fx2 * bw)), frame_w)
    py1 = max(int(round(y1 + fy1 * bh)), 0)
    py2 = min(int(round(y1 + fy2 * bh)), frame_h)
    if px2 - px1 <= 0 or py2 - py1 <= 0 or (px2 - px1) * (py2 - py1) < MIN_PIXELS:
        return "unknown"
    hsv = cv2.cvtColor(frame[py1:py2, px1:px2], cv2.COLOR_BGR2HSV)
    label, agree = classify_patch(hsv)
    return label if agree >= AGREE_FRAC else "unknown"


# (camera_id, track_id) -> (committed color, recent raw votes, last update ts).
# Same threading argument as server.py's LANE_STATE: one worker thread per
# camera and per-camera track ids mean keys never collide across threads, and
# dict/deque ops are GIL-atomic — no lock needed. Never touch from the WS
# handler.
_STATE: dict[tuple[str, int], tuple[str, deque, float]] = {}
_WINDOW = 7        # ring buffer of recent per-frame estimates
_MIN_VOTES = 3     # votes needed to establish the track's color
_TTL_S = 20.0      # outlives tracker.yaml track_buffer (~15 s at 6 fps), so a
                   # reclaimed track keeps its committed color


def stable_color(cam_id: str, tid: int, raw: str) -> str:
    """
    First established color wins: per-frame estimates vote until one color
    reaches _MIN_VOTES, and from then on the track keeps that color for life —
    a physical car can't repaint itself mid-track, so lighting/angle changes
    must never flip the published color (they used to, and cars visibly
    changed color on the map).
    """
    if tid < 0:
        return raw
    now = time.time()
    if len(_STATE) > 256:
        for key in [k for k, (_, _, ts) in _STATE.items() if now - ts > _TTL_S]:
            del _STATE[key]
    committed, votes, _ = _STATE.get(
        (cam_id, tid), ("unknown", deque(maxlen=_WINDOW), now)
    )
    if committed == "unknown":
        votes.append(raw)
        counts = Counter(c for c in votes if c != "unknown")
        if counts:
            top, top_count = counts.most_common(1)[0]
            if top_count >= _MIN_VOTES:
                committed = top
    _STATE[(cam_id, tid)] = (committed, votes, now)
    return committed


def vehicle_color(
    cam_id: str,
    tid: int,
    cls_name: str,
    frame: np.ndarray | None,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    conf: float,
) -> str:
    """Full pipeline: gate by class and scene, sample this frame, stabilize."""
    if cls_name not in COLOR_CLASSES or frame is None:
        return "unknown"
    if scene_is_castlit(frame):
        return "unknown"
    raw = sample_color(frame, x1, y1, x2, y2, conf)
    return stable_color(cam_id, tid, raw)
