# Repository Guidelines

## Project Structure & Module Organization

SceneFlow is a React 18 + TypeScript + Vite prototype. Main app code lives in `src/`: `app/` owns the shell and clock, `components/` contains UI, `data/` contains deterministic mock records, `services/` contains geometry/replay/feed logic, `store/` contains Zustand state, and `types/` contains shared types. Global styles are in `src/styles/index.css`.

The optional live detector service is under `detector/` with `server.py`, camera config, generated road corridors, and Python requirements. Utility scripts live in `scripts/`; build output goes to `dist/`.

## Build, Test, and Development Commands

- `npm install`: install frontend dependencies.
- `npm run dev`: start the Vite dev server on `http://localhost:5173`.
- `npm run build`: run TypeScript checking and produce a production build. This is the required validation command.
- `npm run preview`: serve the built app locally.
- `cd detector && python3 server.py`: start the optional YOLO detector WebSocket service on `ws://localhost:8000/ws`.

There is no automated test suite. Do not add one-off test infrastructure unless explicitly required.

## Coding Style & Naming Conventions

Use TypeScript with strict types and React function components. Follow existing style: two-space indentation, single quotes, semicolons, and concise component/helper names. Keep map animation paths imperative where existing code does so.

Project IDs follow patterns such as `VEH-001`, `CAM-ROAD-01`, `CLIP-0001`, and detector IDs like `ITICM_BMAMI0072`. The product name is `SceneFlow`, not `SceneFlow AI`.

## Data & Geometry Rules

Mock movement must come from path geometry only. Use `generateMovementPoints` and LineString distance logic; do not place moving markers at arbitrary raw coordinates. All mock geometry is relative to `MAP_CENTER` through `offsetCoordinate`, within roughly +/-400 m. GeoJSON coordinates are `[lng, lat]`. Use `hashSeed`/`mulberry32`, never `Math.random()`.

No license-plate data or LPR behavior belongs in this repository.

## Testing Guidelines

Run `npm run build` before declaring code complete. The Vite chunk-size warning from MapLibre is expected. For UI or detector changes, verify manually in the browser; for detector sync work, check `http://127.0.0.1:8000/health`.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Add live detection camera picker` or `Fix relay segment reuse handling`. Keep commits focused and avoid bundling unrelated changes.

Pull requests should summarize what changed, why, validation performed, and user-visible impact. Include screenshots or short clips for map/UI changes and note detector config changes when touching `detector/cameras.json`.
