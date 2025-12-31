<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.ts';
  import { push } from 'svelte-spa-router';
  import { WSClient } from '../lib/websocket.ts';
  import { SettingsManager } from '../lib/settingsManager.ts';
  
  // Component imports
  import SessionBanner from '../components/SessionBanner.svelte';
  import NotificationArea from '../components/NotificationArea.svelte';
  import BottomNavigation from '../components/BottomNavigation.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  import HistoryModal from '../components/HistoryModal.svelte';
  import KeyboardHelpModal from '../components/KeyboardHelpModal.svelte';
  import MemoryIndicator from '../components/MemoryIndicator.svelte';
  import ToastContainer from '../components/ToastContainer.svelte';
  
  // Toast system
  import { toastManager } from '../lib/toastManager.ts';

  // State
  let baseUrl = 'http://localhost:3000';
  let obsUrl = $state('http://localhost:3000/follower');

  let currentItem = $state(null);
  let queue = [];
  let knownFollowers = new Set();
  let isProcessing = false;
  let audio; // Ref
  let isFetching = false;
  let isInitialized = false;
  let appStartedAt = Date.now();

  // 루블리스 중복 방지를 위한 추적
  let rublisLastSeen = null;
  let rublisCurrentlyFollowing = false;

  // UI State
  let showSettings = $state(false);
  let showHistory = $state(false);
  let showKeyboardHelp = $state(false);
  let showMemoryMonitor = $state(false); // 메모리 모니터 표시 상태
  let history = $state([]);

  // WebSocket 연결 상태
  let wsConnected = $state(false);
  let wsReconnecting = $state(false);
  let wsConnectionAttempts = $state(0);
  let maxWSConnectionAttempts = 5;

  // Session State (폴백용)
  let sessionError = $state(false);
  let isReconnecting = $state(false);
  let reconnectAttempts = $state(0);
  let maxReconnectAttempts = 10;

  // 성능 최적화: 폴링 제어
  let pollingEnabled = $state(true);
  let lastFetchTime = 0;
  let fetchCooldown = 1000; // 1초 쿨다운

  // 중앙화된 설정 관리자
  let settingsManager;

  // Settings - 이제 settingsManager를 통해 관리됨
  let volume = $state(0.5);
  let pollingInterval = $state(15); // 15초로 증가
  let displayDuration = $state(5);
  let enableTTS = $state(false);
  let customSoundPath = $state(null);
  let animationType = $state('fade');
  let notificationLayout = $state('vertical'); // 새로운 설정: "vertical" 또는 "horizontal"
  let textColor = $state('#ffffff');
  let textSize = $state(100);

  // Cleanup variables - 모든 타이머와 리소스 추적
  let pollingTimeoutId = null;
  let settingsSyncIntervalId = null;
  let keyboardEventHandler = null;
  let wsClient = null;
  let reconnectTimeoutId = null;
  let testAlarmTimeoutId = null;
  let displayTimeoutId = null;
  let queueProcessTimeoutId = null;
  let historyCleanupIntervalId = null;

  // 토스트 알림 시스템
  function showUserError(message, persistent = false) {
    console.log('[Error] Showing user error:', message);
    toastManager.error('오류 발생', message, persistent);
  }

  function showUserSuccess(title, message) {
    console.log('[Success]', title, ':', message);
    toastManager.success(title, message);
  }

  function showUserWarning(title, message) {
    console.log('[Warning]', title, ':', message);
    toastManager.warning(title, message);
  }

  function showUserInfo(title, message) {
    console.log('[Info]', title, ':', message);
    toastManager.info(title, message);
  }

  // 네트워크 에러 처리
  function handleNetworkError(error, context = '') {
    console.error(`[Network Error] ${context}:`, error);
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      toastManager.error('네트워크 오류', '인터넷 연결을 확인해주세요.');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      toastManager.error('인증 오류', '로그인이 만료되었습니다. 다시 로그인해주세요.', true);
    } else if (error.message.includes('timeout')) {
      toastManager.warning('서버 지연', '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
    } else {
      toastManager.error('연결 오류', `${context} 중 오류가 발생했습니다.`);
    }
  }
  const HISTORY_MAX_SIZE = 50;
  const HISTORY_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5분마다 정리
  const HISTORY_STORAGE_KEY = 'alarmHistory';

  // 히스토리 정리 함수
  function cleanupHistory() {
    try {
      if (history.length > HISTORY_MAX_SIZE) {
        const oldLength = history.length;
        history = history.slice(0, HISTORY_MAX_SIZE);
        console.log(`[History] Cleaned up: ${oldLength} -> ${history.length} items`);
        
        // 즉시 저장
        saveHistoryToStorage();
      }
    } catch (error) {
      console.error('[History] Cleanup failed:', error);
    }
  }

  // 히스토리 저장 함수 (중복 제거)
  function saveHistoryToStorage() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
      console.log(`[History] Saved ${history.length} items to storage`);
    } catch (error) {
      console.error('[History] Failed to save to storage:', error);
      // 저장 실패 시 메모리에서라도 크기 제한
      if (history.length > HISTORY_MAX_SIZE * 2) {
        history = history.slice(0, HISTORY_MAX_SIZE);
        console.log('[History] Emergency memory cleanup performed');
      }
    }
  }

  // 주기적 히스토리 정리 시작
  function startHistoryCleanup() {
    if (historyCleanupIntervalId) {
      clearInterval(historyCleanupIntervalId);
    }
    
    historyCleanupIntervalId = setInterval(() => {
      cleanupHistory();
    }, HISTORY_CLEANUP_INTERVAL);
    
    console.log('[History] Cleanup scheduler started');
  }

  // 팔로워 히스토리 관리
  const KNOWN_FOLLOWERS_KEY = 'fazzk-known-followers-v2';

  function saveKnownFollowers() {
    try {
      // 루블리스가 혹시 포함되어 있다면 제거
      const followersArray = Array.from(knownFollowers);

      const data = {
        followers: followersArray,
        lastSaved: Date.now(),
        appStartTime: appStartedAt,
      };
      localStorage.setItem(KNOWN_FOLLOWERS_KEY, JSON.stringify(data));
      console.log(`[Storage] Saved ${knownFollowers.size} known followers (루블리스 excluded)`);
    } catch (e) {
      console.error('[Storage] Failed to save known followers:', e);
    }
  }

  function loadKnownFollowers() {
    try {
      const saved = localStorage.getItem(KNOWN_FOLLOWERS_KEY);
      if (saved) {
        const data = JSON.parse(saved);

        // 7일 이상 된 데이터는 무시 (너무 오래된 데이터 방지)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (data.lastSaved && data.lastSaved > sevenDaysAgo) {
          // 루블리스는 known followers에서 완전히 제외
          const followersWithoutRublis = data.followers.filter(hash => {
            // 루블리스의 해시는 "f2f551b67556276caa1f590604a7d92a"이므로 제외
            return hash !== 'f2f551b67556276caa1f590604a7d92a';
          });

          knownFollowers = new Set(followersWithoutRublis);
          console.log(
            `[Storage] Loaded ${knownFollowers.size} known followers from storage (루블리스 excluded)`
          );
          console.log(
            `[Storage] Original count: ${data.followers.length}, After excluding 루블리스: ${followersWithoutRublis.length}`
          );
          return data.lastSaved;
        } else {
          console.log('[Storage] Stored data too old, starting fresh');
        }
      }
    } catch (e) {
      console.error('[Storage] Failed to load known followers:', e);
    }
    return null;
  }

  // Initialize
  // 동적 사용자 경로 생성
  let userPath = $state('');
  
  onMount(async () => {
    // 사용자 경로 동적 생성
    if (api.isTauri) {
      try {
        const appDir = await api.invoke('get_app_dir');
        userPath = `file:///${appDir}/scripts/obs-redirector.html`.replace(/\\/g, '/');
      } catch (error) {
        console.error('Failed to get app directory:', error);
        // 폴백: 현재 사용자 이름 추정
        const username = navigator.userAgent.includes('Windows') ? 
          (window.location.pathname.includes('/Users/') ? 
            window.location.pathname.split('/Users/')[1]?.split('/')[0] || 'USER' : 'USER') : 'USER';
        userPath = `file:///C:/Users/${username}/Desktop/Development/fazzk-dev/scripts/obs-redirector.html`;
      }
    } else {
      // 브라우저 환경에서는 현재 사용자 추정
      const username = 'USER'; // 브라우저에서는 정확한 사용자명을 알 수 없음
      userPath = `file:///C:/Users/${username}/Desktop/Development/fazzk-dev/scripts/obs-redirector.html`;
    }

    appStartedAt = Date.now();
    console.log('[Svelte] App Initialized at', new Date(appStartedAt).toISOString());

    // 키보드 단축키 등록
    setupKeyboardShortcuts();

    // OBS 모드 감지 (서버에서 설정한 플래그 또는 URL 기반)
    const isOBSMode =
      window.OBS_MODE ||
      window.DIRECT_NOTIFIER_MODE ||
      (!api.isTauri &&
        (window.location.pathname === '/follower' || 
         window.location.pathname.endsWith('/follower') ||
         window.location.hash === '#/notifier' ||
         window.location.hash === '#/follower'));

    console.log('[초기화] OBS 모드 감지 결과:', isOBSMode);
    console.log('[초기화] 현재 URL:', window.location.href);
    console.log('[초기화] 경로:', window.location.pathname);
    console.log('[초기화] 해시:', window.location.hash);
    console.log('[초기화] Tauri 환경:', api.isTauri);

    // Environment-specific initialization
    if (!api.isTauri || isOBSMode) {
      console.log('[초기화] OBS 모드 감지됨 - OBS 기능 활성화');
      document.body.classList.add('obs-mode');
      document.body.classList.remove('app-mode');

      // OBS 모드에서는 기본 포트 사용
      baseUrl = window.location.origin;
      obsUrl = `${baseUrl}/follower`;
      console.log('[알림기] OBS 모드 - 기본 URL:', baseUrl);
    } else {
      console.log('[초기화] Tauri 모드 감지됨 - 전체 기능 활성화');
      document.body.classList.add('app-mode');
      document.body.classList.remove('obs-mode');

      try {
        // Get dynamic server port for Tauri
        console.log('[알림기] 서버 포트 가져오는 중...');
        const port = await api.getServerPort();
        console.log('[알림기] 서버에서 반환된 포트:', port, typeof port);
        
        baseUrl = `http://localhost:${port}`;
        obsUrl = `http://localhost:${port}/follower`;
        console.log('[알림기] 동적 포트 사용 (Tauri):', port);
        console.log('[알림기] 기본 URL 설정:', baseUrl);
        console.log('[알림기] OBS URL 설정:', obsUrl);
        
        // 포트 확인을 위한 테스트 요청
        try {
          console.log('[알림기] 포트 테스트 요청 시작:', `${baseUrl}/settings`);
          const testResponse = await fetch(`${baseUrl}/settings`);
          console.log('[알림기] 포트 테스트 응답:', testResponse.status, testResponse.statusText);
          
          if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log('[알림기] 포트 테스트 성공, 데이터:', testData);
          } else {
            throw new Error(`포트 테스트 실패: ${testResponse.status}`);
          }
        } catch (testError) {
          console.error('[알림기] 포트 테스트 실패:', testError);
          throw testError;
        }
      } catch (portError) {
        console.error('[알림기] 동적 포트 가져오기 실패:', portError);
        // Keep default port as fallback
        console.log('[알림기] 폴백 기본 URL 사용:', baseUrl);
      }

      // Listen for Tauri events
      try {
        await api.listen('manual-login-success', event => {
          console.log('[Event] Login Success', event.payload);
          clearErrorStates();
        });
        
        console.log('[Event] Manual login listeners registered');
      } catch (eventError) {
        console.error('[Notifier] Failed to setup event listeners:', eventError);
      }
    }

    // Load Settings (with comprehensive error handling)
    try {
      await initializeSettingsManager();
      console.log('[init] Settings loaded successfully');
    } catch (settingsError) {
      console.error('[init] Settings loading failed:', settingsError);
      // Continue with defaults
    }

    // Apply styles
    try {
      applyStyles();
      console.log('[init] Styles applied successfully');
    } catch (styleError) {
      console.error('[init] Style application failed:', styleError);
    }

    // Load History with strict size limit
    try {
      loadHistory();
      console.log('[init] History loaded successfully');
      
      // 히스토리 정리 스케줄러 시작
      startHistoryCleanup();
    } catch (historyError) {
      console.error('[init] History loading failed:', historyError);
    }

    // Load known followers from storage
    try {
      loadKnownFollowers();

      // 루블리스를 강제로 제거 (모든 가능한 해시 패턴)
      const possibleRublisHashes = [
        'f2f551b67556276caa1f590604a7d92a', // 알려진 해시
      ];

      let removedCount = 0;
      possibleRublisHashes.forEach(hash => {
        if (knownFollowers.has(hash)) {
          knownFollowers.delete(hash);
          removedCount++;
        }
      });

      // 추가로 현재 API에서 루블리스 해시를 찾아서 제거
      try {
        const res = await fetch(`${baseUrl}/followers?_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          const followers = data.content?.data || [];
          const rublisFollower = followers.find(f => f.user.nickname === '루블리스');
          if (rublisFollower && knownFollowers.has(rublisFollower.user.userIdHash)) {
            knownFollowers.delete(rublisFollower.user.userIdHash);
            removedCount++;
            console.log(`[init] 루블리스 removed with hash: ${rublisFollower.user.userIdHash}`);
          }
        }
      } catch (e) {
        console.error('[init] Failed to fetch current followers for 루블리스 removal:', e);
      }

      if (removedCount > 0) {
        console.log(
          `[init] 루블리스 forcefully removed from known followers (${removedCount} entries)`
        );
        saveKnownFollowers(); // 즉시 저장
      } else {
        console.log('[init] 루블리스 not found in known followers - good!');
      }

      console.log(
        `[init] Known followers loaded successfully. Final count: ${knownFollowers.size}`
      );
    } catch (followersError) {
      console.error('[init] Known followers loading failed:', followersError);
    }

    // Start Polling (Tauri 모드와 OBS 모드 모두에서)
    try {
      // 먼저 기존 팔로워들을 초기화 (WebSocket과 폴링 모두에서 필요)
      await initializeKnownFollowers();
      console.log('[init] Known followers initialized successfully');

      // WebSocket 연결 시도
      initializeWebSocket();

      // 폴백으로 폴링도 시작 (WebSocket 실패 시)
      startPolling();
      console.log('[init] Polling started successfully');
    } catch (pollingError) {
      console.error('[init] Polling startup failed:', pollingError);
    }

    // OBS 모드에서는 설정 동기화 필요
    if (isOBSMode) {
      console.log('[init] OBS mode - starting settings sync');
      startSettingsSync();
    } else if (!api.isTauri) {
      console.log('[init] Starting settings sync for browser mode');
      startSettingsSync();
    } else {
      console.log('[init] Tauri mode - settings sync not needed');
    }

    console.log('[init] Initialization sequence complete');
  });

  // Cleanup on component destroy
  onDestroy(() => {
    console.log('[Cleanup] Component destroying, cleaning up resources');

    // 폴링 비활성화
    pollingEnabled = false;

    // Clear all timeouts and intervals
    const timersToClean = [
      { id: pollingTimeoutId, name: 'Polling timeout' },
      { id: settingsSyncIntervalId, name: 'Settings sync interval' },
      { id: reconnectTimeoutId, name: 'Reconnect timeout' },
      { id: testAlarmTimeoutId, name: 'Test alarm timeout' },
      { id: displayTimeoutId, name: 'Display timeout' },
      { id: queueProcessTimeoutId, name: 'Queue process timeout' },
      { id: historyCleanupIntervalId, name: 'History cleanup interval' }
    ];

    timersToClean.forEach(({ id, name }) => {
      if (id) {
        clearTimeout(id);
        clearInterval(id);
        console.log(`[Cleanup] ${name} cleared`);
      }
    });

    // Reset timer IDs
    pollingTimeoutId = null;
    settingsSyncIntervalId = null;
    reconnectTimeoutId = null;
    testAlarmTimeoutId = null;
    displayTimeoutId = null;
    queueProcessTimeoutId = null;
    historyCleanupIntervalId = null;

    // Remove keyboard event listener
    if (keyboardEventHandler) {
      document.removeEventListener('keydown', keyboardEventHandler, true);
      window.removeEventListener('keydown', keyboardEventHandler, true);
      if (document.body) {
        document.body.removeEventListener('keydown', keyboardEventHandler, true);
      }
      keyboardEventHandler = null;
      console.log('[Cleanup] Keyboard event listeners removed');
    }

    // Disconnect WebSocket and clear all event handlers
    if (wsClient) {
      wsClient.disconnect();
      wsClient = null;
      console.log('[Cleanup] WebSocket disconnected');
    }

    // Clear audio element
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.load();
      console.log('[Cleanup] Audio element cleared');
    }

    // Clear queues and state
    queue.length = 0;
    knownFollowers.clear();
    
    // Clear any pending test alarm flags
    if (window.testAlarmInProgress) {
      window.testAlarmInProgress = false;
    }

    // Clean up settings manager
    if (settingsManager) {
      settingsManager.destroy();
      settingsManager = null;
      console.log('[Cleanup] Settings manager destroyed');
    }

    console.log('[Cleanup] All resources cleaned up successfully');
  });

  async function initializeSettingsManager() {
    console.log('[Settings] Initializing centralized settings manager...');

    try {
      // 설정 관리자 생성
      settingsManager = new SettingsManager(baseUrl);

      // 설정 변경 리스너 등록
      settingsManager.addListener((event) => {
        console.log(`[Settings] Setting changed: ${event.key} = ${event.newValue} (source: ${event.source})`);
        
        // 반응형 변수 업데이트
        switch (event.key) {
          case 'volume':
            volume = event.newValue;
            break;
          case 'pollingInterval':
            pollingInterval = event.newValue;
            break;
          case 'displayDuration':
            displayDuration = event.newValue;
            break;
          case 'enableTTS':
            enableTTS = event.newValue;
            break;
          case 'customSoundPath':
            customSoundPath = event.newValue;
            break;
          case 'animationType':
            animationType = event.newValue;
            break;
          case 'notificationLayout':
            notificationLayout = event.newValue;
            break;
          case 'textColor':
            textColor = event.newValue;
            break;
          case 'textSize':
            textSize = event.newValue;
            break;
        }

        // 스타일 재적용 (UI 관련 설정 변경 시)
        if (['textColor', 'textSize', 'customSoundPath'].includes(event.key)) {
          applyStyles();
        }
      });

      // 설정 로드 순서: 로컬 스토리지 → 서버 → URL 파라미터
      console.log('[Settings] Loading from localStorage...');
      await settingsManager.loadFromStorage();

      console.log('[Settings] Loading from server...');
      await settingsManager.loadFromServer();

      console.log('[Settings] Loading from URL parameters...');
      settingsManager.loadFromURL();

      // 초기 설정값을 반응형 변수에 적용
      const settings = settingsManager.getAll();
      volume = settings.volume;
      pollingInterval = settings.pollingInterval;
      displayDuration = settings.displayDuration;
      enableTTS = settings.enableTTS;
      customSoundPath = settings.customSoundPath;
      animationType = settings.animationType;
      notificationLayout = settings.notificationLayout;
      textColor = settings.textColor;
      textSize = settings.textSize;

      console.log('[Settings] Centralized settings manager initialized successfully');
      console.log('[Settings] Final settings:', settings);

      return true;
    } catch (error) {
      console.error('[Settings] Failed to initialize settings manager:', error);
      
      // 폴백: 기존 방식으로 설정 로드
      console.log('[Settings] Falling back to legacy settings loading...');
      await loadSettingsLegacy();
      return false;
    }
  }

  // 기존 설정 로드 방식 (폴백용)
  async function loadSettingsLegacy() {
    console.log('[Settings] Loading settings (legacy mode)...');

    // Step 1: Try to load from server first
    let serverSettings = {};
    try {
      console.log('[Settings] Attempting to load from server');
      const res = await fetch(`${baseUrl}/settings`);
      if (res.ok) {
        serverSettings = await res.json();
        console.log('[Settings] Server settings loaded:', serverSettings);

        // Apply server settings
        if (serverSettings.volume !== undefined) volume = serverSettings.volume;
        if (serverSettings.pollingInterval !== undefined)
          pollingInterval = Math.max(5, serverSettings.pollingInterval);
        if (serverSettings.displayDuration !== undefined)
          displayDuration = serverSettings.displayDuration;
        if (serverSettings.enableTTS !== undefined) enableTTS = serverSettings.enableTTS;
        if (serverSettings.customSoundPath !== undefined)
          customSoundPath = serverSettings.customSoundPath;
        if (serverSettings.animationType !== undefined)
          animationType = serverSettings.animationType;
        if (serverSettings.notificationLayout !== undefined)
          notificationLayout = serverSettings.notificationLayout;
        if (serverSettings.textColor !== undefined) textColor = serverSettings.textColor;
        if (serverSettings.textSize !== undefined) textSize = serverSettings.textSize;
      } else {
        console.log('[Settings] Server settings not available, status:', res.status);
      }
    } catch (e) {
      console.log('[Settings] Server settings failed, falling back to local storage:', e.message);

      // Step 2: Fallback to local storage
      const s = localStorage;
      try {
        if (s.getItem('volume')) volume = parseFloat(s.getItem('volume'));
        if (s.getItem('pollingInterval'))
          pollingInterval = Math.max(5, parseInt(s.getItem('pollingInterval')));
        if (s.getItem('displayDuration')) displayDuration = parseInt(s.getItem('displayDuration'));
        if (s.getItem('enableTTS')) enableTTS = s.getItem('enableTTS') === 'true';
        if (s.getItem('customSoundPath')) customSoundPath = s.getItem('customSoundPath');
        if (s.getItem('animationType')) animationType = s.getItem('animationType');
        if (s.getItem('notificationLayout')) notificationLayout = s.getItem('notificationLayout');
        if (s.getItem('textColor')) textColor = s.getItem('textColor');
        if (s.getItem('textSize')) textSize = parseInt(s.getItem('textSize'));

        console.log('[Settings] Local storage settings loaded');
      } catch (localError) {
        console.error('[Settings] Failed to load from local storage:', localError);
      }
    }

    // Step 3: Apply URL parameter overrides
    const params = new URLSearchParams(window.location.search);
    let urlOverrides = {};

    if (params.has('volume')) {
      volume = parseFloat(params.get('volume'));
      urlOverrides.volume = volume;
    }
    if (params.has('pollingInterval')) {
      pollingInterval = Math.max(5, parseInt(params.get('pollingInterval')));
      urlOverrides.pollingInterval = pollingInterval;
    }
    if (params.has('displayDuration')) {
      displayDuration = parseInt(params.get('displayDuration'));
      urlOverrides.displayDuration = displayDuration;
    }
    if (params.has('enableTTS')) {
      enableTTS = params.get('enableTTS') === 'true';
      urlOverrides.enableTTS = enableTTS;
    }
    if (params.has('textColor')) {
      textColor = params.get('textColor');
      urlOverrides.textColor = textColor;
    }
    if (params.has('textSize')) {
      textSize = parseInt(params.get('textSize'));
      urlOverrides.textSize = textSize;
    }
    if (params.has('notificationLayout')) {
      notificationLayout = params.get('notificationLayout');
      urlOverrides.notificationLayout = notificationLayout;
    }
    if (params.has('animationType')) {
      animationType = params.get('animationType');
      urlOverrides.animationType = animationType;
    }

    if (Object.keys(urlOverrides).length > 0) {
      console.log('[Settings] URL parameter overrides applied:', urlOverrides);
    }

    console.log('[Settings] Final settings (legacy):', {
      volume,
      pollingInterval,
      displayDuration,
      enableTTS,
      customSoundPath,
      animationType,
      notificationLayout,
      textColor,
      textSize,
    });
  }

  async function saveSettings() {
    console.log('[Settings] Saving settings via centralized manager...');

    try {
      if (!settingsManager) {
        console.warn('[Settings] Settings manager not initialized, falling back to legacy save');
        await saveSettingsLegacy();
        return;
      }

      // 최소값 검증
      if (pollingInterval < 5) pollingInterval = 5;

      // 설정 관리자를 통해 모든 설정 업데이트
      const settingsToSave = {
        volume,
        pollingInterval,
        displayDuration,
        enableTTS,
        customSoundPath,
        animationType,
        notificationLayout,
        textColor,
        textSize,
      };

      const success = settingsManager.setMultiple(settingsToSave, 'user');
      
      if (success) {
        console.log('[Settings] Settings saved successfully via centralized manager');
        applyStyles();
        showSettings = false;
      } else {
        console.error('[Settings] Failed to save settings via centralized manager');
        // 폴백으로 기존 방식 사용
        await saveSettingsLegacy();
      }
    } catch (error) {
      console.error('[Settings] Error saving settings:', error);
      // 폴백으로 기존 방식 사용
      await saveSettingsLegacy();
    }
  }

  // 기존 설정 저장 방식 (폴백용)
  async function saveSettingsLegacy() {
    if (pollingInterval < 5) pollingInterval = 5;

    const settingsToSave = {
      volume,
      pollingInterval,
      displayDuration,
      enableTTS,
      customSoundPath,
      animationType,
      notificationLayout,
      textColor,
      textSize,
    };

    console.log('[Settings] Saving settings (legacy mode):', settingsToSave);

    // Always save to local storage first (as backup)
    try {
      localStorage.setItem('volume', volume.toString());
      localStorage.setItem('pollingInterval', pollingInterval.toString());
      localStorage.setItem('displayDuration', displayDuration.toString());
      localStorage.setItem('enableTTS', enableTTS.toString());
      if (customSoundPath) localStorage.setItem('customSoundPath', customSoundPath);
      localStorage.setItem('animationType', animationType);
      localStorage.setItem('notificationLayout', notificationLayout);
      localStorage.setItem('textColor', textColor);
      localStorage.setItem('textSize', textSize.toString());
      console.log('[Settings] Saved to local storage successfully');
    } catch (localError) {
      console.error('[Settings] Failed to save to local storage:', localError);
    }

    // Try to save to server
    try {
      const response = await fetch(`${baseUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave),
      });

      if (response.ok) {
        console.log('[Settings] Saved to server successfully');
      } else {
        console.error('[Settings] Server save failed with status:', response.status);
      }
    } catch (serverError) {
      console.error('[Settings] Server save failed:', serverError.message);
      // Local storage save already completed above, so settings are still preserved
    }

    applyStyles();
    showSettings = false;
  }

  function applyStyles() {
    console.log('[Styles] Applying styles...');

    try {
      // 다크 테마를 기본으로 설정
      document.documentElement.setAttribute('data-theme', 'dark');

      // Apply custom text color
      document.documentElement.style.setProperty('--text-color', textColor);
      console.log('[Styles] Text color applied:', textColor);

      // Apply text size
      document.body.style.fontSize = `${textSize}%`;
      console.log('[Styles] Text size applied:', textSize + '%');

      // Apply custom sound
      if (customSoundPath && api.isTauri) {
        try {
          const src = api.convertFileSrc(customSoundPath);
          if (audio) {
            audio.src = src;
            console.log('[Styles] Custom sound applied:', customSoundPath);
          }
        } catch (soundError) {
          console.error('[Styles] Failed to apply custom sound:', soundError);
          // Fallback to default sound
          if (audio) audio.src = '/sound.mp3';
        }
      } else {
        if (audio) {
          audio.src = '/sound.mp3';
          console.log('[Styles] Default sound applied');
        }
      }

      console.log('[Styles] All styles applied successfully');
    } catch (styleError) {
      console.error('[Styles] Failed to apply styles:', styleError);
    }
  }

  async function selectSoundFile() {
    try {
      console.log('[FileSelect] Attempting to select audio file');
      const path = await api.selectAudioFile();
      if (path) {
        customSoundPath = path;
        console.log('[FileSelect] Audio file selected:', path);
      } else {
        console.log('[FileSelect] No file selected');
      }
    } catch (fileError) {
      console.error('[FileSelect] File selection failed:', fileError);

      // Show user-friendly error message
      if (api.isTauri) {
        // In Tauri, we can show a more specific error
        showUserError('파일 선택에 실패했습니다. 다시 시도해 주세요.');
      } else {
        showUserError('파일 선택 기능을 사용할 수 없습니다.');
      }

      // Maintain current settings - don't change customSoundPath
    }
  }

  async function startPolling() {
    // 기존 팔로워 초기화는 이미 onMount에서 완료됨
    scheduleNextPoll();
  }

  // WebSocket 초기화
  function initializeWebSocket() {
    console.log('[WebSocket] Initializing WebSocket connection');

    try {
      wsClient = new WSClient(baseUrl);

      // 연결 이벤트
      wsClient.on('connected', () => {
        console.log('[WebSocket] Connected successfully');
        wsConnected = true;
        wsReconnecting = false;
        wsConnectionAttempts = 0;
        sessionError = false;

        // WebSocket 연결 시 폴링 완전 중단 (서버 모니터링으로 대체)
        pollingEnabled = false;
        if (pollingTimeoutId) {
          clearTimeout(pollingTimeoutId);
          pollingTimeoutId = null;
          console.log('[WebSocket] Polling disabled - using server-side monitoring');
        }
      });

      // 연결 해제 이벤트
      wsClient.on('disconnected', () => {
        console.log('[WebSocket] Disconnected');
        wsConnected = false;
        wsReconnecting = true;

        // WebSocket 연결 해제 시 폴링 재개 (폴백)
        setTimeout(() => {
          if (!wsConnected && !pollingTimeoutId) {
            console.log('[WebSocket] Fallback to polling mode');
            pollingEnabled = true;
            scheduleNextPoll();
          }
        }, 2000);
      });

      // 오류 이벤트
      wsClient.on('error', error => {
        console.error('[WebSocket] Error:', error);
        wsConnected = false;
        wsConnectionAttempts++;

        // 최대 시도 횟수 초과 시 폴링으로 완전 전환
        if (wsConnectionAttempts >= maxWSConnectionAttempts) {
          console.log('[WebSocket] Max connection attempts reached, switching to polling');
          wsReconnecting = false;
          pollingEnabled = true;
          if (!pollingTimeoutId) {
            scheduleNextPoll();
          }
        }
      });

      // 새 팔로워 이벤트
      wsClient.on('new_follower', follower => {
        console.log('[WebSocket] New follower received:', follower);
        handleNewFollowerFromWS(follower);
      });

      // 테스트 알림 이벤트
      wsClient.on('test_notification', follower => {
        console.log('[WebSocket] Test notification received:', follower);
        handleTestNotificationFromWS(follower);
      });

      // 설정 업데이트 이벤트
      wsClient.on('settings_updated', settings => {
        console.log('[WebSocket] Settings updated:', settings);
        handleSettingsUpdateFromWS(settings);
      });

      // 연결 시작
      wsClient.connect();
    } catch (error) {
      console.error('[WebSocket] Failed to initialize:', error);
      wsConnected = false;
      pollingEnabled = true;
    }
  }

  // WebSocket에서 새 팔로워 처리
  function handleNewFollowerFromWS(follower) {
    console.log('[WebSocket] Processing new follower:', follower.user.nickname);
    console.log('[WebSocket] Follower data:', follower);

    // 중복 확인
    if (queue.some(q => q.user.userIdHash === follower.user.userIdHash)) {
      console.log('[WebSocket] Follower already in queue, skipping:', follower.user.nickname);
      return;
    }

    // 루블리스는 항상 새 팔로워로 처리 (테스트용) - known followers 체크 완전 건너뛰기
    const isTestFollower = follower.user.nickname === '루블리스';

    if (isTestFollower) {
      console.log(
        '[WebSocket] Test follower (루블리스) - always show notification:',
        follower.user.nickname
      );
      // 루블리스는 known followers 체크 없이 바로 큐에 추가
      queue.push(follower);
      console.log('[WebSocket] Added to notification queue:', follower.user.nickname);
      console.log('[WebSocket] Current queue length:', queue.length);
      processQueue();
      return;
    }

    // 일반 팔로워 처리 (기존 팔로워 확인)
    if (!follower.user.userIdHash.startsWith('test_')) {
      if (knownFollowers.has(follower.user.userIdHash)) {
        console.log('[WebSocket] Follower already known, skipping:', follower.user.nickname);
        return;
      }

      // 앱 시작 이전 팔로워 확인 (더 정확한 시간 비교)
      if (follower.followingSince) {
        try {
          // followingSince가 "YYYY-MM-DD HH:mm:ss" 형식인 경우 처리
          const followTime = new Date(follower.followingSince.replace(' ', 'T')).getTime();
          if (!isNaN(followTime) && followTime < appStartedAt) {
            console.log(
              `[WebSocket] Old follower detected (followed at ${follower.followingSince}, app started at ${new Date(appStartedAt).toISOString()}), adding to known set:`,
              follower.user.nickname
            );
            knownFollowers.add(follower.user.userIdHash);
            saveKnownFollowers();
            return;
          }
        } catch (timeError) {
          console.error('[WebSocket] Failed to parse follow time:', timeError);
          // 시간 파싱 실패 시 안전하게 기존 팔로워로 처리
          console.log(
            '[WebSocket] Time parsing failed, treating as known follower:',
            follower.user.nickname
          );
          knownFollowers.add(follower.user.userIdHash);
          saveKnownFollowers();
          return;
        }
      }

      // 새 팔로워로 등록
      knownFollowers.add(follower.user.userIdHash);
      saveKnownFollowers();
      console.log('[WebSocket] Confirmed new follower:', follower.user.nickname);
    }

    // 큐에 추가
    queue.push(follower);
    console.log('[WebSocket] Added to notification queue:', follower.user.nickname);
    console.log('[WebSocket] Current queue length:', queue.length);

    // 즉시 처리
    processQueue();
  }

  // WebSocket에서 테스트 알림 처리
  function handleTestNotificationFromWS(follower) {
    // 중복 확인
    if (queue.some(q => q.user.userIdHash === follower.user.userIdHash)) {
      console.log('[WebSocket] Test follower already in queue, skipping:', follower.user.nickname);
      return;
    }

    // 큐에 추가
    queue.push(follower);
    console.log('[WebSocket] Added test notification to queue:', follower.user.nickname);

    // 즉시 처리
    processQueue();
  }

  // WebSocket에서 설정 업데이트 처리
  function handleSettingsUpdateFromWS(settings) {
    console.log('[WebSocket] Applying settings update:', settings);

    try {
      if (settingsManager) {
        // 중앙화된 설정 관리자 사용
        console.log('[WebSocket] Using centralized settings manager for update');
        
        // URL 파라미터가 있는 설정은 제외하고 업데이트
        const params = new URLSearchParams(window.location.search);
        const filteredSettings = {};
        
        Object.entries(settings).forEach(([key, value]) => {
          // URL 파라미터로 오버라이드된 설정은 건너뛰기
          const paramName = key === 'notificationLayout' ? 'notificationLayout' : 
                           key === 'animationType' ? 'animationType' :
                           key === 'displayDuration' ? 'displayDuration' :
                           key === 'textColor' ? 'textColor' :
                           key === 'textSize' ? 'textSize' :
                           key === 'volume' ? 'volume' : key;
          
          if (!params.has(paramName)) {
            filteredSettings[key] = value;
          } else {
            console.log(`[WebSocket] Skipping ${key} - overridden by URL parameter`);
          }
        });

        if (Object.keys(filteredSettings).length > 0) {
          const success = settingsManager.setMultiple(filteredSettings, 'server');
          if (success) {
            console.log('[WebSocket] Settings updated successfully via centralized manager');
          } else {
            console.warn('[WebSocket] Failed to update settings via centralized manager, falling back');
            handleSettingsUpdateFromWSLegacy(settings);
          }
        } else {
          console.log('[WebSocket] No settings to update (all overridden by URL parameters)');
        }
      } else {
        console.warn('[WebSocket] Settings manager not available, using legacy update');
        handleSettingsUpdateFromWSLegacy(settings);
      }
    } catch (error) {
      console.error('[WebSocket] Error updating settings:', error);
      handleSettingsUpdateFromWSLegacy(settings);
    }
  }

  // 기존 WebSocket 설정 업데이트 방식 (폴백용)
  function handleSettingsUpdateFromWSLegacy(settings) {
    console.log('[WebSocket] Applying settings update (legacy mode):', settings);

    // URL 파라미터가 없는 경우만 업데이트
    const params = new URLSearchParams(window.location.search);

    let settingsChanged = false;

    if (!params.has('volume') && settings.volume !== undefined && volume !== settings.volume) {
      volume = settings.volume;
      settingsChanged = true;
      console.log('[WebSocket] Updated volume:', volume);
    }
    if (
      !params.has('displayDuration') &&
      settings.displayDuration !== undefined &&
      displayDuration !== settings.displayDuration
    ) {
      displayDuration = settings.displayDuration;
      settingsChanged = true;
      console.log('[WebSocket] Updated displayDuration:', displayDuration);
    }
    if (
      !params.has('animationType') &&
      settings.animationType !== undefined &&
      animationType !== settings.animationType
    ) {
      animationType = settings.animationType;
      settingsChanged = true;
      console.log('[WebSocket] Updated animationType:', animationType);
    }
    if (
      !params.has('notificationLayout') &&
      settings.notificationLayout !== undefined &&
      notificationLayout !== settings.notificationLayout
    ) {
      notificationLayout = settings.notificationLayout;
      settingsChanged = true;
      console.log('[WebSocket] Updated notificationLayout:', notificationLayout);
    }
    if (
      !params.has('textColor') &&
      settings.textColor !== undefined &&
      textColor !== settings.textColor
    ) {
      textColor = settings.textColor;
      settingsChanged = true;
      console.log('[WebSocket] Updated textColor:', textColor);
    }
    if (
      !params.has('textSize') &&
      settings.textSize !== undefined &&
      textSize !== settings.textSize
    ) {
      textSize = settings.textSize;
      settingsChanged = true;
      console.log('[WebSocket] Updated textSize:', textSize);
    }

    // 스타일 재적용 (설정이 변경된 경우만)
    if (settingsChanged) {
      applyStyles();
      console.log('[WebSocket] Settings applied successfully');
    }
  }

  async function initializeKnownFollowers() {
    console.log('[Init] Initializing known followers...');

    try {
      // 현재 팔로워 목록을 가져와서 모두 기존으로 등록
      const res = await fetch(`${baseUrl}/followers?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const followers = data.content?.data || [];

        let registeredCount = 0;
        // 현재 모든 팔로워를 기존으로 등록 (루블리스 제외)
        followers.forEach(f => {
          // 루블리스는 known followers에 추가하지 않음 (항상 새 팔로워로 처리하기 위해)
          if (f.user.nickname !== '루블리스') {
            knownFollowers.add(f.user.userIdHash);
            registeredCount++;
          } else {
            console.log(
              '[Init] 루블리스 excluded from known followers - will always show notifications'
            );
            console.log(`[Init] 루블리스 hash: ${f.user.userIdHash}`);
          }
        });

        // 로컬 스토리지에 저장
        saveKnownFollowers();

        console.log(`[Init] Registered ${registeredCount} existing followers (루블리스 excluded)`);
        console.log(
          `[Init] Total followers found: ${followers.length}, Known followers: ${registeredCount}`
        );
        console.log('[Init] Only NEW followers after this point will trigger notifications');
        console.log('[Init] 루블리스 will ALWAYS trigger notifications');

        // OBS 모드인지 확인
        const isOBSMode = !api.isTauri;
        if (isOBSMode) {
          console.log('[Init] OBS mode detected - 루블리스 will be processed via polling');
        } else {
          console.log(
            '[Init] Tauri mode detected - 루블리스 will be processed via WebSocket and polling'
          );
        }
      }
    } catch (e) {
      console.error('[Init] Failed to initialize known followers:', e);
    }

    isInitialized = true;
  }

  function scheduleNextPoll() {
    // 폴링이 비활성화된 경우에만 건너뛰기 (WebSocket 연결 상태와 무관하게 폴링 유지)
    if (!pollingEnabled) {
      console.log('[Polling] Polling disabled, skipping');
      return;
    }

    // Clear existing timeout
    if (pollingTimeoutId) {
      clearTimeout(pollingTimeoutId);
    }
    pollingTimeoutId = setTimeout(pollLoop, pollingInterval * 1000);
  }

  async function pollLoop() {
    // WebSocket 연결된 경우 폴링 완전 중단 (서버 모니터링이 대체)
    if (wsConnected) {
      console.log('[Polling] Poll cancelled - WebSocket connected, using server monitoring');
      return;
    }
    
    // 폴링이 비활성화된 경우에도 중단
    if (!pollingEnabled) {
      console.log('[Polling] Poll cancelled - polling disabled');
      return;
    }

    console.log('[Polling] Executing poll (WebSocket fallback mode)');
    
    await fetchFollowers();
    scheduleNextPoll();
  }

  async function fetchFollowers() {
    // 성능 최적화: 쿨다운 체크
    const now = Date.now();
    if (now - lastFetchTime < fetchCooldown) {
      console.log('[Fetch] Skipping fetch - cooldown active');
      return;
    }

    if (isFetching) {
      console.log('[Fetch] Fetch already in progress, skipping');
      return;
    }

    // WebSocket 연결된 경우 폴링 중단
    if (wsConnected) {
      console.log('[Fetch] Skipping fetch - WebSocket connected');
      return;
    }

    isFetching = true;
    lastFetchTime = now;
    console.log('[Fetch] Starting follower fetch');

    try {
      const res = await fetch(`${baseUrl}/followers?_t=${now}`);
      
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          handleSessionError();
          return;
        } else if (res.status >= 500) {
          throw new Error(`서버 오류 (${res.status}): 서버에 일시적인 문제가 있습니다.`);
        } else {
          throw new Error(`HTTP ${res.status}: 요청을 처리할 수 없습니다.`);
        }
      }

      // 성공 시 에러 상태 해제
      clearErrorStates();

      const data = await res.json();
      const followers = data.content?.data || [];
      console.log(`[Fetch] Fetched ${followers.length} followers`);

      if (!isInitialized) {
        console.log('[Fetch] Initial fetch - adding all followers to known set');
        if (followers.length > 0) {
          followers.forEach(f => {
            // 테스트 팔로워는 초기화에서 제외 (항상 새로운 것으로 처리)
            if (!f.user.userIdHash.startsWith('test_')) {
              knownFollowers.add(f.user.userIdHash);
            }
          });
          isInitialized = true;
          console.log(`[Fetch] Initialization complete. ${knownFollowers.size} followers known.`);
        } else {
          console.log('[Fetch] Initial fetch returned 0 followers. Initialization complete.');
          isInitialized = true;
        }
        return;
      }

      // 성능 최적화: 새 팔로워만 필터링
      const newFollowers = followers.filter(
        f => !knownFollowers.has(f.user.userIdHash) || f.user.userIdHash.startsWith('test_')
      );

      if (newFollowers.length > 0) {
        console.log(`[Fetch] New followers detected: ${newFollowers.length}`);
        console.log(
          `[Fetch] New followers list:`,
          newFollowers.map(f => f.user.nickname)
        );

        // 배치 처리로 성능 최적화
        const validNewFollowers = [];

        newFollowers.forEach(f => {
          let isOldFollower = false;

          // 루블리스는 항상 새 팔로워로 처리 (테스트용) - known followers 체크 완전 건너뛰기
          const isTestFollower = f.user.nickname === '루블리스';

          if (isTestFollower) {
            // 루블리스는 무조건 새 팔로워로 처리 (팔로우 해제 후 재팔로우 시에도 알림)
            console.log(`[Fetch] ⭐ Test follower (루블리스) detected - ALWAYS show notification!`);
            console.log(`[Fetch] 루블리스 data:`, f);
            isOldFollower = false;
            // 루블리스는 known followers에 추가하지 않음 (항상 새 팔로워로 처리하기 위해)

            // 중복 확인 후 바로 큐에 추가
            if (!queue.some(q => q.user.userIdHash === f.user.userIdHash)) {
              validNewFollowers.push(f);
              console.log(`[Fetch] ✅ 루블리스 added to valid new followers`);
            } else {
              console.log(`[Fetch] ⚠️ 루블리스 already in queue, skipping`);
            }
            return; // 루블리스는 여기서 처리 완료
          } else if (f.user.userIdHash.startsWith('test_')) {
            // 서버에서 생성된 테스트 팔로워 처리 (모든 모드에서 처리)
            console.log(`[Fetch] Processing server test follower: ${f.user.nickname}`);
            isOldFollower = false;
          } else {
            // 일반 팔로워 처리 - 앱 시작 이전 팔로워인지 확인
            if (f.followingSince) {
              const followTime = new Date(f.followingSince.replace(' ', 'T')).getTime();
              if (!isNaN(followTime) && followTime < appStartedAt) {
                isOldFollower = true;
                console.log(`[Fetch] Ignoring old follower: ${f.user.nickname}`);
              }
            }
          }

          // Add to known followers (except test followers and 루블리스)
          if (!f.user.userIdHash.startsWith('test_') && !isTestFollower) {
            knownFollowers.add(f.user.userIdHash);
          }

          // Only add to notification queue if they're a new follower
          if (!isOldFollower) {
            // Double-check they're not already in the queue to prevent duplicates
            if (!queue.some(q => q.user.userIdHash === f.user.userIdHash)) {
              validNewFollowers.push(f);
            }
          }
        });

        // 배치로 큐에 추가
        if (validNewFollowers.length > 0) {
          queue.push(...validNewFollowers);
          console.log(`[Fetch] ✅ Added ${validNewFollowers.length} followers to queue`);
          console.log(
            `[Fetch] Queue contents:`,
            validNewFollowers.map(f => f.user.nickname)
          );
          console.log(`[Fetch] Current queue length: ${queue.length}`);

          // 큐 처리
          processQueue();
        } else {
          console.log(`[Fetch] No valid new followers to add to queue`);
        }
      }
    } catch (e) {
      console.error('[Fetch] Error:', e);
      handleNetworkError(e, '팔로워 정보 가져오기');
      // Continue with next scheduled poll
    } finally {
      isFetching = false;
      console.log('[Fetch] Fetch completed');
    }
  }

  function handleSessionError() {
    console.log('[Session] Error detected - setting session error state');
    sessionError = true;

    // Only attempt reconnection if not already reconnecting and under max attempts
    if (!isReconnecting && reconnectAttempts < maxReconnectAttempts) {
      attemptReconnect();
    }
  }

  function clearErrorStates() {
    console.log('[Session] Clearing error states - connection successful');
    sessionError = false;
    isReconnecting = false;
    reconnectAttempts = 0;
  }

  async function attemptReconnect() {
    console.log(
      `[Reconnect] Attempting reconnection ${reconnectAttempts + 1}/${maxReconnectAttempts}`
    );
    isReconnecting = true;
    reconnectAttempts++;

    try {
      if (api.isTauri) {
        await api.invoke('check_auto_login');
        console.log('[Reconnect] Auto-login successful');
        clearErrorStates();
      } else {
        // For non-Tauri environments, try a simple fetch to test connection
        const testRes = await fetch(`${baseUrl}/followers?_t=${Date.now()}`);
        if (testRes.ok) {
          console.log('[Reconnect] Connection test successful');
          clearErrorStates();
        } else if (testRes.status === 401 || testRes.status === 403) {
          throw new Error('Authentication still required');
        }
      }
    } catch (e) {
      console.error('[Reconnect] Failed:', e);

      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('[Reconnect] Maximum attempts reached, stopping reconnection');
        isReconnecting = false;
      } else {
        console.log(
          `[Reconnect] Scheduling next attempt in 3 seconds (${reconnectAttempts}/${maxReconnectAttempts})`
        );
        
        // Clear existing timeout before setting new one
        if (reconnectTimeoutId) {
          clearTimeout(reconnectTimeoutId);
        }
        
        reconnectTimeoutId = setTimeout(() => {
          reconnectTimeoutId = null;
          attemptReconnect();
        }, 3000);
      }
    }
  }

  function processQueue() {
    console.log(
      `[Queue] Processing queue. Items: ${queue.length}, Currently processing: ${isProcessing}`
    );

    if (queue.length > 0 && !isProcessing) {
      isProcessing = true;
      currentItem = queue.shift();

      console.log(`[Queue] Displaying notification for: ${currentItem.user.nickname}`);
      console.log(`[Queue] Current item data:`, currentItem);

      try {
        // Play audio notification (non-blocking)
        playAlarm().catch(audioError => {
          console.error('[Queue] Audio playback failed:', audioError);
          // Continue with other notification features
        });

        // Add to history (non-blocking)
        try {
          addHistory(currentItem);
        } catch (historyError) {
          console.error('[Queue] History addition failed:', historyError);
          // Continue with notification display
        }

        // Play TTS if enabled (non-blocking)
        if (enableTTS) {
          try {
            speak(currentItem.user.nickname);
          } catch (ttsError) {
            console.error('[Queue] TTS failed:', ttsError);
            // Continue with notification display
          }
        }

        console.log(`[Queue] Notification will display for ${displayDuration} seconds`);

        // Clear existing display timeout
        if (displayTimeoutId) {
          clearTimeout(displayTimeoutId);
        }

        // Set timer for display duration
        displayTimeoutId = setTimeout(() => {
          console.log(
            `[Queue] Display duration expired for: ${currentItem?.user?.nickname || 'unknown'}`
          );
          currentItem = null;
          displayTimeoutId = null;

          // Clear existing queue process timeout
          if (queueProcessTimeoutId) {
            clearTimeout(queueProcessTimeoutId);
          }

          // Small delay before processing next item to prevent UI flicker
          queueProcessTimeoutId = setTimeout(() => {
            isProcessing = false;
            queueProcessTimeoutId = null;
            console.log(`[Queue] Ready for next item. Remaining: ${queue.length}`);

            // Process next item if available
            if (queue.length > 0) {
              processQueue();
            } else {
              console.log('[Queue] Queue is now empty');
            }
          }, 300);
        }, displayDuration * 1000);
      } catch (notificationError) {
        console.error('[Queue] Notification display failed:', notificationError);

        // Even if notification fails, continue processing queue
        currentItem = null;
        
        // Clear existing timeout
        if (queueProcessTimeoutId) {
          clearTimeout(queueProcessTimeoutId);
        }
        
        queueProcessTimeoutId = setTimeout(() => {
          isProcessing = false;
          queueProcessTimeoutId = null;
          processQueue(); // Try next item
        }, 500);
      }
    } else if (queue.length === 0) {
      console.log('[Queue] Queue is empty, setting processing to false');
      isProcessing = false;
    } else {
      console.log('[Queue] Already processing, skipping');
    }
  }

  async function playAlarm() {
    if (!audio) {
      console.warn('[Audio] Audio element not available');
      return;
    }

    try {
      audio.volume = volume;
      audio.currentTime = 0;
      await audio.play();
      console.log('[Audio] Playback successful');
    } catch (audioError) {
      console.error('[Audio] Playback failed:', audioError);
      throw audioError; // Re-throw for caller to handle
    }
  }

  function speak(text) {
    if ('speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(`${text}님이 팔로우했습니다.`);
        u.lang = 'ko-KR';
        u.volume = volume;

        u.onerror = event => {
          console.error('[TTS] Speech synthesis failed:', event.error);
          // Continue with audio notification as fallback
          console.log('[TTS] Falling back to audio notification');
        };

        window.speechSynthesis.speak(u);
        console.log('[TTS] Speech synthesis started for:', text);
      } catch (ttsError) {
        console.error('[TTS] Failed to create speech synthesis:', ttsError);
        // Continue with audio notification as fallback
        console.log('[TTS] Falling back to audio notification');
      }
    } else {
      console.warn('[TTS] Speech synthesis not supported in this browser');
    }
  }

  function addHistory(item) {
    try {
      const historyItem = {
        ...item,
        _id: Date.now() + Math.random().toString(36).substr(2, 9),
        notifiedAt: new Date().toISOString(),
      };

      console.log('[History] Adding item:', historyItem.user.nickname);

      // Add to beginning with strict size limit
      history = [historyItem, ...history.slice(0, HISTORY_MAX_SIZE - 1)];

      // 비동기로 저장하여 UI 블로킹 방지
      setTimeout(() => {
        saveHistoryToStorage();
      }, 0);
    } catch (error) {
      console.error('[History] Failed to add history item:', error);
    }
  }

  function loadHistory() {
    console.log('[History] Loading history from local storage');

    try {
      const s = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (s) {
        const parsedHistory = JSON.parse(s);

        // Validate that it's an array
        if (Array.isArray(parsedHistory)) {
          // Ensure we don't exceed maximum size
          history = parsedHistory.slice(0, HISTORY_MAX_SIZE);
          console.log(`[History] Loaded ${history.length} items from storage`);

          // If we had to truncate, save the truncated version back
          if (parsedHistory.length > HISTORY_MAX_SIZE) {
            console.log(`[History] Truncated from ${parsedHistory.length} to ${HISTORY_MAX_SIZE} items`);
            saveHistoryToStorage();
          }
        } else {
          console.warn('[History] Invalid history format in storage, resetting');
          history = [];
        }
      } else {
        console.log('[History] No history found in storage');
        history = [];
      }
    } catch (error) {
      console.error('[History] Failed to load history from storage:', error);
      history = [];

      // Try to clear corrupted data
      try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        console.log('[History] Cleared corrupted history data');
      } catch (clearError) {
        console.error('[History] Failed to clear corrupted data:', clearError);
      }
    }
  }

  function clearHistory() {
    console.log('[History] Clearing all history');

    // Clear from memory
    history = [];

    // Clear from local storage
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      console.log('[History] Successfully cleared from storage');
    } catch (error) {
      console.error('[History] Failed to clear from storage:', error);
    }
  }

  function formatTime(iso) {
    if (!iso) return '-';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) {
        return '-';
      }

      return date.toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch (error) {
      console.error('[History] Failed to format timestamp:', error);
      return '-';
    }
  }

  function testAlarm() {
    console.log('[TestAlarm] Button clicked');

    // 중복 방지를 위한 플래그 (성능 최적화)
    if (window.testAlarmInProgress) {
      console.log('[TestAlarm] Test alarm already in progress, skipping');
      showUserWarning('테스트 알림', '이미 테스트 알림이 진행 중입니다.');
      return;
    }

    window.testAlarmInProgress = true;

    // WebSocket 연결된 경우 WebSocket 사용
    if (wsClient && wsClient.isConnected()) {
      console.log('[TestAlarm] Using WebSocket for test notification');

      if (wsClient.requestTestFollower()) {
        console.log('[TestAlarm] WebSocket test request sent');
        showUserSuccess('테스트 알림', 'WebSocket을 통해 테스트 알림을 전송했습니다.');
        // WebSocket 성공 시 플래그 빠르게 해제
        if (testAlarmTimeoutId) {
          clearTimeout(testAlarmTimeoutId);
        }
        testAlarmTimeoutId = setTimeout(() => {
          window.testAlarmInProgress = false;
          testAlarmTimeoutId = null;
        }, 1000);
      } else {
        console.log('[TestAlarm] WebSocket request failed, falling back to direct creation');
        showUserWarning('테스트 알림', 'WebSocket 전송 실패, 직접 생성으로 전환합니다.');
        createDirectTestAlarm();
      }
    } else {
      console.log('[TestAlarm] WebSocket not available, using fallback methods');
      
      // 직접 생성 방식에서는 토스트 없이 바로 알림 표시 (중복 방지)
      // 실제 팔로워 알림이 표시되므로 별도 토스트 불필요

      // 모든 환경에서 클라이언트에서 직접 생성 (즉시 표시)
      createDirectTestAlarm();

      // Tauri 앱에서는 추가로 서버 API도 호출 (OBS와 동기화) - 비동기로 처리
      if (api.isTauri) {
        console.log('[TestAlarm] Tauri mode - also calling server API for OBS sync');

        // 비동기로 처리하여 UI 블로킹 방지
        fetch(`${baseUrl}/test-follower-get`, {
          method: 'GET',
        })
          .then(response => {
            console.log('[TestAlarm] Server API response status:', response.status);
            return response.ok ? response.json() : Promise.reject(`Status ${response.status}`);
          })
          .then(data => {
            console.log('[TestAlarm] Server API success for OBS sync:', data);
            // OBS 동기화 성공은 로그만 (실제 알림이 이미 표시됨)
          })
          .catch(error => {
            console.error('[TestAlarm] Server API failed:', error);
            // OBS 동기화 실패만 별도 토스트로 표시
            showUserWarning('OBS 동기화', 'OBS 동기화에 실패했지만 테스트 알림은 정상 작동합니다.');
          });
      }
    }

    // 1초 후 플래그 해제 (안전장치)
    if (testAlarmTimeoutId) {
      clearTimeout(testAlarmTimeoutId);
    }
    testAlarmTimeoutId = setTimeout(() => {
      window.testAlarmInProgress = false;
      testAlarmTimeoutId = null;
      console.log('[TestAlarm] Test alarm flag cleared (safety timeout)');
    }, 1000);
  }

  function createDirectTestAlarm() {
    const now = Date.now();
    const testFollower = {
      user: {
        userIdHash: `test_${now}`,
        nickname: '테스트 유저',
        profileImageUrl: '/default_profile.png',
      },
      followingSince: new Date().toISOString(),
    };

    console.log('[TestAlarm] Creating direct test notification:', testFollower.user.nickname);

    // 큐에 직접 추가 (중복 확인)
    if (!queue.some(q => q.user.userIdHash === testFollower.user.userIdHash)) {
      queue.push(testFollower);
      console.log('[TestAlarm] Test follower added to queue');

      // 즉시 처리
      processQueue();
    } else {
      console.log('[TestAlarm] Test follower already in queue, skipping');
    }
  }

  function copyOBSUrl() {
    const url = `http://localhost:${baseUrl.split(':')[2]}/follower`;
    navigator.clipboard.writeText(url);
    
    showUserSuccess('URL 복사 완료', 'OBS URL이 클립보드에 복사되었습니다.', {
      message: `현재 포트: ${baseUrl.split(':')[2]}\nOBS URL: ${url}\n\n💡 팁: 포트가 변경되면 이 URL도 업데이트됩니다.`
    });
  }

  function copyRedirectorPath() {
    // 동적으로 생성된 경로 사용
    const pathToCopy = userPath || 'scripts/obs-redirector.html';
    navigator.clipboard.writeText(pathToCopy);
    
    showUserSuccess('경로 복사 완료', '리다이렉터 파일 경로가 클립보드에 복사되었습니다.', {
      message: `리다이렉터 파일 경로: ${pathToCopy}\n\n사용법:\n1. OBS Studio에서 브라우저 소스 추가\n2. 이 경로를 URL에 붙여넣기\n3. 자동으로 Fazzk에 연결됩니다\n\n장점:\n- 포트가 변경되어도 자동으로 연결\n- 연결 상태 시각적 표시\n- OBS에서 URL 변경 불필요`
    });
  }

  function handleLogin() {
    if (api.isTauri) {
      push('/');
    } else {
      api.startLogin?.();
    }
  }

  // 메모리 정리 함수
  function triggerMemoryCleanup() {
    console.log('[MemoryCleanup] Manual cleanup triggered via keyboard shortcut');
    
    try {
      // 1. 메모리 모니터의 정리 기능 호출
      import('../lib/memoryMonitor.ts').then(({ memoryMonitor }) => {
        memoryMonitor.manualCleanup();
      });

      // 2. 앱별 정리 로직 실행
      const cleanupResult = triggerAppCleanup();

      // 3. 사용자에게 통합된 피드백 제공
      console.log('[MemoryCleanup] 메모리 정리가 완료되었습니다');
      showUserSuccess('메모리 정리 완료', '메모리 정리가 완료되었습니다.', {
        message: `정리 결과:\n• 이미지 캐시: ${cleanupResult.cleanedImages}개\n• 히스토리 항목: ${cleanupResult.cleanedHistory}개\n• 브라우저 캐시 정리 완료`
      });

    } catch (error) {
      console.error('[MemoryCleanup] Error during cleanup:', error);
      showUserError('메모리 정리 중 오류가 발생했습니다.');
    }
  }

  // 앱별 메모리 정리 로직
  function triggerAppCleanup() {
    try {
      // 1. 이미지 캐시 정리
      const images = document.querySelectorAll('img');
      let cleanedImages = 0;
      images.forEach(img => {
        if (img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src);
          cleanedImages++;
        }
      });

      // 2. 히스토리 데이터 정리 (오래된 항목 제거)
      const originalHistoryLength = history.length;
      if (history.length > 20) {
        history = history.slice(0, 20);
        saveHistoryToStorage();
      }
      const cleanedHistory = originalHistoryLength - history.length;

      // 3. 캐시된 데이터 정리
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            if (name.includes('old') || name.includes('temp')) {
              caches.delete(name);
            }
          });
        });
      }

      return {
        cleanedImages,
        cleanedHistory
      };

      // 4. 큐 정리
      if (queue.length > 10) {
        queue = queue.slice(0, 10);
      }

      console.log(`[MemoryCleanup] App cleanup completed:
        - Images cleaned: ${cleanedImages}
        - History items: ${originalHistoryLength} → ${history.length}
        - Queue items: ${queue.length}`);

    } catch (error) {
      console.error('[MemoryCleanup] Error during app cleanup:', error);
    }
  }

  function setupKeyboardShortcuts() {
    console.log('[Keyboard] Setting up keyboard shortcuts');

    // Remove existing event listener if any
    if (keyboardEventHandler) {
      document.removeEventListener('keydown', keyboardEventHandler);
      window.removeEventListener('keydown', keyboardEventHandler);
      if (document.body) {
        document.body.removeEventListener('keydown', keyboardEventHandler);
      }
    }

    keyboardEventHandler = event => {
      console.log('[Keyboard] Key event detected:', {
        key: event.key,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        target: event.target.tagName
      });

      // Ctrl+T: 테스트 알림
      if (event.ctrlKey && (event.key === 't' || event.key === 'T')) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[Keyboard] Test alarm triggered via Ctrl+T');
        testAlarm();
        return;
      }

      // Ctrl+S: 설정 토글
      if (event.ctrlKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[Keyboard] Settings toggled via Ctrl+S');
        showSettings = !showSettings;
        return;
      }

      // Ctrl+H: 히스토리 토글
      if (event.ctrlKey && (event.key === 'h' || event.key === 'H')) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[Keyboard] History toggled via Ctrl+H');
        showHistory = !showHistory;
        return;
      }

      // Ctrl+M: 메모리 모니터 토글
      if (event.ctrlKey && (event.key === 'm' || event.key === 'M')) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[Keyboard] Memory monitor toggled via Ctrl+M');
        showMemoryMonitor = !showMemoryMonitor;
        return;
      }

      // Ctrl+Shift+M: 메모리 정리 실행
      if (event.ctrlKey && event.shiftKey && (event.key === 'm' || event.key === 'M')) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[Keyboard] Memory cleanup triggered via Ctrl+Shift+M');
        triggerMemoryCleanup();
        return;
      }

      // Escape: 모달 닫기
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (showSettings) {
          console.log('[Keyboard] Settings closed via Escape');
          showSettings = false;
        } else if (showHistory) {
          console.log('[Keyboard] History closed via Escape');
          showHistory = false;
        } else if (showKeyboardHelp) {
          console.log('[Keyboard] Keyboard help closed via Escape');
          showKeyboardHelp = false;
        } else if (showMemoryMonitor) {
          console.log('[Keyboard] Memory monitor closed via Escape');
          showMemoryMonitor = false;
        }
        return;
      }
    };

    // 여러 곳에 이벤트 리스너 등록 (Tauri 환경에서 더 안정적)
    document.addEventListener('keydown', keyboardEventHandler, true); // capture phase
    window.addEventListener('keydown', keyboardEventHandler, true); // window level
    
    // 추가적으로 body에도 등록
    if (document.body) {
      document.body.addEventListener('keydown', keyboardEventHandler, true);
    }

    // 포커스 확인을 위한 클릭 이벤트 추가
    const ensureFocus = () => {
      if (document.activeElement !== document.body) {
        document.body.focus();
      }
    };
    
    document.addEventListener('click', ensureFocus);
    window.addEventListener('focus', ensureFocus);

    console.log('[Keyboard] Keyboard shortcuts registered:');
    console.log('  - Ctrl+T: 테스트 알림');
    console.log('  - Ctrl+S: 설정 열기/닫기');
    console.log('  - Ctrl+H: 히스토리 열기/닫기');
    console.log('  - Ctrl+M: 메모리 모니터 열기/닫기');
    console.log('  - Ctrl+Shift+M: 메모리 정리 실행');
    console.log('  - Escape: 모달 닫기');
    
    // 초기 포커스 설정
    setTimeout(() => {
      if (document.body) {
        document.body.focus();
        document.body.setAttribute('tabindex', '-1');
        console.log('[Keyboard] Initial focus set to body');
      }
    }, 100);
  }

  // OBS 모드에서 설정 동기화 - WebSocket 우선 사용
  function startSettingsSync() {
    // WebSocket이 연결되어 있으면 WebSocket 기반 동기화만 사용
    if (wsConnected) {
      console.log('[SettingsSync] Using WebSocket-based settings sync');
      return; // WebSocket 이벤트로 실시간 동기화됨
    }
    
    // WebSocket이 없는 경우에만 폴링 사용
    console.log('[SettingsSync] WebSocket not available, using polling fallback');
    
    // 중앙화된 설정 관리자가 있으면 사용
    if (settingsManager) {
      console.log('[SettingsSync] Using centralized settings manager for sync');
      
      // 30초마다 서버에서 설정 다시 로드
      if (settingsSyncIntervalId) {
        clearInterval(settingsSyncIntervalId);
      }
      
      settingsSyncIntervalId = setInterval(async () => {
        try {
          console.log('[SettingsSync] Syncing settings from server...');
          await settingsManager.loadFromServer();
        } catch (error) {
          console.error('[SettingsSync] Failed to sync settings from server:', error);
        }
      }, 30000);
      
      console.log('[SettingsSync] Centralized settings sync started (30s interval)');
      return;
    }
    
    // 폴백: 기존 폴링 방식
    console.log('[SettingsSync] Using legacy polling sync');
    startSettingsSyncLegacy();
  }

  // 기존 설정 동기화 방식 (폴백용)
  function startSettingsSyncLegacy() {
    let lastSettingsHash = null;
    let syncInProgress = false;

    const syncSettings = async () => {
      // 이미 동기화 중이면 스킵
      if (syncInProgress) {
        return;
      }

      syncInProgress = true;

      try {
        const res = await fetch(`${baseUrl}/settings?_t=${Date.now()}`);
        if (res.ok) {
          const serverSettings = await res.json();
          const currentHash = JSON.stringify(serverSettings);

          // 설정이 변경되었는지 확인 (해시 비교로 성능 최적화)
          if (lastSettingsHash !== null && lastSettingsHash !== currentHash) {
            console.log('[SettingsSync] Settings changed, updating...');

            // 설정 업데이트 (URL 파라미터가 없는 경우만)
            const params = new URLSearchParams(window.location.search);

            let settingsChanged = false;
            const settingsToUpdate = [
              { key: 'volume', param: 'volume', current: volume },
              { key: 'displayDuration', param: 'displayDuration', current: displayDuration },
              { key: 'animationType', param: 'animationType', current: animationType },
              {
                key: 'notificationLayout',
                param: 'notificationLayout',
                current: notificationLayout,
              },
              { key: 'textColor', param: 'textColor', current: textColor },
              { key: 'textSize', param: 'textSize', current: textSize },
            ];

            // 배치 업데이트로 성능 최적화
            settingsToUpdate.forEach(({ key, param, current }) => {
              if (
                !params.has(param) &&
                serverSettings[key] !== undefined &&
                current !== serverSettings[key]
              ) {
                switch (key) {
                  case 'volume':
                    volume = serverSettings[key];
                    break;
                  case 'displayDuration':
                    displayDuration = serverSettings[key];
                    break;
                  case 'animationType':
                    animationType = serverSettings[key];
                    break;
                  case 'notificationLayout':
                    notificationLayout = serverSettings[key];
                    break;
                  case 'textColor':
                    textColor = serverSettings[key];
                    break;
                  case 'textSize':
                    textSize = serverSettings[key];
                    break;
                }
                settingsChanged = true;
                console.log(`[SettingsSync] Updated ${key}:`, serverSettings[key]);
              }
            });

            // 스타일 재적용 (설정이 변경된 경우만)
            if (settingsChanged) {
              applyStyles();
              console.log('[SettingsSync] Settings synchronized and styles applied');
            }
          } else if (lastSettingsHash === null) {
            // 초기 로드 시에도 설정 적용
            console.log('[SettingsSync] Initial settings sync');
            applyStyles();
          }

          lastSettingsHash = currentHash;
        } else {
          console.warn('[SettingsSync] Failed to fetch settings, status:', res.status);
        }
      } catch (e) {
        console.error('[SettingsSync] Failed to sync settings:', e);
      } finally {
        syncInProgress = false;
      }
    };

    // 초기 설정 해시 저장
    syncSettings();

    // Clear existing interval
    if (settingsSyncIntervalId) {
      clearInterval(settingsSyncIntervalId);
    }

    // 30초마다 설정 동기화 확인 (WebSocket 폴백용으로 간격 늘림)
    settingsSyncIntervalId = setInterval(syncSettings, 30000);
    console.log('[SettingsSync] Fallback settings sync started (30s interval)');
  }
