<!--
  로딩 상태를 표시하는 통합 컴포넌트
-->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { loadingManager } from '../lib/loadingManager';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';

  // Props
  let { 
    position = 'top-right', // 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'
    showOverlay = false, // 전체 화면 오버레이 표시 여부
    maxVisible = 3, // 최대 표시할 로딩 상태 수
    autoHide = true, // 로딩이 없을 때 자동 숨김
    showProgress = true, // 진행률 표시 여부
    showCancel = true, // 취소 버튼 표시 여부
    compact = false // 컴팩트 모드
  } = $props();

  // State
  let loadingStates = $state([]);
  let stats = $state(null);
  let visible = $state(false);
  let removeListener = null;
  let removeStatsListener = null;

  // 위치별 스타일 클래스
  const positionClasses = {
    'top-left': 'top-left',
    'top-right': 'top-right',
    'bottom-left': 'bottom-left',
    'bottom-right': 'bottom-right',
    'center': 'center'
  };

  // 표시할 로딩 상태들 (우선순위 및 개수 제한)
  let visibleStates = $derived(loadingStates.slice(0, maxVisible));
  let hasLoading = $derived(loadingStates.length > 0);
  let shouldShow = $derived(hasLoading && (!autoHide || visible));

  // 오버레이용 주요 로딩 상태
  let primaryLoading = $derived(loadingStates.find(state => state.priority === 'high') || loadingStates[0]);

  // 컴포넌트 마운트
  onMount(() => {
    // 로딩 상태 리스너 등록
    removeListener = loadingManager.addListener((states) => {
      loadingStates = states;
      visible = states.length > 0;
    });

    // 통계 리스너 등록
    removeStatsListener = loadingManager.addStatsListener((newStats) => {
      stats = newStats;
    });
  });

  // 컴포넌트 언마운트
  onDestroy(() => {
    if (removeListener) removeListener();
    if (removeStatsListener) removeStatsListener();
  });

  // 로딩 취소
  function cancelLoading(id) {
    loadingManager.cancel(id);
  }

  // 모든 로딩 취소
  function cancelAllLoading() {
    loadingStates.forEach(state => {
      if (state.cancellable) {
        loadingManager.cancel(state.id);
      }
    });
  }

  // 시간 포맷팅
  function formatDuration(startTime) {
    const duration = Date.now() - startTime;
    if (duration < 1000) return '방금';
    if (duration < 60000) return `${Math.floor(duration / 1000)}초`;
    return `${Math.floor(duration / 60000)}분`;
  }
</script>

