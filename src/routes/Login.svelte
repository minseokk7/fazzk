<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { api } from '../lib/api.ts';

  const isDev = import.meta.env.DEV;

  // Cleanup variables
  let updateCheckIntervalId = null;

  // State
  let helpVisible = $state(false);
  let manualVisible = $state(false);
  let cookieJson = $state('');

  // Update modal state
  let showUpdateModal = $state(false);
  let updateData = $state(null);
  let currentDownloadUrl = $state('');
  let isDownloading = $state(false);
  let downloadProgress = $state(0);
  let currentAppVersion = $state('3.0.0'); // 기본값

  onMount(async () => {
    // 다크 테마를 기본으로 설정
    document.documentElement.setAttribute('data-theme', 'dark');

    // 자동 로그인 이벤트 리스닝
    if (api.isTauri) {
      await api.listen('manual-login-success', event => {
        console.log('[Login] Manual login success', event.payload);
        push('/notifier');
      });
    }

    // 앱 버전 가져오기
    try {
      currentAppVersion = await api.getAppVersion();
      console.log('[Login] Current app version:', currentAppVersion);
    } catch (e) {
      console.error('[Login] Failed to get app version:', e);
    }

    // 업데이트 체크
    if (!isDev) {
      setTimeout(checkForUpdates, 2000);
      updateCheckIntervalId = setInterval(checkForUpdates, 30 * 60 * 1000);
    }
  });

  // Cleanup on component destroy
  onDestroy(() => {
    console.log('[Login] Component destroying, cleaning up resources');

    // Clear update check interval
    if (updateCheckIntervalId) {
      clearInterval(updateCheckIntervalId);
      updateCheckIntervalId = null;
      console.log('[Login] Update check interval cleared');
    }

    console.log('[Login] All resources cleaned up');
  });

  async function startLogin() {
    if (!api.isTauri) return;

    try {
      await api.invoke('check_auto_login');
      console.log('[Login] Auto login successful');
      push('/notifier');
    } catch (error) {
      console.log('[Login] Auto login failed:', error);
      alert(
        '저장된 로그인 정보가 없거나 만료되었습니다.\\n\\n확장 프로그램을 통해 로그인해 주세요.'
      );
    }
  }

  async function manualLogin() {
    if (!cookieJson.trim()) {
      alert('쿠키 JSON 값을 입력해주세요.');
      return;
    }

    let cookies;
    try {
      cookies = JSON.parse(cookieJson);
    } catch {
      alert('올바른 JSON 형식이 아닙니다.');
      return;
    }

    if (!cookies.NID_AUT || !cookies.NID_SES) {
      alert('NID_AUT 또는 NID_SES 값이 누락되었습니다.');
      return;
    }

    try {
      await api.manualLogin(cookies.NID_AUT, cookies.NID_SES);
    } catch (error) {
      alert('오류: ' + error.message);
    }
  }

  async function checkForUpdates() {
    if (isDev || !api.checkForUpdates) return;

    try {
      const result = await api.checkForUpdates();
      if (result.has_update) {
        updateData = result;
        currentDownloadUrl = result.download_url;
      } else {
        updateData = null;
      }
    } catch (e) {
      console.error('[Update] Check failed:', e);
    }
  }

  function openUpdateModal() {
    if (isDev) return;
    checkForUpdates();
    showUpdateModal = true;
  }

  async function startAutoUpdate() {
    if (!currentDownloadUrl || isDownloading) return;

    console.log('[Update] Starting auto update:', currentDownloadUrl);
    isDownloading = true;
    downloadProgress = 0; // 초기화

    // 진행률 이벤트 리스너 설정
    if (api.onUpdateProgress) {
      try {
        await api.onUpdateProgress(payload => {
          console.log('[Update] Progress received:', payload);

          // payload.percent 처리 - 더 관대한 검증
          let percent = payload?.percent;

          // 문자열로 온 경우 숫자로 변환 시도
          if (typeof percent === 'string') {
            percent = parseFloat(percent);
          }

          // 유효한 숫자인지 확인하고 범위 제한
          if (typeof percent === 'number' && !isNaN(percent) && isFinite(percent)) {
            downloadProgress = Math.round(Math.max(0, Math.min(100, percent)));
            console.log('[Update] Progress updated to:', downloadProgress + '%');
          } else {
            console.warn(
              '[Update] Invalid progress value received:',
              payload?.percent,
              'keeping current:',
              downloadProgress
            );
            // 유효하지 않은 값이면 현재 값 유지하되, 0이면 최소 진행 표시
            if (downloadProgress === 0) {
              downloadProgress = 5; // 5%로 설정하여 진행 중임을 표시
            }
          }

          // 진행률이 100%가 되면 잠시 대기 후 설치 메시지 표시
          if (downloadProgress >= 100) {
            setTimeout(() => {
              console.log('[Update] Download complete, installing...');
            }, 500);
          }
        });
        console.log('[Update] Progress listener setup complete');
      } catch (e) {
        console.error('[Update] Failed to setup progress listener:', e);
      }
    }

    try {
      console.log('[Update] Starting download...');
      await api.downloadUpdate(currentDownloadUrl);
      console.log('[Update] Download and install completed');

      // 업데이트 성공 시 상태 초기화
      downloadProgress = 100;
      setTimeout(() => {
        isDownloading = false;
        downloadProgress = 0;
        console.log('[Update] Update process completed successfully');
      }, 1000);
    } catch (e) {
      console.error('Auto update failed:', e);
      alert('자동 업데이트 실패: ' + e);
      isDownloading = false;
      downloadProgress = 0;
    }
  }
