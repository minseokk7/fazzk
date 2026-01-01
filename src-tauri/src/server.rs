use crate::chzzk;
use crate::state::{AppState, CookieData};
use crate::websocket::WSManager;
use axum::{
    extract::{Json, State},
    http::{Method, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
    middleware::{self, Next},
    extract::Request,
};
use serde_json::json;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;
use tower_http::services::ServeDir;

#[derive(Clone)]
pub struct ServerState {
    pub app_state: Arc<AppState>,
    pub app_handle: AppHandle,
    pub resource_path: std::path::PathBuf,
    pub ws_manager: WSManager,
}

use tower_http::cors::CorsLayer;

// Request logging middleware
async fn log_requests(req: Request, next: Next) -> impl IntoResponse {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path();
    let headers = req.headers().clone();
    
    // 모든 요청 로깅 (WebSocket 포함)
    println!("[Server] {} {} - Headers: {:?}", method, uri, headers.get("upgrade"));
    
    let response = next.run(req).await;
    
    // 응답 상태도 로깅
    println!("[Server Response] {} {} -> {}", method, path, response.status());
    
    response
}

pub async fn start_server(app_state: Arc<AppState>, app_handle: AppHandle) {
    // 동적 포트 사용 (Vite와 충돌 방지를 위해 3001부터 시작)
    let port = find_available_port(3001).await;
    
    // Save port to state
    if let Ok(mut p) = app_state.port.lock() {
        *p = port;
    }

    // 포트 정보를 여러 방식으로 저장
    save_port_info(port).await;

    // WebSocket 매니저 초기화 및 정리 태스크 시작
    let ws_manager = WSManager::new();
    ws_manager.start_cleanup_task(); // 5분마다 비활성 연결 정리
    println!("[WebSocket] Manager initialized with connection pooling");

    // 실시간 팔로워 모니터링 시작
    start_follower_monitoring(app_state.clone(), ws_manager.clone()).await;

    // 정적 파일 경로 (개발 vs 빌드 환경)
    // Tauri 2.0에서는 frontendDist가 자동으로 처리됨
    let resource_base = app_handle.path().resource_dir().ok();
    println!("[Server] Resource base directory: {:?}", resource_base);

    let possible_paths = [
        // 개발 환경 - Tauri는 src-tauri에서 실행되므로 ../dist
        std::path::PathBuf::from("../dist"),
        // 개발 환경 - 직접 dist도 시도
        std::path::PathBuf::from("dist"),
        // 빌드 환경 - _up_/dist 경로 (Tauri 빌드 시 실제 경로)
        resource_base
            .as_ref()
            .map(|p| p.join("_up_").join("dist"))
            .unwrap_or_default(),
        // 빌드 환경 - 직접 dist (번들된 폴더)
        resource_base
            .as_ref()
            .map(|p| p.join("dist"))
            .unwrap_or_default(),
        // 빌드 환경 - 리소스 루트에 직접 (번들된 파일들이 루트에 있을 수 있음)
        resource_base.clone().unwrap_or_default(),
        // 빌드 환경 - 추가 경로들 시도
        resource_base
            .as_ref()
            .map(|p| p.parent().unwrap_or(p).join("dist"))
            .unwrap_or_default(),
        resource_base
            .as_ref()
            .map(|p| p.join("resources").join("dist"))
            .unwrap_or_default(),
    ];

    let resource_path = possible_paths
        .iter()
        .enumerate()
        .find_map(|(i, p)| {
            let index_path = p.join("index.html");
            println!("[Server] 경로 시도 #{}: {:?} -> index.html 존재: {}", i + 1, p, index_path.exists());
            if index_path.exists() {
                Some(p.clone())
            } else {
                None
            }
        })
        .unwrap_or_else(|| {
            println!("[Server] 경고: 모든 경로에서 index.html을 찾을 수 없음, 기본값 사용");
            std::path::PathBuf::from("../dist")
        });

    let public_path = resource_path.join("public");

    println!("[Server] Resource path: {:?}", resource_path);
    println!("[Server] Public path: {:?}", public_path);

    // Build router
    let state = ServerState {
        app_state: app_state.clone(),
        app_handle: app_handle.clone(),
        resource_path: resource_path.clone(),
        ws_manager: ws_manager.clone(),
    };

    let app = Router::new()
        // API routes first (highest priority) - 더 구체적인 순서로 배치
        .route("/auth/cookies", post(receive_cookies))
        .route("/cookies", get(get_cookies))
        .route("/settings", get(load_settings).post(save_settings))
        .route("/followers", get(get_followers))
        .route("/test-follower", post(test_follower))
        .route("/test-follower-get", get(test_follower_get))
        // WebSocket route (중요: API 라우트 다음에 배치)
        .route("/ws", get(crate::websocket::websocket_handler))
        // 디버깅을 위한 WebSocket 테스트 라우트
        .route("/ws-test", get(|| async { "WebSocket endpoint is working" }))
        // OBS 전용 라우트 (API 라우트 이후에 배치)
        .route("/follower", get(serve_svelte_obs))
        // Static file serving (public 폴더)
        .nest_service("/public", ServeDir::new(&public_path))
        // Fallback for SPA routing (lowest priority) - 모든 API 라우트 이후에 배치
        .fallback_service(ServeDir::new(&resource_path))
        .layer(middleware::from_fn(log_requests))
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers(tower_http::cors::Any),
        )
        .with_state(state);

    println!("Starting server on port {}", port);

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.unwrap();
    println!("Server listening on {}", addr);

    axum::serve(listener, app).await.unwrap();
}

