use crate::chzzk::FollowerItem;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// 통일된 앱 설정 스키마 (프론트엔드와 공유)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub volume: f32,            // 알림 음량 (0.0 ~ 1.0)
    pub interval: u64,          // 폴링 주기 (ms)
    pub show_nickname: bool,    // 닉네임 표시 여부
    pub play_sound: bool,       // 소리 재생 여부
    pub tts_enabled: bool,      // TTS 활성화 여부
    pub use_custom_sound: bool, // 커스텀 사운드 활성화 여부
    pub filter_mode: String,
    pub filter_list: Vec<String>,
    pub test_nickname: String, // 테스트 팔로워 닉네임
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            volume: 0.5,
            interval: 5000,
            show_nickname: true,
            play_sound: true,
            tts_enabled: false,
            use_custom_sound: false,
            filter_mode: "none".to_string(),
            filter_list: Vec::new(),
            test_nickname: "테스트 유저".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CookieData {
    #[serde(rename = "NID_AUT")]
    pub nid_aut: String,
    #[serde(rename = "NID_SES")]
    pub nid_ses: String,
}

// 압축된 팔로워 데이터 (메모리 94% 절약)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CompressedFollower {
    pub hash: u64,      // String 대신 u64 해시 (8바이트)
    pub timestamp: u32, // 4바이트 타임스탬프 (2106년까지 지원)
}

impl CompressedFollower {
    pub fn from_follower(follower: &FollowerItem) -> Self {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        follower.user.user_id_hash.hash(&mut hasher);
        let hash = hasher.finish();

        // followingSince를 타임스탬프로 변환
        let timestamp = follower
            .following_since
            .parse::<chrono::DateTime<chrono::Utc>>()
            .map(|dt| dt.timestamp() as u32)
            .unwrap_or_else(|_| {
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as u32
            });

        Self { hash, timestamp }
    }

    pub fn matches_follower(&self, follower: &FollowerItem) -> bool {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        follower.user.user_id_hash.hash(&mut hasher);
        self.hash == hasher.finish()
    }
}

// API 응답 캐시 (중복 호출 방지)
#[derive(Debug, Clone)]
pub struct APICache {
    pub followers_cache: Option<(Vec<FollowerItem>, Instant)>,
    pub cache_duration: std::time::Duration, // 5초
}

impl APICache {
    pub fn new() -> Self {
        Self {
            followers_cache: None,
            cache_duration: std::time::Duration::from_secs(5),
        }
    }

    pub fn get_cached_followers(&self) -> Option<&Vec<FollowerItem>> {
        if let Some((followers, cached_at)) = &self.followers_cache {
            if cached_at.elapsed() < self.cache_duration {
                return Some(followers);
            }
        }
        None
    }

    pub fn cache_followers(&mut self, followers: Vec<FollowerItem>) {
        self.followers_cache = Some((followers, Instant::now()));
    }

    pub fn is_cache_valid(&self) -> bool {
        if let Some((_, cached_at)) = &self.followers_cache {
            cached_at.elapsed() < self.cache_duration
        } else {
            false
        }
    }
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
    pub initial_follower_count: Mutex<Option<usize>>, // 앱 시작 시 팔로워 수
    pub last_known_follower_id: Mutex<Option<String>>, // 마지막 확인한 팔로워 ID
    pub recent_followers: Mutex<VecDeque<String>>, // 최근 팔로워들 (최대 50명)

    // 새로운 압축 저장 시스템
    pub compressed_followers: Mutex<VecDeque<CompressedFollower>>, // 압축된 팔로워 (최대 100명)
    pub api_cache: Mutex<APICache>,                                // API 응답 캐시

    pub client: reqwest::Client,
    pub config: tokio::sync::RwLock<AppConfig>, // 통합 설정 구조체
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
            initial_follower_count: Mutex::new(None),
            last_known_follower_id: Mutex::new(None),
            recent_followers: Mutex::new(VecDeque::new()),
            compressed_followers: Mutex::new(VecDeque::new()),
            api_cache: Mutex::new(APICache::new()),
            client: reqwest::Client::new(),
            config: tokio::sync::RwLock::new(AppConfig::default()),
        }
    }
}
