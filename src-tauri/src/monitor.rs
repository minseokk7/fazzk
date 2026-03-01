use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

use crate::state::AppState;
use crate::websocket::WSManager;

/// 실시간 팔로워 모니터링 시작 (압축 저장 + API 캐싱 적용)
pub async fn start_follower_monitoring(app_state: Arc<AppState>, ws_manager: WSManager) {
    log::info!("[FollowerMonitor] Starting optimized monitoring with compression & caching");

    // 백그라운드 태스크로 실행
    tokio::spawn(async move {
        let mut initialized = false;
        let mut error_count = 0;
        let max_errors = 10;

        loop {
            // 테스트 유저 설정 시 더 짧은 폴링 주기 (2초) 사용
            let has_test_user = {
                if let Ok(config) = app_state.config.try_read() {
                    !config.test_nickname.is_empty()
                } else {
                    false
                }
            };

            let sleep_duration = if error_count == 0 {
                if has_test_user {
                    Duration::from_secs(2) // 테스트 유저 설정 시 2초
                } else {
                    Duration::from_secs(5) // 기본 5초
                }
            } else {
                let backoff_seconds = std::cmp::min(5 * (2_u64.pow(error_count.min(4))), 60);
                Duration::from_secs(backoff_seconds)
            };

            sleep(sleep_duration).await;

            if ws_manager.client_count().await == 0 {
                continue;
            }

            if error_count >= max_errors {
                log::error!("[FollowerMonitor] 최대 에러 횟수 초과, 모니터링 중단");
                break;
            }

            let (cookies, user_id_hash) = {
                let cookies_guard = match app_state.cookies.lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        error_count += 1;
                        continue;
                    }
                };
                let user_id_guard = match app_state.user_id_hash.lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        error_count += 1;
                        continue;
                    }
                };
                match (cookies_guard.as_ref(), user_id_guard.as_ref()) {
                    (Some(cookies), Some(user_id)) => (cookies.clone(), user_id.clone()),
                    _ => continue,
                }
            };

            let current_followers =
                match get_or_fetch_followers(&app_state, &cookies, &user_id_hash).await {
                    Ok(followers) => {
                        error_count = 0;
                        followers
                    }
                    Err(_) => {
                        error_count += 1;
                        continue;
                    }
                };

            let current_count = current_followers.len();

            if !initialized {
                log::info!(
                    "[FollowerMonitor] 압축 저장 시스템 초기화 - {} 팔로워",
                    current_count
                );

                if let Ok(mut initial_count) = app_state.initial_follower_count.lock() {
                    *initial_count = Some(current_count);
                }

                // 테스트 유저는 해시에 추가하지 않음 (재팔로우 시 항상 알림 발생 위해)
                let config = app_state.config.read().await;
                let test_nickname = config.test_nickname.clone();
                drop(config);

                if let Ok(mut compressed_followers) = app_state.compressed_followers.lock() {
                    compressed_followers.clear();
                    for follower in &current_followers {
                        let is_test =
                            !test_nickname.is_empty() && follower.user.nickname == test_nickname;
                        if !is_test {
                            let compressed =
                                crate::state::CompressedFollower::from_follower(follower);
                            compressed_followers.push_back(compressed);
                            if compressed_followers.len() > 100 {
                                compressed_followers.pop_front();
                            }
                        }
                    }
                }
                initialized = true;
                continue;
            }

            process_new_followers(&app_state, &ws_manager, &current_followers, current_count).await;
        }
        log::warn!("[FollowerMonitor] 모니터링 종료");
    });
}

