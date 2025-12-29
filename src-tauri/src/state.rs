use crate::chzzk::FollowerItem;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CookieData {
    #[serde(rename = "NID_AUT")]
    pub nid_aut: String,
    #[serde(rename = "NID_SES")]
    pub nid_ses: String,
}

#[derive(Debug, Clone)]
pub struct RealFollowerQueueItem {
    pub follower: FollowerItem,
    pub created_at: u128, // Timestamp
}

pub struct AppState {
    pub cookies: Mutex<Option<CookieData>>,
    pub port: Mutex<u16>,
    pub login_status: Mutex<bool>,
    pub http_client: reqwest::Client, // HTTP 클라이언트 재사용

    // Cache
    pub user_id_hash: Mutex<Option<String>>,

    // Follower Tracking
    pub test_queue: Mutex<VecDeque<FollowerItem>>,
    pub real_queue: Mutex<VecDeque<RealFollowerQueueItem>>,
    pub known_followers: Mutex<HashSet<String>>, // 기존 방식 (호환성 유지)
    pub rublis_last_seen: Mutex<Option<u128>>, // 루블리스 마지막 확인 시간
    pub initial_follower_count: Mutex<Option<usize>>, // 앱 시작 시 팔로워 수
    pub last_known_follower_id: Mutex<Option<String>>, // 마지막 확인한 팔로워 ID
    pub recent_followers: Mutex<VecDeque<String>>, // 최근 팔로워들 (최대 50명)
    pub client: reqwest::Client,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            cookies: Mutex::new(None),
            port: Mutex::new(3000),
            login_status: Mutex::new(false),
            http_client: reqwest::Client::new(), // HTTP 클라이언트 초기화
            user_id_hash: Mutex::new(None),
            test_queue: Mutex::new(VecDeque::new()),
            real_queue: Mutex::new(VecDeque::new()),
            known_followers: Mutex::new(HashSet::new()),
            rublis_last_seen: Mutex::new(None),
            initial_follower_count: Mutex::new(None),
            last_known_follower_id: Mutex::new(None),
            recent_followers: Mutex::new(VecDeque::new()),
            client: reqwest::Client::new(),
        }
    }
}
