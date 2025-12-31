import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { EnvironmentCheck } from '../types/tauri';

// Tauri 전역 객체 타입 확장
declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
    __TAURI__?: any;
  }
}

// 환경 체크
const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

// 업데이트 진행률 콜백 타입
type UpdateProgressCallback = (event: { payload: { progress: number; message: string } }) => void;

// API 인터페이스 정의
interface API extends EnvironmentCheck {
  // === Cookies / Session ===
  getCookies(): Promise<any[]>;
  getServerPort(): Promise<number>;
  getAppVersion(): Promise<string>;
  manualLogin(nidAut: string, nidSes: string): Promise<boolean>;

  // === Settings & Files ===
  selectAudioFile(): Promise<string | null>;
  convertFileSrc(path: string): string;

  // === Window Controls ===
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;

  // === Events ===
  listen<T = any>(event: string, callback: (event: { payload: T }) => void): Promise<() => void>;

  // === Theme ===
  setTheme(isDark: boolean): Promise<void>;

  // === Updates ===
  checkForUpdates(): Promise<{ has_update: boolean; error?: string }>;
  openDownloadPage(url: string): Promise<void>;
  downloadUpdate(url: string): Promise<void>;
  onUpdateProgress(callback: UpdateProgressCallback): Promise<() => void>;

  // === Tauri Invoke ===
  invoke<T = any>(command: string, args?: Record<string, any>): Promise<T>;
}

export const api: API = {
  isTauri,
  isDesktop: isTauri,
  isBrowser: !isTauri,

  // === Cookies / Session ===
  getCookies: async (): Promise<any[]> => {
    if (!isTauri) return [];
    try {
      return await invoke('get_cookies');
    } catch (e) {
      console.error('getCookies failed', e);
      return [];
    }
  },

  getServerPort: async (): Promise<number> => {
    if (!isTauri) return 3000;
    try {
      return await invoke('get_server_port');
    } catch (e) {
      console.error('getServerPort failed', e);
      return 3000;
    }
  },

  getAppVersion: async (): Promise<string> => {
    if (!isTauri) return '2.7.0';
    try {
      return await invoke('get_app_version');
    } catch (e) {
      console.error('getAppVersion failed', e);
      return '2.7.0';
    }
  },

  manualLogin: async (nidAut: string, nidSes: string): Promise<boolean> => {
    if (!isTauri) throw new Error('Manual login not available in browser mode');
    try {
      await invoke('manual_login', { nidAut, nidSes });
      return true;
    } catch (e) {
      console.error('manualLogin failed', e);
      throw e;
    }
  },

  // === Settings & Files ===
  selectAudioFile: async (): Promise<string | null> => {
    if (!isTauri) {
      console.warn('File selection not available in browser mode');
      return null;
    }
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
      });
      return selected as string | null;
    } catch (e) {
      console.error('selectAudioFile failed', e);
      return null;
    }
  },

  convertFileSrc: (path: string): string => {
    if (!isTauri) return path;
    try {
      return convertFileSrc(path);
    } catch (e) {
      console.error('convertFileSrc failed', e);
      return path;
    }
  },

  // === Window Controls ===
  minimize: async (): Promise<void> => {
    if (!isTauri) return;
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error(e);
    }
  },

  toggleMaximize: async (): Promise<void> => {
    if (!isTauri) return;
    try {
      const win = getCurrentWindow();
      const isMaximized = await win.isMaximized();
      if (isMaximized) await win.unmaximize();
      else await win.maximize();
    } catch (e) {
      console.error(e);
    }
  },

  close: async (): Promise<void> => {
    if (!isTauri) return;
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error(e);
    }
  },

  // === Events ===
  listen: <T = any>(
    event: string,
    callback: (event: { payload: T }) => void
  ): Promise<() => void> => {
    if (!isTauri) {
      console.warn('Event listening not available in browser mode');
      return Promise.resolve(() => {});
    }
    return listen(event, callback);
  },

  // === Theme ===
  setTheme: async (isDark: boolean): Promise<void> => {
    if (!isTauri) {
      console.log('Theme setting not available in browser mode');
      return;
    }
    try {
      await invoke('set_theme', { isDark });
    } catch (e) {
      console.error('setTheme failed', e);
    }
  },

  // === Updates ===
  checkForUpdates: async (): Promise<{ has_update: boolean; error?: string }> => {
    if (!isTauri) return { has_update: false, error: 'Not available in browser mode' };
    try {
      return await invoke('check_for_updates');
    } catch (e) {
      return { has_update: false, error: e?.toString() };
    }
  },

  openDownloadPage: async (url: string): Promise<void> => {
    if (!isTauri) {
      window.open(url, '_blank');
      return;
    }
    try {
      await invoke('open_download_page', { url });
    } catch (e) {
      console.error(e);
    }
  },

  downloadUpdate: async (url: string): Promise<void> => {
    if (!isTauri) throw new Error('Update download not available in browser mode');
    try {
      await invoke('download_and_install_update', { url });
    } catch (e) {
      throw e;
    }
  },

  onUpdateProgress: (callback: UpdateProgressCallback): Promise<() => void> => {
    if (!isTauri) return Promise.resolve(() => {});
    return listen('update-progress', callback);
  },

  // === Tauri Invoke ===
  invoke: <T = any>(command: string, args?: Record<string, any>): Promise<T> => {
    if (!isTauri) {
      console.warn(`Invoke command '${command}' not available in browser mode`);
      return Promise.reject(new Error('Not available in browser mode'));
    }
    return invoke(command, args);
  },
};
