<script>
  import { api } from '../lib/api.ts';
  
  export let currentItem = null;
  export let animationType = 'fade';
  export let notificationLayout = 'vertical';
  export let textColor = '#ffffff';
</script>

<div class="notification-area">
  {#if currentItem}
    <div
      class="notification-container show anim-{animationType} layout-{notificationLayout}"
      style="--text-color: {textColor}"
    >
      <img
        src={currentItem.user?.profileImageUrl || '/default_profile.png'}
        class="profile-img"
        alt="Profile"
      />
      <div class="content">
        <h1 class="nickname">{currentItem.user?.nickname}</h1>
        <div class="message">님이 팔로우했습니다!</div>
      </div>
    </div>
  {:else if api.isTauri}
    <div class="waiting-message">
      <p>새로운 팔로워를 기다리는 중...</p>
    </div>
  {/if}
</div>

<style>
  .notification-area {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    pointer-events: none;
  }

  .notification-container {
    padding: 50px 18px 40px 18px;
    border-radius: 24px;
    background: var(--glass-bg, rgba(60, 60, 60, 0.95));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.2));
    box-shadow: var(--glass-shadow, 0 8px 32px 0 rgba(0, 0, 0, 0.5));
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
    opacity: 0;
    transform: scale(0.9);
    visibility: hidden;
    min-height: 280px;
    text-align: center;
  }

  .notification-container.show {
    opacity: 1;
    transform: scale(1);
    visibility: visible;
  }

  /* 가로형 레이아웃 */
  .notification-container.layout-horizontal {
    display: flex;
    align-items: center;
    gap: 30px;
    padding: 30px 50px;
    min-height: 120px;
    min-width: 500px;
    text-align: left;
  }

  .notification-container.layout-horizontal .content {
    flex: 1;
  }

  .notification-container.layout-horizontal .profile-img {
    width: 80px;
    height: 80px;
    margin-bottom: 0;
    flex-shrink: 0;
  }

  .notification-container.layout-horizontal .nickname {
    font-size: 2rem;
    margin: 0 0 8px 0;
  }

  .notification-container.layout-horizontal .message {
    font-size: 1.2rem;
    margin: 0;
  }

  .profile-img {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    border: 4px solid var(--primary-color, #00ffa3);
    box-shadow: 0 0 20px rgba(0, 255, 163, 0.3);
    margin-bottom: 15px;
    object-fit: cover;
  }

  .layout-vertical .profile-img {
    margin-right: 0;
    margin-bottom: 15px;
  }

  .content {
    color: var(--text-color, #ffffff);
  }

  .nickname {
    font-size: 3rem;
    font-weight: 800;
    margin: 10px 0;
    text-shadow:
      2px 2px 4px rgba(0, 0, 0, 0.8),
      0 0 10px rgba(0, 0, 0, 0.5);
    color: #ffffff;
    text-align: center;
  }

  .message {
    font-size: 1.5rem;
    opacity: 1;
    font-weight: 600;
    color: #ffffff;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
    text-align: center;
  }

  .waiting-message {
    text-align: center;
    opacity: 0.3;
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.1rem;
    padding: 20px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 15px;
    backdrop-filter: blur(10px);
  }

  /* 애니메이션 타입별 스타일 */
  .anim-fade {
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .anim-fade.show {
    opacity: 1;
  }

  .anim-slide-up {
    transform: translateY(50px);
    opacity: 0;
  }

  .anim-slide-up.show {
    transform: translateY(0);
    opacity: 1;
  }

  .anim-slide-down {
    transform: translateY(-50px);
    opacity: 0;
  }

  .anim-slide-down.show {
    transform: translateY(0);
    opacity: 1;
  }

  .anim-bounce.show {
    animation: bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    opacity: 1;
    transform: scale(1);
  }

  @keyframes bounceIn {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
      opacity: 1;
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      transform: scale(1);
    }
  }
</style>