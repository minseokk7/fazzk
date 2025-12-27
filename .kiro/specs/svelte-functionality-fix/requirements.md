# Requirements Document

## Introduction

스벨트 버전의 Fazzk 애플리케이션에서 바닐라 JS 버전에 비해 누락되거나 제대로 작동하지 않는 핵심 기능들을 수정하여 완전한 기능 패리티를 달성합니다.

## Glossary

- **Svelte_App**: 스벨트로 구현된 Fazzk 애플리케이션
- **Session_Manager**: 사용자 세션 상태를 관리하는 컴포넌트
- **Follower_Detector**: 새로운 팔로워를 감지하고 처리하는 시스템
- **Settings_Sync**: 서버와 로컬스토리지 간 설정 동기화 시스템
- **History_Manager**: 팔로워 알림 히스토리를 관리하는 시스템
- **Polling_System**: 주기적으로 팔로워 데이터를 가져오는 시스템

## Requirements

### Requirement 1: 세션 관리 및 자동 재연결

**User Story:** As a user, I want the application to automatically handle session errors and reconnect when possible, so that I don't lose functionality due to temporary connection issues.

#### Acceptance Criteria

1. WHEN a session error occurs (401/403 response), THE Session_Manager SHALL set the session error state and display appropriate error message
2. WHEN session error is detected and reconnection attempts are below maximum, THE Session_Manager SHALL automatically attempt to reconnect
3. WHEN reconnection is in progress, THE Session_Manager SHALL display reconnection status with attempt count
4. WHEN maximum reconnection attempts are reached, THE Session_Manager SHALL stop attempting and require manual login
5. WHEN reconnection succeeds, THE Session_Manager SHALL clear error states and resume normal operation

### Requirement 2: 팔로워 중복 감지 및 필터링

**User Story:** As a user, I want the application to properly detect new followers without showing duplicates or old followers, so that I only see genuine new follower notifications.

#### Acceptance Criteria

1. WHEN the application starts, THE Follower_Detector SHALL record the current timestamp as app start time
2. WHEN fetching followers initially, THE Follower_Detector SHALL add all existing followers to known followers set without triggering notifications
3. WHEN a follower's following time is before app start time, THE Follower_Detector SHALL ignore that follower as old
4. WHEN a follower is already in the known followers set, THE Follower_Detector SHALL not add them to the notification queue
5. WHEN multiple polling requests occur simultaneously, THE Follower_Detector SHALL prevent race conditions using a fetching lock

### Requirement 3: 설정 동기화 시스템

**User Story:** As a user, I want my settings to be synchronized between the server and local storage, so that my preferences are preserved and consistent across sessions.

#### Acceptance Criteria

1. WHEN loading settings, THE Settings_Sync SHALL first attempt to load from server
2. WHEN server settings are unavailable, THE Settings_Sync SHALL fallback to local storage
3. WHEN URL parameters are present, THE Settings_Sync SHALL override loaded settings with URL parameters
4. WHEN saving settings, THE Settings_Sync SHALL save to both server and local storage
5. WHEN server save fails, THE Settings_Sync SHALL still save to local storage and log the error

### Requirement 4: 히스토리 관리 시스템

**User Story:** As a user, I want to view and manage my follower notification history, so that I can track who followed me and when.

#### Acceptance Criteria

1. WHEN a new follower notification is shown, THE History_Manager SHALL add the follower to history with timestamp
2. WHEN loading history, THE History_Manager SHALL restore history from local storage with proper error handling
3. WHEN history exceeds maximum size (50 items), THE History_Manager SHALL remove oldest items
4. WHEN clearing history, THE History_Manager SHALL remove all items from both memory and local storage
5. WHEN displaying history, THE History_Manager SHALL format timestamps in Korean locale

### Requirement 5: 초기화 로직 개선

**User Story:** As a developer, I want the application initialization to be robust and handle various environments, so that the app works correctly in both Tauri and OBS modes.

#### Acceptance Criteria

1. WHEN the application starts, THE Svelte_App SHALL detect whether it's running in Tauri or OBS mode
2. WHEN in Tauri mode, THE Svelte_App SHALL add app-mode class and enable window controls
3. WHEN in OBS mode, THE Svelte_App SHALL add obs-mode class and hide UI elements
4. WHEN Tauri API is available, THE Svelte_App SHALL get dynamic server port
5. WHEN initialization completes, THE Svelte_App SHALL load settings and start polling

### Requirement 6: 에러 처리 및 복구

**User Story:** As a user, I want the application to handle errors gracefully and provide clear feedback, so that I understand what's happening and can take appropriate action.

#### Acceptance Criteria

1. WHEN a network error occurs during polling, THE Polling_System SHALL log the error and continue with next scheduled poll
2. WHEN settings loading fails, THE Svelte_App SHALL use default values and show appropriate message
3. WHEN audio playback fails, THE Svelte_App SHALL log the error but continue with other notification features
4. WHEN TTS fails, THE Svelte_App SHALL continue with audio notification
5. WHEN file selection fails, THE Svelte_App SHALL show error message and maintain current settings

### Requirement 7: 알림 큐 처리 개선

**User Story:** As a user, I want follower notifications to be displayed properly without overlapping or getting stuck, so that I see all new followers clearly.

#### Acceptance Criteria

1. WHEN multiple followers are detected simultaneously, THE Svelte_App SHALL queue them for sequential display
2. WHEN a notification is currently being displayed, THE Svelte_App SHALL wait for completion before showing next
3. WHEN display duration expires, THE Svelte_App SHALL clear current notification and process next in queue
4. WHEN queue is empty, THE Svelte_App SHALL set processing state to false
5. WHEN notification display fails, THE Svelte_App SHALL still process remaining queue items

### Requirement 8: 테마 및 스타일 관리

**User Story:** As a user, I want theme changes to be applied consistently across all UI elements, so that the visual experience is coherent.

#### Acceptance Criteria

1. WHEN theme is toggled, THE Svelte_App SHALL update document theme attribute immediately
2. WHEN theme changes, THE Svelte_App SHALL save preference to local storage
3. WHEN application loads, THE Svelte_App SHALL restore saved theme or detect system preference
4. WHEN custom text color is set, THE Svelte_App SHALL apply it to notification text
5. WHEN text size changes, THE Svelte_App SHALL update font size percentage on document body