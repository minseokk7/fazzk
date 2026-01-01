<!--
  연결 상태를 표시하는 컴포넌트
-->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { connectionManager } from '../lib/connectionManager';
  import { createLogger } from '../lib/logger';

  const log = createLogger('ConnectionStatus');

  // Props
  let { 
    position = 'top-left', // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    showDetails = false, // 상세 정보 표시 여부
    showMetrics = false, // 메트릭 표시 여부
    autoHide = true, // 연결 시 자동 숨김
    compact = false // 컴팩트 모드
  } = $props();

  // State
  let connectionState = $state(null);
  let metrics = $state(null);
  let showPanel = $state(false);
  let removeStateListener = null;
  let removeMetricsListener = null;

  // 상태별 스타일
  const statusStyles = {
    connected: {
      color: '#10b981',
      bgColor: '#d1fae5',
      icon: '●',
      text: '연결됨'
    },
    connecting: {
      color: '#f59e0b',
      bgColor: '#fef3c7',
      icon: '◐',
      text: '연결 중...'
    },
    reconnecting: {
      color: '#f59e0b',
      bgColor: '#fef3c7',
      icon: '↻',
      text: '재연결 중...'
    },
    disconnected: {
      color: '#6b7280',
      bgColor: '#f3f4f6',
      icon: '○',
      text: '연결 해제'
    },
    error: {
      color: '#ef4444',
      bgColor: '#fee2e2',
      icon: '✕',
      text: '연결 오류'
    }
  };

  // 현재 상태 스타일
  let currentStyle = $derived(statusStyles[connectionState?.status] || statusStyles.disconnected);

  // 표시 여부 결정
  let shouldShow = $derived(!autoHide || (connectionState?.status !== 'connected'));

  // 컴포넌트 마운트
  onMount(() => {
    // 연결 상태 리스너
    removeStateListener = connectionManager.addListener((state) => {
      connectionState = state;
      log.debug('Connection state updated:', state.status);
    });

    // 메트릭 리스너
    removeMetricsListener = connectionManager.addMetricsListener((newMetrics) => {
      metrics = newMetrics;
    });
  });

  // 컴포넌트 언마운트
  onDestroy(() => {
    if (removeStateListener) removeStateListener();
    if (removeMetricsListener) removeMetricsListener();
  });

  // 강제 재연결
  function forceReconnect() {
    log.info('Force reconnect requested');
    connectionManager.forceReconnect();
  }

  // 재연결 취소
  function cancelReconnect() {
    log.info('Reconnect cancelled');
    connectionManager.cancelReconnect();
  }

  // 패널 토글
  function togglePanel() {
    showPanel = !showPanel;
  }

  // 시간 포맷팅
  function formatTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString();
  }

  // 지속시간 포맷팅
  function formatDuration(ms) {
    if (!ms) return '-';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  }

  // 안정성 색상
  function getReliabilityColor(reliability) {
    if (reliability >= 95) return '#10b981';
    if (reliability >= 85) return '#f59e0b';
    return '#ef4444';
  }
</script>

