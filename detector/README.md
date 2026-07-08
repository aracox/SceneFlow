# SceneFlow YOLO detector service

Runs real YOLO-seg object detection on the two live iTIC HLS feeds at the foot
of Taksin Bridge (`ITICM_BMAMI0080`, `ITICM_BMAMI0081`), projects each
detection onto the ground, and streams lat/lng detections to the React app over
a WebSocket.

This is the only part of SceneFlow that does real inference on real video. It
intentionally overrides CLAUDE.md's "no backend / no real camera streams" rule
for the live-detection feature. Everything else in the app stays mock.

## Run

```bash
cd detector
python3 -m pip install -r requirements.txt   # first time (ultralytics may already be present)
python3 server.py                            # serves ws://localhost:8000/ws
```

On first run the model downloads automatically (tries `yolo26s-seg.pt`, falls
back to `yolo11s-seg.pt` if that name isn't published for your ultralytics
version). Set `MODEL=/path/to/yolo26s-seg.pt` to use a local weight.

Then start the app as usual (`npm run dev`). The map's **Live Detections** layer
(sidebar toggle, on by default) connects to the WebSocket and draws detections
at the bridge. Use the **Jump to live detections** button to fly there, since
the cameras are ~3 km from the default scene center.

## Live replay history

The detector keeps the last 10 minutes of vehicle detection records in an
in-memory `deque`. This needs no separate database and clears automatically when
the Python server restarts. The frontend reads this buffer through `/history`
when the map timeline is scrubbed into replay mode.

Useful endpoints:

- `GET /history?at_s=<epoch_seconds>&tolerance_s=0.45`
- `GET /history?from_s=<epoch_seconds>&to_s=<epoch_seconds>`
- `GET /health` includes current history record count and oldest/newest times

Set `HISTORY_WINDOW_S=600` to change the retention window.

## How detections become map points (road-following projection)

For each detection box, the bottom-center (foot point) is projected to the
ground:

- vertical foot position → distance from `near_m` (frame bottom) to `range_m`
  (frame top)
- if the camera has a road corridor (`detector/road_<id>.json`), that distance
  is walked **along the real road centerline**, so detections sit on the curving
  road; horizontal image position adds a small lane offset. Without a corridor it
  falls back to a straight bearing across the camera `fov_deg`.

Generate/refresh a camera's corridor (real OSM centerline of the road it looks
down) with:

```bash
node scripts/gen-detector-road.mjs
```

That writes `detector/road_<id>.json` (used here) and
`src/data/detectionCorridors.ts` (drawn on the map), and prints the road's start
bearing to set as the camera heading in `src/data/mockCameras.ts`.

This is still approximate (no camera calibration / no per-frame depth); upgrade
to a homography per camera for metric accuracy.

## Config / env

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8000` | WebSocket/HTTP port (`/ws`, `/health`) |
| `MODEL` | `yolo26s-seg.pt` | model name or path |
| `CONF` | `0.18` | detection confidence threshold; lower sees more small/far cars but may add false positives |
| `IMGSZ` | `960` | YOLO inference image size; higher helps traffic-camera small objects but costs CPU/GPU |
| `INFER_FPS` | `6` | inferences per second per camera |
| `CAMERAS` | `./cameras.json` | camera config path |
| `HISTORY_WINDOW_S` | `600` | in-memory live detection replay retention in seconds |

Each camera can also define `roi_polygon` as a list of `[x, y]` points in
normalized image coordinates (`0..1`) or source-frame pixels. When present, the
detector keeps only objects whose bbox bottom-center point is inside the polygon;
this filters cars from adjacent roads before they reach the frontend.

The app's WebSocket URL defaults to `ws://localhost:8000/ws`; override with
`VITE_DETECTOR_WS` when running `npm run dev`.
