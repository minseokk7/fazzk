<script>
  import { onMount, tick } from 'svelte';

  export let items = [];
  export let itemHeight = 60; // 각 아이템의 고정 높이
  export let containerHeight = 300; // 컨테이너 높이
  export let overscan = 5; // 버퍼로 렌더링할 추가 아이템 수

  let scrollContainer;
  let scrollTop = 0;
  let containerWidth = 0;

  // 계산된 값들
  $: visibleCount = Math.ceil(containerHeight / itemHeight);
  $: totalHeight = items.length * itemHeight;
  $: startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  $: endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);
  $: visibleItems = items.slice(startIndex, endIndex);
  $: offsetY = startIndex * itemHeight;

  function handleScroll() {
    scrollTop = scrollContainer.scrollTop;
  }

  onMount(() => {
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  });
</script>

<div 
  class="virtual-list-container" 
  style="height: {containerHeight}px; overflow-y: auto;"
  bind:this={scrollContainer}
  bind:clientWidth={containerWidth}
>
  <!-- 전체 높이를 유지하는 스페이서 -->
  <div style="height: {totalHeight}px; position: relative;">
    <!-- 실제 렌더링되는 아이템들 -->
    <div style="transform: translateY({offsetY}px);">
      {#each visibleItems as item, index (item.id || startIndex + index)}
        <div class="virtual-item" style="height: {itemHeight}px;">
          <slot {item} index={startIndex + index} />
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-list-container {
    position: relative;
    overflow-y: auto;
  }
  
  .virtual-item {
    display: flex;
    align-items: center;
    box-sizing: border-box;
  }
</style>