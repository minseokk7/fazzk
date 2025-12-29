# Fazzk 아키텍처 문서

## 시스템 개요

Fazzk는 치지직 스트리밍 플랫폼의 팔로워 알림을 실시간으로 제공하는 데스크톱 애플리케이션입니다.

## 기술 스택

### 프론트엔드
- **Svelte 5.43.8**: 반응형 UI 프레임워크
- **TypeScript 5.9.3**: 타입 안전성
- **Vite 7.2.4**: 빌드 도구
- **svelte-spa-router**: 클라이언트 사이드 라우팅

### 백엔드
- **Tauri 2.x**: 데스크톱 앱 프레임워크
- **Rust**: 시스템 프로그래밍 언어
- **Axum 0.7.5**: 웹 프레임워크
- **Tokio**: 비동기 런타임

### 통신
- **HTTP/REST**: API 통신
- **WebSocket**: 실시간 알림
- **reqwest**: HTTP 클라이언트

## 아키텍처 다이어그램

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Svelte UI     │    │   Tauri Core    │    │   치지직 API    │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Login.svelte│ │◄──►│ │ HTTP Server │ │◄──►│ │ Follower API│ │
│ └─────────────┘ │    │ │ (Axum)      │ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ └─────────────┘ │    │ ┌─────────────┐ │
│ │Notifier.svelte│◄──►│ ┌─────────────┐ │    │ │ Profile API │ │
│ └─────────────┘ │    │ │ WebSocket   │ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ │ Manager     │ │    └─────────────────┘
│ │ Settings UI │ │    │ └─────────────┘ │
│ └─────────────┘ │    │ ┌─────────────┐ │
└─────────────────┘    │ │ State Mgmt  │ │
                       │ └─────────────┘ │
┌─────────────────┐    └─────────────────┘
│   OBS Browser   │           │
│     Source      │◄──────────┘
└─────────────────┘
```

## 핵심 컴포넌트

### 1. 프론트엔드 구조

```
src/
├── routes/
│   ├── Login.svelte          # 로그인 페이지
│   └── Notifier.svelte       # 메인 알림 페이지
├── lib/
│   ├── api.ts               # API 통신 레이어
│   ├── websocket.ts         # WebSocket 클라이언트
│   ├── logger.ts            # 로깅 시스템
│   └── constants.ts         # 상수 정의
├── types/
│   ├── tauri.ts            # Tauri 관련 타입
│   └── common.ts           # 공통 타입 정의
└── App.svelte              # 루트 컴포넌트
```

### 2. 백엔드 구조

```
src-tauri/src/
├── lib.rs                  # 메인 엔트리포인트
├── server.rs               # HTTP 서버 및 라우팅
├── websocket.rs            # WebSocket 관리
├── state.rs                # 애플리케이션 상태
├── chzzk.rs               # 치지직 API 클라이언트
└── updater.rs             # 자동 업데이트
```

## 데이터 플로우

### 1. 로그인 플로우
```
1. 사용자가 쿠키 입력
2. Login.svelte → POST /auth/cookies
3. server.rs → chzzk.rs → 치지직 API 검증
4. 성공 시 상태 저장 및 /notifier로 리다이렉트
```

### 2. 팔로워 감지 플로우
```
1. 주기적 폴링 (15초 간격)
2. GET /followers → chzzk.rs → 치지직 API
3. 하이브리드 감지 알고리즘으로 신규 팔로워 식별
4. WebSocket으로 실시간 브로드캐스트
5. Notifier.svelte에서 알림 표시
```

### 3. 설정 동기화 플로우
```
1. 설정 변경 → POST /settings
2. 로컬 스토리지 + 서버 상태 동기화
3. WebSocket으로 설정 변경 브로드캐스트
```

## 상태 관리

### AppState (Rust)
```rust
pub struct AppState {
    pub cookies: Mutex<Option<CookieData>>,
    pub login_status: Mutex<bool>,
    pub user_id_hash: Mutex<Option<String>>,
    
    // 팔로워 추적
    pub known_followers: Mutex<HashSet<String>>,
    pub recent_followers: Mutex<VecDeque<String>>,
    pub initial_follower_count: Mutex<Option<usize>>,
    
    // 큐 관리
    pub test_queue: Mutex<VecDeque<FollowerItem>>,
    pub real_queue: Mutex<VecDeque<RealFollowerQueueItem>>,
    
