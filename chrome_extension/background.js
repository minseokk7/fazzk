// Fazzk Extension Background Script (Chrome/Firefox 호환)
// browser API 사용 (polyfill에 의해 Chrome에서도 작동)

const PORT_RANGE = { start: 3000, end: 3010 };
const HOSTS = ['127.0.0.1', 'localhost'];
let activePort = null;
let activeHost = null;
let lastSent = 0;
let isConnected = false;

// API 호환성: browser 또는 chrome 사용
const api = typeof browser !== 'undefined' ? browser : chrome;

// 아이콘 상태 업데이트
async function setIconStatus(status) {
    const configs = {
        connected: { text: '', color: '#00ffa3', title: 'Fazzk - 연결됨' },
        disconnected: { text: '!', color: '#ff5555', title: 'Fazzk - 미연결' },
        syncing: { text: '↻', color: '#ffaa00', title: 'Fazzk - 동기화 중...' }
    };

    const config = configs[status] || configs.disconnected;

    try {
        await api.action.setBadgeText({ text: config.text });
        await api.action.setBadgeBackgroundColor({ color: config.color });
        await api.action.setTitle({ title: config.title });
        isConnected = (status === 'connected');
    } catch (e) {
        console.error('[Icon] Error:', e);
    }
}

// 사용 가능한 포트 찾기
async function findActivePort() {
    for (const host of HOSTS) {
        for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 500);

                const response = await fetch(`http://${host}:${port}/health`, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const health = await response.json();
                    if (health?.app !== 'fazzk' || health?.status !== 'ok') {
                        continue;
                    }

                    activeHost = host;
                    activePort = port;
                    await api.storage.local.set({ activeHost: host, activePort: port });
                    await setIconStatus('connected');
                    return { host, port };
                }
            } catch (e) {
                // 이 주소는 사용 불가
            }
        }
    }

    activeHost = null;
    activePort = null;
    await api.storage.local.remove(['activeHost', 'activePort']);
    await setIconStatus('disconnected');
    return null;
}

// 저장된 포트 확인 또는 탐색
async function getActivePort() {
    const stored = await api.storage.local.get(['activeHost', 'activePort']);

    if (stored.activeHost && stored.activePort) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 500);

            const response = await fetch(`http://${stored.activeHost}:${stored.activePort}/health`, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const health = await response.json();
                if (health?.app !== 'fazzk' || health?.status !== 'ok') {
                    throw new Error('Invalid settings response');
                }

                activeHost = stored.activeHost;
                activePort = stored.activePort;
                if (!isConnected) {
                    await setIconStatus('connected');
                }
                return { host: activeHost, port: activePort };
            }
        } catch (e) {
            // 저장된 포트 무효
        }
    }

    return await findActivePort();
}

// Alarm을 사용한 연결 상태 확인
api.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'connectionCheck') {
        await getActivePort();
    }
});

// 쿠키 변경 감지
api.cookies.onChanged.addListener((changeInfo) => {
    const cookie = changeInfo.cookie;
    if (cookie.domain.includes('naver.com') && (cookie.name === 'NID_AUT' || cookie.name === 'NID_SES')) {
        const now = Date.now();
        if (now - lastSent > 2000) {
            lastSent = now;
            checkAndSendCookies();
        }
    }
});

async function checkAndSendCookies() {
    try {
        const nidAut = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
        const nidSes = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

        if (nidAut && nidSes) {
            sendToApp(nidAut.value, nidSes.value);
        }
    } catch (error) {
        console.error('[Cookie] Error:', error);
    }
}

async function sendToApp(nidAut, nidSes) {
    const target = await getActivePort();
    if (!target) {
        await setIconStatus('disconnected');
        return { ok: false, error: 'app_not_running' };
    }

    const { host, port } = target;

    try {
        await setIconStatus('syncing');

        const response = await fetch(`http://${host}:${port}/auth/cookies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ NID_AUT: nidAut, NID_SES: nidSes })
        });

        if (response.ok) {
            await setIconStatus('connected');

            // 성공 표시
            await api.action.setBadgeText({ text: '✓' });
            await api.action.setBadgeBackgroundColor({ color: '#00ffa3' });

            setTimeout(async () => {
                if (isConnected) {
                    await api.action.setBadgeText({ text: '' });
                }
            }, 3000);
            return { ok: true, host, port };
        } else {
            await setIconStatus('disconnected');
            return { ok: false, error: `http_${response.status}`, host, port };
        }
    } catch (error) {
        console.error('[Send] Error:', error);
        activeHost = null;
        activePort = null;
        await api.storage.local.remove(['activeHost', 'activePort']);
        await setIconStatus('disconnected');
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'manualSync') {
        (async () => {
            try {
                const nidAut = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
                const nidSes = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

                if (!nidAut || !nidSes) {
                    sendResponse({ ok: false, error: 'missing_cookies' });
                    return;
                }

                const result = await sendToApp(nidAut.value, nidSes.value);
                sendResponse(result);
            } catch (error) {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        })();

        return true;
    }

    return false;
});

// 시작 시 초기화
async function initialize() {
    console.log('[Init] Fazzk Extension starting...');

    // 초기 상태는 미연결
    await setIconStatus('disconnected');

    // 포트 찾기
    await findActivePort();

    // 10초마다 연결 확인 알람 설정
    await api.alarms.create('connectionCheck', {
        periodInMinutes: 0.167 // 약 10초
    });

    console.log('[Init] Extension initialized');
}

// 시작
initialize();
