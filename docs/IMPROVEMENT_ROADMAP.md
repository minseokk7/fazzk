# Fazzk 개선 로드맵

> 현재 v2.7.1 기준으로 작성된 개선사항 및 구현 가이드

## 📋 목차

1. [우선순위 높은 개선사항](#우선순위-높은-개선사항)
2. [사용자 경험 개선](#사용자-경험-개선)
3. [기술적 개선사항](#기술적-개선사항)
4. [UI/UX 개선](#uiux-개선)
5. [보안 및 안정성](#보안-및-안정성)
6. [구현 우선순위](#구현-우선순위)

---

## 🚀 우선순위 높은 개선사항

### 1. 토스트 알림 시스템

**현재 문제점:**
- 에러 메시지가 모달 형태로만 표시됨
- 성공 메시지는 콘솔에만 출력
- 사용자 피드백이 부족함

**개선 방안:**
```typescript
// src/lib/toastManager.ts
export interface ToastNotification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  duration?: number; // 자동 사라지는 시간 (ms)
  persistent?: boolean; // 수동으로만 닫기
  actions?: Array<{
    label: string;
    action: () => void;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
}

export class ToastManager {
  private toasts: ToastNotification[] = [];
  private listeners: Set<(toasts: ToastNotification[]) => void> = new Set();
  
  show(toast: Omit<ToastNotification, 'id'>): string {
    const id = crypto.randomUUID();
    const newToast = { ...toast, id };
    
    this.toasts.push(newToast);
    this.notifyListeners();
    
    // 자동 제거
    if (!toast.persistent && toast.duration !== 0) {
      setTimeout(() => this.remove(id), toast.duration || 5000);
    }
    
    return id;
  }
  
  success(title: string, message: string) {
    return this.show({ type: 'success', title, message });
  }
  
  error(title: string, message: string, persistent = false) {
    return this.show({ type: 'error', title, message, persistent });
  }
}
```

**구현 파일:**
- `src/lib/toastManager.ts` - 토스트 관리 로직
- `src/components/ToastContainer.svelte` - 토스트 표시 컴포넌트
- `src/components/Toast.svelte` - 개별 토스트 컴포넌트

**예상 개발 시간:** 1-2일

---

### 2. 설정 백업/복원 시스템

**현재 문제점:**
- 설정 손실 시 복구 불가능
- 다른 기기로 설정 이전 어려움
- 설정 히스토리 없음

**개선 방안:**
```typescript
// src/lib/backupManager.ts
export interface SettingsBackup {
  version: string;
  timestamp: number;
  appVersion: string;
  settings: AppSettings;
  history?: HistoryItem[];
  shortcuts?: KeyboardShortcuts;
  metadata: {
    deviceInfo: string;
    exportReason: 'manual' | 'auto' | 'crash';
    notes?: string;
  };
}

export class BackupManager {
  private static readonly BACKUP_VERSION = '1.0.0';
  private static readonly AUTO_BACKUP_KEY = 'fazzk-auto-backup';
  private static readonly BACKUP_HISTORY_KEY = 'fazzk-backup-history';
  
  // 설정 내보내기
  async exportSettings(includeHistory = true): Promise<SettingsBackup> {
    const settings = settingsManager.getAll();
    const history = includeHistory ? this.getHistory() : undefined;
    
    return {
      version: BackupManager.BACKUP_VERSION,
      timestamp: Date.now(),
      appVersion: await this.getAppVersion(),
      settings,
      history,
      shortcuts: this.getKeyboardShortcuts(),
      metadata: {
        deviceInfo: this.getDeviceInfo(),
        exportReason: 'manual',
        notes: ''
      }
    };
  }
  
  // 파일로 내보내기
  async exportToFile(backup: SettingsBackup): Promise<void> {
    const filename = `fazzk-backup-${new Date().toISOString().split('T')[0]}.json`;
    const content = JSON.stringify(backup, null, 2);
    
    if (api.isTauri) {
      // Tauri 파일 저장 다이얼로그
      const filePath = await api.invoke('save_file_dialog', {
        defaultPath: filename,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      
      if (filePath) {
        await api.invoke('write_file', { path: filePath, content });
      }
    } else {
      // 브라우저 다운로드
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
  
  // 설정 가져오기
  async importSettings(backup: SettingsBackup): Promise<boolean> {
    try {
      // 버전 호환성 검사
      if (!this.isCompatibleVersion(backup.version)) {
        throw new Error(`호환되지 않는 백업 버전: ${backup.version}`);
      }
      
      // 현재 설정 백업 (복원용)
      await this.createAutoBackup('before-import');
      
      // 설정 적용
      Object.entries(backup.settings).forEach(([key, value]) => {
        settingsManager.set(key as keyof AppSettings, value, 'import');
      });
      
      // 히스토리 복원 (선택적)
      if (backup.history) {
        this.restoreHistory(backup.history);
      }
      
      // 단축키 복원 (선택적)
      if (backup.shortcuts) {
        this.restoreShortcuts(backup.shortcuts);
      }
      
      return true;
    } catch (error) {
      console.error('[BackupManager] Import failed:', error);
      return false;
    }
  }
  
  // 자동 백업
  async createAutoBackup(reason: 'daily' | 'before-update' | 'before-import' | 'crash'): Promise<void> {
    const backup = await this.exportSettings(false); // 히스토리 제외
    backup.metadata.exportReason = 'auto';
    backup.metadata.notes = `Auto backup: ${reason}`;
    
    // 로컬 스토리지에 저장 (최근 5개만 유지)
    const backups = this.getAutoBackups();
    backups.unshift(backup);
    
    if (backups.length > 5) {
      backups.splice(5);
    }
    
    localStorage.setItem(BackupManager.AUTO_BACKUP_KEY, JSON.stringify(backups));
  }
  
  // 백업 복원
  async restoreFromAutoBackup(index = 0): Promise<boolean> {
    const backups = this.getAutoBackups();
    if (backups[index]) {
      return await this.importSettings(backups[index]);
    }
    return false;
  }
}
```

**구현 파일:**
- `src/lib/backupManager.ts` - 백업/복원 로직
- `src/components/BackupModal.svelte` - 백업/복원 UI
- `src/components/BackupHistory.svelte` - 백업 히스토리 표시

**예상 개발 시간:** 3-4일

---

### 4. 키보드 단축키 커스터마이징

**현재 문제점:**
- 하드코딩된 단축키
- 사용자 커스터마이징 불가능
- 단축키 충돌 감지 없음

**개선 방안:**
```typescript
// src/lib/shortcutManager.ts
export interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'modal' | 'memory' | 'navigation';
  defaultKey: string;
  currentKey: string;
  action: () => void;
  enabled: boolean;
  global?: boolean; // 전역 단축키 여부
}

export interface ShortcutConflict {
  key: string;
  shortcuts: KeyboardShortcut[];
}

export class ShortcutManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private keyMap: Map<string, string> = new Map(); // key -> shortcut id
  private eventHandler: ((event: KeyboardEvent) => void) | null = null;
  
  constructor() {
    this.initializeDefaultShortcuts();
    this.loadCustomShortcuts();
    this.setupEventHandler();
  }
  
  private initializeDefaultShortcuts() {
    const defaults: Omit<KeyboardShortcut, 'currentKey' | 'enabled'>[] = [
      {
        id: 'test-alarm',
        name: '테스트 알림',
        description: '테스트 알림을 실행합니다',
        category: 'general',
        defaultKey: 'Ctrl+T',
        action: () => this.triggerTestAlarm()
      },
      {
        id: 'toggle-settings',
        name: '설정 열기/닫기',
        description: '설정 모달을 토글합니다',
        category: 'modal',
        defaultKey: 'Ctrl+S',
        action: () => this.toggleSettings()
      },
      {
        id: 'toggle-history',
        name: '히스토리 열기/닫기',
        description: '히스토리 모달을 토글합니다',
        category: 'modal',
        defaultKey: 'Ctrl+H',
        action: () => this.toggleHistory()
      },
      {
        id: 'toggle-memory-monitor',
        name: '메모리 모니터 토글',
        description: '메모리 모니터를 표시/숨김합니다',
        category: 'memory',
        defaultKey: 'Ctrl+M',
        action: () => this.toggleMemoryMonitor()
      },
      {
        id: 'memory-cleanup',
        name: '메모리 정리',
        description: '수동으로 메모리를 정리합니다',
        category: 'memory',
        defaultKey: 'Ctrl+Shift+M',
        action: () => this.triggerMemoryCleanup()
      },
      {
        id: 'close-modal',
        name: '모달 닫기',
        description: '열린 모달을 닫습니다',
        category: 'modal',
        defaultKey: 'Escape',
        action: () => this.closeModals()
      }
    ];
    
    defaults.forEach(shortcut => {
      this.shortcuts.set(shortcut.id, {
        ...shortcut,
        currentKey: shortcut.defaultKey,
        enabled: true
      });
    });
  }
  
  // 단축키 설정
  setShortcut(id: string, newKey: string): boolean {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return false;
    
    // 충돌 검사
    const conflicts = this.checkConflicts(newKey, id);
    if (conflicts.length > 0) {
      console.warn('[ShortcutManager] Key conflict detected:', conflicts);
      return false;
    }
    
    // 기존 키 매핑 제거
    this.keyMap.delete(shortcut.currentKey);
    
    // 새 키 설정
    shortcut.currentKey = newKey;
    this.keyMap.set(newKey, id);
    
    // 저장
    this.saveCustomShortcuts();
    
    return true;
  }
  
  // 충돌 검사
  checkConflicts(key: string, excludeId?: string): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];
    const conflictingShortcuts: KeyboardShortcut[] = [];
    
    this.shortcuts.forEach(shortcut => {
      if (shortcut.id !== excludeId && shortcut.currentKey === key && shortcut.enabled) {
        conflictingShortcuts.push(shortcut);
      }
    });
    
    if (conflictingShortcuts.length > 0) {
      conflicts.push({ key, shortcuts: conflictingShortcuts });
    }
    
    return conflicts;
  }
  
  // 키 조합 파싱
  private parseKeyCombo(event: KeyboardEvent): string {
    const parts: string[] = [];
    
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    
    // 특수 키 처리
    const key = event.key;
    if (key.length === 1) {
      parts.push(key.toUpperCase());
    } else {
      parts.push(key);
    }
    
    return parts.join('+');
  }
  
  // 이벤트 핸들러
  private setupEventHandler() {
    this.eventHandler = (event: KeyboardEvent) => {
      const keyCombo = this.parseKeyCombo(event);
      const shortcutId = this.keyMap.get(keyCombo);
      
      if (shortcutId) {
        const shortcut = this.shortcuts.get(shortcutId);
        if (shortcut && shortcut.enabled) {
          event.preventDefault();
          event.stopPropagation();
          
          console.log(`[ShortcutManager] Executing shortcut: ${shortcut.name} (${keyCombo})`);
          shortcut.action();
        }
      }
    };
    
    document.addEventListener('keydown', this.eventHandler, true);
  }
}
```

**구현 파일:**
- `src/lib/shortcutManager.ts` - 단축키 관리 로직
- `src/components/ShortcutSettings.svelte` - 단축키 설정 UI
- `src/components/ShortcutRecorder.svelte` - 키 조합 입력 컴포넌트

**예상 개발 시간:** 4-5일

---

## 🎯 사용자 경험 개선

### 5. 알림 미리보기 시스템

**목적:** 설정 변경 시 실시간으로 결과를 확인할 수 있도록 함

**구현 방안:**
```typescript
// src/lib/previewManager.ts
export class PreviewManager {
  private previewElement: HTMLElement | null = null;
  private previewTimeout: NodeJS.Timeout | null = null;
  
  // 미리보기 표시
  showPreview(settings: Partial<AppSettings>) {
    this.clearPreview();
    
    const mockFollower = {
      user: {
        nickname: '미리보기 사용자',
        profileImageUrl: '/default_profile.png'
      },
      followingSince: new Date().toISOString()
    };
    
    this.previewElement = this.createPreviewElement(mockFollower, settings);
    document.body.appendChild(this.previewElement);
    
    // 3초 후 자동 제거
    this.previewTimeout = setTimeout(() => {
      this.clearPreview();
    }, 3000);
  }
  
  private createPreviewElement(follower: any, settings: Partial<AppSettings>): HTMLElement {
    const element = document.createElement('div');
    element.className = 'notification-preview';
    element.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.9);
      color: ${settings.textColor || '#ffffff'};
      font-size: ${(settings.textSize || 100) / 100}em;
      padding: 16px;
      border-radius: 8px;
      border: 2px solid #007bff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: ${settings.animationType || 'fade'}In 0.3s ease;
    `;
    
    element.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${follower.user.profileImageUrl}" 
             style="width: 40px; height: 40px; border-radius: 50%;" />
        <div>
          <div style="font-weight: bold;">${follower.user.nickname}</div>
          <div style="opacity: 0.8; font-size: 0.9em;">새로운 팔로워!</div>
        </div>
      </div>
      <div style="margin-top: 8px; font-size: 0.8em; opacity: 0.6;">
        미리보기 - 실제 알림이 아닙니다
      </div>
    `;
    
    return element;
  }
}
```

**예상 개발 시간:** 1-2일

---

### 6. 통계 대시보드

**목적:** 팔로워 증감 추이와 패턴을 시각적으로 제공

**구현 방안:**
```typescript
// src/lib/statisticsManager.ts
export interface FollowerStats {
  // 기본 통계
  totalFollowers: number;
  todayNew: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
  
  // 시간대별 분석
  peakHours: Array<{
    hour: number;
    count: number;
    percentage: number;
  }>;
  
  // 일별 분석
  dailyStats: Array<{
    date: string;
    newFollowers: number;
    totalFollowers: number;
  }>;
  
  // 성장률 분석
  growthRate: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  
  // 예측 데이터
  predictions: {
    nextWeek: number;
    nextMonth: number;
    confidence: number;
  };
}

export class StatisticsManager {
  private readonly STATS_STORAGE_KEY = 'fazzk-statistics';
  private stats: FollowerStats;
  
  // 통계 업데이트
  updateStats(newFollower: FollowerItem) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // 일별 통계 업데이트
    let todayStats = this.stats.dailyStats.find(s => s.date === today);
    if (!todayStats) {
      todayStats = {
        date: today,
        newFollowers: 0,
        totalFollowers: this.stats.totalFollowers
      };
      this.stats.dailyStats.push(todayStats);
    }
    
    todayStats.newFollowers++;
    this.stats.totalFollowers++;
    this.stats.todayNew++;
    
    // 시간대별 통계 업데이트
    const hour = now.getHours();
    let hourStats = this.stats.peakHours.find(h => h.hour === hour);
    if (!hourStats) {
      hourStats = { hour, count: 0, percentage: 0 };
      this.stats.peakHours.push(hourStats);
    }
    hourStats.count++;
    
    // 성장률 계산
    this.calculateGrowthRates();
    
    // 예측 계산
    this.calculatePredictions();
    
    // 저장
    this.saveStats();
  }
  
  // 차트 데이터 생성
  generateChartData(type: 'daily' | 'hourly' | 'growth'): any {
    switch (type) {
      case 'daily':
        return {
          labels: this.stats.dailyStats.slice(-30).map(s => s.date),
          datasets: [{
            label: '새 팔로워',
            data: this.stats.dailyStats.slice(-30).map(s => s.newFollowers),
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            tension: 0.4
          }]
        };
        
      case 'hourly':
        return {
          labels: Array.from({length: 24}, (_, i) => `${i}시`),
          datasets: [{
            label: '시간대별 팔로워',
            data: Array.from({length: 24}, (_, hour) => {
              const hourStat = this.stats.peakHours.find(h => h.hour === hour);
              return hourStat ? hourStat.count : 0;
            }),
            backgroundColor: 'rgba(0, 123, 255, 0.6)',
            borderColor: '#007bff'
          }]
        };
        
      case 'growth':
        return {
          labels: this.stats.dailyStats.slice(-30).map(s => s.date),
          datasets: [{
            label: '누적 팔로워',
            data: this.stats.dailyStats.slice(-30).map(s => s.totalFollowers),
            borderColor: '#28a745',
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            tension: 0.4
          }]
        };
    }
  }
}
```

**구현 파일:**
- `src/lib/statisticsManager.ts` - 통계 관리 로직
- `src/components/StatsDashboard.svelte` - 대시보드 메인
- `src/components/StatsChart.svelte` - 차트 컴포넌트
- `src/lib/chartUtils.ts` - Chart.js 유틸리티

**예상 개발 시간:** 5-7일

---

### 7. 알림 필터링 시스템

**목적:** 원하지 않는 알림을 차단하고 중요한 알림만 받기

**구현 방안:**
```typescript
// src/lib/filterManager.ts
export interface NotificationFilter {
  id: string;
  name: string;
  enabled: boolean;
  
  // 사용자 필터
  includeUsers: string[]; // 특정 사용자만 알림
  excludeUsers: string[]; // 특정 사용자 제외
  
  // 시간 필터
  timeRanges: Array<{
    start: string; // "09:00"
    end: string;   // "18:00"
    days: number[]; // 0=일요일, 1=월요일, ...
  }>;
  
  // 조건 필터
  minFollowTime: number; // 최소 팔로우 시간 (분)
  duplicateWindow: number; // 중복 방지 시간 (분)
  maxPerHour: number; // 시간당 최대 알림 수
  
  // 키워드 필터
  nicknamePatterns: Array<{
    pattern: string;
    type: 'include' | 'exclude';
    isRegex: boolean;
  }>;
}

export class FilterManager {
  private filters: NotificationFilter[] = [];
  private recentNotifications: Map<string, number> = new Map(); // userId -> timestamp
  private hourlyCount = 0;
  private lastHourReset = Date.now();
  
  // 알림 필터링 검사
  shouldShowNotification(follower: FollowerItem): FilterResult {
    const result: FilterResult = {
      allowed: true,
      reason: '',
      appliedFilters: []
    };
    
    for (const filter of this.filters) {
      if (!filter.enabled) continue;
      
      const filterResult = this.applyFilter(filter, follower);
      if (!filterResult.allowed) {
        result.allowed = false;
        result.reason = filterResult.reason;
        result.appliedFilters.push(filter.name);
        break;
      }
    }
    
    // 시간당 제한 검사
    if (result.allowed) {
      this.checkHourlyLimit();
      if (this.hourlyCount >= this.getMaxPerHour()) {
        result.allowed = false;
        result.reason = '시간당 알림 한도 초과';
      }
    }
    
    return result;
  }
  
  private applyFilter(filter: NotificationFilter, follower: FollowerItem): FilterResult {
    const userId = follower.user.userIdHash;
    const nickname = follower.user.nickname;
    
    // 사용자 포함/제외 필터
    if (filter.includeUsers.length > 0 && !filter.includeUsers.includes(userId)) {
      return { allowed: false, reason: '포함 목록에 없는 사용자' };
    }
    
    if (filter.excludeUsers.includes(userId)) {
      return { allowed: false, reason: '제외 목록의 사용자' };
    }
    
    // 시간 필터
    if (!this.isInTimeRange(filter.timeRanges)) {
      return { allowed: false, reason: '알림 허용 시간이 아님' };
    }
    
    // 중복 방지 필터
    const lastNotification = this.recentNotifications.get(userId);
    if (lastNotification && Date.now() - lastNotification < filter.duplicateWindow * 60000) {
      return { allowed: false, reason: '중복 알림 방지' };
    }
    
    // 닉네임 패턴 필터
    for (const pattern of filter.nicknamePatterns) {
      const matches = pattern.isRegex 
        ? new RegExp(pattern.pattern).test(nickname)
        : nickname.includes(pattern.pattern);
        
      if (pattern.type === 'include' && !matches) {
        return { allowed: false, reason: '닉네임 패턴 불일치' };
      }
      
      if (pattern.type === 'exclude' && matches) {
        return { allowed: false, reason: '제외 닉네임 패턴 일치' };
      }
    }
    
    return { allowed: true, reason: '' };
  }
  
  // 필터 프리셋
  createPreset(name: string, type: 'work' | 'sleep' | 'focus' | 'custom'): NotificationFilter {
    const presets = {
      work: {
        name: '업무 시간',
        timeRanges: [{
          start: '09:00',
          end: '18:00',
          days: [1, 2, 3, 4, 5] // 월-금
        }],
        maxPerHour: 10,
        duplicateWindow: 30
      },
      sleep: {
        name: '수면 시간',
        timeRanges: [{
          start: '22:00',
          end: '08:00',
          days: [0, 1, 2, 3, 4, 5, 6] // 매일
        }],
        maxPerHour: 0, // 알림 차단
        duplicateWindow: 0
      },
      focus: {
        name: '집중 모드',
        maxPerHour: 3,
        duplicateWindow: 60,
        minFollowTime: 5
      }
    };
    
    const preset = presets[type] || {};
    return {
      id: crypto.randomUUID(),
      name,
      enabled: true,
      includeUsers: [],
      excludeUsers: [],
      timeRanges: [],
      minFollowTime: 0,
      duplicateWindow: 5,
      maxPerHour: 20,
      nicknamePatterns: [],
      ...preset
    };
  }
}

interface FilterResult {
  allowed: boolean;
  reason: string;
  appliedFilters?: string[];
}
```

**구현 파일:**
- `src/lib/filterManager.ts` - 필터링 로직
- `src/components/FilterSettings.svelte` - 필터 설정 UI
- `src/components/FilterPresets.svelte` - 프리셋 관리
- `src/components/FilterStats.svelte` - 필터링 통계

**예상 개발 시간:** 4-6일

---

## 🔧 기술적 개선사항

### 8. 오프라인 모드

**목적:** 네트워크 연결이 불안정해도 기본 기능 유지

**구현 방안:**
```typescript
// src/lib/offlineManager.ts
export interface QueuedAction {
  id: string;
  type: 'settings_update' | 'history_save' | 'backup_create';
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export class OfflineManager {
  private isOnline = navigator.onLine;
  private actionQueue: QueuedAction[] = [];
  private syncInProgress = false;
  
  constructor() {
    this.setupEventListeners();
    this.loadQueuedActions();
    this.startPeriodicSync();
  }
  
  private setupEventListeners() {
    window.addEventListener('online', () => {
      console.log('[OfflineManager] Connection restored');
      this.isOnline = true;
      this.syncQueuedActions();
    });
    
    window.addEventListener('offline', () => {
      console.log('[OfflineManager] Connection lost');
      this.isOnline = false;
    });
  }
  
  // 액션 큐에 추가
  queueAction(type: QueuedAction['type'], data: any): string {
    const action: QueuedAction = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };
    
    this.actionQueue.push(action);
    this.saveQueuedActions();
    
    // 온라인 상태면 즉시 실행 시도
    if (this.isOnline) {
      this.syncQueuedActions();
    }
    
    return action.id;
  }
  
  // 큐된 액션 동기화
  private async syncQueuedActions() {
    if (this.syncInProgress || !this.isOnline || this.actionQueue.length === 0) {
      return;
    }
    
    this.syncInProgress = true;
    console.log(`[OfflineManager] Syncing ${this.actionQueue.length} queued actions`);
    
    const actionsToProcess = [...this.actionQueue];
    
    for (const action of actionsToProcess) {
      try {
        await this.executeAction(action);
        
        // 성공 시 큐에서 제거
        this.actionQueue = this.actionQueue.filter(a => a.id !== action.id);
        console.log(`[OfflineManager] Action ${action.type} executed successfully`);
        
      } catch (error) {
        console.error(`[OfflineManager] Action ${action.type} failed:`, error);
        
        action.retryCount++;
        if (action.retryCount >= action.maxRetries) {
          // 최대 재시도 횟수 초과 시 제거
          this.actionQueue = this.actionQueue.filter(a => a.id !== action.id);
          console.warn(`[OfflineManager] Action ${action.type} discarded after ${action.maxRetries} retries`);
        }
      }
    }
    
    this.saveQueuedActions();
    this.syncInProgress = false;
  }
  
  private async executeAction(action: QueuedAction): Promise<void> {
    switch (action.type) {
      case 'settings_update':
        await this.syncSettings(action.data);
        break;
        
      case 'history_save':
        await this.syncHistory(action.data);
        break;
        
      case 'backup_create':
        await this.syncBackup(action.data);
        break;
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  // 오프라인 상태 표시
  showOfflineIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: #ffc107;
      color: #000;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    indicator.textContent = '오프라인 모드 - 일부 기능이 제한됩니다';
    
    document.body.appendChild(indicator);
    
    // 온라인 복구 시 제거
    const removeIndicator = () => {
      const element = document.getElementById('offline-indicator');
      if (element) {
        element.remove();
      }
      window.removeEventListener('online', removeIndicator);
    };
    
    window.addEventListener('online', removeIndicator);
  }
}
```

**예상 개발 시간:** 3-4일

---

### 9. 성능 모니터링 시스템

**목적:** 앱 성능 문제를 실시간으로 감지하고 최적화

**구현 방안:**
```typescript
// src/lib/performanceMonitor.ts
export interface PerformanceMetrics {
  // 메모리 관련
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  
  // CPU 관련 (추정)
  cpuUsage: {
    percentage: number;
    trend: 'stable' | 'increasing' | 'decreasing';
  };
  
  // 네트워크 관련
  networkLatency: {
    average: number;
    current: number;
    status: 'good' | 'slow' | 'poor';
  };
  
  // 렌더링 성능
  renderMetrics: {
    fps: number;
    frameTime: number;
    longTasks: number;
  };
  
  // 에러 통계
  errorStats: {
    count: number;
    lastError: string;
    errorRate: number; // 에러/분
  };
  
  // 사용자 상호작용
  userMetrics: {
    clickLatency: number;
    modalOpenTime: number;
    settingsSaveTime: number;
  };
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private observers: Map<string, PerformanceObserver> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  
  constructor() {
    this.initializeMetrics();
    this.setupObservers();
    this.startMonitoring();
  }
  
  private setupObservers() {
    // Long Task Observer (메인 스레드 블로킹 감지)
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        this.metrics.renderMetrics.longTasks += entries.length;
        
        entries.forEach(entry => {
          if (entry.duration > 50) { // 50ms 이상
            console.warn(`[Performance] Long task detected: ${entry.duration}ms`);
          }
        });
      });
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.set('longtask', longTaskObserver);
      } catch (e) {
        console.warn('[Performance] Long task observer not supported');
      }
    }
    
    // Navigation Timing Observer
    const navigationObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.entryType === 'navigation') {
          const navEntry = entry as PerformanceNavigationTiming;
          console.log('[Performance] Navigation timing:', {
            domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart,
            loadComplete: navEntry.loadEventEnd - navEntry.loadEventStart,
            totalTime: navEntry.loadEventEnd - navEntry.fetchStart
          });
        }
      });
    });
    
    try {
      navigationObserver.observe({ entryTypes: ['navigation'] });
      this.observers.set('navigation', navigationObserver);
    } catch (e) {
      console.warn('[Performance] Navigation observer not supported');
    }
  }
  
  // FPS 측정
  private measureFPS() {
    let frames = 0;
    let lastTime = performance.now();
    
    const countFrame = (currentTime: number) => {
      frames++;
      
      if (currentTime - lastTime >= 1000) {
        this.metrics.renderMetrics.fps = Math.round((frames * 1000) / (currentTime - lastTime));
        this.metrics.renderMetrics.frameTime = (currentTime - lastTime) / frames;
        
        frames = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(countFrame);
    };
    
    requestAnimationFrame(countFrame);
  }
  
  // 네트워크 지연시간 측정
  private async measureNetworkLatency(): Promise<number> {
    const start = performance.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/ping`, {
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      const latency = performance.now() - start;
      
      // 평균 계산 (이동 평균)
      const currentAvg = this.metrics.networkLatency.average;
      this.metrics.networkLatency.average = currentAvg === 0 
        ? latency 
        : (currentAvg * 0.8) + (latency * 0.2);
      
      this.metrics.networkLatency.current = latency;
      
      // 상태 판정
      if (latency < 100) {
        this.metrics.networkLatency.status = 'good';
      } else if (latency < 300) {
        this.metrics.networkLatency.status = 'slow';
      } else {
        this.metrics.networkLatency.status = 'poor';
      }
      
      return latency;
      
    } catch (error) {
      console.error('[Performance] Network latency measurement failed:', error);
      return -1;
    }
  }
  
  // 성능 경고 시스템
  private checkPerformanceThresholds() {
    const warnings: string[] = [];
    
    // 메모리 사용량 경고
    if (this.metrics.memoryUsage.percentage > 85) {
      warnings.push(`높은 메모리 사용량: ${this.metrics.memoryUsage.percentage}%`);
    }
    
    // FPS 경고
    if (this.metrics.renderMetrics.fps < 30) {
      warnings.push(`낮은 FPS: ${this.metrics.renderMetrics.fps}`);
    }
    
    // 네트워크 지연 경고
    if (this.metrics.networkLatency.status === 'poor') {
      warnings.push(`높은 네트워크 지연: ${this.metrics.networkLatency.current}ms`);
    }
    
    // Long Task 경고
    if (this.metrics.renderMetrics.longTasks > 10) {
      warnings.push(`메인 스레드 블로킹 감지: ${this.metrics.renderMetrics.longTasks}개`);
      this.metrics.renderMetrics.longTasks = 0; // 리셋
    }
    
    // 경고 발생 시 처리
    if (warnings.length > 0) {
      console.warn('[Performance] Performance issues detected:', warnings);
      
      // 자동 최적화 시도
      this.attemptOptimization(warnings);
    }
  }
  
  // 자동 최적화
  private attemptOptimization(warnings: string[]) {
    warnings.forEach(warning => {
      if (warning.includes('메모리')) {
        // 메모리 정리 트리거
        window.dispatchEvent(new CustomEvent('memory-cleanup-requested', {
          detail: { trigger: 'performance', threshold: 85 }
        }));
      }
      
      if (warning.includes('FPS') || warning.includes('블로킹')) {
        // 애니메이션 품질 낮추기
        document.documentElement.style.setProperty('--animation-duration', '0.1s');
        
        // 5초 후 복원
        setTimeout(() => {
          document.documentElement.style.removeProperty('--animation-duration');
        }, 5000);
      }
    });
  }
  
  // 성능 리포트 생성
  generateReport(): PerformanceReport {
    return {
      timestamp: Date.now(),
      metrics: { ...this.metrics },
      recommendations: this.generateRecommendations(),
      systemInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        memory: (navigator as any).deviceMemory || 'unknown',
        cores: navigator.hardwareConcurrency || 'unknown'
      }
    };
  }
  
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.metrics.memoryUsage.percentage > 70) {
      recommendations.push('메모리 사용량이 높습니다. 히스토리 정리를 권장합니다.');
    }
    
    if (this.metrics.renderMetrics.fps < 45) {
      recommendations.push('렌더링 성능이 낮습니다. 애니메이션 효과를 줄여보세요.');
    }
    
    if (this.metrics.networkLatency.average > 200) {
      recommendations.push('네트워크 지연이 높습니다. 폴링 간격을 늘려보세요.');
    }
    
    if (this.metrics.errorStats.errorRate > 5) {
      recommendations.push('에러 발생률이 높습니다. 로그를 확인해보세요.');
    }
    
    return recommendations;
  }
}

interface PerformanceReport {
  timestamp: number;
  metrics: PerformanceMetrics;
  recommendations: string[];
  systemInfo: {
    userAgent: string;
    platform: string;
    memory: string | number;
    cores: string | number;
  };
}
```

**구현 파일:**
- `src/lib/performanceMonitor.ts` - 성능 모니터링 로직
- `src/components/PerformancePanel.svelte` - 성능 정보 표시
- `src/components/PerformanceChart.svelte` - 성능 차트
- `src/lib/performanceOptimizer.ts` - 자동 최적화 로직

**예상 개발 시간:** 4-5일

---

## 📊 구현 우선순위

### Phase 1 (즉시 구현 권장) - 2-3주
1. **토스트 알림 시스템** (2일)
2. **알림 미리보기** (2일)
3. **키보드 단축키 커스터마이징** (5일)

### Phase 2 (단기 목표) - 1-2개월
4. **설정 백업/복원** (4일)
5. **알림 필터링 시스템** (6일)
6. **성능 모니터링** (5일)
7. **오프라인 모드** (4일)

### Phase 3 (중장기 목표) - 2-3개월
8. **통계 대시보드** (7일)
9. **고급 애니메이션 시스템** (5일)
10. **접근성 개선** (6일)
11. **자동 업데이트 개선** (4일)

---

## 🎯 개발 가이드라인

### 코드 품질
- TypeScript 엄격 모드 사용
- 단위 테스트 커버리지 80% 이상
- ESLint + Prettier 규칙 준수
- 성능 최적화 고려

### 사용자 경험
- 접근성 (WCAG 2.1 AA 준수)
- 반응형 디자인
- 다국어 지원 준비
- 오프라인 기능 고려

### 기술적 고려사항
- 메모리 사용량 최적화
- 번들 크기 최소화
- 브라우저 호환성
- Tauri 특화 기능 활용

이 로드맵을 참고하여 단계적으로 개선해나가시면 됩니다. 어떤 기능부터 구현하고 싶으신지 알려주시면 더 구체적인 구현 가이드를 제공해드리겠습니다!