// 포트 범위 설정
const PORT_RANGE = { start: 3000, end: 3010 };
let activePort = null;
let lastSent = 0;
let connectionCheckInterval = null;

// 아이콘 색상 설정
const ICON_COLORS = {
    connected: '#00ffa3',
    disconnected: '#666666',
    syncing: '#ffaa00'
};

// 동적 아이콘 생성
function createIcon(color) {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // 원형 배경
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // F 글자
    ctx.fillStyle = color === '#00ffa3' ? '#000' : '#fff';
    ctx.font = 'bold 70px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', 64, 68);

    return ctx.getImageData(0, 0, 128, 128);
}

// 아이콘 상태 업데이트
async function setIconStatus(status) {
    const color = ICON_COLORS[status] || ICON_COLORS.disconnected;
    const imageData = createIcon(color);

    await chrome.action.setIcon({ imageData: { 128: imageData } });

    // 툴팁도 업데이트
    const titles = {
        connected: 'Fazzk - 연결됨',
        disconnected: 'Fazzk - 미연결',
        syncing: 'Fazzk - 동기화 중...'
    };
    await chrome.action.setTitle({ title: titles[status] || 'Fazzk Helper' });
}

// 사용 가능한 포트 찾기
async function findActivePort() {
    for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
        try {
            const response = await fetch(`http://localhost:${port}/settings`, {
                method: 'GET',
                signal: AbortSignal.timeout(500)
            });
            if (response.ok) {
                activePort = port;
                await chrome.storage.local.set({ activePort: port });
                await setIconStatus('connected');
                return port;
            }
        } catch (e) {
            // 이 포트는 사용 불가
        }
    }
    await setIconStatus('disconnected');
    return null;
}

// 저장된 포트 또는 탐색
async function getActivePort() {
    if (activePort) return activePort;

    const stored = await chrome.storage.local.get('activePort');
    if (stored.activePort) {
        // 저장된 포트가 여전히 유효한지 확인
        try {
            const response = await fetch(`http://localhost:${stored.activePort}/settings`, {
                signal: AbortSignal.timeout(500)
            });
            if (response.ok) {
                activePort = stored.activePort;
                await setIconStatus('connected');
                return activePort;
            }
        } catch (e) {
            // 저장된 포트 무효, 재탐색
        }
    }

    return await findActivePort();
}

// 연결 상태 주기적 확인
function startConnectionCheck() {
    if (connectionCheckInterval) return;

    connectionCheckInterval = setInterval(async () => {
        const port = await getActivePort();
        if (port) {
            await setIconStatus('connected');
        } else {
            await setIconStatus('disconnected');
        }
    }, 30000); // 30초마다 확인
}

// 쿠키 변경 감지
chrome.cookies.onChanged.addListener((changeInfo) => {
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
        const nidAut = await chrome.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
        const nidSes = await chrome.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

        if (nidAut && nidSes) {
            sendToApp(nidAut.value, nidSes.value);
        }
    } catch (error) {
        // 쿠키 가져오기 실패
    }
}

async function sendToApp(nidAut, nidSes) {
    const port = await getActivePort();
    if (!port) {
        await setIconStatus('disconnected');
        return;
    }

    try {
        await setIconStatus('syncing');

        const response = await fetch(`http://localhost:${port}/auth/cookies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                NID_AUT: nidAut,
                NID_SES: nidSes
            })
        });

        if (response.ok) {
            await setIconStatus('connected');

            // 배지 표시 (3초 후 사라짐)
            chrome.action.setBadgeText({ text: '✓' });
            chrome.action.setBadgeBackgroundColor({ color: '#00ffa3' });
            setTimeout(() => {
                chrome.action.setBadgeText({ text: '' });
            }, 3000);
        } else {
            await setIconStatus('disconnected');
        }
    } catch (error) {
        // 포트 무효화, 다음에 재탐색
        activePort = null;
        await setIconStatus('disconnected');
    }
}

// 시작 시 초기화
async function initialize() {
    await setIconStatus('disconnected');
    await findActivePort();
    startConnectionCheck();
}

initialize();
