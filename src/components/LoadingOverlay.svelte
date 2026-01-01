<!--
  전체 화면 로딩 오버레이 컴포넌트
-->
<script>
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // Props
  let { 
    show = false,
    message = '로딩 중...',
    progress = null, // 0-100 또는 null
    cancellable = false,
    onCancel = null,
    blur = true, // 배경 블러 효과
    opacity = 0.8, // 배경 투명도
    zIndex = 9999 // z-index 값
  } = $props();

  // 취소 핸들러
  function handleCancel() {
    if (cancellable && onCancel) {
      onCancel();
    }
    dispatch('cancel');
  }

  // ESC 키로 취소
  function handleKeydown(event) {
    if (event.key === 'Escape' && cancellable) {
      handleCancel();
    }
  }

  // 진행률 표시 여부
  let showProgress = $derived(progress !== null && progress !== undefined);
  let progressValue = $derived(Math.max(0, Math.min(100, progress || 0)));
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div 
    class="loading-overlay"
    class:blur
    style="
      background-color: rgba(0, 0, 0, {opacity});
      z-index: {zIndex};
    "
    role="dialog"
    aria-modal="true"
    aria-labelledby="loading-message"
    tabindex="0"
    onkeydown={handleKeydown}
  >
    <div class="loading-content">
      <!-- 로딩 스피너 -->
      <LoadingSpinner 
        size="large" 
        color="white" 
        label={message}
      />
      
      <!-- 메시지 -->
      <div id="loading-message" class="message">
        {message}
      </div>
      
      <!-- 진행률 바 -->
      {#if showProgress}
        <div class="progress-container">
          <div class="progress-bar">
            <div 
              class="progress-fill"
              style="width: {progressValue}%"
            ></div>
          </div>
          <div class="progress-text">
            {Math.round(progressValue)}%
          </div>
        </div>
      {/if}
      
      <!-- 취소 버튼 -->
      {#if cancellable}
        <button 
          class="cancel-button"
          onclick={handleCancel}
          type="button"
        >
          취소
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: none;
    transition: all 0.2s ease;
  }

  .loading-overlay.blur {
    backdrop-filter: blur(4px);
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    max-width: 400px;
    width: 90%;
    text-align: center;
    animation: fadeInScale 0.3s ease;
  }

  .message {
    font-size: 1.125rem;
    font-weight: 500;
    color: #374151;
    line-height: 1.5;
  }

  .progress-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #1d4ed8);
    border-radius: 4px;
    transition: width 0.3s ease;
    position: relative;
  }

  .progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    animation: shimmer 2s infinite;
  }

  .progress-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-align: center;
  }

  .cancel-button {
    padding: 0.75rem 1.5rem;
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .cancel-button:hover {
    background: #4b5563;
    transform: translateY(-1px);
  }

  .cancel-button:active {
    transform: translateY(0);
  }

  .cancel-button:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(107, 114, 128, 0.3);
  }

  @keyframes fadeInScale {
    0% {
      opacity: 0;
      transform: scale(0.9) translateY(20px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  /* 다크 모드 지원 */
  @media (prefers-color-scheme: dark) {
    .loading-content {
      background: rgba(31, 41, 55, 0.95);
      color: #f9fafb;
    }

    .message {
      color: #f9fafb;
    }

    .progress-bar {
      background: #374151;
    }

    .progress-text {
      color: #d1d5db;
    }
  }

  /* 모바일 최적화 */
  @media (max-width: 640px) {
    .loading-content {
      padding: 1.5rem;
      margin: 1rem;
    }

    .message {
      font-size: 1rem;
    }

    .cancel-button {
      padding: 0.625rem 1.25rem;
      font-size: 0.8125rem;
    }
  }

  /* 접근성: 애니메이션 감소 설정 시 */
  @media (prefers-reduced-motion: reduce) {
    .loading-overlay {
      transition: none;
    }

    .loading-content {
      animation: none;
    }

    .progress-fill {
      transition: none;
    }

    .progress-fill::after {
      animation: none;
    }

    .cancel-button {
      transition: none;
    }

    .cancel-button:hover {
      transform: none;
    }

    .cancel-button:active {
      transform: none;
    }
  }
</style>