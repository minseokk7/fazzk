<script>
  export let showHistory = false;
  export let showSettings = false;
  export let testAlarm = () => {};
</script>

<div class="bottom-nav-wrapper">
  <div class="bottom-nav">
    <button class="nav-btn history-btn" onclick={() => (showHistory = !showHistory)} title="히스토리">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        ></path>
      </svg>
      <span>기록</span>
    </button>

    <button class="nav-btn test-btn" onclick={testAlarm} title="테스트 알림">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        ></path>
      </svg>
      <span>테스트</span>
    </button>

    <button class="nav-btn settings-btn" onclick={() => (showSettings = !showSettings)} title="설정">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        ></path>
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        ></path>
      </svg>
      <span>설정</span>
    </button>
  </div>
</div>

<style>
  .bottom-nav-wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .bottom-nav {
    display: flex;
    justify-content: center;
    gap: 20px;
    padding: 15px 20px;
    max-width: 600px;
    margin: 0 auto;
  }

  .nav-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 10px 15px;
    border-radius: 12px;
    transition: all 0.3s ease;
    min-width: 70px;
  }

  .nav-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
  }

  .nav-btn svg {
    width: 24px;
    height: 24px;
  }

  .nav-btn span {
    font-size: 0.8rem;
    font-weight: 500;
  }

  /* OBS 모드 숨김 */
  :global(.obs-mode) .bottom-nav-wrapper {
    display: none !important;
  }
</style>