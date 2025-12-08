/**
 * @fileoverview 조건부 로깅 모듈
 * 개발/프로덕션 환경에 따라 로그 출력을 제어합니다.
 * @module logger
 */

const config = require('./config');

/**
 * 로깅 활성화 여부 (프로덕션에서는 비활성화)
 * @type {boolean}
 */
const isEnabled = !config.isProduction;

/**
 * 정보 로그 출력
 * @param {...any} args - 로그 인자들
 * @returns {void}
 */
function info(...args) {
    if (isEnabled) {
        console.log(...args);
    }
}

/**
 * 경고 로그 출력
 * @param {...any} args - 로그 인자들
 * @returns {void}
 */
function warn(...args) {
    if (isEnabled) {
        console.warn(...args);
    }
}

/**
 * 에러 로그 출력 (항상 출력)
 * @param {...any} args - 로그 인자들
 * @returns {void}
 */
function error(...args) {
    console.error(...args);
}

module.exports = {
    info,
    warn,
    error
};
