import type { FollowerItem } from '../../types/common';

export const HISTORY_MAX_SIZE = 50;
export const HISTORY_CLEANUP_INTERVAL = 5 * 60 * 1000;
export const HISTORY_STORAGE_KEY = 'alarmHistory';
export const KNOWN_FOLLOWERS_KEY = 'fazzk-known-followers-v2';
const RUBLIS_HASH = 'f2f551b67556276caa1f590604a7d92a';

type KnownFollowersPayload = {
  followers: string[];
  lastSaved: number;
  appStartTime: number;
};

export function clampHistory<T>(history: T[], maxSize = HISTORY_MAX_SIZE): T[] {
  return history.slice(0, maxSize);
}

export function saveHistory(history: FollowerItem[], storageKey = HISTORY_STORAGE_KEY): void {
  localStorage.setItem(storageKey, JSON.stringify(history));
}

export function loadHistory(
  storageKey = HISTORY_STORAGE_KEY,
  maxSize = HISTORY_MAX_SIZE
): FollowerItem[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid history format');
  }

  return parsed.slice(0, maxSize);
}

export function clearHistory(storageKey = HISTORY_STORAGE_KEY): void {
  localStorage.removeItem(storageKey);
}

export function addHistoryItem(history: FollowerItem[], item: FollowerItem): FollowerItem[] {
  const historyItem = {
    ...item,
    _id: Date.now() + Math.random().toString(36).slice(2, 11),
    notifiedAt: new Date().toISOString(),
  };

  return [historyItem, ...history.slice(0, HISTORY_MAX_SIZE - 1)];
}

export function formatHistoryTime(iso?: string): string {
  if (!iso) {
    return '-';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function saveKnownFollowers(knownFollowers: Iterable<string>, appStartTime: number): void {
  const data: KnownFollowersPayload = {
    followers: Array.from(knownFollowers),
    lastSaved: Date.now(),
    appStartTime,
  };
  localStorage.setItem(KNOWN_FOLLOWERS_KEY, JSON.stringify(data));
}

export function loadKnownFollowers(maxAgeMs = 7 * 24 * 60 * 60 * 1000): {
  followers: string[];
  lastSaved: number | null;
} {
  const raw = localStorage.getItem(KNOWN_FOLLOWERS_KEY);
  if (!raw) {
    return { followers: [], lastSaved: null };
  }

  const parsed = JSON.parse(raw) as Partial<KnownFollowersPayload>;
  const lastSaved = parsed.lastSaved ?? null;
  if (!lastSaved || lastSaved <= Date.now() - maxAgeMs) {
    return { followers: [], lastSaved: null };
  }

  const followers = Array.isArray(parsed.followers)
    ? parsed.followers.filter(
        (hash): hash is string => typeof hash === 'string' && hash !== RUBLIS_HASH
      )
    : [];

  return { followers, lastSaved };
}

export function excludeKnownFollower(
  hash: string,
  knownFollowers: Set<string> | { delete(value: string): boolean }
): boolean {
  return knownFollowers.delete(hash);
}
