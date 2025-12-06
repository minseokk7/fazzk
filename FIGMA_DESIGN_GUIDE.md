# 🎨 Fazzk 피그마 디자인 개발 설명서

## 📋 프로젝트 개요

**Fazzk**는 치지직(Chzzk) 스트리머를 위한 **실시간 팔로우 알림 데스크탑 앱**입니다.  
Electron + Node.js 기반으로 제작되었으며, OBS 브라우저 소스로도 사용 가능합니다.

---

## 🖥️ 화면 구성 (총 4개)

| 화면 | 파일 | 설명 |
|------|------|------|
| 1. 로그인 화면 | `pages/start.html` | 앱 진입점, 네이버 로그인 |
| 2. 메인 알림 화면 | `pages/notifier.html` | 팔로워 알림 표시 |
| 3. 설정 모달 | `notifier.html` 내 | 사운드, 애니메이션 등 설정 |
| 4. OBS 오버레이 | `notifier.html?obs=true` | 투명 배경 알림 전용 |

---

## 🎨 디자인 시스템

### 색상 팔레트

```css
/* 브랜드 컬러 */
--primary-color: #00ffa3;        /* 민트 그린 - 메인 액센트 */
--primary-hover: #00dd88;        /* 호버 상태 */

/* 배경 */
--bg-dark: #121212;              /* 메인 배경 (다크) */
--bg-gradient-start: #667eea;    /* 로그인 그라데이션 시작 */
--bg-gradient-end: #764ba2;      /* 로그인 그라데이션 끝 */

/* 글래스모피즘 */
--glass-bg: rgba(30, 30, 30, 0.6);
--glass-border: rgba(255, 255, 255, 0.1);
--glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);

/* 텍스트 */
--text-primary: #ffffff;
--text-secondary: #dddddd;
--text-muted: #888888;

/* 상태 색상 */
--status-success: linear-gradient(90deg, #00c853, #00e676);
--status-error: linear-gradient(90deg, #ff5555, #ff7777);
--status-warning: linear-gradient(90deg, #ff9800, #ffb74d);
```

### 타이포그래피

| 용도 | 폰트 | 크기 | 굵기 |
|------|------|------|------|
| 메인 타이틀 | Pretendard | 48px | 900 (Black) |
| 알림 닉네임 | Pretendard | 3rem (48px) | 800 |
| 서브타이틀 | Pretendard | 18px | 400 |
| 알림 메시지 | Pretendard | 1.5rem (24px) | 500 |
| 본문/라벨 | Pretendard | 14-16px | 400-500 |
| 소형 텍스트 | Pretendard | 12-13px | 400 |

> **폰트 CDN**: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css`

---

## 📱 화면별 상세 스펙

### 1️⃣ 로그인 화면 (start.html)

**전체 레이아웃**
- 배경: 그라데이션 (`135deg, #667eea → #764ba2`)
- 전체 화면 중앙 정렬 (flex, center)

**📦 카드 컨테이너 구조 (매우 중요!)**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    🎮 Fazzk                                 │  ← 로고 + 타이틀
│           실시간 팔로워 알림을 받아보세요                    │  ← 서브타이틀
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              치지직 로그인                          │   │  ← 메인 로그인 버튼
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│              📖 사용방법 보기                              │  ← 토글 버튼 (카드 안)
│                                                             │
│         🔧 수동 로그인 (문제 해결용)                        │  ← 토글 버튼 (카드 안)
│                                                             │
└─────────────────────────────────────────────────────────────┘

