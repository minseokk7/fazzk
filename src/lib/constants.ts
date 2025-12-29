/**
 * 애플리케이션 상수 정의
 */

// 에러 메시지
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '네트워크 연결을 확인해주세요',
  LOGIN_FAILED: '로그인에 실패했습니다',
  SETTINGS_SAVE_FAILED: '설정 저장에 실패했습니다',
  FILE_SELECT_FAILED: '파일 선택에 실패했습니다',
  WEBSOCKET_CONNECTION_FAILED: 'WebSocket 연결에 실패했습니다',
  FOLLOWER_FETCH_FAILED: '팔로워 정보를 가져오는데 실패했습니다',
  AUDIO_PLAY_FAILED: '오디오 재생에 실패했습니다',
  UPDATE_CHECK_FAILED: '업데이트 확인에 실패했습니다',
} as const;

// 성공 메시지
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: '로그인 성공',
  SETTINGS_SAVED: '설정이 저장되었습니다',
  FILE_SELECTED: '파일이 선택되었습니다',
  WEBSOCKET_CONNECTED: 'WebSocket 연결 성공',
  UPDATE_AVAILABLE: '새 업데이트가 있습니다',
} as const;

// 정보 메시지
export const INFO_MESSAGES = {
  INITIALIZING: '초기화 중...',
  CONNECTING: '연결 중...',
  LOADING: '로딩 중...',
  PROCESSING: '처리 중...',
  RECONNECTING: '재연결 중...',
} as const;

// 설정 기본값
export const DEFAULT_SETTINGS = {
  VOLUME: 0.5,
  POLLING_INTERVAL: 15,
  DISPLAY_DURATION: 5,
  ENABLE_TTS: false,
  ANIMATION_TYPE: 'fade',
  NOTIFICATION_LAYOUT: 'vertical',
  TEXT_COLOR: '#ffffff',
  TEXT_SIZE: 100,
} as const;

// WebSocket 설정
export const WEBSOCKET_CONFIG = {
  RECONNECT_INTERVAL: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
  PING_INTERVAL: 30000,
} as const;

// 폴링 설정
export const POLLING_CONFIG = {
  MIN_INTERVAL: 5,
  MAX_INTERVAL: 60,
  COOLDOWN: 1000,
} as const;

// 루블리스 설정
export const RUBLIS_CONFIG = {
  USER_HASH: 'f2f551b67556276caa1f590604a7d92a',
  COOLDOWN_SECONDS: 5,
} as const;

// OBS 설정
export const OBS_CONFIG = {
  RECOMMENDED_SIZE_VERTICAL: '300x350',
  RECOMMENDED_SIZE_HORIZONTAL: '600x150',
} as const;

// 키보드 단축키
export const KEYBOARD_SHORTCUTS = {
  TEST_NOTIFICATION: 'Ctrl+T',
  TOGGLE_SETTINGS: 'Ctrl+S',
  TOGGLE_HISTORY: 'Ctrl+H',
  CLOSE_MODAL: 'Escape',
} as const;
