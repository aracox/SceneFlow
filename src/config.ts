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

const LOCAL_BROWSER_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const isLocalBrowser =
  typeof window !== 'undefined' && LOCAL_BROWSER_HOSTS.has(window.location.hostname);

export const DETECTOR_HTTP_BASE =
  (import.meta.env.VITE_DETECTOR_HTTP as string | undefined)?.trim() ||
  (isLocalBrowser ? 'http://localhost:8000' : '');

export const DETECTOR_WS_URL =
  (import.meta.env.VITE_DETECTOR_WS as string | undefined)?.trim() ||
  (isLocalBrowser ? 'ws://localhost:8000/ws' : '');
