import type { AppSettings } from '../../types/common';
import type { SettingsManager } from '../settingsManager';

type IntervalId = ReturnType<typeof setInterval>;

export function startManagedSettingsSync(
  wsConnected: boolean,
  settingsManager: SettingsManager | null,
  existingIntervalId: IntervalId | null,
  onError: (error: unknown) => void
): IntervalId | null {
  if (existingIntervalId) {
    clearInterval(existingIntervalId);
  }

  if (wsConnected || !settingsManager) {
    return null;
  }

  return setInterval(async () => {
    try {
      await settingsManager.loadFromServer();
    } catch (error) {
      onError(error);
    }
  }, 30000);
}

export function startLegacySettingsSync(
  baseUrl: string,
  existingIntervalId: IntervalId | null,
  applySettings: (settings: Partial<AppSettings>) => void,
  onError: (error: unknown) => void
): IntervalId {
  if (existingIntervalId) {
    clearInterval(existingIntervalId);
  }

  let lastSettingsHash: string | null = null;
  let syncInProgress = false;

  const syncSettings = async () => {
    if (syncInProgress) {
      return;
    }

    syncInProgress = true;

    try {
      const response = await fetch(`${baseUrl}/settings?_t=${Date.now()}`);
      if (!response.ok) {
        return;
      }

      const serverSettings = (await response.json()) as Partial<AppSettings>;
      const currentHash = JSON.stringify(serverSettings);

      if (lastSettingsHash === null || lastSettingsHash !== currentHash) {
        applySettings(serverSettings);
      }

      lastSettingsHash = currentHash;
    } catch (error) {
      onError(error);
    } finally {
      syncInProgress = false;
    }
  };

  void syncSettings();
  return setInterval(syncSettings, 30000);
}
