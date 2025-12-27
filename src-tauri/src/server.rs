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
use std::time::{SystemTime, UNIX_EPOCH};
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
    println!("[Server] {} {}", method, uri);
    next.run(req).await
}

pub async fn start_server(app_state: Arc<AppState>, app_handle: AppHandle) {
    // Find available port starting from 3000
    let port = find_available_port(3000).await;
    // let port = 3000; // Legacy static port

    // Save port to state
    if let Ok(mut p) = app_state.port.lock() {
        *p = port;
    }

    // WebSocket 매니저 초기화
    let ws_manager = WSManager::new();
    println!("[WebSocket] Manager initialized");

    // 정적 파일 경로 (개발 vs 빌드 환경)
    // 가능한 리소스 경로들을 시도
    let resource_base = app_handle.path().resource_dir().ok();

    let possible_paths = [
        // 개발 환경 - pages-svelte/dist
        std::path::PathBuf::from("../pages-svelte/dist"),
        // 빌드 환경 - 직접 pages-svelte/dist
        resource_base
            .as_ref()
            .map(|p| p.join("pages-svelte").join("dist"))
            .unwrap_or_default(),
        // 빌드 환경 - 리소스 루트에 직접
        resource_base.clone().unwrap_or_default(),
    ];

    let resource_path = possible_paths
        .iter()
        .find(|p| p.join("index.html").exists())
        .cloned()
        .unwrap_or_else(|| std::path::PathBuf::from("../pages-svelte/dist"));

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
        // API routes first (highest priority)
        .route("/auth/cookies", post(receive_cookies))
        .route("/cookies", get(get_cookies))
        .route("/settings", get(load_settings).post(save_settings))
        .route("/followers", get(get_followers))
        .route("/test-follower", post(test_follower))
        .route("/test-follower-get", get(test_follower_get))
        // Static file serving
        .nest_service("/public", ServeDir::new(&public_path))
        // OBS 전용 라우트 - Svelte 앱으로 리다이렉트
        .route("/follower", get(serve_svelte_obs))
        // WebSocket route
        .route("/ws", get(crate::websocket::websocket_handler))
        // Fallback for SPA routing (lowest priority)
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

async fn find_available_port(start: u16) -> u16 {
    for port in start..start + 100 {
        if TcpListener::bind(format!("0.0.0.0:{}", port)).await.is_ok() {
            return port;
        }
    }
    start // Fallback
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
    let html_path = state.resource_path.join("index.html");
    println!("[Server] Serving OBS follower page from: {:?}", html_path);

    match std::fs::read_to_string(&html_path) {
        Ok(mut html) => {
            // OBS 모드로 설정하고 직접 알림 컴포넌트 렌더링
            html = html.replace(
                "<head>",
                "<head>
                    <script>
                        // OBS 모드 설정
                        window.OBS_MODE = true;
                        window.DIRECT_NOTIFIER_MODE = true;
                        console.log('[OBS] OBS mode enabled - direct notifier rendering');
                    </script>
                    <style>
                        /* OBS 전용 스타일 */
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
                    </style>"
            );
            Html(html).into_response()
        },
        Err(e) => {
            eprintln!("[Server] index.html not found: {:?}, error: {}", html_path, e);
            (StatusCode::NOT_FOUND, "index.html not found").into_response()
        }
    }
}

// Handler for GET /followers (Polling)
#[axum::debug_handler]
async fn get_followers(State(state): State<ServerState>) -> impl IntoResponse {
    let app_state = &state.app_state;
    let mut real_followers: Vec<crate::chzzk::FollowerItem> = Vec::new();

    // 1. Fetch from Chzzk API
    let (cookies, user_id_hash) = {
        let cookies_lock = app_state.cookies.lock().unwrap();
        let hash_lock = app_state.user_id_hash.lock().unwrap();
        (cookies_lock.clone(), hash_lock.clone())
    };

    if let (Some(cookies), Some(hash)) = (cookies, user_id_hash) {
        match chzzk::get_followers(&app_state.client, &cookies, &hash).await {
            Ok(response) => {
                if let Some(content) = response.content {
                    real_followers = content.data;
                }
            }
            Err(e) => {
                println!("[Server] Failed to fetch followers: {}", e);
                // Continue to serve test queue even if API fails
            }
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    // 2. Process New Followers
    if !real_followers.is_empty() {
        let mut new_followers = Vec::new();
        
        {
            let mut known = app_state.known_followers.lock().unwrap();
            let mut real_queue = app_state.real_queue.lock().unwrap();
            let mut rublis_last_seen = app_state.rublis_last_seen.lock().unwrap();

            // 첫 번째 호출 시 모든 팔로워를 기존으로 등록 (초기화) - 루블리스 제외
            if known.is_empty() && !real_followers.is_empty() {
                println!("[Server] First call - initializing known followers (excluding 루블리스)");
                let mut initialized_count = 0;
                for follower in &real_followers {
                    // 루블리스는 초기화에서 제외 (항상 새 팔로워로 처리하기 위해)
                    if follower.user.nickname != "루블리스" {
                        known.insert(follower.user.user_id_hash.clone());
                        initialized_count += 1;
                    } else {
                        // 루블리스가 현재 팔로우 중이면 마지막 확인 시간 기록
                        *rublis_last_seen = Some(now);
                        println!("[Server] 루블리스 currently following - tracking for duplicate prevention");
                    }
                }
                println!("[Server] Initialized {} known followers (루블리스 excluded)", initialized_count);
                // 초기화 후에는 새 팔로워 처리하지 않고 종료
            } else {
                // 정상적인 새 팔로워 처리
                let current_hashes: std::collections::HashSet<String> = real_followers
                    .iter()
                    .map(|f| f.user.user_id_hash.clone())
                    .collect();

                // Remove old known followers not in current list (except 루블리스)
                known.retain(|h| {
                    if current_hashes.contains(h) {
                        true
                    } else {
                        // 루블리스는 known에서 제거되어도 다시 추가하지 않음 (항상 새 팔로워로 처리)
                        let follower_is_rublis = real_followers.iter()
                            .any(|f| f.user.user_id_hash == *h && f.user.nickname == "루블리스");
                        !follower_is_rublis
                    }
                });

                // 루블리스 특별 처리
                let rublis_follower = real_followers.iter().find(|f| f.user.nickname == "루블리스");
                
                if let Some(rublis) = rublis_follower {
                    // 루블리스가 현재 팔로우 중
                    if let Some(last_seen) = *rublis_last_seen {
                        // 이미 확인한 적이 있음 - 중복 방지
                        if now - last_seen < 30000 { // 30초 내 중복 방지
                            println!("[Server] 루블리스 duplicate prevented (last seen {}ms ago)", now - last_seen);
                        } else {
                            // 30초 이상 지났으면 새로운 팔로우로 처리
                            println!("[Server] 루블리스 re-follow detected after {}ms", now - last_seen);
                            new_followers.push(rublis.clone());
                            real_queue.push_back(crate::state::RealFollowerQueueItem {
                                follower: rublis.clone(),
                                created_at: now,
                            });
                            *rublis_last_seen = Some(now);
                        }
                    } else {
                        // 처음 확인하는 경우
                        println!("[Server] 루블리스 first detection - always treated as new");
                        new_followers.push(rublis.clone());
                        real_queue.push_back(crate::state::RealFollowerQueueItem {
                            follower: rublis.clone(),
                            created_at: now,
                        });
                        *rublis_last_seen = Some(now);
                    }
                } else {
                    // 루블리스가 팔로우 해제함 - 추적 초기화
                    if rublis_last_seen.is_some() {
                        println!("[Server] 루블리스 unfollowed - resetting tracking");
                        *rublis_last_seen = None;
                    }
                }

                // 일반 팔로워 처리
                for follower in &real_followers {
                    if follower.user.nickname == "루블리스" {
                        continue; // 루블리스는 위에서 이미 처리함
                    }
                    
                    if !known.contains(&follower.user.user_id_hash) {
                        known.insert(follower.user.user_id_hash.clone());
                        println!("[Server] New follower detected: {}", follower.user.nickname);

                        new_followers.push(follower.clone());

                        real_queue.push_back(crate::state::RealFollowerQueueItem {
                            follower: follower.clone(),
                            created_at: now,
                        });
                    }
                }
            }
        } // Mutex guards are dropped here
        
        // Now broadcast new followers without holding any locks
        for follower in new_followers {
            state.ws_manager.broadcast_new_follower(follower).await;
        }
    }

    // 3. Cleanup Queues
    {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();

        // Clean Real Queue
        let mut real_queue = app_state.real_queue.lock().unwrap();
        while let Some(item) = real_queue.front() {
            if now - item.created_at > 30000 {
                real_queue.pop_front();
            } else {
                break;
            }
        }

        // Clean Test Queue
        let mut test_queue = app_state.test_queue.lock().unwrap();
        while let Some(item) = test_queue.front() {
            // Parsing "test_{ts}" from userIdHash
            if let Some(ts_str) = item.user.user_id_hash.strip_prefix("test_") {
                if let Ok(ts) = ts_str.parse::<u128>() {
                    if now - ts > 5000 { // 5 seconds for test items
                        println!("[Server] Removing expired test follower: {}", item.user.nickname);
                        test_queue.pop_front();
                        continue;
                    }
                }
            }
            break;
        }
    }

    // 4. Combine Queues (Test + Real)
    let mut combined_data = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Add Test Queue (Iterate instead of Pop)
    {
        let test_queue = app_state.test_queue.lock().unwrap();
        for item in test_queue.iter() {
            if !seen.contains(&item.user.user_id_hash) {
                seen.insert(item.user.user_id_hash.clone());
                combined_data.push(item.clone());
            }
        }
    }

    // Add Real Queue
    {
        let real_queue = app_state.real_queue.lock().unwrap();
        for item in real_queue.iter() {
            if !seen.contains(&item.follower.user.user_id_hash) {
                seen.insert(item.follower.user.user_id_hash.clone());
                combined_data.push(item.follower.clone());
            }
        }
    }

    // Add remaining history from API (if not seen)
    for f in real_followers {
        if !seen.contains(&f.user.user_id_hash) {
            combined_data.push(f);
        }
    }

    Json(json!({
        "code": 200,
        "message": "Success",
        "content": {
            "page": 0,
            "size": 10,
            "data": combined_data
        }
    }))
}

// Handler for POST /test-follower
async fn test_follower(State(state): State<ServerState>) -> impl IntoResponse {
    println!("[Server] Test follower endpoint called (POST)");
    create_test_follower(state).await
}

// Handler for GET /test-follower-get
async fn test_follower_get(State(state): State<ServerState>) -> impl IntoResponse {
    println!("[Server] Test follower endpoint called (GET)");
    create_test_follower(state).await
}

// Common function to create test follower
async fn create_test_follower(state: ServerState) -> impl IntoResponse {
    let app_state = &state.app_state;
    let now_str = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();
    
    let now = SystemTime::now();
    let datetime: chrono::DateTime<chrono::Utc> = now.into();
    let now_iso = datetime.to_rfc3339();

    let test_item = crate::chzzk::FollowerItem {
        user: crate::chzzk::User {
            user_id_hash: format!("test_{}", now_str),
            nickname: "루블리스".to_string(), // 테스트 알림도 루블리스로 표시
            profile_image_url: Some("/default_profile.png".to_string()),
        },
        following_since: now_iso,
    };

    println!("[Server] Test follower added: {}", test_item.user.nickname);

    // WebSocket으로 테스트 알림 브로드캐스트
    state.ws_manager.broadcast_test_notification(test_item.clone()).await;

    let mut queue = app_state.test_queue.lock().unwrap();
    queue.push_back(test_item);

    Json(json!({
        "success": true,
        "message": "Test follower added to queue"
    }))
}
