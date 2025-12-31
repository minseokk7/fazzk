<script>
  import { onMount, onDestroy } from 'svelte';
  import { memoryMonitor, formatBytes, getMemoryStatusColor, getMemoryStatusText } from '../lib/memoryMonitor.ts';

  export let showDetails = false;
  export let position = 'bottom-right'; // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
  export let compact = false;

  let memoryStats = { used: 0, total: 0, percentage: 0 };
  let unsubscribe;

  onMount(() => {
    // 메모리 모니터링 시작
    memoryMonitor.start();
    
    // 메모리 상태 구독
    const store = memoryMonitor.getStore();
    unsubscribe = store.subscribe(stats => {
      memoryStats = stats;
    });

    // 메모리 정리 이벤트 리스너
    const handleCleanupRequest = (event) => {
      console.log('[MemoryIndicator] Cleanup requested:', event.detail);
      // 여기서 앱별 정리 로직 실행
      triggerAppCleanup();
    };

    window.addEventListener('memory-cleanup-requested', handleCleanupRequest);

    return () => {
      window.removeEventListener('memory-cleanup-requested', handleCleanupRequest);
    };
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
    memoryMonitor.stop();
  });

  function triggerAppCleanup() {
    // 앱별 메모리 정리 로직
    try {
      // 1. 이미지 캐시 정리
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        if (img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src);
        }
      });

      // 2. 히스토리 데이터 정리 (오래된 항목 제거)
      window.dispatchEvent(new CustomEvent('cleanup-history', {
        detail: { maxItems: 20 }
      }));

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

      console.log('[MemoryIndicator] App cleanup completed');
    } catch (error) {
      console.error('[MemoryIndicator] Error during app cleanup:', error);
    }
  }

  function handleManualCleanup() {
    // 이 함수는 더 이상 사용되지 않음 (단축키로 대체)
    console.log('[MemoryIndicator] Manual cleanup should be triggered via Ctrl+Shift+M');
  }

  $: statusColor = getMemoryStatusColor(memoryStats.percentage);
  $: statusText = getMemoryStatusText(memoryStats.percentage);
</script>

<div class="memory-indicator {position}" class:compact class:show-details={showDetails}>
  <div class="memory-bar" style="--status-color: {statusColor}">
    <div class="memory-fill" style="width: {memoryStats.percentage}%"></div>
  </div>
  
  {#if !compact}
    <div class="memory-text">
      <span class="percentage">{memoryStats.percentage}%</span>
      <span class="status" style="color: {statusColor}">{statusText}</span>
    </div>
  {/if}

  {#if showDetails}
    <div class="memory-details">
      <div class="detail-row">
        <span>사용중:</span>
        <span>{formatBytes(memoryStats.used)}</span>
      </div>
      <div class="detail-row">
        <span>전체:</span>
        <span>{formatBytes(memoryStats.total)}</span>
      </div>
      {#if memoryStats.jsHeapSizeLimit}
        <div class="detail-row">
          <span>JS 힙:</span>
          <span>{formatBytes(memoryStats.usedJSHeapSize)} / {formatBytes(memoryStats.jsHeapSizeLimit)}</span>
        </div>
      {/if}
      <div class="shortcut-hint">
        Ctrl+Shift+M: 메모리 정리
      </div>
    </div>
  {/if}
</div>

<style>
  .memory-indicator {
    position: fixed;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    padding: 8px 12px;
    color: white;
    font-size: 12px;
    font-family: monospace;
    border: 1px solid rgba(255, 255, 255, 0.2);
    min-width: 120px;
  }

  .memory-indicator.compact {
    padding: 4px 8px;
    min-width: 80px;
  }

  /* 위치별 스타일 */
  .top-left { top: 10px; left: 10px; }
  .top-right { top: 10px; right: 10px; }
  .bottom-left { bottom: 10px; left: 10px; }
  .bottom-right { bottom: 10px; right: 10px; }

  .memory-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .memory-fill {
    height: 100%;
    background: var(--status-color);
    transition: width 0.3s ease, background-color 0.3s ease;
  }

  .memory-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .percentage {
    font-weight: bold;
  }

  .status {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: bold;
  }

  .memory-details {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 10px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2px;
  }

  .shortcut-hint {
    margin-top: 6px;
    padding: 4px 8px;
    background: rgba(0, 255, 163, 0.1);
    border: 1px solid rgba(0, 255, 163, 0.3);
    border-radius: 4px;
    color: #00ffa3;
    font-size: 9px;
    text-align: center;
    font-family: monospace;
  }

  /* 애니메이션 */
  .memory-indicator {
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>