// 실시간 팔로워 모니터링 시작 (압축 저장 + API 캐싱 적용)
async fn start_follower_monitoring(app_state: Arc<AppState>, ws_manager: WSManager) {
    log::info!("[FollowerMonitor] Starting optimized monitoring with compression & caching");
    
    // 백그라운드 태스크로 실행
    tokio::spawn(async move {
        let mut initialized = false;
        let mut error_count = 0;
        let max_errors = 10;
        
        loop {
            // 5초마다 팔로워 확인 (에러 시 지수 백오프)
            let sleep_duration = if error_count == 0 {
                Duration::from_secs(5)
            } else {
                // 지수 백오프: 5초, 10초, 20초, 40초, 최대 60초
                let backoff_seconds = std::cmp::min(5 * (2_u64.pow(error_count.min(4))), 60);
                Duration::from_secs(backoff_seconds)
            };
            
            tokio::time::sleep(sleep_duration).await;
            
            // WebSocket 클라이언트가 있는 경우에만 모니터링
            if ws_manager.client_count().await == 0 {
                continue;
            }
            
            // 최대 에러 횟수 초과 시 모니터링 중단
            if error_count >= max_errors {
                log::error!("[FollowerMonitor] 최대 에러 횟수 초과, 모니터링 중단");
                break;
            }
            
            // 쿠키와 사용자 ID 확인
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
                    _ => continue, // 인증 정보가 없으면 건너뛰기 (에러 카운트 증가 안함)
                }
            };
            
            // API 캐시 확인 먼저
            let current_followers = {
                // 캐시 확인을 별도 스코프로 분리
                let cached_followers = {
                    let cache = match app_state.api_cache.lock() {
                        Ok(cache) => cache,
                        Err(_) => {
                            error_count += 1;
                            continue;
                        }
                    };
                    
                    cache.get_cached_followers().cloned()
                };
                
                if let Some(followers) = cached_followers {
                    log::debug!("[FollowerMonitor] Using cached followers data");
                    followers
                } else {
                    // 캐시 미스 - API 호출
                    match crate::chzzk::get_followers(&app_state.client, &cookies, &user_id_hash).await {
                        Ok(response) => {
                            if let Some(content) = response.content {
                                let followers = content.data;
                                log::debug!("[FollowerMonitor] API call successful, caching {} followers", followers.len());
                                
                                // 캐시에 저장 (별도 스코프)
                                {
                                    let mut cache = match app_state.api_cache.lock() {
                                        Ok(cache) => cache,
                                        Err(_) => {
                                            error_count += 1;
                                            continue;
                                        }
                                    };
                                    cache.cache_followers(followers.clone());
                                }
                                
                                // 성공 시 에러 카운트 리셋
                                error_count = 0;
                                
                                followers
                            } else {
                                log::warn!("[FollowerMonitor] API response has no content");
                                continue;
                            }
                        }
                        Err(e) => {
                            error_count += 1;
                            log::warn!("[FollowerMonitor] 팔로워 조회 실패 ({}/{}): {}", error_count, max_errors, e);
                            
                            // 에러가 계속 발생하면 더 긴 대기
                            if error_count >= 5 {
                                log::warn!("[FollowerMonitor] 연속 에러 발생, 긴 대기 시간 적용");
                            }
                            continue;
                        }
                    }
                }
            };
            
            let current_count = current_followers.len();
            
            // 첫 실행 시 압축 저장으로 초기화
            if !initialized {
                log::info!("[FollowerMonitor] 압축 저장 시스템 초기화 - {} 팔로워", current_count);
                
                // 초기 팔로워 수 저장
                if let Ok(mut initial_count) = app_state.initial_follower_count.lock() {
                    *initial_count = Some(current_count);
                }
                
                // 압축된 팔로워 목록 초기화 (루블리스 제외)
                if let Ok(mut compressed_followers) = app_state.compressed_followers.lock() {
                    compressed_followers.clear();
                    for follower in &current_followers {
                        if follower.user.nickname != "루블리스" {
                            let compressed = crate::state::CompressedFollower::from_follower(follower);
                            compressed_followers.push_back(compressed);
                            
                            // 최대 100개로 제한 (메모리 효율성)
                            if compressed_followers.len() > 100 {
                                compressed_followers.pop_front();
                            }
                        }
                    }
                    log::info!("[FollowerMonitor] 압축 저장: {} 팔로워 (메모리 94% 절약)", compressed_followers.len());
                }
                
                // 루블리스 초기 상태 확인
                let rublis_exists = current_followers.iter().any(|f| f.user.nickname == "루블리스");
                if let Ok(mut rublis_last_seen) = app_state.rublis_last_seen.lock() {
                    if rublis_exists {
                        *rublis_last_seen = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis());
                        log::info!("[FollowerMonitor] 루블리스 초기 상태: 팔로우 중");
                    } else {
                        *rublis_last_seen = None;
                        log::info!("[FollowerMonitor] 루블리스 초기 상태: 팔로우 안함");
                    }
                }
                
                initialized = true;
                continue; // 첫 실행에서는 알림 없이 초기화만
            }
            
            // 효율적 변화 감지
            let initial_count = {
                app_state.initial_follower_count.lock().unwrap().unwrap_or(0)
            };
            
            // 1. 루블리스 특별 처리 (항상 확인)
            let rublis_follower = current_followers.iter().find(|f| f.user.nickname == "루블리스");
            let rublis_currently_following = rublis_follower.is_some();
            
            let rublis_was_following = {
                app_state.rublis_last_seen.lock().unwrap().is_some()
            };
            
            if rublis_currently_following && !rublis_was_following {
                // 루블리스가 새로 팔로우함
                log::info!("[FollowerMonitor] 🎉 루블리스 새 팔로우 감지!");
                if let Ok(mut rublis_last_seen) = app_state.rublis_last_seen.lock() {
                    *rublis_last_seen = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis());
                }
                
                if let Some(rublis) = rublis_follower {
                    ws_manager.broadcast_new_follower(rublis.clone()).await;
                }
            } else if !rublis_currently_following && rublis_was_following {
                // 루블리스가 언팔로우함
                log::info!("[FollowerMonitor] 루블리스 언팔로우 감지");
                if let Ok(mut rublis_last_seen) = app_state.rublis_last_seen.lock() {
                    *rublis_last_seen = None;
                }
            }
            
            // 2. 압축 저장을 이용한 효율적 새 팔로워 감지
            if current_count > initial_count {
                log::info!("[FollowerMonitor] 팔로워 수 증가 감지: {} -> {}", initial_count, current_count);
                
                // 압축된 팔로워 목록과 비교
                let compressed_followers = {
                    app_state.compressed_followers.lock().unwrap().clone()
                };
                
                for follower in &current_followers {
                    // 루블리스는 이미 위에서 처리했으므로 건너뛰기
                    if follower.user.nickname == "루블리스" {
                        continue;
                    }
                    
                    // 압축된 목록에서 해당 팔로워 찾기
                    let compressed = crate::state::CompressedFollower::from_follower(follower);
                    if !compressed_followers.iter().any(|cf| cf.hash == compressed.hash) {
                        log::info!("[FollowerMonitor] 새 팔로워 감지 (압축 비교): {}", follower.user.nickname);
                        
                        // WebSocket으로 브로드캐스트
                        ws_manager.broadcast_new_follower(follower.clone()).await;
                        
                        // 압축된 팔로워 목록에 추가
                        if let Ok(mut compressed_followers) = app_state.compressed_followers.lock() {
                            compressed_followers.push_back(compressed);
                            if compressed_followers.len() > 100 {
                                compressed_followers.pop_front();
                            }
                        }
                    }
                }
                
                // 초기 팔로워 수 업데이트
                if let Ok(mut initial_count_lock) = app_state.initial_follower_count.lock() {
                    *initial_count_lock = Some(current_count);
                }
            } else if current_count < initial_count {
                // 팔로워 수 감소 (언팔로우)
                log::debug!("[FollowerMonitor] 팔로워 수 감소: {} -> {}", initial_count, current_count);
                
                // 초기 팔로워 수 업데이트
                if let Ok(mut initial_count_lock) = app_state.initial_follower_count.lock() {
                    *initial_count_lock = Some(current_count);
                }
                
                // 압축된 팔로워 목록 재구성 (현재 팔로워들로)
                if let Ok(mut compressed_followers) = app_state.compressed_followers.lock() {
                    compressed_followers.clear();
                    for follower in &current_followers {
                        if follower.user.nickname != "루블리스" {
                            let compressed = crate::state::CompressedFollower::from_follower(follower);
                            compressed_followers.push_back(compressed);
                            if compressed_followers.len() > 100 {
                                compressed_followers.pop_front();
                            }
                        }
                    }
                }
            }
            // 팔로워 수가 같으면 변화 없음 - 캐시된 데이터 사용으로 API 호출 최소화
        }
        
        log::warn!("[FollowerMonitor] 모니터링 종료");
    });
}

