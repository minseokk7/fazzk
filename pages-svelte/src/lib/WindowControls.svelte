<script>
  import { api } from "./api";

  const minimize = () => api.minimize();
  const toggleMaximize = () => api.toggleMaximize();
  const close = () => api.close();
</script>

{#if api.isTauri}
  <!-- Titlebar drag region -->
  <div class="titlebar-drag-region" data-tauri-drag-region></div>

  <!-- Window control buttons -->
  <div class="window-controls-container">
    <button
      class="window-control-btn minimize-btn"
      onclick={minimize}
      title="최소화"
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d="M0 5 L10 5"
          stroke="currentColor"
          stroke-width="1"
          fill="none"
        ></path>
      </svg>
    </button>
    <button
      class="window-control-btn maximize-btn"
      onclick={toggleMaximize}
      title="최대화/이전 크기"
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d="M1,1 H9 V9 H1 V1 Z"
          stroke="currentColor"
          stroke-width="1"
          fill="none"
        ></path>
      </svg>
    </button>
    <button class="window-control-btn close-btn" onclick={close} title="닫기">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d="M1,1 L9,9 M9,1 L1,9"
          stroke="currentColor"
          stroke-width="1"
          fill="none"
        ></path>
      </svg>
    </button>
  </div>
{/if}

<style>
  .titlebar-drag-region {
    position: fixed;
    top: 0;
    left: 0;
    right: 138px;
    height: 32px;
    -webkit-app-region: drag;
    z-index: 9998;
  }

  .window-controls-container {
    position: fixed;
    top: 0;
    right: 0;
    height: 32px;
    width: 138px;
    display: flex;
    flex-direction: row;
    z-index: 9999;
    -webkit-app-region: no-drag;
    background: transparent;
  }

  .window-control-btn {
    width: 46px;
    height: 32px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    padding: 0;
    margin: 0;
    transition: background-color 0.2s;
  }

  .window-control-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .window-control-btn.close-btn:hover {
    background-color: #e81123;
  }

  .window-control-btn svg {
    stroke: white;
    stroke-width: 1;
    fill: none;
  }
</style>
