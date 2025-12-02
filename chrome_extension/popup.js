document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const sendBtn = document.getElementById('sendBtn');
    const copyBtn = document.getElementById('copyBtn');

    // Check connection immediately
    checkConnection();

    sendBtn.addEventListener('click', async () => {
        statusDiv.textContent = '쿠키 가져오는 중...';
        const cookies = await getCookies();
        if (cookies) {
            sendToApp(cookies.NID_AUT, cookies.NID_SES);
        } else {
            statusDiv.textContent = '네이버 로그인 필요';
        }
    });

    copyBtn.addEventListener('click', async () => {
        const cookies = await getCookies();
        if (cookies) {
            const json = JSON.stringify(cookies, null, 2);
            navigator.clipboard.writeText(json).then(() => {
                statusDiv.textContent = '복사되었습니다!';
                setTimeout(() => checkConnection, 2000);
            });
        } else {
            statusDiv.textContent = '네이버 로그인 필요';
        }
    });

    async function getCookies() {
        const nidAut = await chrome.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
        const nidSes = await chrome.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

        if (nidAut && nidSes) {
            return { NID_AUT: nidAut.value, NID_SES: nidSes.value };
        }
        return null;
    }

    async function sendToApp(nidAut, nidSes) {
        try {
            statusDiv.textContent = '전송 중...';
            const response = await fetch('http://localhost:3000/auth/cookies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ NID_AUT: nidAut, NID_SES: nidSes })
            });

            if (response.ok) {
                statusDiv.textContent = '전송 성공! 앱을 확인하세요.';
                statusDiv.style.color = '#00ffa3';
            } else {
                statusDiv.textContent = '앱 연결 실패 (서버 응답 없음)';
                statusDiv.style.color = '#ff5555';
            }
        } catch (error) {
            statusDiv.textContent = '앱이 실행 중인지 확인하세요.';
            statusDiv.style.color = '#ff5555';
            console.error(error);
        }
    }

    async function checkConnection() {
        try {
            await fetch('http://localhost:3000/settings'); // Just check if server is up
            statusDiv.textContent = '앱 연결됨 (자동 동기화 중)';
            statusDiv.style.color = '#00ffa3';
        } catch (e) {
            statusDiv.textContent = '앱을 실행해 주세요.';
            statusDiv.style.color = '#aaa';
        }
    }
});
