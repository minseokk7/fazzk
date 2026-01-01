<!--
  스켈레톤 로딩 컴포넌트 - 콘텐츠 로딩 중 플레이스홀더 표시
-->
<script>
  // Props
  let { 
    width = '100%',
    height = '20px',
    borderRadius = '4px',
    count = 1, // 반복 개수
    spacing = '8px', // 스켈레톤 간 간격
    variant = 'text', // 'text', 'circular', 'rectangular', 'rounded'
    animation = 'pulse', // 'pulse', 'wave', 'none'
    color = 'default' // 'default', 'light', 'dark'
  } = $props();

  // 변형별 기본 스타일
  const variantStyles = {
    text: {
      height: '1em',
      borderRadius: '4px'
    },
    circular: {
      borderRadius: '50%',
      aspectRatio: '1'
    },
    rectangular: {
      borderRadius: '0'
    },
    rounded: {
      borderRadius: '8px'
    }
  };

  // 색상 테마
  const colorThemes = {
    default: {
      background: '#f3f4f6',
      highlight: '#e5e7eb'
    },
    light: {
      background: '#f9fafb',
      highlight: '#f3f4f6'
    },
    dark: {
      background: '#374151',
      highlight: '#4b5563'
    }
  };

  // 계산된 스타일
  let variantStyle = $derived(variantStyles[variant] || variantStyles.text);
  let theme = $derived(colorThemes[color] || colorThemes.default);
  let skeletonHeight = $derived(variantStyle.height || height);
  let skeletonBorderRadius = $derived(variantStyle.borderRadius || borderRadius);
  
  // 스켈레톤 배열 생성
  let skeletons = $derived(Array.from({ length: count }, (_, i) => i));
</script>

<div class="skeleton-container" style="gap: {spacing};">
  {#each skeletons as _, index}
    <div 
      class="skeleton"
      class:pulse={animation === 'pulse'}
      class:wave={animation === 'wave'}
      style="
        width: {width};
        height: {skeletonHeight};
        border-radius: {skeletonBorderRadius};
        background-color: {theme.background};
        --highlight-color: {theme.highlight};
        {variantStyle.aspectRatio ? `aspect-ratio: ${variantStyle.aspectRatio};` : ''}
      "
      role="status"
      aria-label="콘텐츠 로딩 중"
    >
      {#if animation === 'wave'}
        <div class="wave-effect"></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .skeleton-container {
    display: flex;
    flex-direction: column;
  }

  .skeleton {
    position: relative;
    overflow: hidden;
    background-color: #f3f4f6;
  }

  /* Pulse 애니메이션 */
  .skeleton.pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Wave 애니메이션 */
  .skeleton.wave {
    background: linear-gradient(
      90deg,
      var(--highlight-color) 0%,
      var(--highlight-color) 40%,
      #ffffff 50%,
      var(--highlight-color) 60%,
      var(--highlight-color) 100%
    );
    background-size: 200% 100%;
    animation: wave 2s linear infinite;
  }

  .wave-effect {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.6) 50%,
      transparent 100%
    );
    animation: wave-shimmer 2s linear infinite;
  }

  @keyframes wave {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  @keyframes wave-shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  /* 다크 모드 지원 */
  @media (prefers-color-scheme: dark) {
    .skeleton {
      background-color: #374151;
    }

    .skeleton.wave {
      background: linear-gradient(
        90deg,
        #374151 0%,
        #374151 40%,
        #4b5563 50%,
        #374151 60%,
        #374151 100%
      );
    }

    .wave-effect {
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(156, 163, 175, 0.3) 50%,
        transparent 100%
      );
    }
  }

  /* 접근성: 애니메이션 감소 설정 시 */
  @media (prefers-reduced-motion: reduce) {
    .skeleton.pulse {
      animation: none;
      opacity: 0.7;
    }

    .skeleton.wave {
      animation: none;
      background: var(--highlight-color);
    }

    .wave-effect {
      animation: none;
      display: none;
    }
  }

  /* 반응형 디자인 */
  @media (max-width: 640px) {
    .skeleton-container {
      gap: 6px;
    }
  }
</style>