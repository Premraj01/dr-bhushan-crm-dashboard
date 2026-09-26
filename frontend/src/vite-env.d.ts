/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the NestJS API. Leave empty to use the Vite dev proxy (same origin). */
  readonly VITE_API_URL?: string;
  /** Base URL of the socket.io server. Defaults to VITE_API_URL / same origin. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
