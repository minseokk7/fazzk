<script>
  export let showSettings = false;
  export let showKeyboardHelp = false;
  export let volume = 0.5;
  export let pollingInterval = 15;
  export let displayDuration = 5;
  export let enableTTS = false;
  export let customSoundPath = null;
  export let notificationLayout = 'vertical';
  export let animationType = 'fade';
  export let textColor = '#ffffff';
  export let textSize = 100;
  export let obsUrl = '';
  export let userPath = '';
  
  export let selectSoundFile = () => {};
  export let saveSettings = () => {};
  export let copyOBSUrl = () => {};
  export let copyRedirectorPath = () => {};
</script>

{#if showSettings}
  <!-- 배경 오버레이 -->
  <div class="modal-overlay" 
       role="button" 
       tabindex="0"
       aria-label="모달 닫기"
       onclick={() => (showSettings = false)}
       onkeydown={(e) => {
         if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
           e.preventDefault();
           showSettings = false;
         }
       }}
  ></div>
  
  <!-- 모달 컨텐츠 -->
  <div class="settings-modal">
    <div class="settings-header">
      <h2>설정</h2>
      <div class="header-buttons">
        <button class="help-btn" onclick={() => (showKeyboardHelp = !showKeyboardHelp)} title="키보드 단축키">
          ❓
        </button>
        <button class="close-btn" onclick={() => (showSettings = false)}>×</button>
      </div>
    </div>
    
    <div class="settings-body">
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
          {#if notificationLayout === 'horizontal'}
            권장 OBS 브라우저 소스 크기: 600x150
          {:else}
            권장 OBS 브라우저 소스 크기: 300x350
          {/if}
        </p>
      </div>
    </div>
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
  .settings-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 20, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    width: 500px;
    max-width: 90vw;
    max-height: 90vh;
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

  .header-buttons {
    display: flex;
    gap: 10px;
  }

  .help-btn, .close-btn {
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
  }

  .help-btn:hover, .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .settings-body {
    padding: 20px;
    max-height: calc(90vh - 80px);
    overflow-y: auto;
    background: linear-gradient(135deg, #2c3e50, #34495e);
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    color: white;
    margin-bottom: 8px;
    font-weight: 500;
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
    color: white;
    font-size: 14px;
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
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.3);
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
    color: white;
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
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-left: 8px;
  }

  .copy-btn:hover {
    background: rgba(255, 255, 255, 0.3);
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
</style>