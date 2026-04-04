<script>
  export let showKeyboardHelp = false;
</script>

{#if showKeyboardHelp}
  <!-- 배경 오버레이 -->
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    aria-label="모달 닫기"
    onclick={() => (showKeyboardHelp = false)}
    onkeydown={e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        showKeyboardHelp = false;
      }
    }}
  ></div>

  <!-- 모달 컨텐츠 -->
  <div class="keyboard-help-modal">
    <div class="settings-header">
      <h2>키보드 단축키</h2>
      <button class="close-btn" onclick={() => (showKeyboardHelp = false)}>×</button>
    </div>

    <div class="keyboard-shortcuts">
      <div class="shortcut-item">
        <div class="shortcut-key">Ctrl + T</div>
        <div class="shortcut-desc">테스트 알림 실행</div>
      </div>
      <div class="shortcut-item">
        <div class="shortcut-key">Ctrl + S</div>
        <div class="shortcut-desc">설정 열기/닫기</div>
      </div>
      <div class="shortcut-item">
        <div class="shortcut-key">Ctrl + H</div>
        <div class="shortcut-desc">히스토리 열기/닫기</div>
      </div>
      <div class="shortcut-item">
        <div class="shortcut-key">Ctrl + M</div>
        <div class="shortcut-desc">메모리 모니터 표시/숨김</div>
      </div>
      <div class="shortcut-item">
        <div class="shortcut-key">Ctrl + Shift + M</div>
        <div class="shortcut-desc">메모리 정리 실행</div>
      </div>
      <div class="shortcut-item">
        <div class="shortcut-key">Escape</div>
        <div class="shortcut-desc">모달 창 닫기</div>
      </div>
    </div>

    <div class="tip-message">💡 이 단축키들은 앱이 포커스된 상태에서 작동합니다</div>
  </div>
{/if}

<style>
  /* 배경 오버레이 */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: 1999;
  }

  /* 모달 컨텐츠 */
  .keyboard-help-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 20, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    width: 400px;
    max-width: 90vw;
    color: white;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    z-index: 2000;
    border: 1px solid rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(135deg, #2c3e50, #34495e);
  }

  .settings-header h2 {
    margin: 0;
    color: white;
    font-size: 1.5rem;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    width: 35px;
    height: 35px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.3s ease;
    font-size: 20px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .keyboard-shortcuts {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    background: linear-gradient(135deg, #2c3e50, #34495e);
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
    color: #00ffa3;
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
    color: white;
  }

  .tip-message {
    text-align: center;
    font-size: 0.9rem;
    opacity: 0.7;
    color: white;
    padding: 20px;
    background: linear-gradient(135deg, #2c3e50, #34495e);
  }
</style>
