---
name: sceneflow-verify
description: Build, run, and verify the SceneFlow prototype after changes. Use when asked to test, verify, debug, or demo the app, or before declaring any SceneFlow change done.
---

# Verifying SceneFlow

## Build & run

```bash
npm run build        # tsc type-check + vite build — must pass clean
```

For interactive verification use the preview tools with the existing
`.claude/launch.json` config (`sceneflow-dev`, port 5173). Resize the viewport
to **1440×900** before screenshotting — that is the design target; narrower
viewports squeeze the KPI row.

## Verification checklist

1. **Console clean** — no errors/warnings in preview console logs.
2. **Counts** — eval in the page:
   - `.entity-marker` → 26 (or current entity total)
   - `.camera-marker` → 8, `.zone-label` → 11 (adjust if data changed)
3. **Movement is path-constrained** — sample a marker's `style.transform`
   twice ~1.5 s apart: it must change, and vehicles/boats must carry a
   `rotateZ` matching their lane direction. Entities must never cut across
   buildings or leave their path.
4. **Selection** — clicking a marker fills the Entity Detail panel (status
   badge, speed, confidence bar, source camera, path name) and shows a popup
   that follows the marker. Note: markers move, so synthetic clicks by
   selector can miss — dispatch a `MouseEvent('click', {bubbles:true})` on the
   element via eval instead.
5. **Clip flow** — with an entity selected, click "Save 5-minute clip": a new
   `CLIP-NNNN` appears with a sane summary (duration/distance/avg speed);
   clicking it enters clip replay (amber REPLAY badge, timeline locked to the
   clip range, other entities dimmed); "Back to Live" restores the live clock.
6. **Timeline** — scrubbing backwards in live mode drops into history replay;
   speeds 1x/2x/4x/8x change animation rate; play/pause works.
7. **Layer toggles** — each sidebar checkbox hides its markers/layers
   (Zones also hides the floating zone labels).

## Known behaviors (not bugs)

- The mock window is 30 min anchored to app startup; the live clock starts
  20 min in and wraps at the window end.
- Entities teleport from path end back to start (wrap) — trails and
  interpolation are intentionally cut at jumps > 60 m.
- Entities outside any supporting camera's coverage render dashed/faded as
  `predicted` — that is the tracking-state feature, not a rendering glitch.
- Chunk-size warning in `vite build` is maplibre-gl; ignore it.
