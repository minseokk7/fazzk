use crate::chzzk;
use crate::error::AppError;
use crate::state::{AppState, CookieData};
use crate::websocket::WSManager;
use axum::{
    extract::Request,
    extract::{Json, State},
    http::Method,
    middleware::{self, Next},
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
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
    let path = uri.path();
    let headers = req.headers().clone();

    // 모든 요청 로깅 (WebSocket 포함)
    println!(
        "[Server] {} {} - Headers: {:?}",
        method,
        uri,
        headers.get("upgrade")
    );

    let response = next.run(req).await;

    // 응답 상태도 로깅
    println!(
        "[Server Response] {} {} -> {}",
        method,
        path,
        response.status()
    );

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
    crate::monitor::start_follower_monitoring(app_state.clone(), ws_manager.clone()).await;

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
            println!(
                "[Server] 경로 시도 #{}: {:?} -> index.html 존재: {}",
                i + 1,
                p,
                index_path.exists()
            );
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
        .route("/tts", post(generate_tts))
        // WebSocket route (중요: API 라우트 다음에 배치)
        .route("/ws", get(crate::websocket::websocket_handler))
        // 디버깅을 위한 WebSocket 테스트 라우트
        .route(
            "/ws-test",
            get(|| async { "WebSocket endpoint is working" }),
        )
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
) -> Result<impl IntoResponse, AppError> {
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

            Ok(Json(serde_json::json!({
                "code": 200,
                "message": "Success",
                "nickname": nickname
            })))
        }
        Err(e) => {
            eprintln!("[Server] Cookie verification failed: {}", e);
            Err(AppError::AuthError(e.to_string()))
        }
    }
}

// Handler for GET /cookies (Debug)
async fn get_cookies(State(state): State<ServerState>) -> Result<impl IntoResponse, AppError> {
    let cookies = state
        .app_state
        .cookies
        .lock()
        .map_err(|_| AppError::LockError)?
        .clone()
        .unwrap_or_default();
    Ok(Json(cookies))
}

// Handler for GET /settings - Load settings from Tauri Store
async fn load_settings(State(state): State<ServerState>) -> Result<impl IntoResponse, AppError> {
    use tauri_plugin_store::StoreExt;

    println!("[Server] Loading settings from Store");

    if let Ok(store) = state.app_handle.store("settings.json") {
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
            "testNickname",
        ];

        for key in keys {
            if let Some(value) = store.get(key) {
                settings.insert(key.to_string(), value.clone());
            }
        }

        if settings.is_empty() {
            Ok(Json(serde_json::json!({
                "volume": 0.5,
                "pollingInterval": 5,
                "displayDuration": 5,
                "enableTTS": false,
                "customSoundPath": null,
                "animationType": "fade",
                "notificationLayout": "vertical",
                "textColor": "#ffffff",
                "textSize": 100,
                "testNickname": "테스트 유저"
            })))
        } else {
            Ok(Json(serde_json::Value::Object(settings)))
        }
    } else {
        Ok(Json(serde_json::json!({
            "volume": 0.5,
            "pollingInterval": 5,
            "displayDuration": 5,
            "enableTTS": false,
            "customSoundPath": null,
            "animationType": "fade",
            "notificationLayout": "vertical",
            "textColor": "#ffffff",
            "textSize": 100
        })))
    }
}