⚠️ 모든 요소는 하나의 카드 컨테이너 안에 있어야 함!
```

**카드 컨테이너 스펙**
```css
/* 카드 */
max-width: 600px;
width: 100%;
padding: 60px 80px;
background: rgba(255, 255, 255, 0.1);
backdrop-filter: blur(10px);
border-radius: 20px;
border: 1px solid rgba(255, 255, 255, 0.2);
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
text-align: center;
```

**컴포넌트 상세**

| 요소 | 스펙 | 위치 |
|------|------|------|
| 앱 아이콘 | 🎮 이모지 또는 게임패드 아이콘 | 카드 내부 상단 |
| 앱 타이틀 | "Fazzk", 48px, font-weight 900, 흰색 | 아이콘 옆 |
| 서브타이틀 | "실시간 팔로워 알림을 받아보세요", 18px, opacity 0.9 | 타이틀 아래 margin-bottom 40px |
| 로그인 버튼 | 너비 거의 100%, height ~52px | 서브타이틀 아래 |
| 사용방법 버튼 | 반투명 배경, 아이콘 📖 포함 | 로그인 버튼 아래 margin-top 30px |
| 수동 로그인 버튼 | 더 작은 크기(12px), opacity 0.7 | 사용방법 버튼 아래 margin-top 10px |

**메인 로그인 버튼**
```css
background: #00ffa3;
color: #000;
padding: 16px 48px;
width: 100%;              /* 카드 너비에 맞춤 */
border-radius: 50px;
font-size: 18px;
font-weight: bold;
box-shadow: 0 8px 20px rgba(0, 255, 163, 0.4);

/* 호버 */
background: #00dd88;
transform: translateY(-2px);
box-shadow: 0 12px 30px rgba(0, 255, 163, 0.6);
```

**토글 버튼 (사용방법/수동 로그인)**
```css
background: rgba(255, 255, 255, 0.2);
border: 1px solid rgba(255, 255, 255, 0.3);
color: white;
padding: 10px 24px;
border-radius: 25px;
font-size: 14px;
font-weight: 600;
```

---

### 2️⃣ 메인 알림 화면 (notifier.html)

**레이아웃**
- 전체 화면 (100vh)
- 플렉스 중앙 정렬
- 배경: #121212 (다크)

**상태 배너 (상단 고정)**
| 상태 | 색상 | 아이콘 | 메시지 |
|------|------|--------|--------|
| 연결됨 | 녹색 그라데이션 | ✅ | "연결됨 - 팔로워 알림 대기 중" |
| 세션 만료 | 빨강 그라데이션 | ⚠️ | "세션이 만료되었습니다. 다시 로그인해 주세요." + [로그인] 버튼 |
| 재연결 중 | 주황 그라데이션 | 🔄 | "재연결 중... (1/5)" |

**알림 카드**
```
┌─────────────────────────────┐
│     ┌─────────────┐        │
│     │   프로필    │        │  150x150px, 원형
│     │    이미지   │        │  테두리: 4px solid #00ffa3
│     └─────────────┘        │  그림자: 0 0 20px rgba(0,255,163,0.3)
│                             │
│      닉네임                 │  3rem, font-weight 800
│      님이 팔로우했습니다!    │  1.5rem, opacity 0.9
└─────────────────────────────┘

컨테이너: 글래스모피즘
- background: rgba(30, 30, 30, 0.6)
- backdrop-filter: blur(10px)
- border: 1px solid rgba(255, 255, 255, 0.1)
- border-radius: 20px
- padding: 20px
```

**플로팅 버튼 (우하단)**
| 버튼 | 위치 (right) | 아이콘 | 설명 |
|------|-------------|--------|------|
| 설정 | 20px | ⚙️ | 설정 모달 열기 |
| 도움말 | 80px | ❓ | 사용방법 모달 |
| 히스토리 | 140px | 📋 | 최근 팔로워 목록 |

```css
/* 플로팅 버튼 공통 */
width: 45px;
height: 45px;
border-radius: 50%;
background: rgba(0, 0, 0, 0.4);
backdrop-filter: blur(5px);
border: 1px solid rgba(255, 255, 255, 0.1);
```

**테스트 버튼 (좌하단)**
- 위치: bottom 20px, left 20px
- 배경: #00ffa3, 텍스트: #000
- 패딩: 8px 16px, border-radius 8px

---

### 3️⃣ 설정 모달

**모달 컨테이너**
```css
width: 380px;
background: rgba(20, 20, 20, 0.85);
backdrop-filter: blur(20px);
border-radius: 16px;
padding: 30px;
border: 1px solid rgba(255, 255, 255, 0.1);
```

**설정 항목**

| 항목 | 컴포넌트 타입 | 범위/값 |
|------|--------------|---------|
| 알림 볼륨 | Range Slider | 0~100% |
| 알림음 설정 | 파일 선택 버튼 | mp3 파일 |
| 등장 효과 | Select (드롭다운) | 페이드/슬라이드업/슬라이드다운/바운스 |
| 텍스트 색상 | Color Picker | #ffffff 기본 |
| 텍스트 크기 | Range Slider | 50~150% |
| 알림 표시 시간 | Range Slider | 3~15초 |
| 갱신 주기 | Number Input | 3초 이상 |
| TTS 사용 | Checkbox | on/off |

**폼 컨트롤 스타일**
```css
/* 입력 필드 */
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 8px;
padding: 10px;
color: white;