</script>

<div class="login-container">
  <!-- 업데이트 알림 버튼 -->
  {#if !isDev}
    <button class="update-notify-btn" onclick={openUpdateModal}>
      {#if updateData}
        <div class="update-notify-badge">
          <span class="update-notify-ping"></span>
          <span class="update-notify-dot"></span>
        </div>
      {/if}
      <div class="update-notify-content">
        <div class="update-notify-icon">
          <svg stroke="currentColor" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            ></path>
          </svg>
          <div class="update-notify-icon-glow"></div>
        </div>
        <div class="update-notify-text">
          <span class="update-notify-title">업데이트</span>
          <span class="update-notify-subtitle">클릭하여 확인</span>
        </div>
        <div class="update-notify-dots">
          <div class="dot dot-1"></div>
          <div class="dot dot-2"></div>
          <div class="dot dot-3"></div>
        </div>
      </div>
      <div class="update-notify-overlay"></div>
    </button>
  {/if}

  <!-- 메인 컨테이너 -->
  <div class="container">
    <h1>🎮 Fazzk</h1>
    <p class="subtitle">실시간 팔로워 알림을 받아보세요</p>

    <button class="login-btn" onclick={startLogin}> 치지직 로그인 </button>

    <div class="help-toggle">
      <button class="toggle-btn" onclick={() => (helpVisible = !helpVisible)}>
        📖 사용방법 {helpVisible ? '숨기기' : '보기'}
      </button>
    </div>

    <div class="help-content" class:show={helpVisible}>
      <h3>📌 사용방법</h3>
      <ol>
        <li>
          <strong>로그인:</strong> 위의 "치지직 로그인" 버튼을 클릭하여 네이버 계정으로 로그인하세요.
        </li>
        <li>
          <strong>알림 확인:</strong> 로그인 후 자동으로 알림 화면으로 이동합니다. 새로운 팔로워가 생기면
          실시간으로 알림이 표시됩니다.
        </li>
        <li>
          <strong>OBS 연동:</strong> OBS에서 브라우저 소스를 추가하고 URL을
          <code>http://127.0.0.1:3001/follower</code>로 설정하세요.
        </li>
        <li>
          <strong>테스트:</strong> 알림 화면에서 "테스트 알림" 버튼을 클릭하여 알림이 제대로 작동하는지
          확인할 수 있습니다.
        </li>
        <li>
          <strong>설정:</strong> 알림 화면 우측 상단의 톱니바퀴 아이콘을 클릭하여 TTS 및 알림 설정을 변경할
          수 있습니다.
        </li>
      </ol>
    </div>

    <div class="help-toggle" style="margin-top: 10px;">
      <button
        class="toggle-btn"
        onclick={() => (manualVisible = !manualVisible)}
        style="font-size: 12px; padding: 8px 16px; opacity: 0.7;"
      >
        🔧 수동 로그인 (문제 해결용)
      </button>
    </div>

    <div class="manual-login-content" class:show={manualVisible}>
      <div class="input-group">
        <label for="cookie-json">쿠키 JSON (확장프로그램에서 복사한 값)</label>
        <textarea
          id="cookie-json"
          bind:value={cookieJson}
          class="form-control"
          rows="5"
          placeholder="&lbrace;&quot;NID_AUT&quot;: &quot;...&quot;, &quot;NID_SES&quot;: &quot;...&quot;&rbrace;"
        ></textarea>
      </div>
      <button class="login-btn" onclick={manualLogin} style="width:100%"> 로그인 적용 </button>
    </div>
  </div>

  <!-- 업데이트 모달 -->
  {#if showUpdateModal}
    <div class="update-modal">
      <div
        class="update-modal-backdrop"
        role="button"
        tabindex="0"
        aria-label="업데이트 모달 닫기"
        onclick={() => (showUpdateModal = false)}
        onkeydown={e => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault();
            showUpdateModal = false;
          }
        }}
      ></div>
      <div class="update-modal-content">
        <div class="update-modal-glow-left"></div>
        <div class="update-modal-glow-right"></div>

        <div class="update-modal-inner">
          <div class="update-header">
            <div class="update-icon-wrapper">
              <div class="update-icon-glow"></div>
              <div class="update-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
              </div>
            </div>
            <div class="update-title-wrapper">
              <h3 class="update-title">
                {updateData ? '새 업데이트 가능' : '최신 버전 사용 중'}
              </h3>
              <p class="update-version">
                {#if updateData}
                  {updateData.current_version} → {updateData.latest_version}
                {:else}
                  v{currentAppVersion}
                {/if}
              </p>
            </div>
            {#if updateData}
              <div class="update-badge">
                <span class="update-badge-dot"></span>
                New
              </div>
            {/if}
          </div>

          <div class="update-notes">
            <div class="update-notes-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <p>
              {updateData
                ? updateData.release_notes?.split('\n')[0] || '성능 개선 및 버그 수정'
                : '현재 최신 버전을 사용 중입니다.'}
            </p>
          </div>

          {#if isDownloading}
            <div class="modal-progress-container">
              <div class="modal-progress-text">
                <span
                  >{downloadProgress < 100
                    ? '업데이트 다운로드 중...'
                    : '업데이트 설치 중...'}</span
                >
                <span>{isNaN(downloadProgress) ? 0 : downloadProgress}%</span>
              </div>
              <div class="modal-progress-bar">
                <div
                  class="modal-progress-fill"
                  style="width: {isNaN(downloadProgress) ? 0 : downloadProgress}%"
                ></div>
              </div>
            </div>
          {:else}
            <div class="update-buttons">
              <button class="update-btn-primary" onclick={startAutoUpdate} disabled={!updateData}>
                <span>자동 업데이트</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  ></path>
                </svg>
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    padding-top: 52px;
  }

  :global(body) {
    font-family: 'Pretendard', sans-serif;
    background: var(--bg-color);
    color: var(--text-color);
    transition: background 0.3s ease;
  }

  :global(:root) {
    /* 다크 모드가 기본 */
    --bg-color: #1a1a1a;
    --container-bg: rgba(30, 40, 45, 0.9);
    --container-border: rgba(0, 255, 163, 0.3);
    --text-color: #5ce1b0;
    --text-secondary: #888;
    --primary-color: #5ce1b0;
    --btn-text: #1a1a1a;
  }

  .container {
    text-align: center;
    background: var(--container-bg);
    backdrop-filter: blur(10px);
    padding: 60px 80px;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--container-border);
    max-width: 600px;
    width: 100%;
    transition: all 0.3s ease;
  }

  h1 {
    font-size: 48px;
    font-weight: 900;
    margin-bottom: 10px;
    text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
    color: #5ce1b0;
  }

  .subtitle {
    font-size: 18px;
    opacity: 0.9;
    margin-bottom: 40px;
    color: var(--text-secondary);
  }

  .login-btn {
    background: #5ce1b0;
    color: #1a1a1a;
    border: none;
    padding: 16px 48px;
    font-size: 18px;
    font-weight: bold;
    border-radius: 50px;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 8px 20px rgba(0, 255, 163, 0.4);
    font-family: 'Pretendard', sans-serif;
  }

  .login-btn:hover {
    filter: brightness(0.9);
    transform: translateY(-2px);
    box-shadow: 0 12px 30px rgba(0, 255, 163, 0.6);
  }

  .help-toggle {
    margin-top: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .toggle-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid var(--container-border);
    color: var(--text-color);
    padding: 10px 24px;
    border-radius: 25px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
    font-family: 'Pretendard', sans-serif;
  }

  .toggle-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: var(--primary-color);
  }

  .help-content {
    margin-top: 20px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 15px;
    text-align: left;
    max-height: 0;
    padding: 0 24px;
    overflow: hidden;
    transition:
      max-height 0.3s ease-out,
      padding 0.3s ease-out;
  }

  .help-content.show {
    max-height: 600px;
    padding: 24px;
  }

  .help-content h3 {
    font-size: 20px;
    margin-bottom: 16px;
    color: #00ffa3;
  }

  .help-content ol {
    margin-left: 20px;
    line-height: 1.8;
    color: var(--text-color);
  }

  .help-content li {
    margin-bottom: 12px;
    color: var(--text-color);
  }

  .help-content code {
    background: rgba(0, 0, 0, 0.3);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
  }

  .help-content strong {
    color: #00ffa3;
  }

  .manual-login-content {
    margin-top: 20px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 15px;
    padding: 0 24px;
    max-height: 0;
    overflow: hidden;
    transition: all 0.3s ease-out;
    text-align: left;
  }

  .manual-login-content.show {
    max-height: 400px;
    padding: 24px;
  }

  .input-group {
    margin-bottom: 15px;
  }

  .input-group label {
    display: block;
    margin-bottom: 5px;
    font-size: 14px;
    color: #aaa;
  }

  .input-group textarea {
    width: 100%;
    padding: 10px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: white;
    font-family: monospace;
    resize: vertical;
  }

  /* 업데이트 관련 스타일 */
  /* (start.html의 스타일을 그대로 가져옴) */
  /* 업데이트 알림 버튼 스타일 (HTML 버전과 동일) */
  .update-notify-btn {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 9999;
    -webkit-app-region: no-drag;
    background: #1e2730;
    border: 1px solid rgba(0, 255, 163, 0.2);
    border-radius: 16px;
    padding: 12px 20px;
    cursor: pointer;
    box-shadow: none;
    transition: all 0.3s ease;
    overflow: visible;
  }

  /* 라이트 모드 버튼 스타일 (HTML 버전과 동일) */
  :global(html:not([data-theme='dark'])) .update-notify-btn {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(102, 126, 234, 0.3);
    box-shadow: none;
  }

  :global(html:not([data-theme='dark'])) .update-notify-btn .update-notify-title {
    color: #333;
  }

  :global(html:not([data-theme='dark'])) .update-notify-btn .update-notify-subtitle {
    color: #667eea;
  }

  :global(html:not([data-theme='dark'])) .update-notify-icon {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  :global(html:not([data-theme='dark'])) .update-notify-dots .dot {
    background: #667eea;
  }

  :global(html:not([data-theme='dark'])) .update-notify-btn:hover {
    box-shadow: inset 0 0 20px rgba(102, 126, 234, 0.2);
    border-color: rgba(102, 126, 234, 0.4);
    transform: translateY(0);
  }

  /* 다크 모드 버튼 스타일 */
  :global([data-theme='dark']) .update-notify-btn {
    background: #1e2730;
    border-color: rgba(0, 255, 163, 0.2);
    box-shadow: none;
  }

  :global([data-theme='dark']) .update-notify-btn .update-notify-title {
    color: white;
  }

  :global([data-theme='dark']) .update-notify-btn .update-notify-subtitle {
    color: rgba(0, 255, 163, 0.8);
  }

  :global([data-theme='dark']) .update-notify-icon {
    background: linear-gradient(135deg, #00ffa3 0%, #00cc82 100%);
  }

  :global([data-theme='dark']) .update-notify-dots .dot {
    background: #00ffa3;
  }

  .update-notify-btn:hover {
    transform: translateY(0);
    box-shadow: inset 0 0 20px rgba(0, 255, 163, 0.2);
    border-color: rgba(0, 255, 163, 0.4);
  }

  :global([data-theme='dark']) .update-notify-btn:hover {
    box-shadow: inset 0 0 20px rgba(0, 255, 163, 0.2);
    border-color: rgba(0, 255, 163, 0.4);
  }

  .update-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .update-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
  }

  /* 업데이트 모달 스타일 (HTML 버전과 동일) */
  .update-modal-content {
    position: relative;
    width: 400px;
    background: #1e2730;
    border-radius: 20px;
    box-shadow: 0 25px 50px -12px rgba(0, 255, 163, 0.2);
    overflow: hidden;
    animation: modalSlideIn 0.3s ease-out;
  }

  /* 라이트 모드 모달 스타일 (HTML 버전과 동일) */
  :global(html:not([data-theme='dark'])) .update-modal-content {
    background: #ffffff;
    box-shadow: 0 25px 50px -12px rgba(102, 126, 234, 0.3);
  }

  :global(html:not([data-theme='dark'])) .update-title {
    color: #1e293b;
  }

  :global(html:not([data-theme='dark'])) .update-version {
    color: #64748b;
  }

  :global(html:not([data-theme='dark'])) .update-notes {
    background: #f1f5f9;
  }

  :global(html:not([data-theme='dark'])) .update-notes p {
    color: #475569;
  }

  :global(html:not([data-theme='dark'])) .update-icon {
    background: #e2e8f0;
  }

  :global(html:not([data-theme='dark'])) .update-icon svg {
    color: #667eea;
  }

  :global(html:not([data-theme='dark'])) .update-btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  :global(html:not([data-theme='dark'])) .update-btn-primary:hover:not(:disabled) {
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
  }

  :global(html:not([data-theme='dark'])) .modal-progress-text {
    color: #475569;
  }

  :global(html:not([data-theme='dark'])) .modal-progress-bar {
    background: #e2e8f0;
  }

  :global(html:not([data-theme='dark'])) .modal-progress-fill {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .update-modal-inner {
    position: relative;
    padding: 24px;
  }

  .update-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }

  .update-icon-wrapper {
    position: relative;
  }

  .update-icon {
    position: relative;
    width: 48px;
    height: 48px;
    background: #1e293b;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .update-icon svg {
    width: 24px;
    height: 24px;
    color: #00ffa3;
  }

  .update-title-wrapper {
    flex: 1;
  }

  .update-title {
    font-size: 18px;
    font-weight: 600;
    color: white;
    margin-bottom: 4px;
  }

  .update-version {
    font-size: 14px;
    color: #64748b;
  }

  .update-notes {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: #151b23;
    border-radius: 12px;
    margin-bottom: 20px;
  }

  .update-notes-icon {
    width: 24px;
    height: 24px;
    background: rgba(0, 255, 163, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .update-notes-icon svg {
    width: 14px;
    height: 14px;
    color: #00ffa3;
  }

  .update-notes p {
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .update-buttons {
    display: flex;
    gap: 12px;
  }

  .update-btn-primary {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 20px;
    background: linear-gradient(135deg, #00ffa3 0%, #00cc82 100%);
    border: none;
    border-radius: 12px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .update-btn-primary svg {
    width: 16px;
    height: 16px;
  }

  /* 추가 스타일들 (간략화) */
  .update-notify-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .update-notify-ping {
    position: absolute;
    width: 100%;
    height: 100%;
    background: #f87171;
    border-radius: 50%;
    animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    opacity: 0.75;
  }

  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  .update-notify-dot {
    position: relative;
    width: 16px;
    height: 16px;
    background: #ef4444;
    border-radius: 50%;
  }

  .update-notify-content {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
  }

  .update-notify-icon {
    position: relative;
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #00ffa3 0%, #00cc82 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .update-notify-icon svg {
    width: 20px;
    height: 20px;
    color: white;
  }

  .update-notify-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .update-notify-title {
    font-size: 14px;
    font-weight: 600;
    color: white;
  }

  .update-notify-subtitle {
    font-size: 10px;
    color: rgba(0, 255, 163, 0.8);
  }

  .update-notify-dots {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .update-notify-dots .dot {
    width: 6px;
    height: 6px;
    background: #00ffa3;
    border-radius: 50%;
  }

  .update-notify-dots .dot-2 {
    opacity: 0.5;
  }

  .update-notify-dots .dot-3 {
    opacity: 0.3;
  }

  /* Modal Progress Styles */
  .modal-progress-container {
    margin-top: 16px;
  }

  .modal-progress-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 14px;
    color: #94a3b8;
  }

  .modal-progress-bar {
    width: 100%;
    height: 8px;
    background: #1e293b;
    border-radius: 4px;
    overflow: hidden;
  }

  .modal-progress-fill {
    height: 100%;
    background: linear-gradient(135deg, #00ffa3 0%, #00cc82 100%);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
</style>
