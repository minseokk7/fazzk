<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  
  export let show = false;
  export let title = '';
  export let width = '400px';
  export let maxWidth = '90vw';
  export let closeOnEscape = true;
  export let closeOnOverlay = true;
  
  const dispatch = createEventDispatcher<{
    close: void;
  }>();
  
  let modalElement: HTMLElement;
  
  function handleClose() {
    dispatch('close');
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (closeOnEscape && event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    }
  }
  
  function handleOverlayClick() {
    if (closeOnOverlay) {
      handleClose();
    }
  }
  
  function handleOverlayKeydown(event: KeyboardEvent) {
    if (closeOnOverlay && (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape')) {
      event.preventDefault();
      handleClose();
    }
  }
  
  onMount(() => {
    if (show && modalElement) {
      modalElement.focus();
    }
  });
  
  $: if (show && modalElement) {
    modalElement.focus();
  }
</script>

{#if show}
  <!-- 배경 오버레이 -->
  <div 
    class="modal-overlay" 
    role="button" 
    tabindex="0"
    aria-label="모달 닫기"
    onclick={handleOverlayClick}
    onkeydown={handleOverlayKeydown}
  >
    <!-- 모달 컨텐츠 -->
    <div 
      bind:this={modalElement}
      class="modal-content"
      style="width: {width}; max-width: {maxWidth};"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
    >
      {#if title}
        <div class="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button 
            class="modal-close-btn" 
            onclick={handleClose}
            aria-label="모달 닫기"
            type="button"
          >
            ×
          </button>
        </div>
      {/if}
      
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    box-sizing: border-box;
  }
  
  .modal-content {
    background: rgba(20, 20, 20, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    outline: none;
  }
  
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: white;
  }
  
  .modal-close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 24px;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
    line-height: 1;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
  
  .modal-close-btn:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }
  
  .modal-body {
    padding: 20px 24px 24px;
    overflow-y: auto;
    flex: 1;
  }
  
  /* 모바일 대응 */
  @media (max-width: 480px) {
    .modal-overlay {
      padding: 10px;
    }
    
    .modal-header {
      padding: 16px 20px 12px;
    }
    
    .modal-body {
      padding: 16px 20px 20px;
    }
  }
</style>