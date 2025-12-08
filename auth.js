const { session } = require('electron');
const Store = require('electron-store');
const fs = require('fs');
const config = require('./config');

const store = new Store({
    name: 'session',
    encryptionKey: config.auth.encryptionKey
});

async function saveSessionData() {
    const userDataPath = config.paths.userData;

    console.log('[Auth] Saving session data...');

    try {
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        fs.accessSync(userDataPath, fs.constants.W_OK);

        const currentSession = session.fromPartition('persist:chzzk');
        const cookies = await currentSession.cookies.get({});

        if (cookies.length === 0) {
            console.warn('[Auth] No cookies to save.');
        } else {
            const naverAuthCookies = cookies.filter(c => c.name === 'NID_AUT' || c.name === 'NID_SES');
            if (naverAuthCookies.length > 0) {
                console.log(`[Auth] Found ${naverAuthCookies.length} Naver auth cookies.`);
            }
        }

        const sessionData = {
            cookies,
            savedAt: new Date().toISOString()
        };

        store.set('session', sessionData);
        console.log('[Auth] Session data saved securely.');
    } catch (error) {
        console.error('[Auth] Failed to save session data:', error);
    }
}

async function loadSessionData() {
    console.log('[Auth] Loading session data...');

    try {
        if (!store.has('session')) {
            console.log('[Auth] No saved session data found.');
            return false;
        }

        const sessionData = store.get('session');

        if (!sessionData.cookies || !Array.isArray(sessionData.cookies)) {
            console.error('[Auth] Invalid session data format.');
            clearSessionData();
            return false;
        }

        const now = Date.now() / 1000;
        const hasExpiredCookies = sessionData.cookies.some(cookie => {
            return cookie.expirationDate && cookie.expirationDate < now;
        });

        if (hasExpiredCookies) {
            console.log('[Auth] Found expired cookies. Clearing session.');
            clearSessionData();
            return false;
        }

        // Filter out invalid cookies instead of clearing everything
        const validCookies = sessionData.cookies.filter(cookie => {
            return config.auth.allowedDomains.some(domain => {
                if (domain.startsWith('.')) {
                    return cookie.domain.endsWith(domain) || cookie.domain === domain.substring(1);
                }
                return cookie.domain === domain;
            });
        });

        if (validCookies.length < sessionData.cookies.length) {
            console.log(`[Auth] Filtered out ${sessionData.cookies.length - validCookies.length} invalid domain cookies.`);
        }

        const currentSession = session.fromPartition('persist:chzzk');
        let successCount = 0;

        for (const cookie of validCookies) {
            if (!cookie.url) {
                cookie.url = `http${cookie.secure ? 's' : ''}://${cookie.domain}`;
            }
            try {
                await currentSession.cookies.set(cookie);
                successCount++;
            } catch (error) {
                console.error('[Auth] Failed to set cookie:', error);
            }
        }

        console.log(`[Auth] Session restored. ${successCount}/${sessionData.cookies.length} cookies loaded.`);
        return successCount > 0;
    } catch (error) {
        console.error('[Auth] Failed to load session data:', error);
        clearSessionData();
        return false;
    }
}

function clearSessionData() {
    try {
        store.delete('session');
        console.log('[Auth] Session data cleared.');
    } catch (error) {
        console.error('[Auth] Failed to clear session data:', error);
    }
}

async function getAllCookies() {
    try {
        return await session.fromPartition('persist:chzzk').cookies.get({});
    } catch (error) {
        console.error('[Auth] Failed to get all cookies:', error);
        return [];
    }
}

async function getCookiesForDomain(domain) {
    try {
        return await session.fromPartition('persist:chzzk').cookies.get({ domain });
    } catch (error) {
        console.error('[Auth] Failed to get cookies for domain:', error);
        return [];
    }
}

async function getAuthCookies() {
    const allCookies = await getAllCookies();
    const authCookies = allCookies.reduce((acc, obj) => {
        if (obj.name === 'NID_AUT' || obj.name === 'NID_SES') {
            acc[obj.name] = obj.value;
        }
        return acc;
    }, {});

    if (!authCookies['NID_SES'] || !authCookies['NID_AUT']) {
        throw new Error('Missing authentication cookies');
    }

    return {
        NID_SES: authCookies['NID_SES'],
        NID_AUT: authCookies['NID_AUT']
    };
}

async function setManualCookies(cookieData) {
    console.log('[Auth] Setting manual cookies...');
    const currentSession = session.fromPartition('persist:chzzk');
    const domain = '.naver.com';
    const now = Date.now() / 1000;
    const expirationDate = now + (60 * 60 * 24 * 365); // 1 year

    const cookiesToSet = [
        { url: 'https://naver.com', name: 'NID_AUT', value: cookieData.NID_AUT, domain: domain, path: '/', secure: true, httpOnly: true, expirationDate },
        { url: 'https://naver.com', name: 'NID_SES', value: cookieData.NID_SES, domain: domain, path: '/', secure: true, httpOnly: true, expirationDate }
    ];

    for (const cookie of cookiesToSet) {
        try {
            await currentSession.cookies.set(cookie);
            console.log(`[Auth] Set cookie: ${cookie.name}`);
        } catch (error) {
            console.error(`[Auth] Failed to set cookie ${cookie.name}:`, error);
        }
    }

    await saveSessionData();
    return true;
}

