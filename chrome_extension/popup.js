// Fazzk Extension Popup Script (Chrome/Firefox 호환)

const PORT_RANGE = { start: 3000, end: 3010 };
const HOSTS = ['127.0.0.1', 'localhost'];

// API 호환성: browser 또는 chrome 사용
const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const portInfo = document.getElementById('portInfo');
    const sendBtn = document.getElementById('sendBtn');
    const copyBtn = document.getElementById('copyBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    // 초기 연결 확인
    checkConnection();

    sendBtn.addEventListener('click', async () => {
        statusDiv.textContent = '전송 중...';
        statusDiv.style.color = '#aaa';

        try {
            const result = await api.runtime.sendMessage({ type: 'manualSync' });

            if (result?.ok) {
                statusDiv.textContent = '전송 성공! 앱을 확인하세요.';
                statusDiv.style.color = '#00ffa3';
                if (result.host && result.port) {
                    portInfo.textContent = `주소: ${result.host}:${result.port}`;
                    portInfo.style.color = '#00ffa3';
                }
            } else if (result?.error === 'missing_cookies') {
                statusDiv.textContent = '네이버 로그인 필요';
                statusDiv.style.color = '#ff5555';
            } else if (result?.error === 'app_not_running') {
                statusDiv.textContent = '앱을 실행해 주세요.';
                statusDiv.style.color = '#ff5555';
            } else {
                statusDiv.textContent = `앱 연결 실패${result?.error ? ` (${result.error})` : ''}`;
                statusDiv.style.color = '#ff5555';
            }
        } catch (error) {
            statusDiv.textContent = '확장 백그라운드와 통신하지 못했습니다.';
            statusDiv.style.color = '#ff5555';
        }
    });

    copyBtn.addEventListener('click', async () => {
        const cookies = await getCookies();
        if (cookies) {
            const json = JSON.stringify(cookies, null, 2);
            navigator.clipboard.writeText(json).then(() => {
                statusDiv.textContent = '복사되었습니다!';
                setTimeout(() => checkConnection(), 2000);
            });
        } else {
            statusDiv.textContent = '네이버 로그인 필요';
        }
    });

    refreshBtn.addEventListener('click', async () => {
        portInfo.textContent = '포트 탐색 중...';
        portInfo.style.color = '#aaa';
        await api.storage.local.remove(['activeHost', 'activePort']);
        checkConnection();
    });

    async function getCookies() {
        const nidAut = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
        const nidSes = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

        if (nidAut && nidSes) {
            return { NID_AUT: nidAut.value, NID_SES: nidSes.value };
        }
        return null;
    }

    async function findActivePort() {
        for (const host of HOSTS) {
            for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
                try {
                    const response = await fetch(`http://${host}:${port}/health`, {
                        method: 'GET',
                        signal: AbortSignal.timeout(500)
                    });
                    if (response.ok) {
                        const health = await response.json();
                        if (health?.app !== 'fazzk' || health?.status !== 'ok') {
                            continue;
                        }

                        await api.storage.local.set({ activeHost: host, activePort: port });
                        return { host, port };
                    }
                } catch (e) {
                    // 이 주소 사용 불가
                }
            }
        }
        return null;
    }

    async function getActivePort() {
        const stored = await api.storage.local.get(['activeHost', 'activePort']);
        if (stored.activeHost && stored.activePort) {
            try {
                const response = await fetch(`http://${stored.activeHost}:${stored.activePort}/health`, {
                    signal: AbortSignal.timeout(500)
                });
                if (response.ok) {
                    const health = await response.json();
                    if (health?.app !== 'fazzk' || health?.status !== 'ok') {
                        throw new Error('Invalid settings response');
                    }

                    return { host: stored.activeHost, port: stored.activePort };
                }
            } catch (e) {
                // 저장된 포트 무효
            }
        }
        return await findActivePort();
    }

    async function checkConnection() {
        const target = await getActivePort();
        if (target) {
            portInfo.textContent = `주소: ${target.host}:${target.port}`;
            portInfo.style.color = '#00ffa3';
            statusDiv.textContent = '앱 연결됨 (자동 동기화 중)';
            statusDiv.style.color = '#00ffa3';
        } else {
            portInfo.textContent = '앱 미연결';
            portInfo.style.color = '#ff5555';
            statusDiv.textContent = '앱을 실행해 주세요.';
            statusDiv.style.color = '#aaa';
        }
    }
});