/* 포커스 */
border-color: #00ffa3;
background: rgba(255, 255, 255, 0.1);

/* Range Slider */
accent-color: #00ffa3;
```

---

### 4️⃣ 히스토리 모달

**모달 크기**: 420px 너비

**히스토리 아이템**
```
┌────────────────────────────────────┐
│ [프로필]  닉네임               시간  │
│  40x40   #00ffa3 bold      #888   │
└────────────────────────────────────┘

background: rgba(255, 255, 255, 0.05);
border-radius: 8px;
padding: 10px;
gap: 12px (이미지-텍스트 간격)
```

---

## ✨ 애니메이션 스펙

### 알림 등장 효과

| 타입 | 초기 상태 | 최종 상태 | duration |
|------|----------|----------|----------|
| fade | opacity: 0 | opacity: 1 | 0.5s |
| slide-up | translateY(50px), opacity: 0 | translateY(0), opacity: 1 | 0.5s |
| slide-down | translateY(-50px), opacity: 0 | translateY(0), opacity: 1 | 0.5s |
| bounce | scale(0.3), opacity: 0 | scale(1), opacity: 1 | 0.6s (cubic-bezier) |

```css
/* 바운스 keyframes */
@keyframes bounceIn {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); opacity: 1; }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
```

### 버튼 호버 효과
- 설정 버튼: `transform: rotate(90deg)` (0.3s)
- 도움말/히스토리: `transform: scale(1.1)` (0.3s)
- 메인 버튼: `brightness(1.1)` + `scale(0.98)` on active

---

## 📐 레이아웃 치수

### 화면 크기
- 데스크탑 앱 기본: 800 x 600px (조절 가능)
- OBS 권장: 1920 x 1080px

### 컴포넌트 크기

| 컴포넌트 | 크기 |
|----------|------|
| 프로필 이미지 | 150 x 150px (알림), 40 x 40px (히스토리) |
| 플로팅 버튼 | 45 x 45px |
| 테스트 버튼 | 자동 (패딩 8px 16px) |
| 설정 모달 | 380px 너비 |
| 히스토리 모달 | 420px 너비 |
| 로그인 컨테이너 | 최대 600px 너비 |

---

## 🌐 OBS 모드 특이사항

`?obs=true` 파라미터 적용 시:

1. **배경 투명**: `background: transparent`
2. **UI 버튼 숨김**: 설정, 도움말, 히스토리, 테스트 버튼 모두 숨김
3. **알림만 표시**: 글래스모피즘 카드 + 프로필 + 닉네임만 보임

---

## 📁 에셋 목록

| 파일 | 경로 | 설명 |
|------|------|------|
| 앱 아이콘 | `public/dodoroi_icon.png` | 76KB |
| 기본 프로필 | `public/default_profile.png` | 33KB |
| 알림 사운드 | `public/sound.mp3` | 64KB |

---

## 💡 디자인 핵심 포인트

1. **글래스모피즘** - 반투명 배경 + blur 효과로 현대적 UI
2. **민트 그린 (#00ffa3)** - 브랜드 컬러, 모든 강조 요소에 사용
3. **다크 테마** - #121212 배경으로 스트리밍 환경에 최적화
4. **원형 프로필** - 치지직 스타일과 일관성 유지
5. **부드러운 애니메이션** - cubic-bezier 이징으로 자연스러운 전환

---

## 🔗 참고 자료

- **폰트**: [Pretendard](https://github.com/orioncactus/pretendard)
- **기술 스택**: Electron, Alpine.js, Glassmorphism CSS
- **타겟 플랫폼**: Windows 데스크탑, OBS 브라우저 소스
