const path = require('path');
const { app } = require('electron');

const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged;

module.exports = {
    port: 3000,

    // 세션 관련 설정
    session: {
        partition: 'persist:chzzk'
    },

    // 창 크기 설정
    window: {
        width: 1024,
        height: 768
    },

    // 타이머 설정 (밀리초)
    timers: {
        sessionMonitor: 10 * 60 * 1000,      // 10분
        updateCheck: 3000,                     // 3초
        connectionCheck: 10000,                // 10초
        testFollowerExpiry: 10000,             // 10초
        realFollowerExpiry: 30000              // 30초
    },

    api: {
        naverGame: 'https://comm-api.game.naver.com',
        chzzk: 'https://api.chzzk.naver.com',
        nidLogin: 'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fchzzk.naver.com%2F',
        chzzkMain: 'https://chzzk.naver.com/'
    },

    auth: {
        encryptionKey: 'chzzk-follow-alram-secure-session-key-v1',
        allowedDomains: ['.naver.com', '.nid.naver.com', 'nid.naver.com', 'chzzk.naver.com', '.chzzk.naver.com']
    },

    paths: {
        userData: app.getPath('userData'),
        pages: path.join(app.getAppPath(), 'pages'),
        public: path.join(app.getAppPath(), 'public'),
        icon: path.join(app.getAppPath(), 'public', 'dodoroi_icon.png'),
        preload: path.join(app.getAppPath(), 'preload.js')
    },

    isProduction
};