// 세션 모니터 관련 변수
let sessionMonitorInterval = null;
let sessionExpiryCallback = null;

/**
 * 세션 만료 시간 확인
 */
async function getSessionExpiryTime() {
    const cookies = await getAllCookies();
    const authCookies = cookies.filter(c => c.name === 'NID_AUT' || c.name === 'NID_SES');

    if (authCookies.length === 0) return null;

    // 가장 빨리 만료되는 쿠키 찾기
    let earliestExpiry = Infinity;
    authCookies.forEach(cookie => {
        if (cookie.expirationDate && cookie.expirationDate < earliestExpiry) {
            earliestExpiry = cookie.expirationDate;
        }
    });

    return earliestExpiry === Infinity ? null : earliestExpiry * 1000; // ms로 변환
}

/**
 * 세션 만료 임박 여부 확인 (1시간 내)
 */
async function isSessionExpiringSoon(hoursThreshold = 1) {
    const expiryTime = await getSessionExpiryTime();
    if (!expiryTime) return false;

    const now = Date.now();
    const threshold = hoursThreshold * 60 * 60 * 1000;

    return (expiryTime - now) < threshold;
}

/**
 * 세션 모니터 시작
 * @param {Function} onExpiringSoon - 만료 임박 시 콜백
 */
function startSessionMonitor(onExpiringSoon) {
    sessionExpiryCallback = onExpiringSoon;

    // 10분마다 세션 체크 및 저장
    sessionMonitorInterval = setInterval(async () => {
        console.log('[Auth] 세션 모니터 실행...');

        // 세션 데이터 저장
        await saveSessionData();

        // 만료 임박 확인
        const expiringSoon = await isSessionExpiringSoon(1);
        if (expiringSoon && sessionExpiryCallback) {
            console.log('[Auth] 세션 만료 임박!');
            sessionExpiryCallback();
        }
    }, 10 * 60 * 1000); // 10분

    console.log('[Auth] 세션 모니터 시작됨');
}

/**
 * 세션 모니터 중지
 */
function stopSessionMonitor() {
    if (sessionMonitorInterval) {
        clearInterval(sessionMonitorInterval);
        sessionMonitorInterval = null;
    }
}

// 자동 갱신 관련 변수
let autoRefreshTimeout = null;

/**
 * 세션 갱신 시도
 * 현재 쿠키로 API 호출하여 세션 유효성 검증
 */
async function refreshSession() {
    try {
        const authCookies = await getAuthCookies();
        const axios = require('axios');

        // Chzzk API로 세션 유효성 검증
        const response = await axios.get('https://api.chzzk.naver.com/service/v1/user', {
            headers: {
                'Cookie': `NID_AUT=${authCookies.NID_AUT}; NID_SES=${authCookies.NID_SES}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.status === 200 && response.data.code === 200) {
            // 세션 유효 - 쿠키 저장하여 만료 시간 갱신
            await saveSessionData();
            return { success: true, message: '세션 갱신 성공' };
        }

        return { success: false, message: '세션 검증 실패' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * 자동 갱신 시작
 * 세션 만료 1시간 전에 자동으로 갱신 시도
 * @param {Function} onRefreshFailed - 갱신 실패 시 콜백
 */
async function startAutoRefresh(onRefreshFailed) {
    // 기존 타이머 정리
    if (autoRefreshTimeout) {
        clearTimeout(autoRefreshTimeout);
    }

    const expiryTime = await getSessionExpiryTime();
    if (!expiryTime) {
        return;
    }

    const now = Date.now();
    const refreshTime = expiryTime - (60 * 60 * 1000); // 만료 1시간 전
    const delay = Math.max(refreshTime - now, 60000); // 최소 1분 후

    autoRefreshTimeout = setTimeout(async () => {
        const result = await refreshSession();

        if (result.success) {
            // 다음 갱신 스케줄링
            startAutoRefresh(onRefreshFailed);
        } else {
            // 갱신 실패 시 콜백 호출
            if (onRefreshFailed) {
                onRefreshFailed(result.message);
            }
        }
    }, delay);
}

/**
 * 자동 갱신 중지
 */
function stopAutoRefresh() {
    if (autoRefreshTimeout) {
        clearTimeout(autoRefreshTimeout);
        autoRefreshTimeout = null;
    }
}

module.exports = {
    saveSessionData,
    loadSessionData,
    clearSessionData,
    getAllCookies,
    getCookiesForDomain,
    getAuthCookies,
    setManualCookies,
    getSessionExpiryTime,
    isSessionExpiringSoon,
    startSessionMonitor,
    stopSessionMonitor,
    refreshSession,
    startAutoRefresh,
    stopAutoRefresh,
    store
};
