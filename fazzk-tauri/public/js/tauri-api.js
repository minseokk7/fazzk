/**
 * Tauri API 호환 레이어
 * Electron의 window.electronAPI를 Tauri API로 대체합니다.
 * 
 * 사용법: HTML 파일에서 이 스크립트를 먼저 로드하세요.
 * <script src="/public/js/tauri-api.js"></script>
 */

// Tauri 환경 감지
const isTauri = window.__TAURI__ !== undefined;

// Tauri API 초기화
async function initTauriAPI() {
    if (!isTauri) {
        console.warn('[Tauri API] Tauri 환경이 아닙니다. 일부 기능이 비활성화됩니다.');
        return;
    }

    const { invoke } = window.__TAURI__.core;
    const { open } = window.__TAURI__.shell;
    const { getCurrentWindow } = window.__TAURI__.window;

    // window.electronAPI 호환 객체 생성
    window.electronAPI = {
        // === 쿠키/세션 관리 (Rust 백엔드 구현 필요) ===
        getCookies: async () => {
            try {
                return await invoke('get_cookies');
            } catch (e) {
                console.error('[Tauri API] getCookies 실패:', e);
                return [];
            }
        },
        getCookiesForDomain: async (domain) => {
            try {
                return await invoke('get_cookies_for_domain', { domain });
            } catch (e) {
                console.error('[Tauri API] getCookiesForDomain 실패:', e);
                return [];
            }
        },
        clearSessionData: async () => {
            try {
                return await invoke('clear_session_data');
            } catch (e) {
                console.error('[Tauri API] clearSessionData 실패:', e);
                return false;
            }
        },

        // === 네비게이션 ===
        navigateToUrl: async (url) => {
            try {
                return await invoke('navigate_to_url', { url });
            } catch (e) {
                console.error('[Tauri API] navigateToUrl 실패:', e);
                // 폴백: 현재 창에서 이동
                window.location.href = url;
                return true;
            }
        },

        // === 로그인 ===
        startLogin: async () => {
            try {
                return await invoke('start_login');
            } catch (e) {
                console.error('[Tauri API] startLogin 실패:', e);
                alert('로그인 기능이 아직 구현되지 않았습니다. (Tauri 마이그레이션 진행 중)');
                return false;
            }
        },

        // === 설정 ===
        selectAudioFile: async () => {
            try {
                const { open: openDialog } = window.__TAURI__.dialog;
                const selected = await openDialog({
                    multiple: false,
                    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]
                });
                return selected;
            } catch (e) {
                console.error('[Tauri API] selectAudioFile 실패:', e);
                return null;
            }
        },
        getAppConfig: async () => {
            try {
                return await invoke('get_app_config');
            } catch (e) {
                console.error('[Tauri API] getAppConfig 실패:', e);
                return { port: 3000 };
            }
        },

        // === 테마 ===
        setTheme: async (isDark) => {
            // Tauri에서는 타이틀바 색상 변경이 제한적이므로 로컬 저장만 수행
            localStorage.setItem('fazzk-theme', isDark ? 'dark' : 'light');
            return true;
        },

        // === 업데이트 관련 (이벤트 리스너 스텁) ===
        // Tauri 업데이터는 다른 방식으로 동작하므로 스텁 처리
        onUpdateAvailable: (callback) => {
            // Tauri 업데이터 이벤트 연결 예정
            console.log('[Tauri API] onUpdateAvailable 리스너 등록됨');
        },
        onUpdateDownloadStarted: (callback) => {
            console.log('[Tauri API] onUpdateDownloadStarted 리스너 등록됨');
        },
        onUpdateProgress: (callback) => {
            console.log('[Tauri API] onUpdateProgress 리스너 등록됨');
        },
        onUpdateDownloaded: (callback) => {
            console.log('[Tauri API] onUpdateDownloaded 리스너 등록됨');
        },
        onUpdateAvailableGithub: (callback) => {
            console.log('[Tauri API] onUpdateAvailableGithub 리스너 등록됨');
        },
        onUpdateCheckFailed: (callback) => {
            console.log('[Tauri API] onUpdateCheckFailed 리스너 등록됨');
        },
        onUpdateCheckComplete: (callback) => {
            console.log('[Tauri API] onUpdateCheckComplete 리스너 등록됨');
        },
        checkForUpdates: async () => {
            console.log('[Tauri API] checkForUpdates 호출 (스텁)');
            return false;
        },
        openDownloadPage: async (url) => {
            try {
                await open(url);
                return true;
            } catch (e) {
                console.error('[Tauri API] openDownloadPage 실패:', e);
                window.open(url, '_blank');
                return true;
            }
        },

        // === 창 제어 (Custom Titlebar for Tauri) ===
        minimize: async () => {
            try {
                await getCurrentWindow().minimize();
            } catch (e) {
                console.error('[Tauri API] minimize 실패:', e);
            }
        },
        toggleMaximize: async () => {
            try {
                const win = getCurrentWindow();
                const isMaximized = await win.isMaximized();
                if (isMaximized) {
                    await win.unmaximize();
                } else {
                    await win.maximize();
                }
            } catch (e) {
                console.error('[Tauri API] toggleMaximize 실패:', e);
            }
        },
        close: async () => {
            try {
                await getCurrentWindow().close();
            } catch (e) {
                console.error('[Tauri API] close 실패:', e);
            }
        },

        // === 로깅 ===
        log: (...args) => console.log('[Tauri]', ...args)
    };

    console.log('[Tauri API] 초기화 완료');
}

// 페이지 로드 시 자동 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTauriAPI);
} else {
    initTauriAPI();
}
