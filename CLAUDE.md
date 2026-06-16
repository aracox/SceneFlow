# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**SceneFlow** — camera-to-map visual intelligence platform, frontend-only
prototype. Camera-detected entities (vehicles, shuttle, people, pets, boats,
floating waste, incidents) are visualized as a live map digital twin of the
**Thailand Digital Valley Pilot** site (~800 m × 800 m).

Everything is mock: **no backend, no real database, no camera streams, no
external APIs** (the basemap is custom GeoJSON — no tile/glyph servers).
The product name is **"SceneFlow"**, never "SceneFlow AI".

Stack: React 18 + TypeScript (strict) + Vite + MapLibre GL JS + Tailwind CSS + Zustand.

## Commands

```bash
npm run dev      # dev server on :5173 (preview config: .claude/launch.json, name "sceneflow-dev")
npm run build    # tsc type-check + vite build — must pass before declaring work done
```

No test suite. Verify changes by running the app — follow the
`sceneflow-verify` skill. The vite chunk-size warning (maplibre-gl) is expected.

## Hard rules

1. **Movement comes from path geometry only.** Entity positions are generated
   by walking a path's LineString (`generateMovementPoints`). Never place
   markers at raw coordinates, never add random movement.
2. **All geometry is relative to `MAP_CENTER`** (13.805567987114605,
   100.57466669475343) via `offsetCoordinate(center, metersEast, metersNorth)`.
   Keep offsets within ±400 m. GeoJSON is WGS84 **[lng, lat]** order.
3. **No license-plate data anywhere** — the product explicitly does no LPR.
4. Mock data must stay deterministic: use the seeded PRNG helpers
   (`hashSeed`/`mulberry32`), not `Math.random()`.

## Architecture (data flow)

```
src/data/*            mock DB records; movement points generated at startup
                      (30-min window anchored to app launch, 1 pt/sec/entity;
                      window constants in src/data/simWindow.ts)
        │
src/services/
  geometryUtils.ts    offsetCoordinate, distance-along-line, headings,
                      point-in-polygon, generateMovementPoints, getPositionAtTime
  replayEngine.ts     time→state interpolation (binary search + shortest-arc
                      heading), clip summaries
  mockSceneStore.ts   the query API ("mock backend"): live states, time-range
                      queries, clips, derived events
        │
src/store/sceneStore.ts   Zustand UI state: mode (live/replay), simTime,
                          speed, selection, layer toggles, clips
        │
src/app/App.tsx           rAF clock calls store.tick() every frame
src/components/map/*      SceneMap (GeoJSON layers), EntityMarker/CameraMarker/
                          TrailLayer update imperatively via store.subscribe()
src/components/...        layout / panels / timeline (React, per-second selectors)
```

Key performance pattern: the 60 fps animation **bypasses React** — markers
subscribe to the store and mutate DOM/maplibre directly. React components
select coarse values like `Math.floor(simTime / 1000)` so they re-render at
most once per second. Keep this split when adding features.

Tracking semantics: an entity is `tracked` (high confidence) only while inside
an online camera's coverage sector supporting its type; otherwise `predicted`
(dashed marker, lower opacity). Jumps > 60 m between points are path
wrap-arounds — interpolation and trails intentionally cut there.

## Project skills (in .claude/skills/)

- `sceneflow-add-entity` — checklist for adding entities / entity types
- `sceneflow-add-geometry` — paths, zones, cameras, coordinate rules
- `sceneflow-verify` — run + verification checklist, known non-bugs

## Conventions

- IDs: `VEH-001`, `SHUTTLE-001`, `PERSON-001`, `PET-001`, `BOAT-001`,
  `WASTE-001`, `INCIDENT-001`, `CLIP-0001`, `CAM-ROAD-01`, `LANE-N2-E`,
  `ZONE-BLDG-A`, `EVT-0001`.
- Types live in `src/types/scene.ts`; import GeoJSON types from `'geojson'`.
- UI: light enterprise style, blue accent (`brand-*` in tailwind.config.js),
  design target 1440×900+. Times render via `toLocaleTimeString('en-GB')`.
- Entity icon SVGs point north; only types in `ROTATABLE`
  (vehicle/boat/floating_waste) rotate with heading.
