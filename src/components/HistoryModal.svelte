<script>
  export let showHistory = false;
  export let history = [];
  export let clearHistory = () => {};
  
  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR');
  }
</script>

{#if showHistory}
  <!-- 배경 오버레이 -->
  <div class="modal-overlay" onclick={() => (showHistory = false)}></div>
  
  <!-- 모달 컨텐츠 -->
  <div class="history-modal">
    <div class="settings-header">
      <h2>알림 기록</h2>
      <button class="close-btn" onclick={() => (showHistory = false)}>×</button>
    </div>
    
    <div class="history-list">
      {#if history.length === 0}
        <p class="empty-message">기록이 없습니다.</p>
      {/if}
      {#each history as item (item._id)}
        <div class="history-item">
          <img src={item.user?.profileImageUrl || '/default_profile.png'} alt="Profile" class="profile-img" />
          <div class="info">
            <div class="nickname">{item.user?.nickname}</div>
            <div class="time">{formatTime(item.followingSince || item.notifiedAt)}</div>
          </div>
        </div>
      {/each}
    </div>
    
    {#if history.length > 0}
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={clearHistory}>기록 지우기</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* 배경 오버레이 */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: 1999;
  }

  /* 모달 컨텐츠 */
  .history-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 20, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    width: 400px;
    max-width: 90vw;
    max-height: 90vh;
    color: white;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    z-index: 2000;
    border: 1px solid rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(135deg, #2c3e50, #34495e);
  }

  .settings-header h2 {
    margin: 0;
    color: white;
    font-size: 1.5rem;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    width: 35px;
    height: 35px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.3s ease;
    font-size: 20px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .history-list {
    max-height: calc(90vh - 160px);
    overflow-y: auto;
    padding: 20px;
    background: linear-gradient(135deg, #2c3e50, #34495e);
  }

  .empty-message {
    text-align: center;
    color: #888;
    font-style: italic;
    margin: 40px 0;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    transition: background 0.3s ease;
  }

  .history-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .profile-img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .info {
    flex: 1;
  }

  .nickname {
    color: white;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .time {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
  }

  .modal-footer {
    padding: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    text-align: right;
    background: linear-gradient(135deg, #2c3e50, #34495e);
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style>