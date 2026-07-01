/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the YOLO detector service (see detector/server.py). */
  readonly VITE_DETECTOR_WS?: string;
  /** 'off' disables the mock simulation (entities + movement) for a fast live-only view. */
  readonly VITE_MOCK_DATA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
