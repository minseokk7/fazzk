<script>
  import { onMount } from "svelte";
  import Router from "svelte-spa-router";
  import Login from "./routes/Login.svelte";
  import Notifier from "./routes/Notifier.svelte";
  import WindowControls from "./lib/WindowControls.svelte";
  import { api } from "./lib/api";

  const routes = {
    "/": Login,
    "/notifier": Notifier,
    "/follower": Notifier,  // OBS에서 사용하는 경로
  };

  let directNotifierMode = false;

  onMount(async () => {
    console.log("[App] Initializing application");
    
    // Check for direct notifier mode (OBS)
    if (window.DIRECT_NOTIFIER_MODE) {
      console.log("[App] Direct notifier mode detected - rendering Notifier directly");
      directNotifierMode = true;
    }
    
    // Detect environment and apply appropriate classes
    if (api.isTauri) {
      console.log("[App] Tauri environment detected - adding app-mode class");
      document.body.classList.add("app-mode");
      document.body.classList.remove("obs-mode");
    } else {
      console.log("[App] Non-Tauri environment detected - adding obs-mode class");
      document.body.classList.add("obs-mode");
      document.body.classList.remove("app-mode");
    }
    
    console.log("[App] Environment detection complete");
  });
</script>

{#if !api.isTauri}
  <!-- OBS 모드에서는 윈도우 컨트롤 숨김 -->
{:else}
  <WindowControls />
{/if}

{#if directNotifierMode}
  <!-- OBS 직접 모드: 바로 Notifier 컴포넌트 렌더링 -->
  <Notifier />
{:else}
  <!-- 일반 모드: 라우터 사용 -->
  <Router {routes} />
{/if}

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