// Handler for POST /settings - Save settings to Tauri Store
async fn save_settings(
    State(state): State<ServerState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, AppError> {
    use tauri_plugin_store::StoreExt;

    println!("[Server] Saving settings to Store");

    if let Ok(store) = state.app_handle.store("settings.json") {
        if let Some(obj) = payload.as_object() {
            for (key, value) in obj {
                if key == "pollingInterval" {
                    if let Some(interval) = value.as_u64() {
                        if interval < 5 {
                            store.set(key, serde_json::json!(5));
                            continue;
                        }
                    } else if let Some(interval) = value.as_f64() {
                        if interval < 5.0 {
                            store.set(key, serde_json::json!(5));
                            continue;
                        }
                    }
                }
                store.set(key, value.clone());
            }

            store
                .save()
                .map_err(|e| AppError::ConfigError(e.to_string()))?;

            println!("[Server] Settings saved successfully");

            // AppConfig에 testNickname 동기화
            if let Some(nickname_val) = payload.get("testNickname").and_then(|v| v.as_str()) {
                let mut config = state.app_state.config.write().await;
                config.test_nickname = nickname_val.to_string();
            }

            state
                .ws_manager
                .broadcast_settings_update(payload.clone())
                .await;

            Ok(Json(serde_json::json!({ "success": true })))
        } else {
            Err(AppError::ParseError("Invalid settings format".to_string()))
        }
    } else {
        Err(AppError::ConfigError("Failed to open store".to_string()))
    }
}

// Handler for GET /follower (OBS Widget) - 직접 알림 컴포넌트 렌더링
async fn serve_svelte_obs(State(state): State<ServerState>) -> Result<impl IntoResponse, AppError> {
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
                            
                            // OBS에서 TTS 초기화
                            initializeTTSForOBS();
                            
                            // 서버 연결 상태 모니터링 시작
                            startServerMonitoring();
                            
                            // 추가적인 TTS 활성화 시도 (페이지 로드 후)
                            setTimeout(() => {
                                console.log('[OBS] Starting additional TTS activation...');
                                
                                // 여러 번의 TTS 활성화 시도
                                for (let i = 0; i < 5; i++) {
                                    setTimeout(() => {
                                        try {
                                            // 다양한 방법으로 TTS 시스템 깨우기
                                            if ('speechSynthesis' in window) {
                                                const synth = window.speechSynthesis;
                                                
                                                // 기존 발화 취소
                                                synth.cancel();
                                                
                                                // 무음 발화로 시스템 활성화
                                                const wakeUpUtterance = new SpeechSynthesisUtterance('');
                                                wakeUpUtterance.volume = 0;
                                                wakeUpUtterance.rate = 10;
                                                synth.speak(wakeUpUtterance);
                                                
                                                console.log(`[OBS] TTS wake-up attempt ${i + 1}/5`);
                                            }
                                        } catch (e) {
                                            console.warn(`[OBS] TTS wake-up attempt ${i + 1} failed:`, e);
                                        }
                                    }, i * 1000); // 1초 간격으로 시도
                                }
                                
                                // 최종 확인
                                setTimeout(() => {
                                    if ('speechSynthesis' in window) {
                                        const voices = speechSynthesis.getVoices();
                                        console.log('[OBS] Final TTS status - Voices available:', voices.length);
                                        console.log('[OBS] Speech synthesis ready:', !speechSynthesis.speaking && !speechSynthesis.pending);
                                    }
                                }, 6000);
                                
                            }, 2000); // 페이지 로드 2초 후 시작
                        });
                        
                        // OBS에서 TTS 초기화 함수
                        function initializeTTSForOBS() {
                            if ('speechSynthesis' in window) {
                                console.log('[OBS] Initializing TTS for OBS...');
                                
                                // 음성 목록 로드 대기
                                function loadVoices() {
                                    const voices = speechSynthesis.getVoices();
                                    console.log('[OBS] TTS voices loaded:', voices.length);
                                    
                                    if (voices.length > 0) {
                                        const koreanVoices = voices.filter(v => v.lang.includes('ko') || v.lang.includes('KR'));
                                        console.log('[OBS] Korean voices available:', koreanVoices.length);
                                        
                                        // 각 음성의 세부 정보 로그
                                        voices.forEach((voice, index) => {
                                            console.log(`[OBS] Voice ${index}: ${voice.name} (${voice.lang}) - Local: ${voice.localService}`);
                                        });
                                        
                                        // 테스트 발화들 (다양한 방법으로 TTS 시스템 활성화)
                                        try {
                                            // 방법 1: 무음 테스트
                                            const silentUtterance = new SpeechSynthesisUtterance('');
                                            silentUtterance.volume = 0;
                                            speechSynthesis.speak(silentUtterance);
                                            console.log('[OBS] Silent TTS test completed');
                                            
                                            // 방법 2: 매우 짧은 테스트
                                            setTimeout(() => {
                                                const shortUtterance = new SpeechSynthesisUtterance('테스트');
                                                shortUtterance.volume = 0.01;
                                                shortUtterance.rate = 10;
                                                speechSynthesis.speak(shortUtterance);
                                                console.log('[OBS] Short TTS test completed');
                                            }, 100);
                                            
                                            // 방법 3: 한국어 음성으로 테스트
                                            if (koreanVoices.length > 0) {
                                                setTimeout(() => {
                                                    const koreanUtterance = new SpeechSynthesisUtterance('');
                                                    koreanUtterance.voice = koreanVoices[0];
                                                    koreanUtterance.volume = 0;
                                                    speechSynthesis.speak(koreanUtterance);
                                                    console.log('[OBS] Korean voice test completed');
                                                }, 200);
                                            }
                                            
                                        } catch (e) {
                                            console.warn('[OBS] TTS test failed:', e);
                                        }
                                    }
                                }
                                
                                // 음성 목록이 이미 로드되었는지 확인
                                if (speechSynthesis.getVoices().length > 0) {
                                    loadVoices();
                                } else {
                                    // 음성 목록 로드 이벤트 대기
                                    speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
                                    
                                    // 타임아웃으로 강제 로드 시도 (여러 번)
                                    setTimeout(loadVoices, 500);
                                    setTimeout(loadVoices, 1000);
                                    setTimeout(loadVoices, 2000);
                                }
                                
                                // 추가적인 TTS 시스템 활성화 시도
                                setTimeout(() => {
                                    try {
                                        // 사용자 상호작용 시뮬레이션
                                        const events = ['click', 'touchstart', 'keydown', 'mousedown'];
                                        events.forEach(eventType => {
                                            const event = new Event(eventType, { 
                                                bubbles: true, 
                                                cancelable: true 
                                            });
                                            document.dispatchEvent(event);
                                        });
                                        
                                        // 오디오 컨텍스트 활성화
                                        if (window.AudioContext || window.webkitAudioContext) {
                                            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                                            const audioContext = new AudioContextClass();
                                            
                                            if (audioContext.state === 'suspended') {
                                                audioContext.resume().then(() => {
                                                    console.log('[OBS] Audio context resumed for TTS');
                                                }).catch(e => {
                                                    console.warn('[OBS] Audio context resume failed:', e);
                                                });
                                            }
                                        }
                                        
                                        console.log('[OBS] Additional TTS activation attempts completed');
                                    } catch (e) {
                                        console.warn('[OBS] Additional TTS activation failed:', e);
                                    }
                                }, 1000);
                                
                            } else {
                                console.warn('[OBS] Speech synthesis not supported');
                            }
                        }
                        
                        // 서버 연결 상태 모니터링
                        function startServerMonitoring() {
                            let consecutiveFailures = 0;
                            const maxFailures = 3;
                            const checkInterval = 5000; // 5초마다 체크
                            
                            function checkServerConnection() {
                                fetch('/settings', { 
                                    method: 'HEAD',
                                    cache: 'no-cache'
                                })
                                .then(response => {
                                    if (response.ok) {
                                        consecutiveFailures = 0;
                                    } else {
                                        throw new Error('Server response not ok');
                                    }
                                })
                                .catch(error => {
                                    consecutiveFailures++;
                                    console.log(`[OBS] 서버 연결 실패 ${consecutiveFailures}/${maxFailures}:`, error);
                                    
                                    if (consecutiveFailures >= maxFailures) {
                                        console.log('[OBS] 서버 연결 완전 실패 - 페이지 정리');
                                        handleServerDisconnection();
                                    }
                                });
                            }
                            
                            function handleServerDisconnection() {
                                // 모든 로딩 인디케이터 강제 제거
                                const loadingElements = document.querySelectorAll('.loading-indicator, .loading-item, .loading-spinner');
                                loadingElements.forEach(el => {
                                    el.style.display = 'none';
                                    el.remove();
                                });
                                
                                // 세션 배너 제거
                                const sessionBanner = document.querySelector('.session-banner');
                                if (sessionBanner) {
                                    sessionBanner.style.display = 'none';
                                    sessionBanner.remove();
                                }
                                
                                // 연결 상태 표시 제거
                                const connectionStatus = document.querySelector('.connection-status');
                                if (connectionStatus) {
                                    connectionStatus.style.display = 'none';
                                    connectionStatus.remove();
                                }
                                
                                // 토스트 알림 제거
                                const toastContainer = document.querySelector('.toast-container');
                                if (toastContainer) {
                                    toastContainer.style.display = 'none';
                                    toastContainer.remove();
                                }
                                
                                console.log('[OBS] 서버 연결 끊김 - UI 요소 정리 완료');
                                
                                // 30초 후 페이지 새로고침 (서버 재시작 대기)
                                setTimeout(() => {
                                    console.log('[OBS] 서버 재연결 시도 - 페이지 새로고침');
                                    window.location.reload();
                                }, 30000);
                            }
                            
                            // 초기 체크
                            checkServerConnection();
                            
                            // 주기적 체크 시작
                            setInterval(checkServerConnection, checkInterval);
                            
                            console.log('[OBS] 서버 모니터링 시작됨');
                        }
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
                        .obs-mode .bottom-nav-wrapper,
                        .obs-mode .loading-indicator,
                        .obs-mode .connection-status,
                        .obs-mode .toast-container {
                            display: none !important;
                            visibility: hidden !important;
                            opacity: 0 !important;
                        }
                        
                        /* 서버 연결 끊김 시 모든 UI 요소 숨김 */
                        .server-disconnected * {
                            display: none !important;
                        }
                        
                        .server-disconnected {
                            background: transparent !important;
                        }
                    </style>"
            );
            println!("[Server] OBS HTML 수정 완료, 응답 전송");

            // 캐시 방지 헤더 추가
            let mut response = Html(html).into_response();
            let headers = response.headers_mut();
            headers.insert(
                "Cache-Control",
                "no-cache, no-store, must-revalidate".parse().unwrap(),
            );
            headers.insert("Pragma", "no-cache".parse().unwrap());
            headers.insert("Expires", "0".parse().unwrap());

            Ok(response)
        }
        Err(e) => {
            eprintln!(
                "[Server] index.html을 찾을 수 없음: {:?}, 오류: {}",
                html_path, e
            );
            Err(AppError::PathError)
        }
    }
}

