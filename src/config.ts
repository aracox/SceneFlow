/**
 * App-wide feature switches.
 *
 * MOCK_DATA_ENABLED — when off, the simulated entities, their per-second
 * movement points (generated at startup), and movement-derived events are
 * skipped entirely. This removes the heavy startup work, leaving a fast
 * live-detection-only view (real cameras + the YOLO detection layer). Cameras,
 * zones, paths and the basemap stay available. Toggle via VITE_MOCK_DATA in
 * .env.local: `VITE_MOCK_DATA=off` disables it; anything else (or unset) keeps
 * the full mock simulation.
 */
export const MOCK_DATA_ENABLED =
  (import.meta.env.VITE_MOCK_DATA ?? 'on').toLowerCase() !== 'off';
