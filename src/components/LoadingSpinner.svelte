<!--
  재사용 가능한 로딩 스피너 컴포넌트
-->
<script>
  // Props
  let { 
    size = 'medium', // 'small', 'medium', 'large', 'xl'
    color = 'primary', // 'primary', 'secondary', 'white', 'gray'
    thickness = 'normal', // 'thin', 'normal', 'thick'
    speed = 'normal', // 'slow', 'normal', 'fast'
    label = '로딩 중...', // 접근성을 위한 라벨
    showLabel = false // 라벨 표시 여부
  } = $props();

  // 크기 매핑
  const sizeMap = {
    small: '16px',
    medium: '24px',
    large: '32px',
    xl: '48px'
  };

  // 색상 매핑
  const colorMap = {
    primary: '#3b82f6',
    secondary: '#6b7280',
    white: '#ffffff',
    gray: '#9ca3af'
  };

  // 두께 매핑
  const thicknessMap = {
    thin: '1px',
    normal: '2px',
    thick: '3px'
  };

  // 속도 매핑
  const speedMap = {
    slow: '1.5s',
    normal: '1s',
    fast: '0.5s'
  };

  // 계산된 스타일
  let spinnerSize = $derived(sizeMap[size] || sizeMap.medium);
  let spinnerColor = $derived(colorMap[color] || colorMap.primary);
  let spinnerThickness = $derived(thicknessMap[thickness] || thicknessMap.normal);
  let spinnerSpeed = $derived(speedMap[speed] || speedMap.normal);
</script>

<div 
  class="loading-spinner"
  class:with-label={showLabel}
  role="status"
  aria-label={label}
>
  <div 
    class="spinner"
    style="
      width: {spinnerSize};
      height: {spinnerSize};
      border: {spinnerThickness} solid transparent;
      border-top-color: {spinnerColor};
      animation-duration: {spinnerSpeed};
    "
  ></div>
  
  {#if showLabel}
    <span class="label" style="color: {spinnerColor};">
      {label}
    </span>
  {/if}
</div>

<style>
  .loading-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner.with-label {
    flex-direction: column;
    gap: 8px;
  }

  .spinner {
    border-radius: 50%;
    animation: spin linear infinite;
    flex-shrink: 0;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    text-align: center;
    white-space: nowrap;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* 접근성: 애니메이션 감소 설정 시 */
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
      border: 2px solid currentColor;
      border-radius: 50%;
      opacity: 0.6;
    }
    
    .spinner::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 4px;
      height: 4px;
      background: currentColor;
      border-radius: 50%;
      transform: translate(-50%, -50%);
    }
  }

  /* 다크 모드 지원 */
  @media (prefers-color-scheme: dark) {
    .loading-spinner .spinner {
      border-top-color: #d1d5db;
    }
    
    .loading-spinner .label {
      color: #d1d5db;
    }
  }
</style>