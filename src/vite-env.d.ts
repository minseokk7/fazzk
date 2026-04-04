/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  OBS_MODE?: boolean;
  DIRECT_NOTIFIER_MODE?: boolean;
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
  testAlarmInProgress?: boolean;
  toastManager?: unknown;
  webkitAudioContext?: typeof AudioContext;
}