async fn get_or_fetch_followers(
    app_state: &Arc<AppState>,
    cookies: &crate::state::CookieData,
    user_id_hash: &str,
) -> Result<Vec<crate::chzzk::FollowerItem>, ()> {
    // 테스트 유저가 설정되어 있으면 캐시 바이패스 (실시간 감지)
    let has_test_user = {
        if let Ok(config) = app_state.config.try_read() {
            !config.test_nickname.is_empty()
        } else {
            false
        }
    };

    if !has_test_user {
        let cached_followers = {
            if let Ok(cache) = app_state.api_cache.lock() {
                cache.get_cached_followers().cloned()
            } else {
                None
            }
        };

        if let Some(followers) = cached_followers {
            return Ok(followers);
        }
    }

    match crate::chzzk::get_followers(&app_state.client, cookies, user_id_hash).await {
        Ok(response) => {
            if let Some(content) = response.content {
                let followers = content.data;
                if let Ok(mut cache) = app_state.api_cache.lock() {
                    cache.cache_followers(followers.clone());
                }
                Ok(followers)
            } else {
                Err(())
            }
        }
        Err(e) => {
            log::warn!("[FollowerMonitor] 팔로워 조회 실패: {}", e);
            Err(())
        }
    }
}

async fn process_new_followers(
    app_state: &Arc<AppState>,
    ws_manager: &WSManager,
    current_followers: &[crate::chzzk::FollowerItem],
    current_count: usize,
) {
    let initial_count = app_state
        .initial_follower_count
        .lock()
        .map(|guard| guard.unwrap_or(0))
        .unwrap_or(0);

    // 필터 설정 읽기
    let config = app_state.config.read().await;
    let filter_mode = config.filter_mode.clone();
    let filter_list = config.filter_list.clone();
    let test_nickname = config.test_nickname.clone();
    drop(config);

    if current_count > initial_count {
        log::info!(
            "[FollowerMonitor] 팔로워 수 증가 감지: {} -> {}",
            initial_count,
            current_count
        );

        let compressed_followers = app_state
            .compressed_followers
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default();

        for follower in current_followers {
            let compressed = crate::state::CompressedFollower::from_follower(follower);

            // 테스트 유저인지 먼저 확인
            let is_test_user = !test_nickname.is_empty() && follower.user.nickname == test_nickname;

            // 테스트 유저는 해시 비교 바이패스 (항상 새 팔로워로 처리)
            // 일반 유저는 해시가 있으면 건너뜀 (중복 알림 방지)
            let is_new = is_test_user
                || !compressed_followers
                    .iter()
                    .any(|cf| cf.hash == compressed.hash);

            if is_new {
                log::info!(
                    "[FollowerMonitor] 새 팔로워 감지{}: {}",
                    if is_test_user {
                        " (테스트 유저)"
                    } else {
                        ""
                    },
                    follower.user.nickname
                );

                // 커스텀 필터링 검사 로직
                let nickname = &follower.user.nickname;
                let should_broadcast = match filter_mode.as_str() {
                    "whitelist" => filter_list.iter().any(|s| s == nickname),
                    "blacklist" => !filter_list.iter().any(|s| s == nickname),
                    _ => true, // "none" 또는 예외 상황 시 모두 패스
                };

                if should_broadcast {
                    log::info!(
                        "[FollowerMonitor] 닉네임 필터 통과. 알림 발생: {}",
                        nickname
                    );
                    ws_manager.broadcast_new_follower(follower.clone()).await;
                } else {
                    log::info!("[FollowerMonitor] 닉네임 필터에 의해 차단됨: {}", nickname);
                }

                if let Ok(mut compressed_guard) = app_state.compressed_followers.lock() {
                    // 테스트 유저는 압축 목록에 추가하지 않음
                    if !is_test_user {
                        compressed_guard.push_back(compressed);
                        if compressed_guard.len() > 100 {
                            compressed_guard.pop_front();
                        }
                    }
                }
            }
        }

        if let Ok(mut initial_count_lock) = app_state.initial_follower_count.lock() {
            *initial_count_lock = Some(current_count);
        }
    } else if current_count < initial_count {
        log::debug!(
            "[FollowerMonitor] 팔로워 수 감소: {} -> {}",
            initial_count,
            current_count
        );

        // initial_count만 갱신, compressed_followers는 유지
        // 해시를 유지하면 재팔로우 시 기존 해시와 비교되어 중복 알림 방지
        if let Ok(mut initial_count_lock) = app_state.initial_follower_count.lock() {
            *initial_count_lock = Some(current_count);
        }
    }
}
