import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import packageJson from '../../package.json';
import type { EnvironmentCheck } from '../types/tauri';
import { globalErrorHandler } from './errorHandler';
import { loadingManager } from './loadingManager';
import { createLogger } from './logger';

const log = createLogger('API');
const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
const fallbackAppVersion = packageJson.version;

interface APIError extends Error {
  code?: string;
  command?: string;
  context?: unknown;
}

type UpdateProgressPayload = { progress?: number; percent?: number; message?: string };
type UpdateProgressCallback = (event: { payload: UpdateProgressPayload }) => void;

interface API extends EnvironmentCheck {
  getCookies(): Promise<unknown[]>;
  getServerPort(): Promise<number>;
  getAppVersion(): Promise<string>;
  manualLogin(nidAut: string, nidSes: string): Promise<boolean>;
  selectAudioFile(): Promise<string | null>;
  convertFileSrc(path: string): string;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  listen<T = unknown>(
    event: string,
    callback: (event: { payload: T }) => void
  ): Promise<() => void>;
  checkForUpdates(): Promise<{ has_update: boolean; error?: string }>;
  openDownloadPage(url: string): Promise<void>;
  downloadUpdate(url: string): Promise<void>;
  onUpdateProgress(callback: UpdateProgressCallback): Promise<() => void>;
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
}

function createAPIError(message: string, command?: string, originalError?: unknown): APIError {
  const error = new Error(message) as APIError;
  if (command !== undefined) {
    error.command = command;
  }
  if (originalError !== undefined) {
    error.context = originalError;
  }
  return error;
}