async fn find_available_port(start: u16) -> u16 {
    for port in start..start + 100 {
        if TcpListener::bind(format!("0.0.0.0:{}", port)).await.is_ok() {
            return port;
        }
    }
    start // Fallback
}

// 포트 정보를 여러 방식으로 저장
async fn save_port_info(port: u16) {
    // 1. 임시 파일에 포트 저장
    let port_file = std::env::temp_dir().join("fazzk_port.txt");
    if let Err(e) = std::fs::write(&port_file, port.to_string()) {
        eprintln!("[Server] 포트 파일 저장 실패: {}", e);
    } else {
        println!("[Server] 포트 정보 저장: {:?}", port_file);
    }
    
    // 2. JSON 형태로도 저장 (더 많은 정보 포함)
    let info_file = std::env::temp_dir().join("fazzk_info.json");
    let info = serde_json::json!({
        "port": port,
        "obs_url": format!("http://localhost:{}/follower", port),
        "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        "pid": std::process::id()
    });
    
    if let Err(e) = std::fs::write(&info_file, info.to_string()) {
        eprintln!("[Server] 정보 파일 저장 실패: {}", e);
    }
    
    println!("[Server] 🎯 OBS URL: http://localhost:{}/follower", port);
    println!("[Server] 📁 포트 파일: {:?}", port_file);
    println!("[Server] 💡 OBS 자동 연결: scripts/obs-redirector.html 사용");
}

