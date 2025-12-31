pub mod chzzk;
pub mod server;
pub mod state;
pub mod updater;
pub mod websocket;

use state::AppState;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_store::StoreExt;



/// 로깅 시스템 초기화
fn init_logging() {
    #[cfg(debug_assertions)]
    {
        env_logger::Builder::from_default_env()
            .filter_level(log::LevelFilter::Debug)
            .init();
        log::info!("Debug logging initialized");
    }
    #[cfg(not(debug_assertions))]
    {
        env_logger::Builder::from_default_env()
            .filter_level(log::LevelFilter::Info)
            .init();
        log::info!("Production logging initialized");
    }
}


/// 로그인 상태를 업데이트하는 헬퍼 함수
fn update_login_state(
    state: &AppState,
    cookie_data: state::CookieData,
    user_id_hash: String,
) -> Result<(), String> {
    state.cookies
        .lock()
        .map_err(|e| format!("쿠키 잠금 실패: {}", e))?
        .replace(cookie_data);
    
    *state.login_status
        .lock()
        .map_err(|e| format!("로그인 상태 잠금 실패: {}", e))? = true;
    
    state.user_id_hash
        .lock()
        .map_err(|e| format!("사용자 ID 잠금 실패: {}", e))?
        .replace(user_id_hash);
    
    Ok(())
}

/// 앱 시작 시 저장된 쿠키를 로드하고 검증합니다.
#[tauri::command]
async fn check_auto_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    println!("[Command] check_auto_login called");

    // 1. Load cookies from Store
    let store = app.store("session.json").map_err(|e| {
        println!("[Command] Failed to open store: {}", e);
        format!("Store 열기 실패: {}", e)
    })?;

    // Store에서 값 가져오기
    let nid_aut_value = store.get("NID_AUT");
    let nid_ses_value = store.get("NID_SES");

    if nid_aut_value.is_none() || nid_ses_value.is_none() {
        println!("[Command] No stored cookies found");
        return Err("저장된 쿠키 없음".to_string());
    }

    // serde_json::Value를 String으로 변환
    let nid_aut_str = match nid_aut_value {
        Some(value) => value
            .as_str()
            .ok_or("NID_AUT가 문자열이 아닙니다")?
            .to_string(),
        None => return Err("NID_AUT가 없습니다".to_string()),
    };

    let nid_ses_str = match nid_ses_value {
        Some(value) => value
            .as_str()
            .ok_or("NID_SES가 문자열이 아닙니다")?
            .to_string(),
        None => return Err("NID_SES가 없습니다".to_string()),
    };

    // 2. Verify cookies with Chzzk API
    let cookie_data = state::CookieData {
        nid_aut: nid_aut_str.clone(),
        nid_ses: nid_ses_str.clone(),
    };

    match chzzk::get_profile_id(&state.client, &cookie_data).await {
        Ok((user_id_hash, nickname)) => {
            println!(
                "[Command] Auto-login successful: {} ({})",
                nickname, user_id_hash
            );

            // 3. Update Global State
            update_login_state(&state, cookie_data, user_id_hash.clone())?;

            // 4. Return user info
            Ok(serde_json::json!({
                "success": true,
                "nickname": nickname,
                "userIdHash": user_id_hash
            }))
        }
        Err(e) => {
            println!("[Command] Auto-login verification failed: {}", e);
            // Clear invalid cookies
            let _ = store.delete("NID_AUT");
            let _ = store.delete("NID_SES");
            let _ = store.save();
            Err(format!("자동 로그인 실패: {}", e))
        }
    }
}

/// 쿠키를 Store에 저장합니다.
#[tauri::command]
async fn save_cookies(
    app: tauri::AppHandle,
    nid_aut: String,
    nid_ses: String,
) -> Result<(), String> {
    println!("[Command] save_cookies called");

    let store = app
        .store("session.json")
        .map_err(|e| format!("Store 열기 실패: {}", e))?;

    store.set("NID_AUT", serde_json::json!(nid_aut));
    store.set("NID_SES", serde_json::json!(nid_ses));

    store
        .save()
        .map_err(|e| format!("Store 저장 실패: {}", e))?;

    println!("[Command] Cookies saved successfully");
    Ok(())
}

