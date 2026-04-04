<script>
  import { onMount } from 'svelte';
  import ErrorFallback from './ErrorFallback.svelte';
  import { globalErrorHandler } from '../lib/errorHandler';
  import { createLogger } from '../lib/logger';

  const log = createLogger('ErrorBoundary');

  let {
    fallback = null,
    onError = null,
    resetOnPropsChange = true,
    isolate = false,
    children,
  } = $props();

  let hasError = $state(false);
  let errorInfo = $state(null);
  let retryCount = $state(0);
  const maxRetries = 3;

  function resetError() {
    hasError = false;
    errorInfo = null;
    log.info('Error boundary reset');
  }

  function retry() {
    if (retryCount >= maxRetries) {
      log.warn('Max retry attempts reached');
      return;
    }

    retryCount += 1;
    resetError();
    log.info(`Retrying... (${retryCount}/${maxRetries})`);
  }

  function handleError(error, component = 'Unknown') {
    hasError = true;
    errorInfo = {
      message: error.message || String(error),
      stack: error.stack,
      component,
      timestamp: Date.now(),
    };

    globalErrorHandler.handleError(error, {
      component,
      boundary: true,
      retryCount,
    });

    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (callbackError) {
        log.error('Error in onError callback:', callbackError);
      }
    }

    if (!isolate) {
      window.dispatchEvent(
        new CustomEvent('svelte:error', {
          detail: { error, component },
        })
      );
    }

    log.error(`Error caught in boundary (component: ${component}):`, error);
  }

  onMount(() => {
    const errorListener = event => {
      if (event.detail?.error) {
        handleError(event.detail.error, event.detail.component);
      }
    };

    window.addEventListener('svelte:error', errorListener);

    return () => {
      window.removeEventListener('svelte:error', errorListener);
    };
  });

  $effect(() => {
    if (resetOnPropsChange && hasError) {
      resetError();
    }
  });

  $effect(() => {
    if (!hasError || retryCount >= maxRetries) {
      return;
    }

    const timer = setTimeout(() => {
      log.info('Auto-retry after 5 seconds');
      retry();
    }, 5000);

    return () => clearTimeout(timer);
  });
</script>

{#if hasError}
  {#if fallback}
    {@const Fallback = fallback}
    <Fallback
      {errorInfo}
      {retry}
      {resetError}
      canRetry={retryCount < maxRetries}
      {retryCount}
      {maxRetries}
    />
  {:else}
    <ErrorFallback
      {errorInfo}
      {retry}
      {resetError}
      canRetry={retryCount < maxRetries}
      {retryCount}
      {maxRetries}
    />
  {/if}
{:else}
  {@render children?.()}
{/if}

<style>
</style>
