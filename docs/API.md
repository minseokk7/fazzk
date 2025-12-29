# Fazzk API 문서

## 개요
Fazzk는 치지직 팔로워 실시간 알림을 위한 로컬 HTTP 서버를 제공합니다.

## 기본 정보
- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **인증**: 쿠키 기반 (NID_AUT, NID_SES)

## 엔드포인트

### 1. 인증 관련

#### POST /auth/cookies
쿠키 정보를 서버에 전송하여 로그인합니다.

**Request Body:**
```json
{
  "NID_AUT": "string",
  "NID_SES": "string"
}
```

**Response:**
```json
{
  "success": true,
  "userIdHash": "string",
  "nickname": "string"
}
```

#### GET /cookies
현재 저장된 쿠키 정보를 조회합니다.

**Response:**
```json
{
  "NID_AUT": "string",
  "NID_SES": "string"
}
```

### 2. 설정 관리

#### GET /settings
현재 설정을 조회합니다.

**Response:**
```json
{
  "volume": 0.5,
  "pollingInterval": 15,
  "displayDuration": 5,
  "enableTTS": false,
  "customSoundPath": null,
  "animationType": "fade",
  "notificationLayout": "vertical",
  "textColor": "#ffffff",
  "textSize": 100
}
```

#### POST /settings
설정을 저장합니다.

**Request Body:**
```json
{
  "volume": 0.5,
  "pollingInterval": 15,
  "displayDuration": 5,
  "enableTTS": false,
  "customSoundPath": null,
  "animationType": "fade",
  "notificationLayout": "vertical",
  "textColor": "#ffffff",
  "textSize": 100
}
```

### 3. 팔로워 관리

#### GET /followers
현재 팔로워 목록을 조회합니다.

**Response:**
```json
{
  "data": [
    {
      "user": {
        "userIdHash": "string",
        "nickname": "string",
        "profileImageUrl": "string"
      },
      "followingSince": "2023-12-28T12:00:00Z"
    }
  ]
}
```

#### POST /test-follower
테스트 팔로워 알림을 생성합니다.

**Request Body:**
```json
{
  "nickname": "테스트사용자"
}
```

#### GET /test-follower-get
테스트 팔로워 알림을 조회합니다.

### 4. WebSocket 연결

#### WS /ws
실시간 팔로워 알림을 위한 WebSocket 연결입니다.

**메시지 타입:**
- `new_follower`: 새 팔로워 알림
- `test_notification`: 테스트 알림
- `settings_updated`: 설정 업데이트
- `ping`/`pong`: 연결 상태 확인

**예시 메시지:**
```json
{
  "type": "new_follower",
  "follower": {
    "user": {
      "nickname": "새팔로워",
      "userIdHash": "hash123",
      "profileImageUrl": "https://..."
    },
    "followingSince": "2023-12-28T12:00:00Z"
  }
}
```

## 에러 코드

| 코드 | 설명 |
|------|------|
| 200 | 성공 |
| 400 | 잘못된 요청 |
| 401 | 인증 실패 |
| 500 | 서버 오류 |

## 사용 예시

### JavaScript/TypeScript
```typescript
// 팔로워 조회
const response = await fetch('http://localhost:3000/followers');
const data = await response.json();

// WebSocket 연결
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'new_follower') {
    console.log('새 팔로워:', message.follower.user.nickname);
  }
};
```

### OBS 브라우저 소스
```html
<!-- OBS에서 직접 사용 가능한 URL -->
http://localhost:3000/follower
```

## 보안 고려사항

1. **로컬 전용**: 서버는 localhost에서만 접근 가능
2. **CORS**: 특정 도메인만 허용
3. **쿠키 보안**: 민감한 정보는 암호화 저장 권장
4. **CSP**: Content Security Policy 적용

## 문제 해결

### 일반적인 문제
1. **포트 충돌**: 3000번 포트가 사용 중인 경우 자동으로 다른 포트 사용
2. **쿠키 만료**: 로그인 페이지에서 새 쿠키 입력 필요
3. **WebSocket 연결 실패**: 폴링 모드로 자동 전환

### 디버깅
- 브라우저 개발자 도구의 Network 탭에서 API 호출 확인
- WebSocket 연결 상태는 Console에서 로그 확인
- Tauri 앱의 경우 백엔드 로그는 터미널에서 확인