/// Store에서 저장된 쿠키를 가져옵니다.
#[tauri::command]
async fn get_stored_cookies(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let store = app
        .store("session.json")
        .map_err(|e| format!("Store 열기 실패: {}", e))?;

    let nid_aut = store.get("NID_AUT");
    let nid_ses = store.get("NID_SES");

    if nid_aut.is_none() || nid_ses.is_none() {
        return Err("저장된 쿠키 없음".to_string());
    }

    Ok(serde_json::json!({
        "NID_AUT": nid_aut,
        "NID_SES": nid_ses
    }))
}

#[tauri::command]
async fn manual_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    nid_aut: String,
    nid_ses: String,
) -> Result<(), String> {
    println!("[Command] manual_login called");

    // 1. Verify cookies with Chzzk API
    let cookie_data = state::CookieData {
        nid_aut: nid_aut.clone(),
        nid_ses: nid_ses.clone(),
    };

    match chzzk::get_profile_id(&state.client, &cookie_data).await {
        Ok((user_id_hash, nickname)) => {
            println!("[Command] Login verified: {} ({})", nickname, user_id_hash);

            // 2. Update Global State
            update_login_state(&state, cookie_data, user_id_hash.clone())?;

            // 3. Emit Success Event
            use tauri::Emitter;
            app.emit(
                "manual-login-success",
                serde_json::json!({
                    "nickname": nickname,
                    "userIdHash": user_id_hash
                }),
            )
            .map_err(|e| e.to_string())?;

            Ok(())
        }
        Err(e) => {
            println!("[Command] Login verification failed: {}", e);
            Err(format!("로그인 검증 실패: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 로깅 시스템 초기화
    init_logging();
    
    let app_state = Arc::new(AppState::default());
    let server_state = app_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 중복 실행 시 기존 창 포커스
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(app_state)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 윈도우 닫기 요청 시(X 버튼 등) 앱을 종료하지 않고 숨김
                // 트레이 아이콘을 통해서만 완전히 종료 가능
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let state = server_state.clone();

            // scripts 폴더 및 파일 생성
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ensure_scripts_folder().await {
                    log::error!("scripts 폴더 생성 실패: {}", e);
                } else {
                    log::info!("scripts 폴더 및 파일 준비 완료");
                }
            });

            // 서버 시작
            tauri::async_runtime::spawn(async move {
                server::start_server(state, handle).await;
            });

            // 트레이 아이콘 설정
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;

            let show_item = MenuItem::with_id(app, "show", "보이기", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
                    if let TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } = event
                    {
                        if button == MouseButton::Left && button_state == MouseButtonState::Up {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_auto_login,
            save_cookies,
            get_stored_cookies,
            manual_login,
            get_server_port,
            get_app_version,
            get_app_dir,
            updater::check_for_updates,
            updater::open_download_page,
            updater::download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn get_server_port(state: tauri::State<'_, Arc<AppState>>) -> Result<u16, String> {
    let port = state.port.lock().map_err(|e| e.to_string())?;
    Ok(*port)
}



#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn get_app_dir(_app: tauri::AppHandle) -> Result<String, String> {
    // 현재 실행 파일의 디렉토리를 가져옴
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("실행 파일 디렉토리를 찾을 수 없습니다")?;
    
    // 개발 모드에서는 프로젝트 루트를 반환
    #[cfg(debug_assertions)]
    {
        // 개발 모드에서는 src-tauri/target/debug에서 실행되므로 프로젝트 루트로 이동
        let project_root = exe_dir
            .parent() // target
            .and_then(|p| p.parent()) // src-tauri
            .and_then(|p| p.parent()) // project root
            .ok_or("프로젝트 루트를 찾을 수 없습니다")?;
        
        Ok(project_root.to_string_lossy().to_string())
    }
    
    // 프로덕션 모드에서는 실행 파일 디렉토리를 반환
    #[cfg(not(debug_assertions))]
    {
        Ok(exe_dir.to_string_lossy().to_string())
    }
}

/// scripts 폴더와 obs-redirector.html 파일을 생성합니다.
async fn ensure_scripts_folder() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("실행 파일 디렉토리를 찾을 수 없습니다")?;
    
    let scripts_dir = exe_dir.join("scripts");
    
    // scripts 폴더 생성
    if !scripts_dir.exists() {
        std::fs::create_dir_all(&scripts_dir).map_err(|e| {
            format!("scripts 폴더 생성 실패: {}", e)
        })?;
        log::info!("scripts 폴더 생성됨: {:?}", scripts_dir);
    }
    
    // obs-redirector.html 파일 생성
    let redirector_file = scripts_dir.join("obs-redirector.html");
    if !redirector_file.exists() {
        let redirector_content = r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fazzk OBS 리다이렉터</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: transparent;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #ffffff;
            text-align: center;
        }
        .loading {
            font-size: 16px;
            opacity: 0.8;
        }
        .error {
            color: #ff6b6b;
            font-size: 14px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="loading">Fazzk 서버 연결 중...</div>
    <div id="error" class="error" style="display: none;"></div>

    <script>
        console.log('[OBS Redirector] 시작됨');
        
        // 포트 정보 파일에서 동적 포트 읽기
        async function getServerPort() {
            try {
                // 임시 폴더에서 포트 정보 읽기
                const tempDir = navigator.platform.includes('Win') ? 
                    'C:/Users/' + (navigator.userAgent.match(/Windows NT.*?(\w+)/)?.[1] || 'USER') + '/AppData/Local/Temp/' :
                    '/tmp/';
                
                const portFile = tempDir + 'fazzk_port.txt';
                const infoFile = tempDir + 'fazzk_info.json';
                
                // 여러 방법으로 포트 정보 시도
                const methods = [
                    () => fetch('file://' + infoFile).then(r => r.json()).then(data => data.port),
                    () => fetch('file://' + portFile).then(r => r.text()).then(port => parseInt(port.trim())),
                    () => Promise.resolve(3001), // 기본 포트
                ];
                
                for (const method of methods) {
                    try {
                        const port = await method();
                        if (port && port > 1000 && port < 65536) {
                            console.log('[OBS Redirector] 포트 발견:', port);
                            return port;
                        }
                    } catch (e) {
                        console.log('[OBS Redirector] 포트 방법 실패:', e.message);
                    }
                }
                
                return 3001; // 최종 폴백
            } catch (e) {
                console.error('[OBS Redirector] 포트 읽기 실패:', e);
                return 3001;
            }
        }
        
        // 서버 연결 및 리다이렉트
        async function connectToServer() {
            try {
                const port = await getServerPort();
                const serverUrl = `http://localhost:${port}/follower`;
                
                console.log('[OBS Redirector] 서버 URL:', serverUrl);
                
                // 서버 연결 테스트
                const response = await fetch(`http://localhost:${port}/settings`);
                if (response.ok) {
                    console.log('[OBS Redirector] 서버 연결 성공, 리다이렉트 중...');
                    window.location.href = serverUrl;
                } else {
                    throw new Error(`서버 응답 오류: ${response.status}`);
                }
            } catch (error) {
                console.error('[OBS Redirector] 연결 실패:', error);
                document.querySelector('.loading').style.display = 'none';
                const errorDiv = document.getElementById('error');
                errorDiv.style.display = 'block';
                errorDiv.textContent = `서버 연결 실패: ${error.message}`;
                
                // 3초 후 재시도
                setTimeout(connectToServer, 3000);
            }
        }
        
        // 페이지 로드 시 연결 시도
        connectToServer();
    </script>
</body>
</html>"#;
        
        std::fs::write(&redirector_file, redirector_content).map_err(|e| {
            format!("obs-redirector.html 파일 생성 실패: {}", e)
        })?;
        log::info!("obs-redirector.html 파일 생성됨: {:?}", redirector_file);
    }
    
    Ok(())
}
