<script>
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import Login from './routes/Login.svelte';
  import Notifier from './routes/Notifier.svelte';
  import WindowControls from './lib/WindowControls.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import LoadingIndicator from './components/LoadingIndicator.svelte';
  import ConnectionStatus from './components/ConnectionStatus.svelte';
  import { api } from './lib/api.ts';
  import { createLogger } from './lib/logger.ts';
  import { globalErrorHandler } from './lib/errorHandler.ts';

  const log = createLogger('App');

  const routes = {
    '/': Login,
    '/notifier': Notifier,
    '/follower': Notifier, // OBS에서 사용하는 경로
  };

  let directNotifierMode = false;

  onMount(async () => {
    log.info('Initializing application');

    try {
      // Check for direct notifier mode (OBS)
      if (window.DIRECT_NOTIFIER_MODE || window.OBS_MODE) {
        log.info('Direct notifier mode detected - rendering Notifier directly');
        directNotifierMode = true;
      }

      // URL 기반 OBS 모드 감지 추가 (더 강력한 감지)
      const currentPath = window.location.pathname;
      const currentHash = window.location.hash;
      log.info('Current URL path:', currentPath, 'hash:', currentHash);
      
      if (currentPath === '/follower' || currentPath.endsWith('/follower') || currentHash === '#/follower') {
        log.info('OBS follower path detected - enabling direct mode');
        directNotifierMode = true;
        // OBS 모드 플래그도 설정
        window.OBS_MODE = true;
        window.DIRECT_NOTIFIER_MODE = true;
      }

      // Detect environment and apply appropriate classes
      if (api.isTauri) {
        log.info('Tauri 환경 감지됨 - app-mode 클래스 추가');
        document.body.classList.add('app-mode');
        document.body.classList.remove('obs-mode');
      } else {
        log.info('비-Tauri 환경 감지됨 - obs-mode 클래스 추가');
        document.body.classList.add('obs-mode');
        document.body.classList.remove('app-mode');
      }

      log.info('환경 감지 완료');
      log.info('직접 알림 모드:', directNotifierMode);
    } catch (error) {
      log.error('App initialization failed:', error);
      globalErrorHandler.handleError(error, { component: 'App', phase: 'initialization' });
    }
  });
</script>

{#if !api.isTauri}
  <!-- OBS 모드에서는 윈도우 컨트롤 숨김 -->
{:else}
  <WindowControls />
{/if}

<ErrorBoundary>
  {#if directNotifierMode}
    <!-- OBS 직접 모드: 바로 Notifier 컴포넌트 렌더링 -->
    <Notifier />
  {:else}
    <!-- 일반 모드: 라우터 사용 -->
    <Router {routes} />
  {/if}
</ErrorBoundary>

<!-- 로딩 인디케이터 -->
<LoadingIndicator 
  position="top-right"
  maxVisible={3}
  showProgress={true}
  showCancel={true}
  compact={false}
/>

<!-- 연결 상태 표시 -->
<ConnectionStatus 
  position="bottom-right"
  showDetails={true}
  showMetrics={true}
  autoHide={true}
  compact={false}
/>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    overflow: hidden;
    height: 100vh;
  }
</style>