// 실제 치지직 API를 호출하는 팔로워 조회
async fn get_followers(State(state): State<ServerState>) -> Result<impl IntoResponse, AppError> {
    println!("[Server] GET /followers");

    let cookies = {
        let cookies_guard = state
            .app_state
            .cookies
            .lock()
            .map_err(|_| AppError::LockError)?;

        match cookies_guard.as_ref() {
            Some(cookies) => cookies.clone(),
            None => {
                println!("[Server] No cookies available");
                return Err(AppError::AuthError("인증이 필요합니다.".to_string()));
            }
        }
    };

    let user_id_hash = {
        let user_id_guard = state
            .app_state
            .user_id_hash
            .lock()
            .map_err(|_| AppError::LockError)?;

        match user_id_guard.as_ref() {
            Some(user_id) => user_id.clone(),
            None => {
                println!("[Server] No user ID available");
                return Err(AppError::AuthError("User ID Not available".to_string()));
            }
        }
    };

    // 치지직 API 호출
    match crate::chzzk::get_followers(&state.app_state.client, &cookies, &user_id_hash).await {
        Ok(response) => {
            println!(
                "[Server] Successfully fetched {} followers",
                response.content.as_ref().map(|c| c.data.len()).unwrap_or(0)
            );
            Ok(Json(json!(response)))
        }
        Err(e) => {
            eprintln!("[Server] Failed to fetch followers: {}", e);
            Err(e)
        }
    }
}

