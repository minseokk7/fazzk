/**
 * @fileoverview 치지직 API 모듈
 * 팔로워 정보 및 프로필 데이터를 가져옵니다.
 * @module chzzk
 */

const axios = require('axios');
const config = require('./config');
const auth = require('./auth');
const logger = require('./logger');

/**
 * 현재 로그인된 사용자의 프로필 ID (캐시)
 * @type {string}
 */
let profileId = '';

/**
 * 사용자 프로필 ID를 가져옵니다.
 * @async
 * @returns {Promise<string>} 사용자 프로필 ID (userIdHash)
 * @throws {Error} 인증 실패 또는 네트워크 오류 시
 */
async function getProfileId() {
    if (profileId) return profileId;

    try {
        const apiUrl = `${config.api.naverGame}/nng_main/v1/user/getUserStatus`;
        const cookies = await auth.getAuthCookies();

        const response = await axios.get(apiUrl, {
            headers: {
                Cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
            },
            timeout: 5000
        });

        logger.info('[Chzzk] 프로필 데이터 수신:', response.data);
        profileId = response.data.content.userIdHash;
        return profileId;
    } catch (error) {
        logger.error('[Chzzk] 프로필 ID 가져오기 실패:', error.message);
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            logger.error('[Chzzk] 세션 만료됨');
            auth.clearSessionData();
            profileId = '';
        }
        throw error;
    }
}

/**
 * 팔로워 목록을 가져옵니다.
 * @async
 * @param {number} [page=0] - 페이지 번호 (0부터 시작)
 * @param {number} [size=10] - 페이지당 팔로워 수
 * @returns {Promise<{code: number, content: {data: Array}}>} 팔로워 응답 데이터
 * @throws {Error} 인증 실패 또는 네트워크 오류 시
 */
async function getFollowers(page = 0, size = 10) {
    try {
        const currentProfileId = await getProfileId();
        const apiUrl = `${config.api.chzzk}/manage/v1/channels/${currentProfileId}/followers?page=${page}&size=${size}&userNickname=`;

        const cookies = await auth.getAuthCookies();

        const response = await axios.get(apiUrl, {
            headers: {
                Cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
            },
            timeout: 5000
        });

        return response.data;
    } catch (error) {
        logger.error('[Chzzk] 팔로워 가져오기 실패:', error.message);
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            logger.error('[Chzzk] 세션 만료됨');
            auth.clearSessionData();
            profileId = '';
        }
        throw error;
    }
}

/**
 * 캐시된 프로필 ID를 초기화합니다.
 * @returns {void}
 */
function resetProfileId() {
    profileId = '';
}

module.exports = {
    getProfileId,
    getFollowers,
    resetProfileId
};
