const SERVER_URL = 'http://localhost:3000/auth/cookies';
let lastSent = 0;

// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
    const cookie = changeInfo.cookie;
    if (cookie.domain.includes('naver.com') && (cookie.name === 'NID_AUT' || cookie.name === 'NID_SES')) {
        // Debounce to avoid spamming
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
            console.log('Found cookies, sending to app...');
            sendToApp(nidAut.value, nidSes.value);
        }
    } catch (error) {
        console.error('Error getting cookies:', error);
    }
}

async function sendToApp(nidAut, nidSes) {
    try {
        const response = await fetch(SERVER_URL, {
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
            console.log('Cookies sent successfully');
            chrome.action.setBadgeText({ text: 'OK' });
            chrome.action.setBadgeBackgroundColor({ color: '#00ffa3' });

            // Reset badge after 3 seconds
            setTimeout(() => {
                chrome.action.setBadgeText({ text: '' });
            }, 3000);
        } else {
            console.warn('App server not responding or error');
        }
    } catch (error) {
        console.error('Failed to send to app:', error);
    }
}

// Check on startup
checkAndSendCookies();