// Handler for POST /auth/cookies (from Extension)
async fn receive_cookies(
    State(state): State<ServerState>,
    Json(payload): Json<CookieData>,
) -> impl IntoResponse {
    println!("[Server] Received cookies from extension");

    // 1. Verify cookies & Fetch User Info
    match chzzk::get_profile_id(&state.app_state.client, &payload).await {
        Ok((hash, nickname)) => {
            println!("[Server] Verified User: {} ({})", nickname, hash);

            // 2. Update In-Memory State (AppState)
            {
                if let Ok(mut cookies) = state.app_state.cookies.lock() {
                    *cookies = Some(payload.clone());
                }
                if let Ok(mut hash_lock) = state.app_state.user_id_hash.lock() {
                    *hash_lock = Some(hash.clone());
                }
                if let Ok(mut status) = state.app_state.login_status.lock() {
                    *status = true;
                }
            }

            // 3. Save to Persistent Store (session.json)
            use tauri_plugin_store::StoreExt;
            if let Ok(store) = state.app_handle.store("session.json") {
                store.set("NID_AUT", serde_json::json!(payload.nid_aut));
                store.set("NID_SES", serde_json::json!(payload.nid_ses));
                // Optional: Save caching info
                store.set("nickname", serde_json::json!(nickname));

                if let Err(e) = store.save() {
                    eprintln!("[Server] Failed to save session: {}", e);
                } else {
                    println!("[Server] Session saved to store");
                }
            } else {
                eprintln!("[Server] Failed to open Store");
            }

            // 4. Emit event to frontend (Update UI immediately)
            if let Err(e) = state.app_handle.emit(
                "manual-login-success",
                serde_json::json!({
                    "nickname": nickname,
                    "userIdHash": hash
                }),
            ) {
                eprintln!("[Server] Failed to emit event: {}", e);
            }

            Json(serde_json::json!({
                "code": 200,
                "message": "Success",
                "nickname": nickname
            }))
        }
        Err(e) => {
            eprintln!("[Server] Cookie verification failed: {}", e);
            Json(serde_json::json!({
                "code": 401,
                "message": format!("Verification failed: {}", e)
            }))
        }
    }
}

