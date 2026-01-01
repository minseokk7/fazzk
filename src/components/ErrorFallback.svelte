<!--
  에러 발생 시 표시되는 기본 UI 컴포넌트
-->
<script>
  import { createLogger } from '../lib/logger';
  import { getErrorStats, clearAllErrors } from '../lib/errorHandler';

  const log = createLogger('ErrorFallback');

  // Props
  let { 
    errorInfo = null,
    retry = null,
    resetError = null,
    canRetry = true,
    retryCount = 0,
    maxRetries = 3
  } = $props();

  // State
  let showDetails = $state(false);
  let showStats = $state(false);
  let errorStats = $state(null);

  // 에러 통계 로드
  function loadErrorStats() {
    errorStats = getErrorStats();
    showStats = true;
  }

  // 에러 상세 정보 복사
  function copyErrorDetails() {
    const details = {
      message: errorInfo?.message,
      component: errorInfo?.component,
      timestamp: new Date(errorInfo?.timestamp).toISOString(),
      stack: errorInfo?.stack,
      retryCount,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    navigator.clipboard.writeText(JSON.stringify(details, null, 2))
      .then(() => {
        log.info('Error details copied to clipboard');
        // 간단한 피드백 표시
        const button = document.querySelector('.copy-button');
        if (button) {
          const originalText = button.textContent;
          button.textContent = '복사됨!';
          setTimeout(() => {
            button.textContent = originalText;
          }, 2000);
        }
      })
      .catch(err => {
        log.error('Failed to copy error details:', err);
      });
  }

  // 페이지 새로고침
  function refreshPage() {
    window.location.reload();
  }

  // 모든 에러 지우기
  function clearErrors() {
    clearAllErrors();
    errorStats = null;
    showStats = false;
    log.info('All errors cleared from ErrorFallback');
  }
</script>

<div class="error-fallback">
  <div class="error-container">
    <!-- 에러 아이콘 -->
    <div class="error-icon">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/>
        <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" stroke-width="2"/>
        <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" stroke-width="2"/>
      </svg>
    </div>

    <!-- 에러 메시지 -->
    <div class="error-content">
      <h2 class="error-title">문제가 발생했습니다</h2>
      
      <p class="error-message">
        {errorInfo?.message || '알 수 없는 오류가 발생했습니다.'}
      </p>

      {#if errorInfo?.component}
        <p class="error-component">
          컴포넌트: <code>{errorInfo.component}</code>
        </p>
      {/if}

      {#if retryCount > 0}
        <p class="retry-info">
          재시도 횟수: {retryCount}/{maxRetries}
        </p>
      {/if}
    </div>

    <!-- 액션 버튼들 -->
    <div class="error-actions">
      {#if canRetry && retry}
        <button 
          class="btn btn-primary" 
          onclick={retry}
        >
          다시 시도 ({maxRetries - retryCount}회 남음)
        </button>
      {/if}

      {#if resetError}
        <button 
          class="btn btn-secondary" 
          onclick={resetError}
        >
          에러 무시하고 계속
        </button>
      {/if}

      <button 
        class="btn btn-secondary" 
        onclick={refreshPage}
      >
        페이지 새로고침
      </button>
    </div>

    <!-- 고급 옵션 -->
    <div class="error-advanced">
      <button 
        class="btn-link" 
        onclick={() => showDetails = !showDetails}
      >
        {showDetails ? '상세 정보 숨기기' : '상세 정보 보기'}
      </button>

      <button 
        class="btn-link" 
        onclick={loadErrorStats}
      >
        에러 통계 보기
      </button>
    </div>

    <!-- 에러 상세 정보 -->
    {#if showDetails && errorInfo}
      <div class="error-details">
        <h3>상세 정보</h3>
        
        <div class="detail-item">
          <strong>시간:</strong> 
          {new Date(errorInfo.timestamp).toLocaleString()}
        </div>
        
        <div class="detail-item">
          <strong>URL:</strong> 
          {window.location.href}
        </div>
        
        <div class="detail-item">
          <strong>브라우저:</strong> 
          {navigator.userAgent}
        </div>

        {#if errorInfo.stack}
          <div class="detail-item">
            <strong>스택 트레이스:</strong>
            <pre class="stack-trace">{errorInfo.stack}</pre>
          </div>
        {/if}

        <button 
          class="btn btn-small copy-button" 
          onclick={copyErrorDetails}
        >
          에러 정보 복사
        </button>
      </div>
    {/if}

    <!-- 에러 통계 -->
    {#if showStats && errorStats}
      <div class="error-stats">
        <h3>에러 통계</h3>
        
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">총 에러:</span>
            <span class="stat-value">{errorStats.totalErrors}</span>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">심각한 에러:</span>
            <span class="stat-value critical">{errorStats.criticalErrors}</span>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">에러율:</span>
            <span class="stat-value">{errorStats.errorRate.toFixed(2)}/분</span>
          </div>
        </div>

        {#if errorStats.commonErrors.length > 0}
          <div class="common-errors">
            <h4>자주 발생하는 에러</h4>
            {#each errorStats.commonErrors as commonError}
              <div class="common-error-item">
                <span class="error-text">{commonError.message}</span>
                <span class="error-count">({commonError.count}회)</span>
              </div>
            {/each}
          </div>
        {/if}

        <button 
          class="btn btn-small btn-danger" 
          onclick={clearErrors}
        >
          모든 에러 지우기
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .error-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: 2rem;
    background: linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%);
    border-radius: 12px;
    margin: 1rem;
  }

  .error-container {
    max-width: 600px;
    text-align: center;
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  }

  .error-icon {
    margin-bottom: 1.5rem;
  }

  .error-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #dc2626;
    margin-bottom: 1rem;
  }

  .error-message {
    font-size: 1rem;
    color: #374151;
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  .error-component {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }

  .error-component code {
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
  }

  .retry-info {
    font-size: 0.875rem;
    color: #f59e0b;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .error-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin: 1.5rem 0;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .btn-small {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .error-advanced {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn-link {
    background: none;
    border: none;
    color: #3b82f6;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.875rem;
  }

  .btn-link:hover {
    color: #2563eb;
  }

  .error-details, .error-stats {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    text-align: left;
  }

  .error-details h3, .error-stats h3 {
    margin-bottom: 1rem;
    color: #374151;
    font-size: 1.125rem;
  }

  .detail-item {
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .detail-item strong {
    color: #374151;
    display: inline-block;
    min-width: 80px;
  }

  .stack-trace {
    background: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 4px;
    font-size: 0.75rem;
    overflow-x: auto;
    margin-top: 0.5rem;
    white-space: pre-wrap;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .stat-value {
    font-weight: 600;
    color: #374151;
  }

  .stat-value.critical {
    color: #dc2626;
  }

  .common-errors {
    margin-top: 1rem;
  }

  .common-errors h4 {
    margin-bottom: 0.5rem;
    color: #374151;
    font-size: 1rem;
  }

  .common-error-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
  }

  .error-text {
    flex: 1;
    color: #374151;
    text-align: left;
  }

  .error-count {
    color: #6b7280;
    font-weight: 500;
  }

  /* 반응형 디자인 */
  @media (max-width: 640px) {
    .error-fallback {
      padding: 1rem;
      min-height: 300px;
    }

    .error-container {
      padding: 1.5rem;
    }

    .error-actions {
      flex-direction: column;
      align-items: center;
    }

    .btn {
      width: 100%;
      max-width: 200px;
    }

    .error-advanced {
      flex-direction: column;
      gap: 0.5rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>