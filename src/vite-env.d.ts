/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the YOLO detector service (see detector/server.py). */
  readonly VITE_DETECTOR_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