</script>

<div class="notifier-container" tabindex="-1" onclick={() => document.activeElement?.blur()}>
  <audio bind:this={audio} id="notificationSound" preload="auto"></audio>

  <!-- Session Banner Component -->
  <SessionBanner 
    {sessionError}
    {wsConnected}
    {wsReconnecting}
    {wsConnectionAttempts}
    {maxWSConnectionAttempts}
    {pollingEnabled}
    {pollingInterval}
    {handleLogin}
  />

  <!-- Notification Area Component -->
  <NotificationArea 
    {currentItem}
    {animationType}
    {notificationLayout}
    {textColor}
  />

  <!-- Bottom Navigation Component -->
  <BottomNavigation 
    bind:showHistory
    bind:showSettings
    {testAlarm}
  />

  <!-- Toast Container -->
  <ToastContainer position="top-right" maxToasts={3} />

  <!-- Settings Modal Component -->
  {#if showSettings}
    <div class="modal-overlay" onclick={() => (showSettings = false)}>
      <div class="settings-modal" onclick={(e) => e.stopPropagation()} style="width: 400px !important; max-width: 90vw !important;">
        <div class="modal-header">
          <h2>설정</h2>
          <div class="header-buttons">
            <button class="help-btn" onclick={() => (showKeyboardHelp = !showKeyboardHelp)} title="키보드 단축키">
              ❓
            </button>
            <button class="close-btn" onclick={() => (showSettings = false)}>×</button>
          </div>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label for="volume">알림 볼륨 ({Math.round(volume * 100)}%)</label>
            <input id="volume" type="range" min="0" max="1" step="0.1" bind:value={volume} />
          </div>
          
          <div class="form-group">
            <label for="polling">갱신 주기 ({pollingInterval}초)</label>
            <input id="polling" type="range" min="5" max="60" step="1" bind:value={pollingInterval} />
          </div>
          
          <div class="form-group">
            <label for="duration">알림 표시 시간 ({displayDuration}초)</label>
            <input id="duration" type="range" min="1" max="30" step="1" bind:value={displayDuration} />
          </div>
          
          <div class="form-group">
            <label class="toggle-switch">
              <input type="checkbox" bind:checked={enableTTS} />
              <span>TTS 음성 안내 켜기</span>
            </label>
          </div>
          
          <div class="form-group">
            <label for="sound">알림음 설정</label>
            <div class="file-select-group">
              <button class="btn btn-secondary" onclick={selectSoundFile}>파일 선택</button>
              <div class="file-path-display">
                {customSoundPath ? customSoundPath.split('\\').pop() : '기본 알림음'}
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label for="layout">알림 레이아웃</label>
            <select id="layout" class="form-control" bind:value={notificationLayout}>
              <option value="vertical">세로형 (기본)</option>
              <option value="horizontal">가로형 (넓은 직사각형)</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="animation">등장 효과</label>
            <select id="animation" class="form-control" bind:value={animationType}>
              <option value="fade">페이드 (기본)</option>
              <option value="slide-up">아래에서 위로</option>
              <option value="slide-down">위에서 아래로</option>
              <option value="bounce">바운스</option>
            </select>
          </div>

          <div class="form-group">
            <label for="textColor">텍스트 색상</label>
            <input id="textColor" type="color" bind:value={textColor} class="form-control" />
          </div>

          <div class="form-group">
            <label for="textSize">텍스트 크기 ({textSize}%)</label>
            <input id="textSize" type="range" min="50" max="200" step="10" bind:value={textSize} />
          </div>

          <div style="margin-top:20px; text-align:right;">
            <button class="btn btn-secondary" onclick={saveSettings}>저장</button>
          </div>

          <div class="obs-section">
            <p><strong>🔧 OBS 설정</strong></p>
            
            <div class="obs-method">
              <p class="method-title">방법 1: 직접 URL (현재 포트)</p>
              <div class="url-display">
                <code>{obsUrl}</code>
                <button class="copy-btn" onclick={copyOBSUrl}>복사</button>
              </div>
              <p class="method-note">⚠️ 포트 변경 시 OBS에서 URL을 다시 설정해야 합니다</p>
            </div>

            <div class="obs-method">
              <p class="method-title">방법 2: 리다이렉터 파일 (권장)</p>
              <div class="url-display">
                <code>{userPath || 'scripts/obs-redirector.html'}</code>
                <button class="copy-btn" onclick={copyRedirectorPath}>복사</button>
              </div>
              <p class="method-note">✅ 포트 변경 시에도 자동으로 연결됩니다</p>
            </div>

            <p class="size-recommendation">
              권장 OBS 브라우저 소스 크기: 800x400 (가로형/세로형 모두 적합)
            </p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- History Modal Component -->
  {#if showHistory}
    <div class="modal-overlay" onclick={() => (showHistory = false)}>
      <div class="history-modal" onclick={(e) => e.stopPropagation()} style="width: 370px !important; max-width: 90vw !important;">
        <div class="modal-header">
          <h2>알림 기록</h2>
          <button class="close-btn" onclick={() => (showHistory = false)}>×</button>
        </div>
        
        <div class="modal-body">
          {#if history.length === 0}
            <p class="empty-message">기록이 없습니다.</p>
          {:else}
            <div class="history-scroll-area">
              {#each history as item (item._id)}
                <div class="history-item">
                  <img src={item.user?.profileImageUrl || '/default_profile.png'} alt="Profile" class="profile-img" />
                  <div class="info">
                    <div class="nickname">{item.user?.nickname}</div>
                    <div class="time">{formatTime(item.followingSince || item.notifiedAt)}</div>
                  </div>
                </div>
              {/each}
            </div>
            
            <div class="history-footer">
              <button class="btn btn-secondary" onclick={clearHistory}>기록 지우기</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Keyboard Help Modal Component -->
  <KeyboardHelpModal bind:showKeyboardHelp />

  <!-- 메모리 사용량 모니터 -->
  {#if showMemoryMonitor}
    <MemoryIndicator showDetails={true} position="bottom-left" />
  {/if}
</div>

<style>
  .notifier-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding-top: 32px;
  }

  :global(body) {
    background: var(--body-bg, #121212);
    color: var(--text-color, white);
    font-family: 'Pretendard', sans-serif;
  }

  :global(:root) {
    --glass-bg: rgba(60, 60, 60, 0.95);
    --glass-border: rgba(255, 255, 255, 0.2);
    --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
    --primary-color: #00ffa3;
    --text-color: #ffffff;
    --body-bg: #121212;
    --modal-bg: rgba(20, 20, 20, 0.85);
  }

  /* OBS 모드 숨김 */
  :global(.obs-mode) {
    background: transparent !important;
  }

  /* 모달 스타일 - 최고 특이성으로 app.css 완전 오버라이드 */
  div.notifier-container div.modal-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(0, 0, 0, 0.8) !important;
    backdrop-filter: blur(5px) !important;
    z-index: 1999 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  div.notifier-container div.settings-modal,
  div.notifier-container div.history-modal,
  div.notifier-container div.keyboard-help-modal {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    transform: none !important;
    background: rgba(44, 62, 80, 0.95) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border-radius: 16px !important;
    width: 320px !important;
    max-width: 90vw !important;
    max-height: 80vh !important;
    color: white !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
    z-index: 2000 !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  div.notifier-container div.history-modal,
  div.notifier-container div.keyboard-help-modal {
    width: 300px !important;
  }

  .modal-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    padding: 20px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
    background: linear-gradient(135deg, #2c3e50, #34495e) !important;
    margin: 0 !important;
  }

  .modal-header h2 {
    margin: 0 !important;
    color: white !important;
    font-size: 1.5rem !important;
  }

  .header-buttons {
    display: flex;
    gap: 10px;
  }

  .help-btn,
  .close-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: var(--text-color);
    width: 35px;
    height: 35px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.3s ease;
    font-size: 16px;
  }

  .help-btn:hover,
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .modal-body {
    padding: 20px !important;
    max-height: calc(80vh - 80px) !important;
    overflow-y: auto !important;
    background: linear-gradient(135deg, #2c3e50, #34495e) !important;
    color: white !important;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block !important;
    color: white !important;
    margin-bottom: 8px !important;
    font-weight: 500 !important;
  }

  .form-group input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.2);
    outline: none;
  }

  .form-control {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-color);
    font-size: 14px;
  }

  .form-control:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    color: var(--text-color) !important;
  }

  .form-control option {
    background: rgba(44, 62, 80, 0.95) !important;
    color: var(--text-color) !important;
  }

  .form-control option:hover {
    background: rgba(44, 62, 80, 0.95) !important;
    color: var(--text-color) !important;
  }

  .toggle-switch {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .file-select-group {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
  }

  .btn-secondary {
    background: var(--primary-color);
    color: #000;
  }

  .btn-secondary:hover {
    opacity: 0.9;
  }

  .file-path-display {
    flex: 1;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
  }

  .obs-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .obs-section p {
    color: var(--text-color);
    margin: 10px 0;
  }

  .obs-method {
    margin-bottom: 15px;
  }

  .method-title {
    font-weight: 600;
    margin: 5px 0;
  }

  .url-display {
    display: flex;
    align-items: center;
    background: #333;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .url-display code {
    flex: 1;
    overflow: hidden;
    color: #fff;
    font-size: 12px;
  }

  .copy-btn {
    background: var(--primary-color);
    color: #000;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-left: 8px;
  }

  .copy-btn:hover {
    opacity: 0.9;
  }

  .method-note {
    font-size: 0.8rem;
    opacity: 0.7;
    margin: 0;
  }

  .size-recommendation {
    font-size: 0.85rem;
    opacity: 0.8;
    margin-top: 10px;
  }

  .empty-message {
    text-align: center;
    color: #888;
    font-style: italic;
    margin: 40px 0;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    transition: background 0.3s ease;
  }

  .history-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .history-item .profile-img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .history-item .info {
    flex: 1;
  }

  .history-item .nickname {
    color: var(--text-color);
    font-weight: 600;
    margin-bottom: 4px;
  }

  .history-item .time {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
  }

  .history-scroll-area {
    max-height: 300px; /* 약 6개 항목 높이 */
    overflow-y: auto;
    margin-bottom: 0;
  }

  .history-footer {
    text-align: right;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(135deg, #2c3e50, #34495e);
    position: sticky;
    bottom: 0;
  }

  .keyboard-shortcuts {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .shortcut-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .shortcut-key {
    background: rgba(0, 255, 163, 0.2);
    color: var(--primary-color);
    padding: 6px 12px;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    font-size: 0.9rem;
    border: 1px solid rgba(0, 255, 163, 0.3);
  }

  .shortcut-desc {
    flex: 1;
    margin-left: 16px;
    font-size: 0.95rem;
    color: var(--text-color);
  }

  .tip-message {
    text-align: center;
    font-size: 0.9rem;
    opacity: 0.7;
    color: var(--text-color);
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

</style>