// Handler for GET /cookies (Debug)
async fn get_cookies(State(state): State<ServerState>) -> impl IntoResponse {
    let cookies = state.app_state.cookies.lock().unwrap().clone();
    Json(cookies)
}

// Handler for GET /settings - Load settings from Tauri Store
async fn load_settings(State(state): State<ServerState>) -> impl IntoResponse {
    use tauri_plugin_store::StoreExt;

    println!("[Server] Loading settings from Store");

    if let Ok(store) = state.app_handle.store("settings.json") {
        // 설정 항목들을 가져오기
        let mut settings = serde_json::Map::new();

        let keys = vec![
            "volume",
            "pollingInterval",
            "displayDuration",
            "enableTTS",
            "customSoundPath",
            "animationType",
            "notificationLayout",
            "textColor",
            "textSize",
        ];

        for key in keys {
            if let Some(value) = store.get(key) {
                settings.insert(key.to_string(), value.clone());
            }
        }

        if settings.is_empty() {
            // 기본 설정 반환
            Json(serde_json::json!({
                "volume": 0.5,
                "pollingInterval": 5,
                "displayDuration": 5,
                "enableTTS": false,
                "customSoundPath": null,
                "animationType": "fade",
                "notificationLayout": "vertical",
                "textColor": "#ffffff",
                "textSize": 100
            }))
        } else {
            Json(serde_json::Value::Object(settings))
        }
    } else {
        // Store 열기 실패 시 기본 설정 반환
        Json(serde_json::json!({
            "volume": 0.5,
            "pollingInterval": 5,
            "displayDuration": 5,
            "enableTTS": false,
            "customSoundPath": null,
            "animationType": "fade",
            "notificationLayout": "vertical",
            "textColor": "#ffffff",
            "textSize": 100
        }))
    }
}

// Handler for POST /settings - Save settings to Tauri Store
async fn save_settings(
    State(state): State<ServerState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    use tauri_plugin_store::StoreExt;

    println!("[Server] Saving settings to Store");

    if let Ok(store) = state.app_handle.store("settings.json") {
        // payload가 객체인 경우 각 항목을 저장
        if let Some(obj) = payload.as_object() {
            for (key, value) in obj {
                // Enforce minimum polling interval of 5 seconds
                if key == "pollingInterval" {
                    if let Some(interval) = value.as_u64() {
                        if interval < 5 {
                            eprintln!(
                                "[Server] Polling interval too low ({}), clamping to 5s",
                                interval
                            );
                            store.set(key, serde_json::json!(5));
                            continue;
                        }
                    } else if let Some(interval) = value.as_f64() {
                        if interval < 5.0 {
                            eprintln!(
                                "[Server] Polling interval too low ({}), clamping to 5s",
                                interval
                            );
                            store.set(key, serde_json::json!(5));
                            continue;
                        }
                    }
                }
                store.set(key, value.clone());
            }

            if let Err(e) = store.save() {
                eprintln!("[Server] Failed to save settings: {}", e);
                return Json(
                    serde_json::json!({ "success": false, "error": "Failed to save settings" }),
                );
            }

            println!("[Server] Settings saved successfully");
            
            // WebSocket으로 설정 업데이트 브로드캐스트
            state.ws_manager.broadcast_settings_update(payload.clone()).await;
            
            Json(serde_json::json!({ "success": true }))
        } else {
            Json(serde_json::json!({ "success": false, "error": "Invalid settings format" }))
        }
    } else {
        Json(serde_json::json!({ "success": false, "error": "Failed to open store" }))
    }
}

