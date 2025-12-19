/**
 * @fileoverview Fazzk 프로젝트 통합 설정 파일
 * API, UI, 시스템 설정 등 모든 하드코딩된 값을 중앙에서 관리합니다.
 */

const CONFIG = {
    // API 및 서버 설정
    API: {
        BASE_URL_DEFAULT: 'http://localhost:3000',
        OBS_URL_PATH: '/follower',
        POLLING_INTERVAL_DEFAULT: 5, // 초 단위
        RECONNECT_ATTEMPTS: 5,
        RECONNECT_DELAY: 2000,       // 밀리초
        TIMEOUT_TAURI_LOAD: 1000     // Tauri API 로드 대기 시간
    },

    // UI 및 알림 설정
    UI: {
        DISPLAY_DURATION_DEFAULT: 5000, // 밀리초
        ANIMATION_TYPES: ['fade', 'slide-up', 'slide-down', 'bounce'],
        DEFAULT_ANIMATION: 'fade',
        DEFAULT_VOLUME: 0.5,
        DEFAULT_TEXT_SIZE: 100, // 퍼센트
        DEFAULT_TEXT_COLOR: '#ffffff'
    },

    // 사운드 설정
    SOUND: {
        DEFAULT_PATH: '/public/sound.mp3'
    },

    // 로컬 스토리지 키
    STORAGE_KEYS: {
        VOLUME: 'volume',
        POLLING_INTERVAL: 'pollingInterval',
        ENABLE_TTS: 'enableTTS',
        CUSTOM_SOUND_PATH: 'customSoundPath',
        ANIMATION_TYPE: 'animationType',
        TEXT_COLOR: 'textColor',
        TEXT_SIZE: 'textSize',
        THEME: 'theme'
    },

    // 디버그 설정
    DEBUG: {
        ENABLED: false, // 개발 모드일 때 true로 변경
        LOG_PREFIX: '[Fazzk]'
    }
};

// 전역 객체로 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.FAZZK_CONFIG = CONFIG;
    console.log('[Config] Loaded successfully');
}

// 모듈 환경 지원 (필요 시)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
