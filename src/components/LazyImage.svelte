<script lang="ts">
  import { onMount } from 'svelte';

  export let src: string = '';
  export let alt: string = '';
  export let placeholder: string = '/default_profile.png';
  export let className: string = '';
  export let width: number | undefined = undefined;
  export let height: number | undefined = undefined;
  export let threshold: number = 0.1; // Intersection Observer 임계값
  export let webpSupport: boolean = true;

  let imageElement: HTMLImageElement;
  let loaded = false;
  let error = false;
  let observer: IntersectionObserver | null = null;
  let currentSrc = placeholder;
  
  // WebP 지원 감지
  let supportsWebP = false;

  // 최적화된 이미지 URL 생성
  function getOptimizedSrc(originalSrc: string): string {
    if (!originalSrc || !webpSupport || !supportsWebP) {
      return originalSrc;
    }
    
    // 이미 WebP인 경우 그대로 반환
    if (originalSrc.includes('.webp')) {
      return originalSrc;
    }
    
    // 외부 URL인 경우 WebP 변환 시도
    if (originalSrc.startsWith('http')) {
      // 치지직 프로필 이미지 WebP 변환
      if (originalSrc.includes('naver.com') || originalSrc.includes('pstatic.net')) {
        return originalSrc.replace(/\.(jpg|jpeg|png)(\?.*)?$/i, '.webp$2');
      }
    }
    
    return originalSrc;
  }

  function checkWebPSupport(): Promise<boolean> {
    return new Promise((resolve) => {
      const webP = new Image();
      webP.onload = webP.onerror = () => {
        resolve(webP.height === 2);
      };
      webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
    });
  }

  function handleLoad() {
    loaded = true;
    error = false;
  }

  function handleError() {
    error = true;
    // WebP 실패 시 원본 이미지로 재시도
    if (currentSrc !== src && src) {
      currentSrc = src;
      return;
    }
    currentSrc = placeholder;
  }

  async function loadImage() {
    if (src && src !== placeholder) {
      const optimizedSrc = getOptimizedSrc(src);
      
      const img = new Image();
      img.onload = () => {
        currentSrc = optimizedSrc;
        handleLoad();
      };
      img.onerror = () => {
        // WebP 실패 시 원본으로 재시도
        if (optimizedSrc !== src) {
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            currentSrc = src;
            handleLoad();
          };
          fallbackImg.onerror = handleError;
          fallbackImg.src = src;
        } else {
          handleError();
        }
      };
      img.src = optimizedSrc;
    }
  }

  onMount(async () => {
    // WebP 지원 확인
    supportsWebP = await checkWebPSupport();
    
    // Intersection Observer를 사용한 레이지 로딩
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !loaded && !error) {
              loadImage();
              observer?.unobserve(entry.target);
            }
          });
        },
        { 
          threshold,
          rootMargin: '50px' // 50px 전에 미리 로드
        }
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
  loading="lazy"
  decoding="async"
  onload={handleLoad}
  onerror={handleError}
/>

<style>
  img {
    transition: opacity 0.3s ease, filter 0.3s ease;
  }

  img.loading {
    opacity: 0.7;
    filter: blur(2px);
  }

  img.error {
    opacity: 0.5;
    filter: grayscale(100%);
  }
  
  /* 접근성 개선 */
  @media (prefers-reduced-motion: reduce) {
    img {
      transition: opacity 0.1s ease;
    }
  }
  
  /* 고해상도 디스플레이 최적화 */
  @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
    img {
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
  }
</style>