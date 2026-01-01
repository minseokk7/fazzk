<script>
  import { createEventDispatcher, onMount } from 'svelte';
  
  export let toast;
  
  const dispatch = createEventDispatcher();
  let toastElement;
  let isVisible = false;
  let isRemoving = false;

  // 토스트 타입별 아이콘
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  // 토스트 타입별 색상 클래스
  const typeClasses = {
    success: 'toast-success',
    error: 'toast-error',
    warning: 'toast-warning',
    info: 'toast-info'
  };

  onMount(() => {
    // 애니메이션을 위해 약간의 지연 후 표시
    setTimeout(() => {
      isVisible = true;
    }, 10);
  });

  function handleClose() {
    if (isRemoving) return;
    
    isRemoving = true;
    isVisible = false;
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
      dispatch('remove', toast.id);
    }, 300);
  }

  function handleAction(action) {
    action.action();
    handleClose();
  }

  // 클릭으로 닫기 (persistent가 아닌 경우)
  function handleClick() {
    if (!toast.persistent) {
      handleClose();
    }
  }
</script>

<div 
  bind:this={toastElement}
  class="toast {typeClasses[toast.type]}"
  class:visible={isVisible}
  class:removing={isRemoving}
  role="alert"
  aria-live="polite"
>
  <div class="toast-content" 
       role="button" 
       tabindex="0"
       onclick={handleClick}
       onkeydown={(e) => {
         if (e.key === 'Enter' || e.key === ' ') {
           e.preventDefault();
           handleClick();
         }
       }}
       aria-label={toast.persistent ? toast.title : `${toast.title} - 클릭하여 닫기`}
  >
    <div class="toast-icon">
      {icons[toast.type]}
    </div>
    
    <div class="toast-body">
      <div class="toast-title">{toast.title}</div>
      {#if toast.message}
        <div class="toast-message">{toast.message}</div>
      {/if}
    </div>

    {#if !toast.persistent}
      <button 
        class="toast-close" 
        onclick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        aria-label="토스트 닫기"
      >
        ×
      </button>
    {/if}
  </div>

  {#if toast.actions && toast.actions.length > 0}
    <div class="toast-actions">
      {#each toast.actions as action}
        <button 
          class="toast-action {action.style || 'secondary'}"
          onclick={(e) => {
            e.stopPropagation();
            handleAction(action);
          }}
        >
          {action.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .toast {
    background: rgba(20, 20, 20, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 12px;
    min-width: 320px;
    max-width: 480px;
    overflow: hidden;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .toast.visible {
    transform: translateX(0);
    opacity: 1;
  }

  .toast.removing {
    transform: translateX(100%);
    opacity: 0;
  }

  .toast-content {
    display: flex;
    align-items: flex-start;
    padding: 16px;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .toast-content:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .toast-icon {
    font-size: 20px;
    margin-right: 12px;
    margin-top: 2px;
    flex-shrink: 0;
  }

  .toast-body {
    flex: 1;
    min-width: 0;
  }

  .toast-title {
    font-weight: 600;
    font-size: 14px;
    color: white;
    margin-bottom: 4px;
    line-height: 1.4;
  }

  .toast-message {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.4;
    word-wrap: break-word;
  }

  .toast-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .toast-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .toast-actions {
    display: flex;
    gap: 8px;
    padding: 0 16px 16px 16px;
    justify-content: flex-end;
  }

  .toast-action {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .toast-action.primary {
    background: #007bff;
    color: white;
  }

  .toast-action.primary:hover {
    background: #0056b3;
  }

  .toast-action.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .toast-action.secondary:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .toast-action.danger {
    background: #dc3545;
    color: white;
  }

  .toast-action.danger:hover {
    background: #c82333;
  }

  /* 토스트 타입별 스타일 */
  .toast-success {
    border-left: 4px solid #28a745;
  }

  .toast-error {
    border-left: 4px solid #dc3545;
  }

  .toast-warning {
    border-left: 4px solid #ffc107;
  }

  .toast-info {
    border-left: 4px solid #17a2b8;
  }

  /* 접근성 개선 */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      transition: opacity 0.2s ease;
    }
    
    .toast.visible {
      transform: none;
    }
    
    .toast.removing {
      transform: none;
    }
  }

  /* 모바일 대응 */
  @media (max-width: 480px) {
    .toast {
      min-width: 280px;
      max-width: calc(100vw - 32px);
      margin-left: 16px;
      margin-right: 16px;
    }
    
    .toast-content {
      padding: 12px;
    }
    
    .toast-actions {
      padding: 0 12px 12px 12px;
    }
  }
</style>