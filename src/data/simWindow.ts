/**
 * Shared mock simulation window.
 *
 * The mock database covers a 30-minute timeline. The window is anchored to
 * the real clock at app startup so timestamps look current: 20 minutes of
 * "history" (available for replay and 5-minute clips) and 10 minutes of
 * "future" runway for the live clock.
 */
export const SIM_DURATION_SEC = 30 * 60;
export const SIM_DURATION_MS = SIM_DURATION_SEC * 1000;

export const SIM_START_MS = Math.floor((Date.now() - 20 * 60 * 1000) / 1000) * 1000;
export const SIM_END_MS = SIM_START_MS + SIM_DURATION_MS;

/** Where the live clock starts: "now", i.e. 20 minutes into the data window. */
export const LIVE_START_MS = SIM_START_MS + 20 * 60 * 1000;

export const CLIP_DURATION_MS = 5 * 60 * 1000;