    // 루블리스 특별 처리
    pub rublis_last_seen: Mutex<Option<u128>>,
}
```

### 프론트엔드 상태 (Svelte)
```typescript
// 반응형 상태 ($state)
let wsConnected = $state(false);
let currentItem = $state(null);
let showSettings = $state(false);
let history = $state([]);

// 설정 상태
let volume = $state(0.5);
let pollingInterval = $state(15);
let enableTTS = $state(false);
```

## 핵심 알고리즘

### 하이브리드 팔로워 감지
```rust
// 1단계: 팔로워 수 빠른 필터링
if current_count < initial_count.saturating_sub(10) {
    return; // 대량 감소 시 스킵
}

// 2단계: 최신 20명만 체크
let latest_followers = &followers[..min(20, followers.len())];

// 3단계: 최근 50명 메모리 기반 중복 검사
for follower in latest_followers {
    if !recent_followers.contains(&follower.id) {
        // 신규 팔로워 발견
        broadcast_new_follower(follower);
        recent_followers.push_front(follower.id);
        if recent_followers.len() > 50 {
            recent_followers.pop_back();
        }
    }
}
```

### WebSocket + 폴링 하이브리드
```typescript
// WebSocket 우선, 폴링 백업
if (wsConnected) {
    // WebSocket으로 실시간 수신
} else {
    // 폴링으로 주기적 확인
    setTimeout(fetchFollowers, pollingInterval * 1000);
}
```

## 보안 모델

### 1. 인증
- 치지직 쿠키 기반 인증 (NID_AUT, NID_SES)
- 로컬 저장소에 암호화 저장 (향후 계획)

### 2. 네트워크 보안
- CORS 정책으로 허용된 도메인만 접근
- CSP (Content Security Policy) 적용
- HTTPS 사용 권장

### 3. 데이터 보호
- 민감한 데이터는 메모리에서만 처리
- 로그에 개인정보 노출 방지

## 성능 최적화

### 1. 메모리 최적화
- 최근 50명 팔로워만 메모리 유지
- 큐 크기 제한으로 메모리 누수 방지
- HTTP 클라이언트 재사용

### 2. 네트워크 최적화
- 연결 풀링으로 TCP 오버헤드 감소
- 압축 전송 지원
- 캐싱으로 불필요한 요청 방지

### 3. UI 최적화
- 가상 스크롤링 (대량 히스토리)
- 디바운싱으로 과도한 업데이트 방지
- 지연 로딩으로 초기 로딩 시간 단축

## 확장성 고려사항

### 1. 다중 스트리머 지원
- 현재: 단일 스트리머
- 향후: 여러 스트리머 동시 모니터링

### 2. 플러그인 시스템
- 커스텀 알림 효과
- 외부 서비스 연동 (Discord, Slack 등)

### 3. 클라우드 동기화
- 설정 클라우드 백업
- 다중 디바이스 동기화

## 배포 및 업데이트

### 1. 빌드 프로세스
```bash
# 프론트엔드 빌드
npm run build

# 확장프로그램 빌드
npm run zip-extensions

# Tauri 앱 빌드
npm run tauri:build
```
npm run zip-extensions

# Tauri 앱 빌드
cd src-tauri && cargo build --release
```

### 2. 자동 업데이트
- GitHub Releases 기반
- 백그라운드 다운로드
- 사일런트 설치

## 모니터링 및 디버깅

### 1. 로깅 전략
- 개발: DEBUG 레벨
- 프로덕션: INFO 레벨
- 구조화된 로그 (JSON)

### 2. 에러 추적
- 사용자 친화적 에러 메시지
- 상세한 디버그 정보 (개발 모드)
- 자동 에러 리포팅 (향후 계획)

## 알려진 제한사항

1. **단일 스트리머**: 현재 한 번에 하나의 스트리머만 모니터링
2. **로컬 전용**: 네트워크를 통한 원격 접근 불가
3. **쿠키 의존성**: 치지직 쿠키 만료 시 재로그인 필요
4. **Windows 최적화**: 주로 Windows 환경에서 테스트됨

## 향후 개발 계획

### 단기 (1-2개월)
- [ ] 단위 테스트 추가
- [ ] 에러 핸들링 개선
- [ ] 성능 모니터링

### 중기 (3-6개월)
- [ ] 다중 스트리머 지원
- [ ] 플러그인 시스템
- [ ] 클라우드 동기화

### 장기 (6개월+)
- [ ] 모바일 앱
- [ ] 웹 버전
- [ ] AI 기반 알림 필터링