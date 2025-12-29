use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

// WebSocket 메시지 타입
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WSMessage {
    // 클라이언트 → 서버
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "subscribe")]
    Subscribe { topics: Vec<String> },
    #[serde(rename = "test_follower")]
    TestFollower,
    
    // 서버 → 클라이언트
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "new_follower")]
    NewFollower { follower: crate::chzzk::FollowerItem },
    #[serde(rename = "test_notification")]
    TestNotification { follower: crate::chzzk::FollowerItem },
    #[serde(rename = "settings_updated")]
    SettingsUpdated { settings: serde_json::Value },
    #[serde(rename = "error")]
    Error { message: String },
}

// 클라이언트 정보 (개선된 버전)
#[derive(Debug, Clone)]
pub struct WSClient {
    pub id: String,
    pub subscriptions: Vec<String>,
    pub sender: broadcast::Sender<WSMessage>,
    pub connected_at: Instant,
    pub last_activity: Instant,
}

impl WSClient {
    pub fn new(id: String) -> Self {
        let (sender, _) = broadcast::channel(100);
        let now = Instant::now();
        
        Self {
            id,
            subscriptions: vec!["followers".to_string()], // 기본 구독
            sender,
            connected_at: now,
            last_activity: now,
        }
    }
    
    pub fn update_activity(&mut self) {
        self.last_activity = Instant::now();
    }
    
    pub fn is_stale(&self, timeout: Duration) -> bool {
        self.last_activity.elapsed() > timeout
    }
}

// WebSocket 연결 풀 (메모리 효율성 향상)
#[derive(Debug, Clone)]
pub struct WSConnectionPool {
    clients: Arc<RwLock<HashMap<String, WSClient>>>,
    connection_limit: usize,
    cleanup_interval: Duration,
    client_timeout: Duration,
    broadcast_tx: broadcast::Sender<WSMessage>,
}

impl WSConnectionPool {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(1000);
        
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            connection_limit: 100, // 최대 100개 연결
            cleanup_interval: Duration::from_secs(300), // 5분마다 정리
            client_timeout: Duration::from_secs(600), // 10분 비활성 시 제거
            broadcast_tx,
        }
    }
    
    // 클라이언트 추가 (연결 제한 적용)
    pub async fn add_client(&self, client: WSClient) -> Result<(), String> {
        let mut clients = self.clients.write().await;
        
        // 연결 수 제한 확인
        if clients.len() >= self.connection_limit {
            // 가장 오래된 비활성 클라이언트 제거
            if let Some(oldest_id) = self.find_oldest_inactive_client(&clients).await {
                clients.remove(&oldest_id);
                log::info!("[WSPool] Removed oldest inactive client: {}", oldest_id);
            } else {
                return Err("Connection limit reached and no inactive clients to remove".to_string());
            }
        }
        
        let client_id = client.id.clone();
        clients.insert(client_id.clone(), client);
        log::info!("[WSPool] Client added: {} (Total: {})", client_id, clients.len());
        
        Ok(())
    }
    
    // 클라이언트 제거
    pub async fn remove_client(&self, client_id: &str) {
        let mut clients = self.clients.write().await;
        if clients.remove(client_id).is_some() {
            log::info!("[WSPool] Client removed: {} (Remaining: {})", client_id, clients.len());
        }
    }
    
    // 클라이언트 활동 업데이트
    pub async fn update_client_activity(&self, client_id: &str) {
        let mut clients = self.clients.write().await;
        if let Some(client) = clients.get_mut(client_id) {
            client.update_activity();
        }
    }
    
    // 비활성 클라이언트 정리
    pub async fn cleanup_stale_clients(&self) {
        let mut clients = self.clients.write().await;
        let mut to_remove = Vec::new();
        
        for (id, client) in clients.iter() {
            if client.is_stale(self.client_timeout) {
                to_remove.push(id.clone());
            }
        }
        
        for id in to_remove {
            clients.remove(&id);
            log::info!("[WSPool] Removed stale client: {}", id);
        }
        
        if !clients.is_empty() {
            log::debug!("[WSPool] Cleanup completed. Active clients: {}", clients.len());
        }
    }
    
    // 가장 오래된 비활성 클라이언트 찾기
    async fn find_oldest_inactive_client(&self, clients: &HashMap<String, WSClient>) -> Option<String> {
        clients.iter()
            .min_by_key(|(_, client)| client.last_activity)
            .map(|(id, _)| id.clone())
    }
    
    // 클라이언트 수 반환
    pub async fn client_count(&self) -> usize {
        self.clients.read().await.len()
    }
    
    // 새 팔로워 브로드캐스트
    pub async fn broadcast_new_follower(&self, follower: crate::chzzk::FollowerItem) {
        let message = WSMessage::NewFollower { follower };
        if let Err(e) = self.broadcast_tx.send(message) {
            log::warn!("[WSPool] Failed to broadcast new follower: {}", e);
        } else {
            let client_count = self.client_count().await;
            log::info!("[WSPool] Broadcasted new follower to {} clients", client_count);
        }
    }
    
    // 테스트 알림 브로드캐스트
    pub async fn broadcast_test_notification(&self, follower: crate::chzzk::FollowerItem) {
        let message = WSMessage::TestNotification { follower };
        if let Err(e) = self.broadcast_tx.send(message) {
            log::warn!("[WSPool] Failed to broadcast test notification: {}", e);
        } else {
            let client_count = self.client_count().await;
            log::info!("[WSPool] Broadcasted test notification to {} clients", client_count);
        }
    }
    
    // 설정 업데이트 브로드캐스트
    pub async fn broadcast_settings_update(&self, settings: serde_json::Value) {
        let message = WSMessage::SettingsUpdated { settings };
        if let Err(e) = self.broadcast_tx.send(message) {
            log::warn!("[WSPool] Failed to broadcast settings update: {}", e);
        } else {
            let client_count = self.client_count().await;
            log::info!("[WSPool] Broadcasted settings update to {} clients", client_count);
        }
    }
    
    // 정기 정리 태스크 시작
    pub fn start_cleanup_task(&self) {
        let pool = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(pool.cleanup_interval);
            
            loop {
                interval.tick().await;
                pool.cleanup_stale_clients().await;
            }
        });
        
        log::info!("[WSPool] Cleanup task started (interval: {:?})", self.cleanup_interval);
    }
    
    // 브로드캐스트 채널 구독
    pub fn subscribe(&self) -> broadcast::Receiver<WSMessage> {
        self.broadcast_tx.subscribe()
    }
}

