<script>
  export let sessionError = false;
  export let wsConnected = false;
  export let wsReconnecting = false;
  export let wsConnectionAttempts = 0;
  export let maxWSConnectionAttempts = 5;
  export let pollingEnabled = true;
  export let pollingInterval = 15;
  export let handleLogin = () => {};
</script>

<div
  class="session-banner"
  class:error={sessionError && !wsConnected && !wsReconnecting}
  class:warning={wsReconnecting || (!wsConnected && !sessionError && pollingEnabled)}
  class:success={wsConnected}
>
  {#if wsConnected}
    🔗 실시간 연결됨 - 즉시 알림 활성화
  {:else if wsReconnecting}
    🔄 재연결 중... ({wsConnectionAttempts}/{maxWSConnectionAttempts})
  {:else if sessionError}
    ⚠️ 세션이 만료되었습니다. 다시 로그인해 주세요.
    <button onclick={handleLogin}>로그인</button>
  {:else if pollingEnabled}
    📡 폴링 모드 - 팔로워 알림 대기 중 (최대 {pollingInterval}초 지연)
  {:else}
    ⏸️ 대기 중...
  {/if}
</div>

<style>
  /* 세션 배너 */
  .session-banner {
    z-index: 1000;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 8px 16px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 500;
    color: white;
    background: linear-gradient(90deg, #4a90e2, #357abd);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    -webkit-app-region: drag;
    transition: all 0.3s ease;
  }

  .session-banner button {
    margin-left: 8px;
    -webkit-app-region: no-drag;
    background: white;
    color: #333;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .session-banner.error {
    color: white;
    background: linear-gradient(90deg, #ff5555, #ff7777);
  }

  .session-banner.success {
    color: white;
    background: linear-gradient(90deg, #00c853, #00e676);
  }

  .session-banner.warning {
    color: white;
    background: linear-gradient(90deg, #ff9800, #ffb74d);
  }

  /* OBS 모드 숨김 */
  :global(.obs-mode) .session-banner {
    display: none !important;
  }
</style>