async function safeInvoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauri) {
    throw createAPIError(`Command '${command}' not available in browser mode`, command);
  }

  const loadingId = `api-${command}-${Date.now()}`;

  try {
    loadingManager.start(loadingId, `${command} 실행 중...`, {
      category: 'api',
      priority: 'medium',
    });

    log.debug(`Invoking command: ${command}`, args);
    const result = await invoke<T>(command, args);
    log.debug(`Command '${command}' completed successfully`);
    return result;
  } catch (cause) {
    const error = createAPIError(
      `Command '${command}' failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      command,
      cause
    );
    globalErrorHandler.handleError(error, {
      component: 'API',
      command,
      args,
      isTauri,
    });
    throw error;
  } finally {
    loadingManager.finish(loadingId);
  }
}

export const api: API = {
  isTauri,
  isDesktop: isTauri,
  isBrowser: !isTauri,

  async getCookies(): Promise<unknown[]> {
    if (!isTauri) {
      log.warn('getCookies not available in browser mode');
      return [];
    }

    try {
      return await safeInvoke<unknown[]>('get_cookies');
    } catch (cause) {
      log.error('getCookies failed:', cause);
      return [];
    }
  },

  async getServerPort(): Promise<number> {
    if (!isTauri) {
      log.debug('Using default port 3000 in browser mode');
      return 3000;
    }

    try {
      return await safeInvoke<number>('get_server_port');
    } catch (cause) {
      log.error('getServerPort failed, using default port 3000:', cause);
      return 3000;
    }
  },

  async getAppVersion(): Promise<string> {
    if (!isTauri) {
      log.debug('Using fallback version in browser mode');
      return fallbackAppVersion;
    }

    try {
      return await safeInvoke<string>('get_app_version');
    } catch (cause) {
      log.error('getAppVersion failed, using fallback version:', cause);
      return fallbackAppVersion;
    }
  },

  async manualLogin(nidAut: string, nidSes: string): Promise<boolean> {
    if (!isTauri) {
      throw createAPIError('Manual login not available in browser mode', 'manual_login');
    }
    if (!nidAut || !nidSes) {
      throw createAPIError('NID_AUT and NID_SES are required', 'manual_login');
    }

    const loadingId = 'manual-login';

    try {
      loadingManager.start(loadingId, '로그인 중...', {
        category: 'auth',
        priority: 'high',
      });

      await safeInvoke('manual_login', { nidAut, nidSes });
      log.info('Manual login successful');
      return true;
    } catch (cause) {
      log.error('Manual login failed:', cause);
      throw cause;
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  async selectAudioFile(): Promise<string | null> {
    if (!isTauri) {
      log.warn('File selection not available in browser mode');
      return null;
    }

    const loadingId = 'file-selection';

    try {
      loadingManager.start(loadingId, '파일 선택 대화상자 여는 중...', {
        category: 'file',
        priority: 'medium',
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
    } catch (cause) {
      const error = createAPIError(
        `Audio file selection failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        'selectAudioFile',
        cause
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'file-selection' });
      return null;
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  convertFileSrc(path: string): string {
    if (!isTauri || !path) {
      return path;
    }

    try {
      const converted = convertFileSrc(path);
      log.debug('File path converted:', path, '->', converted);
      return converted;
    } catch (cause) {
      const error = createAPIError(
        `File path conversion failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        'convertFileSrc',
        cause
      );
      globalErrorHandler.handleError(error, { component: 'API', originalPath: path });
      return path;
    }
  },

  async minimize(): Promise<void> {
    if (!isTauri) {
      log.warn('Window minimize not available in browser mode');
      return;
    }

    try {
      await getCurrentWindow().minimize();
      log.debug('Window minimized');
    } catch (cause) {
      const error = createAPIError(
        `Window minimize failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        'minimize',
        cause
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'window-control' });
    }
  },

  async toggleMaximize(): Promise<void> {
    if (!isTauri) {
      log.warn('Window maximize not available in browser mode');
      return;
    }

    try {
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
        log.debug('Window unmaximized');
      } else {
        await win.maximize();
        log.debug('Window maximized');
      }
    } catch (cause) {
      const error = createAPIError(
        `Window maximize toggle failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        'toggleMaximize',
        cause
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'window-control' });
    }
  },

  async close(): Promise<void> {
    if (!isTauri) {
      log.warn('Window close not available in browser mode');
      return;
    }

    try {
      await getCurrentWindow().close();
      log.debug('Window closed');
    } catch (cause) {
      const error = createAPIError(
        `Window close failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        'close',
        cause
      );
      globalErrorHandler.handleError(error, { component: 'API', operation: 'window-control' });
    }
  },

  listen<T = unknown>(
    event: string,
    callback: (event: { payload: T }) => void
  ): Promise<() => void> {
    if (!isTauri) {
      log.warn(`Event listening for '${event}' not available in browser mode`);
      return Promise.resolve(() => {});
    }

    try {
      log.debug(`Setting up event listener for: ${event}`);
      return listen(event, eventData => {
        try {
          callback(eventData as { payload: T });
        } catch (cause) {
          const error = createAPIError(
            `Event callback error for '${event}': ${cause instanceof Error ? cause.message : String(cause)}`,
            'listen',
            cause
          );
          globalErrorHandler.handleError(error, {
            component: 'API',
            event,
            eventData: eventData.payload,
          });
        }
      });
    } catch (cause) {
      const error = createAPIError(
        `Failed to set up event listener for '${event}': ${cause instanceof Error ? cause.message : String(cause)}`,
        'listen',
        cause
      );
      globalErrorHandler.handleError(error, { component: 'API', event });
      return Promise.resolve(() => {});
    }
  },

  async checkForUpdates(): Promise<{ has_update: boolean; error?: string }> {
    if (!isTauri) {
      log.debug('Update check not available in browser mode');
      return { has_update: false, error: 'Not available in browser mode' };
    }

    const loadingId = 'update-check';

    try {
      loadingManager.start(loadingId, '업데이트 확인 중...', {
        category: 'api',
        priority: 'low',
      });

      const result = await safeInvoke<{ has_update: boolean; error?: string }>('check_for_updates');
      log.info('Update check completed:', result);
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      log.error('Update check failed:', message);
      return { has_update: false, error: message };
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  async openDownloadPage(url: string): Promise<void> {
    if (!url) {
      throw createAPIError('URL is required for opening download page', 'openDownloadPage');
    }

    if (!isTauri) {
      window.open(url, '_blank');
      return;
    }

    try {
      await safeInvoke('open_download_page', { url });
      log.info('Download page opened:', url);
    } catch (cause) {
      log.error('Failed to open download page:', cause);
      window.open(url, '_blank');
    }
  },

  async downloadUpdate(url: string): Promise<void> {
    if (!isTauri) {
      throw createAPIError('Update download not available in browser mode', 'downloadUpdate');
    }
    if (!url) {
      throw createAPIError('URL is required for downloading update', 'downloadUpdate');
    }

    const loadingId = 'update-download';

    try {
      loadingManager.start(loadingId, '업데이트 다운로드 중...', {
        category: 'api',
        priority: 'high',
        progress: 0,
      });

      await safeInvoke('download_and_install_update', { url });
      log.info('Update download completed');
    } catch (cause) {
      log.error('Update download failed:', cause);
      throw cause;
    } finally {
      loadingManager.finish(loadingId);
    }
  },

  onUpdateProgress(callback: UpdateProgressCallback): Promise<() => void> {
    if (!isTauri) {
      log.warn('Update progress monitoring not available in browser mode');
      return Promise.resolve(() => {});
    }

    return api.listen<UpdateProgressPayload>('update-progress', event => {
      try {
        callback(event);
      } catch (cause) {
        const error = createAPIError(
          `Update progress callback error: ${cause instanceof Error ? cause.message : String(cause)}`,
          'onUpdateProgress',
          cause
        );
        globalErrorHandler.handleError(error, {
          component: 'API',
          event: 'update-progress',
          payload: event.payload,
        });
      }
    });
  },

  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
    return safeInvoke<T>(command, args);
  },
};
