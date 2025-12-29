// Tauri API 타입 정의
export interface TauriAPI {
  invoke: <T = any>(cmd: string, args?: Record<string, any>) => Promise<T>;
  listen: <T = any>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  emit: (event: string, payload?: any) => Promise<void>;
}

// Tauri 명령어 타입 정의
export interface TauriCommands {
  get_followers: () => Promise<Follower[]>;
  get_settings: () => Promise<Settings>;
  save_settings: (settings: Settings) => Promise<void>;
  check_for_updates: () => Promise<UpdateInfo | null>;
  install_update: () => Promise<void>;
}

// 팔로워 타입
export interface Follower {
  id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
  followed_at: string;
}

// 설정 타입
export interface Settings {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  broadcaster_id: string;
  broadcaster_name: string;
  notification_sound: boolean;
  notification_duration: number;
  polling_interval: number;
}

// 업데이트 정보 타입
export interface UpdateInfo {
  version: string;
  notes: string;
  pub_date: string;
  signature: string;
  url: string;
}

// WebSocket 메시지 타입
export interface WebSocketMessage {
  type: 'new_follower' | 'settings_update' | 'error';
  data: any;
}

// 이벤트 타입
export interface TauriEvents {
  'new-follower': Follower;
  'settings-updated': Settings;
  'update-available': UpdateInfo;
  'update-progress': { progress: number; message: string };
  'update-installed': void;
}

// 환경 체크 함수 타입
export interface EnvironmentCheck {
  isTauri: boolean;
  isDesktop: boolean;
  isBrowser: boolean;
}
