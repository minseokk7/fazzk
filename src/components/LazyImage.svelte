<script>
  import { onMount } from 'svelte';

  export let src = '';
  export let alt = '';
  export let placeholder = '/default_profile.png';
  export let className = '';
  export let width = undefined;
  export let height = undefined;
  export let threshold = 0.1; // Intersection Observer 임계값

  let imageElement;
  let loaded = false;
  let error = false;
  let observer;
  let currentSrc = placeholder;

  function handleLoad() {
    loaded = true;
    error = false;
  }

  function handleError() {
    error = true;
    currentSrc = placeholder;
  }

  function loadImage() {
    if (src && src !== placeholder) {
      const img = new Image();
      img.onload = () => {
        currentSrc = src;
        handleLoad();
      };
      img.onerror = handleError;
      img.src = src;
    }
  }

  onMount(() => {
    // Intersection Observer를 사용한 레이지 로딩
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !loaded && !error) {
              loadImage();
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold }
      );

      if (imageElement) {
        observer.observe(imageElement);
      }
    } else {
      // Intersection Observer를 지원하지 않는 경우 즉시 로드
      loadImage();
    }

    return () => {
      if (observer && imageElement) {
        observer.unobserve(imageElement);
      }
    };
  });
</script>

<img
  bind:this={imageElement}
  src={currentSrc}
  {alt}
  class={className}
  {width}
  {height}
  class:loading={!loaded && !error}
  class:error
  on:load={handleLoad}
  on:error={handleError}
/>

<style>
  img {
    transition: opacity 0.3s ease;
  }

  img.loading {
    opacity: 0.7;
    filter: blur(2px);
  }

  img.error {
    opacity: 0.5;
    filter: grayscale(100%);
  }
</style>