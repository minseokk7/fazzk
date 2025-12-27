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

// 클라이언트 정보
#[derive(Debug, Clone)]
pub struct WSClient {
    pub id: String,
    pub subscriptions: Vec<String>,
    pub sender: broadcast::Sender<WSMessage>,
}

// WebSocket 매니저
#[derive(Debug, Clone)]
pub struct WSManager {
    clients: Arc<RwLock<HashMap<String, WSClient>>>,
    broadcast_tx: broadcast::Sender<WSMessage>,
}

impl WSManager {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(1000);
        
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            broadcast_tx,
        }
    }
    
    // 새 팔로워 브로드캐스트
    pub async fn broadcast_new_follower(&self, follower: crate::chzzk::FollowerItem) {
        let message = WSMessage::NewFollower { follower };
        if let Err(e) = self.broadcast_tx.send(message) {
            eprintln!("[WebSocket] Failed to broadcast new follower: {}", e);
        } else {
            println!("[WebSocket] Broadcasted new follower to {} clients", self.clients.read().await.len());
        }
    }
    
    // 테스트 알림 브로드캐스트
    pub async fn broadcast_test_notification(&self, follower: crate::chzzk::FollowerItem) {
        let message = WSMessage::TestNotification { follower };
        if let Err(e) = self.broadcast_tx.send(message) {
            eprintln!("[WebSocket] Failed to broadcast test notification: {}", e);
        } else {
            println!("[WebSocket] Broadcasted test notification to {} clients", self.clients.read().await.len());
        }
    }
    
    // 설정 업데이트 브로드캐스트
    pub async fn broadcast_settings_update(&self, settings: serde_json::Value) {
        let message = WSMessage::SettingsUpdated { settings };
        if let Err(e) = self.broadcast_tx.send(message) {
            eprintln!("[WebSocket] Failed to broadcast settings update: {}", e);
        } else {
            println!("[WebSocket] Broadcasted settings update to {} clients", self.clients.read().await.len());
        }
    }
    
    // 클라이언트 수 반환
    pub async fn client_count(&self) -> usize {
        self.clients.read().await.len()
    }
}

// WebSocket 핸들러
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<crate::server::ServerState>,
) -> axum::response::Response {
    println!("[WebSocket] New connection attempt");
    let ws_manager = state.ws_manager.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, ws_manager))
}

async fn handle_socket(socket: WebSocket, ws_manager: WSManager) {
    let client_id = Uuid::new_v4().to_string();
    println!("[WebSocket] Client {} connected", client_id);
    
    let (mut sender, mut receiver) = socket.split();
    let (client_tx, mut client_rx) = broadcast::channel(100);
    
    // 클라이언트 등록
    {
        let mut clients = ws_manager.clients.write().await;
        clients.insert(client_id.clone(), WSClient {
            id: client_id.clone(),
            subscriptions: vec!["followers".to_string()], // 기본 구독
            sender: client_tx.clone(),
        });
    }
    
    // 글로벌 브로드캐스트 구독
    let mut global_rx = ws_manager.broadcast_tx.subscribe();
    
    // 메시지 전송 태스크
    let client_id_clone = client_id.clone();
    let send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                // 글로벌 브로드캐스트 메시지
                msg = global_rx.recv() => {
                    match msg {
                        Ok(ws_msg) => {
                            let json = match serde_json::to_string(&ws_msg) {
                                Ok(json) => json,
                                Err(e) => {
                                    eprintln!("[WebSocket] Failed to serialize message: {}", e);
                                    continue;
                                }
                            };
                            
                            if sender.send(Message::Text(json)).await.is_err() {
                                println!("[WebSocket] Client {} disconnected (send failed)", client_id_clone);
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            println!("[WebSocket] Broadcast channel closed");
                            break;
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            println!("[WebSocket] Client {} lagged behind", client_id_clone);
                            // 계속 진행
                        }
                    }
                }
                
                // 클라이언트별 메시지
                msg = client_rx.recv() => {
                    match msg {
                        Ok(ws_msg) => {
                            let json = match serde_json::to_string(&ws_msg) {
                                Ok(json) => json,
                                Err(e) => {
                                    eprintln!("[WebSocket] Failed to serialize client message: {}", e);
                                    continue;
                                }
                            };
                            
                            if sender.send(Message::Text(json)).await.is_err() {
                                println!("[WebSocket] Client {} disconnected (client send failed)", client_id_clone);
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            println!("[WebSocket] Client channel closed");
                            break;
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            // 클라이언트별 채널에서는 lagged가 발생하지 않아야 함
                            continue;
                        }
                    }
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
                    // 클라이언트 메시지 처리
                    if let Err(e) = handle_client_message(&text, &client_id_clone, &ws_manager_clone).await {
                        eprintln!("[WebSocket] Error handling message from {}: {}", client_id_clone, e);
                    }
                }
                Ok(Message::Close(_)) => {
                    println!("[WebSocket] Client {} sent close message", client_id_clone);
                    break;
                }
                Ok(Message::Ping(_data)) => {
                    // Pong은 axum이 자동으로 처리
                    println!("[WebSocket] Received ping from {}", client_id_clone);
                }
                Ok(Message::Pong(_)) => {
                    println!("[WebSocket] Received pong from {}", client_id_clone);
                }
                Ok(Message::Binary(_)) => {
                    println!("[WebSocket] Received binary message from {} (ignored)", client_id_clone);
                }
                Err(e) => {
                    eprintln!("[WebSocket] Error receiving message from {}: {}", client_id_clone, e);
                    break;
                }
            }
        }
    });
    
    // 태스크 완료 대기
    tokio::select! {
        _ = send_task => {
            println!("[WebSocket] Send task completed for client {}", client_id);
        }
        _ = recv_task => {
            println!("[WebSocket] Receive task completed for client {}", client_id);
        }
    }
    
    // 클라이언트 정리
    {
        let mut clients = ws_manager.clients.write().await;
        clients.remove(&client_id);
        println!("[WebSocket] Client {} removed. Remaining clients: {}", client_id, clients.len());
    }
}

async fn handle_client_message(
    text: &str,
    client_id: &str,
    ws_manager: &WSManager,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let message: WSMessage = serde_json::from_str(text)?;
    
    match message {
        WSMessage::Ping => {
            println!("[WebSocket] Ping from client {}", client_id);
            // Pong 응답은 클라이언트별 채널로 전송
            if let Some(client) = ws_manager.clients.read().await.get(client_id) {
                let _ = client.sender.send(WSMessage::Pong);
            }
        }
        WSMessage::Subscribe { topics } => {
            println!("[WebSocket] Client {} subscribed to: {:?}", client_id, topics);
            // 구독 정보 업데이트
            if let Some(client) = ws_manager.clients.write().await.get_mut(client_id) {
                client.subscriptions = topics;
            }
        }
        WSMessage::TestFollower => {
            println!("[WebSocket] Test follower request from client {}", client_id);
            
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
            println!("[WebSocket] Unhandled message from client {}: {:?}", client_id, message);
        }
    }
    
    Ok(())
}