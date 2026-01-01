import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { EnvironmentCheck } from '../types/tauri';
import { globalErrorHandler } from './errorHandler';
import { createLogger } from './logger';
import { loadingManager } from './loadingManager';

const log = createLogger('API');

// Tauri 전역 객체 타입 확장
declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
    __TAURI__?: any;
  }
}

// 환경 체크
const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

// API 에러 타입
interface APIError extends Error {
  code?: string;
  command?: string;
  context?: any;
}

// API 에러 생성 헬퍼
function createAPIError(message: string, command?: string, originalError?: any): APIError {
  const error = new Error(message) as APIError;
  error.command = command;
  error.context = originalError;
  return error;
}

// 안전한 invoke 래퍼
async function safeInvoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
  if (!isTauri) {
    const error = createAPIError(`Command '${command}' not available in browser mode`, command);
    throw error;
  }

  const loadingId = `api-${command}-${Date.now()}`;
  
  try {
    // 로딩 시작
    loadingManager.start(loadingId, `${command} 실행 중...`, {
      category: 'api',
      priority: 'medium'
    });

    log.debug(`Invoking command: ${command}`, args);
    const result = await invoke<T>(command, args);
    
    log.debug(`Command '${command}' completed successfully`);
    return result;
  } catch (e) {
    const error = createAPIError(
      `Command '${command}' failed: ${e instanceof Error ? e.message : String(e)}`,
      command,
      e
    );
    
    // 전역 에러 핸들러에 보고
    globalErrorHandler.handleError(error, {
      component: 'API',
      command,
      args,
      isTauri
    });
    
    throw error;
  } finally {
    // 로딩 완료
    loadingManager.finish(loadingId);
  }
}

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
    if (!isTauri) {
      log.warn('getCookies not available in browser mode');
      return [];
    }
    try {
      return await safeInvoke('get_cookies');
    } catch (e) {
      log.error('getCookies failed:', e);
      return [];
    }
  },

  getServerPort: async (): Promise<number> => {
    if (!isTauri) {
      log.debug('Using default port 3000 in browser mode');
      return 3000;
    }
    try {
      return await safeInvoke('get_server_port');
    } catch (e) {
      log.error('getServerPort failed, using default port 3000:', e);
      return 3000;
    }
  },

  getAppVersion: async (): Promise<string> => {
    if (!isTauri) {
      log.debug('Using default version in browser mode');
      return '2.8.0';
    }
    try {
      return await safeInvoke('get_app_version');
    } catch (e) {
      log.error('getAppVersion failed, using default version:', e);
      return '2.8.0';
    }
  },

  manualLogin: async (nidAut: string, nidSes: string): Promise<boolean> => {
    if (!isTauri) {
      const error = createAPIError('Manual login not available in browser mode', 'manual_login');
      throw error;
    }
    
    if (!nidAut || !nidSes) {
      const error = createAPIError('NID_AUT and NID_SES are required', 'manual_login');
      throw error;
    }
    
    const loadingId = 'manual-login';
    
    try {
      loadingManager.start(loadingId, '로그인 중...', {
        category: 'auth',
        priority: 'high'
      });

      await safeInvoke('manual_login', { nidAut, nidSes });
      log.info('Manual login successful');
      return true;
    } catch (e) {
      log.error('Manual login failed:', e);
      throw e;
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  // === Settings & Files ===
  selectAudioFile: async (): Promise<string | null> => {
    if (!isTauri) {
      log.warn('File selection not available in browser mode');
      return null;
    }

    const loadingId = 'file-selection';
    
    try {
      loadingManager.start(loadingId, '파일 선택 대화상자 열기...', {
        category: 'file',
        priority: 'medium'
      });

      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
      });
      
      if (selected) {
        log.info('Audio file selected:', selected);
      } else {
        log.debug('No audio file selected');
      }
      
      return selected as string | null;
    } catch (e) {
      const error = createAPIError(
        `Audio file selection failed: ${e instanceof Error ? e.message : String(e)}`,
        'selectAudioFile',
        e
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'file-selection' });
      return null;
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  convertFileSrc: (path: string): string => {
    if (!isTauri) return path;
    if (!path) {
      log.warn('convertFileSrc called with empty path');
      return path;
    }
    
    try {
      const converted = convertFileSrc(path);
      log.debug('File path converted:', path, '->', converted);
      return converted;
    } catch (e) {
      const error = createAPIError(
        `File path conversion failed: ${e instanceof Error ? e.message : String(e)}`,
        'convertFileSrc',
        e
      );
      globalErrorHandler.handleError(error, { component: 'API', originalPath: path });
      return path;
    }
  },

  // === Window Controls ===
  minimize: async (): Promise<void> => {
    if (!isTauri) {
      log.warn('Window minimize not available in browser mode');
      return;
    }
    try {
      await getCurrentWindow().minimize();
      log.debug('Window minimized');
    } catch (e) {
      const error = createAPIError(
        `Window minimize failed: ${e instanceof Error ? e.message : String(e)}`,
        'minimize',
        e
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'window-control' });
    }
  },

  toggleMaximize: async (): Promise<void> => {
    if (!isTauri) {
      log.warn('Window maximize not available in browser mode');
      return;
    }
    try {
      const win = getCurrentWindow();
      const isMaximized = await win.isMaximized();
      if (isMaximized) {
        await win.unmaximize();
        log.debug('Window unmaximized');
      } else {
        await win.maximize();
        log.debug('Window maximized');
      }
    } catch (e) {
      const error = createAPIError(
        `Window maximize toggle failed: ${e instanceof Error ? e.message : String(e)}`,
        'toggleMaximize',
        e
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'window-control' });
    }
  },

  close: async (): Promise<void> => {
    if (!isTauri) {
      log.warn('Window close not available in browser mode');
      return;
    }
    try {
      await getCurrentWindow().close();
      log.debug('Window closed');
    } catch (e) {
      const error = createAPIError(
        `Window close failed: ${e instanceof Error ? e.message : String(e)}`,
        'close',
        e
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'window-control' });
    }
  },

  // === Events ===
  listen: <T = any>(
    event: string,
    callback: (event: { payload: T }) => void
  ): Promise<() => void> => {
    if (!isTauri) {
      log.warn(`Event listening for '${event}' not available in browser mode`);
      return Promise.resolve(() => {});
    }
    
    try {
      log.debug(`Setting up event listener for: ${event}`);
      return listen(event, (eventData) => {
        try {
          callback(eventData);
        } catch (e) {
          const error = createAPIError(
            `Event callback error for '${event}': ${e instanceof Error ? e.message : String(e)}`,
            'listen',
            e
          );
          globalErrorHandler.handleError(error, { 
            component: 'API', 
            event, 
            eventData: eventData.payload 
          });
        }
      });
    } catch (e) {
      const error = createAPIError(
        `Failed to set up event listener for '${event}': ${e instanceof Error ? e.message : String(e)}`,
        'listen',
        e
      );
      globalErrorHandler.handleError(error, { component: 'API', event });
      return Promise.resolve(() => {});
    }
  },

  // === Theme ===
  setTheme: async (isDark: boolean): Promise<void> => {
    if (!isTauri) {
      log.debug('Theme setting not available in browser mode');
      return;
    }
    try {
      await safeInvoke('set_theme', { isDark });
      log.info(`Theme set to: ${isDark ? 'dark' : 'light'}`);
    } catch (e) {
      log.error('setTheme failed:', e);
      // 테마 설정 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  },

  // === Updates ===
  checkForUpdates: async (): Promise<{ has_update: boolean; error?: string }> => {
    if (!isTauri) {
      log.debug('Update check not available in browser mode');
      return { has_update: false, error: 'Not available in browser mode' };
    }

    const loadingId = 'update-check';
    
    try {
      loadingManager.start(loadingId, '업데이트 확인 중...', {
        category: 'api',
        priority: 'low'
      });

      const result = await safeInvoke('check_for_updates');
      log.info('Update check completed:', result);
      return result;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      log.error('Update check failed:', errorMessage);
      return { 
        has_update: false, 
        error: errorMessage
      };
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  openDownloadPage: async (url: string): Promise<void> => {
    if (!url) {
      const error = createAPIError('URL is required for opening download page', 'openDownloadPage');
      throw error;
    }
    
    if (!isTauri) {
      log.info('Opening download page in browser:', url);
      window.open(url, '_blank');
      return;
    }
    
    try {
      await safeInvoke('open_download_page', { url });
      log.info('Download page opened:', url);
    } catch (e) {
      log.error('Failed to open download page:', e);
      // 폴백: 브라우저에서 열기
      window.open(url, '_blank');
    }
  },

  downloadUpdate: async (url: string): Promise<void> => {
    if (!isTauri) {
      const error = createAPIError('Update download not available in browser mode', 'downloadUpdate');
      throw error;
    }
    
    if (!url) {
      const error = createAPIError('URL is required for downloading update', 'downloadUpdate');
      throw error;
    }
    
    const loadingId = 'update-download';
    
    try {
      loadingManager.start(loadingId, '업데이트 다운로드 중...', {
        category: 'api',
        priority: 'high',
        progress: 0
      });

      log.info('Starting update download:', url);
      await safeInvoke('download_and_install_update', { url });
      log.info('Update download completed');
    } catch (e) {
      log.error('Update download failed:', e);
      throw e;
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  onUpdateProgress: (callback: UpdateProgressCallback): Promise<() => void> => {
    if (!isTauri) {
      log.warn('Update progress monitoring not available in browser mode');
      return Promise.resolve(() => {});
    }
    
    return api.listen('update-progress', (event) => {
      try {
        callback(event);
      } catch (e) {
        const error = createAPIError(
          `Update progress callback error: ${e instanceof Error ? e.message : String(e)}`,
          'onUpdateProgress',
          e
        );
        globalErrorHandler.handleError(error, { 
          component: 'API', 
          event: 'update-progress',
          payload: event.payload 
        });
      }
    });
  },

  // === Tauri Invoke ===
  invoke: <T = any>(command: string, args?: Record<string, any>): Promise<T> => {
    return safeInvoke<T>(command, args);
  },
};