// 기존 WSManager를 WSConnectionPool로 대체
pub type WSManager = WSConnectionPool;

// WebSocket 핸들러
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<crate::server::ServerState>,
) -> axum::response::Response {
    log::info!("[WebSocket] New connection attempt");
    let ws_manager = state.ws_manager.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, ws_manager))
}

async fn handle_socket(socket: WebSocket, ws_manager: WSConnectionPool) {
    let client_id = Uuid::new_v4().to_string();
    log::info!("[WebSocket] Client {} connecting", client_id);
    
    let (mut sender, mut receiver) = socket.split();
    
    // 클라이언트 생성 및 풀에 추가
    let client = WSClient::new(client_id.clone());
    if let Err(e) = ws_manager.add_client(client).await {
        log::warn!("[WebSocket] Failed to add client {}: {}", client_id, e);
        return;
    }
    
    // 글로벌 브로드캐스트 구독
    let mut global_rx = ws_manager.subscribe();
    
    // 메시지 전송 태스크
    let client_id_clone = client_id.clone();
    let ws_manager_clone = ws_manager.clone();
    let send_task = tokio::spawn(async move {
        loop {
            match global_rx.recv().await {
                Ok(ws_msg) => {
                    let json = match serde_json::to_string(&ws_msg) {
                        Ok(json) => json,
                        Err(e) => {
                            log::error!("[WebSocket] Failed to serialize message: {}", e);
                            continue;
                        }
                    };
                    
                    if sender.send(Message::Text(json)).await.is_err() {
                        log::info!("[WebSocket] Client {} disconnected (send failed)", client_id_clone);
                        break;
                    }
                    
                    // 활동 업데이트
                    ws_manager_clone.update_client_activity(&client_id_clone).await;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    log::info!("[WebSocket] Broadcast channel closed");
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    log::warn!("[WebSocket] Client {} lagged behind", client_id_clone);
                    // 계속 진행
                }
            }
        }
    });
    
    // 메시지 수신 태스크
    let client_id_clone = client_id.clone();
    let ws_manager_clone = ws_manager.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    // 활동 업데이트
                    ws_manager_clone.update_client_activity(&client_id_clone).await;
                    
                    // 클라이언트 메시지 처리
                    if let Err(e) = handle_client_message(&text, &client_id_clone, &ws_manager_clone).await {
                        log::error!("[WebSocket] Error handling message from {}: {}", client_id_clone, e);
                    }
                }
                Ok(Message::Close(_)) => {
                    log::info!("[WebSocket] Client {} sent close message", client_id_clone);
                    break;
                }
                Ok(Message::Ping(_data)) => {
                    // Pong은 axum이 자동으로 처리
                    ws_manager_clone.update_client_activity(&client_id_clone).await;
                }
                Ok(Message::Pong(_)) => {
                    ws_manager_clone.update_client_activity(&client_id_clone).await;
                }
                Ok(Message::Binary(_)) => {
                    log::debug!("[WebSocket] Received binary message from {} (ignored)", client_id_clone);
                }
                Err(e) => {
                    log::error!("[WebSocket] Error receiving message from {}: {}", client_id_clone, e);
                    break;
                }
            }
        }
    });
    
    // 태스크 완료 대기
    tokio::select! {
        _ = send_task => {
            log::debug!("[WebSocket] Send task completed for client {}", client_id);
        }
        _ = recv_task => {
            log::debug!("[WebSocket] Receive task completed for client {}", client_id);
        }
    }
    
    // 클라이언트 정리
    ws_manager.remove_client(&client_id).await;
}

async fn handle_client_message(
    text: &str,
    client_id: &str,
    ws_manager: &WSConnectionPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let message: WSMessage = serde_json::from_str(text)?;
    
    match message {
        WSMessage::Ping => {
            log::debug!("[WebSocket] Ping from client {}", client_id);
            // Pong 응답은 자동으로 처리됨
        }
        WSMessage::Subscribe { topics } => {
            log::info!("[WebSocket] Client {} subscribed to: {:?}", client_id, topics);
            // 구독 정보는 클라이언트 생성 시 기본값으로 설정됨
        }
        WSMessage::TestFollower => {
            log::info!("[WebSocket] Test follower request from client {}", client_id);
            
            // 테스트 팔로워 생성
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis();
            
            let test_follower = crate::chzzk::FollowerItem {
                user: crate::chzzk::User {
                    user_id_hash: format!("test_{}", now),
                    nickname: "테스트 유저".to_string(),
                    profile_image_url: Some("/default_profile.png".to_string()),
                },
                following_since: chrono::Utc::now().to_rfc3339(),
            };
            
            // 테스트 알림 브로드캐스트
            ws_manager.broadcast_test_notification(test_follower).await;
        }
        _ => {
            log::debug!("[WebSocket] Unhandled message from client {}: {:?}", client_id, message);
        }
    }
    
    Ok(())
}