<!-- 일반 로딩 인디케이터 -->
{#if shouldShow && !showOverlay}
  <div 
    class="loading-indicator {positionClasses[position]}"
    class:compact
    role="status"
    aria-live="polite"
  >
    <div class="indicator-content">
      <!-- 헤더 -->
      {#if !compact && (visibleStates.length > 1 || stats)}
        <div class="indicator-header">
          <span class="loading-count">
            {loadingStates.length}개 작업 진행 중
          </span>
          {#if stats && showCancel}
            <button 
              class="cancel-all-btn"
              onclick={cancelAllLoading}
              title="모든 작업 취소"
            >
              모두 취소
            </button>
          {/if}
        </div>
      {/if}

      <!-- 로딩 상태 목록 -->
      <div class="loading-list">
        {#each visibleStates as state (state.id)}
          <div class="loading-item" class:high-priority={state.priority === 'high'}>
            <div class="item-content">
              <!-- 스피너 -->
              <LoadingSpinner 
                size={compact ? 'small' : 'medium'} 
                color="primary"
              />
              
              <!-- 정보 -->
              <div class="item-info">
                <div class="item-message" title={state.message}>
                  {state.message}
                </div>
                
                {#if !compact}
                  <div class="item-meta">
                    <span class="item-duration">
                      {formatDuration(state.startTime)}
                    </span>
                    {#if state.category}
                      <span class="item-category">
                        {state.category}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- 진행률 -->
              {#if showProgress && state.progress !== undefined}
                <div class="item-progress">
                  <div class="progress-bar">
                    <div 
                      class="progress-fill"
                      style="width: {state.progress}%"
                    ></div>
                  </div>
                  <span class="progress-text">
                    {Math.round(state.progress)}%
                  </span>
                </div>
              {/if}

              <!-- 취소 버튼 -->
              {#if showCancel && state.cancellable}
                <button 
                  class="cancel-btn"
                  onclick={() => cancelLoading(state.id)}
                  title="취소"
                >
                  ✕
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- 더 많은 로딩이 있을 때 -->
      {#if loadingStates.length > maxVisible}
        <div class="more-indicator">
          +{loadingStates.length - maxVisible}개 더
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- 오버레이 모드 -->
{#if showOverlay && primaryLoading}
  <LoadingOverlay
    show={true}
    message={primaryLoading.message}
    progress={primaryLoading.progress}
    cancellable={primaryLoading.cancellable}
    onCancel={() => cancelLoading(primaryLoading.id)}
  />
{/if}

<style>
  .loading-indicator {
    position: fixed;
    max-width: 400px;
    min-width: 250px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  }

  .loading-indicator.compact {
    min-width: 200px;
    max-width: 300px;
  }

  /* 위치별 스타일 */
  .loading-indicator.top-left {
    top: 20px;
    left: 20px;
  }

  .loading-indicator.top-right {
    top: 20px;
    right: 20px;
  }

  .loading-indicator.bottom-left {
    bottom: 20px;
    left: 20px;
  }

  .loading-indicator.bottom-right {
    bottom: 20px;
    right: 20px;
  }

  .loading-indicator.center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .indicator-content {
    padding: 16px;
  }

  .indicator-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f3f4f6;
  }

  .loading-count {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
  }

  .cancel-all-btn {
    padding: 4px 8px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .cancel-all-btn:hover {
    background: #dc2626;
  }

  .loading-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .loading-item {
    display: flex;
    align-items: flex-start;
  }

  .loading-item.high-priority {
    background: #fef3c7;
    padding: 8px;
    border-radius: 6px;
    border-left: 3px solid #f59e0b;
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .item-info {
    flex: 1;
    min-width: 0;
  }

  .item-message {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .item-category {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .item-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 80px;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #3b82f6;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    min-width: 30px;
    text-align: right;
  }

  .cancel-btn {
    padding: 4px;
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    font-size: 0.875rem;
    line-height: 1;
  }

  .cancel-btn:hover {
    background: #f3f4f6;
    color: #ef4444;
  }

  .more-indicator {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #f3f4f6;
    text-align: center;
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }

  @keyframes slideIn {
    0% {
      opacity: 0;
      transform: translateY(-20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 다크 모드 */
  @media (prefers-color-scheme: dark) {
    .loading-indicator {
      background: #1f2937;
      border-color: #374151;
      color: #f9fafb;
    }

    .indicator-header {
      border-bottom-color: #374151;
    }

    .loading-count {
      color: #f9fafb;
    }

    .item-message {
      color: #f9fafb;
    }

    .item-meta {
      color: #d1d5db;
    }

    .item-category {
      background: #374151;
      color: #d1d5db;
    }

    .progress-bar {
      background: #374151;
    }

    .progress-text {
      color: #d1d5db;
    }

    .cancel-btn {
      color: #d1d5db;
    }

    .cancel-btn:hover {
      background: #374151;
      color: #ef4444;
    }

    .more-indicator {
      border-top-color: #374151;
      color: #d1d5db;
    }

    .loading-item.high-priority {
      background: #451a03;
      border-left-color: #f59e0b;
    }
  }

  /* 모바일 최적화 */
  @media (max-width: 640px) {
    .loading-indicator {
      left: 10px !important;
      right: 10px !important;
      max-width: none;
      min-width: auto;
    }

    .loading-indicator.center {
      left: 10px;
      right: 10px;
      transform: translateY(-50%);
    }

    .indicator-content {
      padding: 12px;
    }

    .item-content {
      gap: 8px;
    }

    .item-progress {
      min-width: 60px;
    }
  }

  /* 접근성 */
  @media (prefers-reduced-motion: reduce) {
    .loading-indicator {
      animation: none;
    }

    .progress-fill {
      transition: none;
    }
  }
</style>