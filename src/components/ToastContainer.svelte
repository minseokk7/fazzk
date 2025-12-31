<script>
  import { onMount, onDestroy } from 'svelte';
  import { toastManager } from '../lib/toastManager.ts';
  import Toast from './Toast.svelte';

  export let position = 'top-right'; // 'top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'
  export let maxToasts = 5; // 최대 표시할 토스트 개수

  let toasts = [];
  let unsubscribe;

  // 위치별 CSS 클래스
  const positionClasses = {
    'top-right': 'toast-container-top-right',
    'top-left': 'toast-container-top-left',
    'bottom-right': 'toast-container-bottom-right',
    'bottom-left': 'toast-container-bottom-left',
    'top-center': 'toast-container-top-center',
    'bottom-center': 'toast-container-bottom-center'
  };

  onMount(() => {
    // 토스트 매니저 구독
    unsubscribe = toastManager.subscribe((newToasts) => {
      // 최대 개수 제한
      toasts = newToasts.slice(-maxToasts);
    });
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  function handleRemove(event) {
    const toastId = event.detail;
    toastManager.remove(toastId);
  }
</script>

{#if toasts.length > 0}
  <div class="toast-container {positionClasses[position]}" role="region" aria-label="알림 메시지">
    {#each toasts as toast (toast.id)}
      <Toast {toast} on:remove={handleRemove} />
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    z-index: 10000;
    pointer-events: none;
    max-height: 100vh;
    overflow: hidden;
  }

  .toast-container :global(.toast) {
    pointer-events: auto;
  }

  /* 위치별 스타일 */
  .toast-container-top-right {
    top: 20px;
    right: 20px;
  }

  .toast-container-top-left {
    top: 20px;
    left: 20px;
  }

  .toast-container-bottom-right {
    bottom: 20px;
    right: 20px;
  }

  .toast-container-bottom-left {
    bottom: 20px;
    left: 20px;
  }

  .toast-container-top-center {
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  .toast-container-bottom-center {
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  /* 하단 위치의 경우 토스트 순서 뒤집기 */
  .toast-container-bottom-right,
  .toast-container-bottom-left,
  .toast-container-bottom-center {
    display: flex;
    flex-direction: column-reverse;
  }

  /* 모바일 대응 */
  @media (max-width: 480px) {
    .toast-container-top-right,
    .toast-container-top-left {
      top: 10px;
      left: 10px;
      right: 10px;
    }

    .toast-container-bottom-right,
    .toast-container-bottom-left {
      bottom: 10px;
      left: 10px;
      right: 10px;
    }

    .toast-container-top-center {
      top: 10px;
      left: 10px;
      right: 10px;
      transform: none;
    }

    .toast-container-bottom-center {
      bottom: 10px;
      left: 10px;
      right: 10px;
      transform: none;
    }
  }

  /* 스크롤 가능한 영역 */
  @media (max-height: 600px) {
    .toast-container {
      max-height: 80vh;
      overflow-y: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .toast-container::-webkit-scrollbar {
      display: none;
    }
  }
</style>