// Handler for GET /follower (OBS Widget) - 직접 알림 컴포넌트 렌더링
async fn serve_svelte_obs(State(state): State<ServerState>) -> impl IntoResponse {
    println!("[Server] OBS 팔로워 라우트 핸들러 호출됨");
    let html_path = state.resource_path.join("index.html");
    println!("[Server] OBS 팔로워 페이지 제공 중: {:?}", html_path);

    match std::fs::read_to_string(&html_path) {
        Ok(mut html) => {
            println!("[Server] OBS HTML 파일 읽기 성공, 수정 중...");
            // OBS 모드로 설정하고 직접 알림 컴포넌트 렌더링
            html = html.replace(
                "<head>",
                "<head>
                    <script>
                        // OBS 모드 설정 - 한국어 로그 추가
                        window.OBS_MODE = true;
                        window.DIRECT_NOTIFIER_MODE = true;
                        console.log('[OBS] OBS 모드 활성화 - 직접 알림 렌더링');
                        console.log('[OBS] 현재 URL:', window.location.href);
                        console.log('[OBS] 경로:', window.location.pathname);
                        
                        // 강제로 OBS 모드 클래스 추가
                        document.addEventListener('DOMContentLoaded', function() {
                            document.body.classList.add('obs-mode');
                            console.log('[OBS] obs-mode 클래스 추가됨');
                        });
                    </script>
                    <style>
                        /* OBS 전용 스타일 - 한국어 주석 */
                        body { 
                            margin: 0; 
                            padding: 0; 
                            background: transparent !important;
                            overflow: hidden;
                        }
                        #app {
                            width: 100vw;
                            height: 100vh;
                            background: transparent;
                        }
                        /* OBS 모드에서 불필요한 요소 숨김 */
                        .obs-mode .session-banner,
                        .obs-mode .bottom-nav-wrapper {
                            display: none !important;
                        }
                    </style>"
            );
            println!("[Server] OBS HTML 수정 완료, 응답 전송");
            Html(html).into_response()
        },
        Err(e) => {
            eprintln!("[Server] index.html을 찾을 수 없음: {:?}, 오류: {}", html_path, e);
            (StatusCode::NOT_FOUND, "index.html을 찾을 수 없습니다").into_response()
        }
    }
}

// 실제 치지직 API를 호출하는 팔로워 조회
async fn get_followers(State(state): State<ServerState>) -> impl IntoResponse {
    println!("[Server] GET /followers");
    
    // 쿠키와 사용자 ID 가져오기
    let cookies = {
        let cookies_guard = state.app_state.cookies.lock().map_err(|e| {
            eprintln!("[Server] Failed to lock cookies: {}", e);
            return Json(json!({
                "code": 401,
                "message": "Authentication required",
                "content": null
            }));
        }).unwrap();
        
        match cookies_guard.as_ref() {
            Some(cookies) => cookies.clone(),
            None => {
                println!("[Server] No cookies available");
                return Json(json!({
                    "code": 401,
                    "message": "Authentication required",
                    "content": null
                }));
            }
        }
    };
    
    let user_id_hash = {
        let user_id_guard = state.app_state.user_id_hash.lock().map_err(|e| {
            eprintln!("[Server] Failed to lock user_id_hash: {}", e);
            return Json(json!({
                "code": 500,
                "message": "Internal server error",
                "content": null
            }));
        }).unwrap();
        
        match user_id_guard.as_ref() {
            Some(user_id) => user_id.clone(),
            None => {
                println!("[Server] No user ID available");
                return Json(json!({
                    "code": 401,
                    "message": "User ID not available",
                    "content": null
                }));
            }
        }
    };
    
    // 치지직 API 호출
    match crate::chzzk::get_followers(&state.app_state.client, &cookies, &user_id_hash).await {
        Ok(response) => {
            println!("[Server] Successfully fetched {} followers", 
                response.content.as_ref().map(|c| c.data.len()).unwrap_or(0));
            Json(json!(response))
        }
        Err(e) => {
            eprintln!("[Server] Failed to fetch followers: {}", e);
            Json(json!({
                "code": 500,
                "message": format!("Failed to fetch followers: {}", e),
                "content": null
            }))
        }
    }
}

async fn test_follower(State(_state): State<ServerState>) -> impl IntoResponse {
    // 테스트 팔로워 생성
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();
    
    let now_iso = format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());

    let test_item = json!({
        "user": {
            "userIdHash": format!("test_{}", now),
            "nickname": "루블리스",
            "profileImageUrl": "/default_profile.png"
        },
        "followingSince": now_iso
    });

    println!("[Server] Test follower created: {}", test_item);

    // WebSocket으로 테스트 알림 브로드캐스트 (있는 경우만)
    // state.ws_manager.broadcast_test_notification(test_item.clone()).await;

    Json(json!({
        "success": true,
        "message": "Test follower added to queue"
    }))
}

async fn test_follower_get(State(state): State<ServerState>) -> impl IntoResponse {
    test_follower(State(state)).await
}