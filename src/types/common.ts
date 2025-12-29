/**
 * 공통 타입 정의
 */

// 설정 관련 타입
export interface AppSettings {
  volume: number;
  pollingInterval: number;
  displayDuration: number;
  enableTTS: boolean;
  customSoundPath: string | null;
  animationType: AnimationType;
  notificationLayout: NotificationLayout;
  textColor: string;
  textSize: number;
}

export type AnimationType = 'fade' | 'slide-up' | 'slide-down' | 'bounce';
export type NotificationLayout = 'vertical' | 'horizontal';

// 팔로워 관련 타입
export interface FollowerItem {
  user: {
    userIdHash: string;
    nickname: string;
    profileImageUrl?: string;
  };
  followingSince?: string;
  notifiedAt?: number;
  _id?: string;
}

export interface RealFollowerQueueItem {
  follower: FollowerItem;
  created_at: number;
}

// WebSocket 관련 타입
export interface WSMessage {
  type: 'follower' | 'ping' | 'pong' | 'error';
  data?: any;
  timestamp?: number;
}

export interface WSConnectionState {
  connected: boolean;
  reconnecting: boolean;
  attempts: number;
  lastError?: string;
}

// API 응답 타입
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UpdateCheckResult {
  has_update: boolean;
  current_version?: string;
  latest_version?: string;
  download_url?: string;
  release_notes?: string;
  error?: string;
}

// 로그 관련 타입
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  timestamp: number;
  data?: any;
}

// 히스토리 관련 타입
export interface NotificationHistory {
  id: string;
  follower: FollowerItem;
  timestamp: number;
  type: 'real' | 'test';
}

// 상태 관리 타입
export interface AppState {
  isInitialized: boolean;
  isConnected: boolean;
  currentUser?: {
    nickname: string;
    userIdHash: string;
  };
  settings: AppSettings;
  notifications: FollowerItem[];
  history: NotificationHistory[];
}

// 이벤트 타입
export interface AppEvent {
  type: string;
  payload?: any;
  timestamp: number;
}

// 환경 관련 타입
export interface Environment {
  isTauri: boolean;
  isDevelopment: boolean;
  isOBSMode: boolean;
  version: string;
}

// 에러 타입
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}
// 유틸리티 타입
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// 상수 타입
export const ANIMATION_TYPES = ['fade', 'slide-up', 'slide-down', 'bounce'] as const;
export const NOTIFICATION_LAYOUTS = ['vertical', 'horizontal'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
