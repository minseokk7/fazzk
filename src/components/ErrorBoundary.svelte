<!--
  Svelte 에러 바운더리 컴포넌트
  자식 컴포넌트에서 발생하는 에러를 포착하고 처리
-->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { globalErrorHandler } from '../lib/errorHandler';
  import ErrorFallback from './ErrorFallback.svelte';
  import { createLogger } from '../lib/logger';

  const log = createLogger('ErrorBoundary');

  // Props
  let { 
    fallback = null, // 커스텀 에러 UI 컴포넌트
    onError = null, // 에러 발생 시 콜백
    resetOnPropsChange = true, // props 변경 시 에러 상태 리셋
    isolate = false // 에러를 상위로 전파하지 않음
  } = $props();

  // State
  let hasError = $state(false);
  let errorInfo = $state(null);
  let errorId = $state(null);
  let retryCount = $state(0);
  let maxRetries = 3;

  // 에러 상태 리셋
  function resetError() {
    hasError = false;
    errorInfo = null;
    errorId = null;
    log.info('Error boundary reset');
  }

  // 재시도
  function retry() {
    if (retryCount < maxRetries) {
      retryCount++;
      resetError();
      log.info(`Retrying... (${retryCount}/${maxRetries})`);
    } else {
      log.warn('Max retry attempts reached');
    }
  }

  // 에러 처리
  function handleError(error, component = 'Unknown') {
    hasError = true;
    errorInfo = {
      message: error.message || String(error),
      stack: error.stack,
      component,
      timestamp: Date.now()
    };

    // 전역 에러 핸들러에 보고
    errorId = globalErrorHandler.handleError(error, {
      component,
      boundary: true,
      retryCount
    });

    // 커스텀 에러 콜백 실행
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (callbackError) {
        log.error('Error in onError callback:', callbackError);
      }
    }

    // 에러를 상위로 전파하지 않음 (isolate가 true인 경우)
    if (!isolate) {
      // Svelte 커스텀 이벤트로 에러 전파
      window.dispatchEvent(new CustomEvent('svelte:error', {
        detail: { error, component }
      }));
    }

    log.error(`Error caught in boundary (component: ${component}):`, error);
  }

  // 컴포넌트 마운트 시 에러 리스너 설정
  onMount(() => {
    // 전역 에러 이벤트 리스너
    const errorListener = (event) => {
      if (event.detail && event.detail.error) {
        handleError(event.detail.error, event.detail.component);
      }
    };

    window.addEventListener('svelte:error', errorListener);

    // 정리 함수 반환
    return () => {
      window.removeEventListener('svelte:error', errorListener);
    };
  });

  // Props 변경 시 에러 상태 리셋
  $effect(() => {
    if (resetOnPropsChange && hasError) {
      resetError();
    }
  });

  // 에러 발생 시 자동 복구 시도 (5초 후)
  $effect(() => {
    if (hasError && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        log.info('Auto-retry after 5 seconds');
        retry();
      }, 5000);

      return () => clearTimeout(timer);
    }
  });
</script>

{#if hasError}
  {#if fallback}
    <!-- 커스텀 에러 UI -->
    <svelte:component 
      this={fallback} 
      {errorInfo} 
      {retry} 
      {resetError}
      canRetry={retryCount < maxRetries}
      retryCount={retryCount}
      maxRetries={maxRetries}
    />
  {:else}
    <!-- 기본 에러 UI -->
    <ErrorFallback 
      {errorInfo} 
      {retry} 
      {resetError}
      canRetry={retryCount < maxRetries}
      retryCount={retryCount}
      maxRetries={maxRetries}
    />
  {/if}
{:else}
  <!-- 정상 상태: 자식 컴포넌트 렌더링 -->
  <slot />
{/if}

<style>
  /* 에러 바운더리는 시각적 스타일이 없음 */
</style>