{#if shouldShow && connectionState}
  <div 
    class="connection-status {position}"
    class:compact
    class:with-panel={showPanel}
  >
    <!-- 상태 표시 -->
    <div 
      class="status-indicator"
      style="
        color: {currentStyle.color};
        background-color: {currentStyle.bgColor};
      "
      onclick={togglePanel}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === 'Enter' && togglePanel()}
      title="연결 상태: {currentStyle.text}"
    >
      <span class="status-icon" class:spinning={connectionState.status === 'connecting' || connectionState.status === 'reconnecting'}>
        {currentStyle.icon}
      </span>
      
      {#if !compact}
        <span class="status-text">
          {currentStyle.text}
        </span>
      {/if}

      {#if connectionState.status === 'reconnecting'}
        <span class="reconnect-count">
          {connectionState.reconnectAttempts}/{connectionState.maxReconnectAttempts}
        </span>
      {/if}

      {#if connectionState.latency && connectionState.status === 'connected'}
        <span class="latency">
          {Math.round(connectionState.latency)}ms
        </span>
      {/if}
    </div>

    <!-- 상세 패널 -->
    {#if showPanel}
      <div class="status-panel">
        <!-- 기본 정보 -->
        <div class="panel-section">
          <h4>연결 상태</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">상태:</span>
              <span class="value" style="color: {currentStyle.color};">
                {currentStyle.text}
              </span>
            </div>
            
            {#if connectionState.lastConnected}
              <div class="info-item">
                <span class="label">마지막 연결:</span>
                <span class="value">{formatTime(connectionState.lastConnected)}</span>
              </div>
            {/if}
            
            {#if connectionState.lastDisconnected}
              <div class="info-item">
                <span class="label">마지막 해제:</span>
                <span class="value">{formatTime(connectionState.lastDisconnected)}</span>
              </div>
            {/if}
            
            {#if connectionState.latency}
              <div class="info-item">
                <span class="label">지연시간:</span>
                <span class="value">{Math.round(connectionState.latency)}ms</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- 에러 정보 -->
        {#if connectionState.error}
          <div class="panel-section">
            <h4>오류 정보</h4>
            <div class="error-message">
              {connectionState.error}
            </div>
          </div>
        {/if}

        <!-- 서버 정보 -->
        {#if connectionState.serverInfo}
          <div class="panel-section">
            <h4>서버 정보</h4>
            <div class="info-grid">
              {#if connectionState.serverInfo.version}
                <div class="info-item">
                  <span class="label">버전:</span>
                  <span class="value">{connectionState.serverInfo.version}</span>
                </div>
              {/if}
              
              {#if connectionState.serverInfo.clientCount}
                <div class="info-item">
                  <span class="label">클라이언트:</span>
                  <span class="value">{connectionState.serverInfo.clientCount}개</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- 메트릭 -->
        {#if showMetrics && metrics}
          <div class="panel-section">
            <h4>연결 통계</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">총 연결:</span>
                <span class="value">{metrics.totalConnections}회</span>
              </div>
              
              <div class="info-item">
                <span class="label">재연결:</span>
                <span class="value">{metrics.totalReconnects}회</span>
              </div>
              
              <div class="info-item">
                <span class="label">업타임:</span>
                <span class="value">{formatDuration(metrics.uptime)}</span>
              </div>
              
              <div class="info-item">
                <span class="label">안정성:</span>
                <span 
                  class="value" 
                  style="color: {getReliabilityColor(metrics.reliability)};"
                >
                  {Math.round(metrics.reliability)}%
                </span>
              </div>
              
              {#if metrics.averageLatency > 0}
                <div class="info-item">
                  <span class="label">평균 지연:</span>
                  <span class="value">{Math.round(metrics.averageLatency)}ms</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- 액션 버튼 -->
        <div class="panel-actions">
          {#if connectionState.status === 'reconnecting'}
            <button class="btn btn-secondary" onclick={cancelReconnect}>
              재연결 취소
            </button>
          {:else if connectionState.status === 'disconnected' || connectionState.status === 'error'}
            <button class="btn btn-primary" onclick={forceReconnect}>
              다시 연결
            </button>
          {/if}
          
          <button class="btn btn-secondary" onclick={togglePanel}>
            닫기
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .connection-status {
    position: fixed;
    z-index: 1000;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .connection-status.top-left {
    top: 20px;
    left: 20px;
  }

  .connection-status.top-right {
    top: 20px;
    right: 20px;
  }

  .connection-status.bottom-left {
    bottom: 20px;
    left: 20px;
  }

  .connection-status.bottom-right {
    bottom: 20px;
    right: 20px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 20px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(8px);
  }

  .status-indicator:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .connection-status.compact .status-indicator {
    padding: 6px 8px;
    border-radius: 50%;
    min-width: 32px;
    min-height: 32px;
    justify-content: center;
  }

  .status-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .status-icon.spinning {
    animation: spin 1s linear infinite;
  }

  .status-text {
    white-space: nowrap;
  }

  .reconnect-count {
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .latency {
    font-size: 0.75rem;
    opacity: 0.7;
    background: rgba(0, 0, 0, 0.1);
    padding: 2px 6px;
    border-radius: 10px;
  }

  .status-panel {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 8px;
    min-width: 300px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
    overflow: hidden;
    animation: slideDown 0.2s ease;
  }

  .connection-status.top-right .status-panel,
  .connection-status.bottom-right .status-panel {
    left: auto;
    right: 0;
  }

  .connection-status.bottom-left .status-panel,
  .connection-status.bottom-right .status-panel {
    top: auto;
    bottom: 100%;
    margin-top: 0;
    margin-bottom: 8px;
  }

  .panel-section {
    padding: 16px;
    border-bottom: 1px solid #f3f4f6;
  }

  .panel-section:last-child {
    border-bottom: none;
  }

  .panel-section h4 {
    margin: 0 0 12px 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
  }

  .info-grid {
    display: grid;
    gap: 8px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8125rem;
  }

  .info-item .label {
    color: #6b7280;
    font-weight: 500;
  }

  .info-item .value {
    color: #374151;
    font-weight: 600;
  }

  .error-message {
    padding: 8px 12px;
    background: #fee2e2;
    color: #dc2626;
    border-radius: 6px;
    font-size: 0.8125rem;
    word-break: break-word;
  }

  .panel-actions {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: #f9fafb;
  }

  .btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-secondary {
    background: #e5e7eb;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #d1d5db;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes slideDown {
    0% {
      opacity: 0;
      transform: translateY(-10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 다크 모드 */
  @media (prefers-color-scheme: dark) {
    .status-panel {
      background: #1f2937;
      border-color: #374151;
      color: #f9fafb;
    }

    .panel-section {
      border-bottom-color: #374151;
    }

    .panel-section h4 {
      color: #f9fafb;
    }

    .info-item .label {
      color: #d1d5db;
    }

    .info-item .value {
      color: #f9fafb;
    }

    .error-message {
      background: #451a03;
      color: #fca5a5;
    }

    .panel-actions {
      background: #111827;
    }

    .btn-secondary {
      background: #374151;
      color: #f9fafb;
    }

    .btn-secondary:hover {
      background: #4b5563;
    }
  }

  /* 모바일 최적화 */
  @media (max-width: 640px) {
    .connection-status {
      left: 10px !important;
      right: 10px !important;
      top: 10px !important;
      bottom: auto !important;
    }

    .status-panel {
      left: 0;
      right: 0;
      min-width: auto;
    }

    .panel-actions {
      flex-direction: column;
    }
  }

  /* 접근성 */
  @media (prefers-reduced-motion: reduce) {
    .status-indicator {
      transition: none;
    }

    .status-indicator:hover {
      transform: none;
    }

    .status-icon.spinning {
      animation: none;
    }

    .status-panel {
      animation: none;
    }
  }
</style>