async fn test_follower(State(state): State<ServerState>) -> Result<impl IntoResponse, AppError> {
    // AppConfig에서 테스트 닉네임 가져오기
    let config = state.app_state.config.read().await;
    let nickname = if config.test_nickname.is_empty() {
        "테스트 유저".to_string()
    } else {
        config.test_nickname.clone()
    };
    drop(config);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();

    let now_iso = format!(
        "{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    );

    let test_item = json!({
        "user": {
            "userIdHash": format!("test_{}", now),
            "nickname": nickname,
            "profileImageUrl": "/default_profile.png"
        },
        "followingSince": now_iso
    });

    println!("[Server] Test follower created: {}", test_item);

    // WebSocket으로 테스트 알림 브로드캐스트
    let follower = crate::chzzk::FollowerItem {
        user: crate::chzzk::User {
            user_id_hash: format!("test_{}", now),
            nickname: nickname.clone(),
            profile_image_url: Some("/default_profile.png".to_string()),
        },
        following_since: now_iso,
    };
    state.ws_manager.broadcast_new_follower(follower).await;

    Ok(Json(json!({
        "success": true,
        "message": format!("테스트 팔로워 '{}' 알림 전송 완료", nickname)
    })))
}

async fn test_follower_get(
    State(state): State<ServerState>,
) -> Result<impl IntoResponse, AppError> {
    test_follower(State(state)).await
}

// TTS 음성 생성 API
async fn generate_tts(
    State(_state): State<ServerState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, AppError> {
    use axum::http::header;

    println!("[Server] TTS generation request: {:?}", payload);

    let text = match payload.get("text").and_then(|t| t.as_str()) {
        Some(text) => text,
        None => {
            return Err(AppError::ParseError("Missing text parameter".to_string()));
        }
    };

    // Windows TTS 사용 (SAPI)
    match generate_tts_audio(text).await {
        Ok(audio_data) => {
            // WAV 파일로 응답 (타입 추론 명시를 위해 axum::body::Body 사용)
            let mut response = axum::response::Response::new(axum::body::Body::from(audio_data));
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, "audio/wav".parse().unwrap());
            response.headers_mut().insert(
                header::CACHE_CONTROL,
                "no-cache, no-store, must-revalidate".parse().unwrap(),
            );
            Ok(response)
        }
        Err(e) => {
            eprintln!("[Server] TTS generation failed: {}", e);
            Err(AppError::Unknown(anyhow::anyhow!("TTS error: {}", e)))
        }
    }
}

// Windows SAPI를 사용한 TTS 음성 생성
async fn generate_tts_audio(
    text: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    use std::fs;
    use std::process::Command;

    // 임시 파일 경로 생성
    let temp_dir = std::env::temp_dir();
    let audio_file = temp_dir.join(format!(
        "fazzk_tts_{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));

    // PowerShell을 사용한 Windows TTS (SAPI)
    let powershell_script = format!(
        r#"
        Add-Type -AssemblyName System.Speech
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        
        # 한국어 음성 찾기
        $voices = $synth.GetInstalledVoices()
        $koreanVoice = $voices | Where-Object {{ $_.VoiceInfo.Culture.Name -like "*ko*" -or $_.VoiceInfo.Name -like "*Korean*" }}
        
        if ($koreanVoice) {{
            $synth.SelectVoice($koreanVoice[0].VoiceInfo.Name)
            Write-Host "Using Korean voice: $($koreanVoice[0].VoiceInfo.Name)"
        }} else {{
            Write-Host "No Korean voice found, using default"
        }}
        
        # 음성 설정
        $synth.Rate = 0
        $synth.Volume = 100
        
        # WAV 파일로 저장
        $synth.SetOutputToWaveFile("{}")
        $synth.Speak("{}")
        $synth.SetOutputToDefaultAudioDevice()
        $synth.Dispose()
        
        Write-Host "TTS audio generated successfully"
        "#,
        audio_file.to_string_lossy().replace("\\", "\\\\"),
        text.replace("\"", "\\\"")
    );

    println!("[TTS] Generating audio for: {}", text);

    // PowerShell 실행
    let output = Command::new("powershell")
        .args(&["-Command", &powershell_script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell TTS failed: {}", stderr).into());
    }

    // 생성된 파일 읽기
    if !audio_file.exists() {
        return Err("TTS audio file was not created".into());
    }

    let audio_data =
        fs::read(&audio_file).map_err(|e| format!("Failed to read TTS audio file: {}", e))?;

    // 임시 파일 정리
    let _ = fs::remove_file(&audio_file);

    println!(
        "[TTS] Audio generated successfully: {} bytes",
        audio_data.len()
    );
    Ok(audio_data)
}
