/**
 * 중앙화된 설정 관리 시스템
 */

import type { AppSettings, AnimationType, NotificationLayout } from '../types/common';

// 설정 기본값 정의
export const DEFAULT_SETTINGS: AppSettings = {
  volume: 0.5,
  pollingInterval: 15,
  displayDuration: 5,
  enableTTS: false,
  customSoundPath: null,
  animationType: 'fade' as AnimationType,
  notificationLayout: 'vertical' as NotificationLayout,
  textColor: '#ffffff',
  textSize: 100
};

// 설정 키 상수
export const SETTINGS_KEYS = {
  STORAGE_KEY: 'fazzk-app-settings',
  SERVER_ENDPOINT: '/settings'
} as const;

// 설정 검증 규칙
export const SETTINGS_VALIDATION = {
  volume: { min: 0, max: 1, step: 0.1 },
  pollingInterval: { min: 5, max: 300, step: 1 },
  displayDuration: { min: 1, max: 30, step: 1 },
  textSize: { min: 50, max: 200, step: 10 },
  animationType: ['fade', 'slide-up', 'slide-down', 'bounce'],
  notificationLayout: ['vertical', 'horizontal'],
  textColor: /^#[0-9A-Fa-f]{6}$/
} as const;

// 설정 변경 이벤트 타입
export interface SettingsChangeEvent {
  key: keyof AppSettings;
  oldValue: any;
  newValue: any;
  source: 'local' | 'server' | 'url' | 'user';
}

// 설정 변경 리스너 타입
export type SettingsChangeListener = (event: SettingsChangeEvent) => void;

/**
 * 중앙화된 설정 관리 클래스
 */
export class SettingsManager {
  private settings: AppSettings;
  private listeners: Set<SettingsChangeListener> = new Set();
  private batchSaveTimeout: NodeJS.Timeout | null = null;
  private isDirty = false;
  private baseUrl = '';

  constructor(baseUrl: string = '') {
    this.settings = { ...DEFAULT_SETTINGS };
    this.baseUrl = baseUrl;
  }

  /**
   * 설정값 가져오기
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  /**
   * 모든 설정 가져오기
   */
  getAll(): AppSettings {
    return { ...this.settings };
  }

  /**
   * 설정값 설정하기 (검증 포함)
   */
  set<K extends keyof AppSettings>(
    key: K, 
    value: AppSettings[K], 
    source: SettingsChangeEvent['source'] = 'user'
  ): boolean {
    // 값 검증
    if (!this.validateSetting(key, value)) {
      console.error(`[SettingsManager] Invalid value for ${key}:`, value);
      return false;
    }

    const oldValue = this.settings[key];
    
    // 값이 실제로 변경되었는지 확인
    if (oldValue === value) {
      return true; // 변경되지 않았지만 성공으로 처리
    }

    // 값 설정
    this.settings[key] = value;
    this.isDirty = true;

    // 변경 이벤트 발생
    const event: SettingsChangeEvent = {
      key,
      oldValue,
      newValue: value,
      source
    };

    this.notifyListeners(event);

    // 배치 저장 스케줄링
    this.scheduleBatchSave();

    console.log(`[SettingsManager] Setting changed: ${key} = ${value} (source: ${source})`);
    return true;
  }

  /**
   * 여러 설정을 한번에 설정
   */
  setMultiple(
    settings: Partial<AppSettings>, 
    source: SettingsChangeEvent['source'] = 'user'
  ): boolean {
    let allSuccess = true;
    const changes: SettingsChangeEvent[] = [];

    // 모든 설정을 먼저 검증
    for (const [key, value] of Object.entries(settings)) {
      if (!this.validateSetting(key as keyof AppSettings, value)) {
        console.error(`[SettingsManager] Invalid value for ${key}:`, value);
        allSuccess = false;
      }
    }

    if (!allSuccess) {
      return false;
    }

    // 검증 통과 후 일괄 적용
    for (const [key, value] of Object.entries(settings)) {
      const settingKey = key as keyof AppSettings;
      const oldValue = this.settings[settingKey];
      
      if (oldValue !== value) {
        (this.settings as any)[settingKey] = value;
        changes.push({
          key: settingKey,
          oldValue,
          newValue: value,
          source
        });
      }
    }

    // 변경사항이 있는 경우에만 처리
    if (changes.length > 0) {
      this.isDirty = true;
      
      // 모든 변경 이벤트 발생
      changes.forEach(event => this.notifyListeners(event));
      
      // 배치 저장 스케줄링
      this.scheduleBatchSave();
      
      console.log(`[SettingsManager] Multiple settings changed:`, changes.map(c => c.key));
    }

    return true;
  }

  /**
   * 설정 초기화
   */
  reset(): void {
    const oldSettings = { ...this.settings };
    this.settings = { ...DEFAULT_SETTINGS };
    this.isDirty = true;

    // 모든 설정에 대해 변경 이벤트 발생
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>) {
      if (oldSettings[key] !== this.settings[key]) {
        this.notifyListeners({
          key,
          oldValue: oldSettings[key],
          newValue: this.settings[key],
          source: 'user'
        });
      }
    }

    this.scheduleBatchSave();
    console.log('[SettingsManager] Settings reset to defaults');
  }

  /**
   * 로컬 스토리지에서 설정 로드
   */
  async loadFromStorage(): Promise<boolean> {
    try {
      const stored = localStorage.getItem(SETTINGS_KEYS.STORAGE_KEY);
      if (!stored) {
        console.log('[SettingsManager] No stored settings found');
        return true;
      }

      const parsedSettings = JSON.parse(stored);
      
      // 저장된 설정 검증 및 적용
      const validSettings: Partial<AppSettings> = {};
      
      for (const [key, value] of Object.entries(parsedSettings)) {
        if (this.validateSetting(key as keyof AppSettings, value)) {
          (validSettings as any)[key as keyof AppSettings] = value;
        } else {
          console.warn(`[SettingsManager] Invalid stored setting ignored: ${key} = ${value}`);
        }
      }

      if (Object.keys(validSettings).length > 0) {
        this.setMultiple(validSettings, 'local');
        console.log(`[SettingsManager] Loaded ${Object.keys(validSettings).length} settings from storage`);
      }

      return true;
    } catch (error) {
      console.error('[SettingsManager] Failed to load from storage:', error);
      return false;
    }
  }

  /**
   * 서버에서 설정 로드
   */
  async loadFromServer(): Promise<boolean> {
    if (!this.baseUrl) {
      console.log('[SettingsManager] No base URL provided, skipping server load');
      return true;
    }

    try {
      const response = await fetch(`${this.baseUrl}${SETTINGS_KEYS.SERVER_ENDPOINT}`);
      
      if (!response.ok) {
        console.log(`[SettingsManager] Server settings not available: ${response.status}`);
        return false;
      }

      const serverSettings = await response.json();
      
      // 서버 설정 검증 및 적용
      const validSettings: Partial<AppSettings> = {};
      
      for (const [key, value] of Object.entries(serverSettings)) {
        if (this.validateSetting(key as keyof AppSettings, value)) {
          (validSettings as any)[key as keyof AppSettings] = value;
        } else {
          console.warn(`[SettingsManager] Invalid server setting ignored: ${key} = ${value}`);
        }
      }

      if (Object.keys(validSettings).length > 0) {
        this.setMultiple(validSettings, 'server');
        console.log(`[SettingsManager] Loaded ${Object.keys(validSettings).length} settings from server`);
      }

      return true;
    } catch (error) {
      console.error('[SettingsManager] Failed to load from server:', error);
      return false;
    }
  }

  /**
   * URL 파라미터에서 설정 로드
   */
  loadFromURL(): boolean {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlSettings: Partial<AppSettings> = {};

      // URL 파라미터 매핑
      const paramMapping: Record<string, keyof AppSettings> = {
        volume: 'volume',
        pollingInterval: 'pollingInterval',
        displayDuration: 'displayDuration',
        enableTTS: 'enableTTS',
        textColor: 'textColor',
        textSize: 'textSize',
        notificationLayout: 'notificationLayout',
        animationType: 'animationType'
      };

      for (const [paramName, settingKey] of Object.entries(paramMapping)) {
        if (params.has(paramName)) {
          const paramValue = params.get(paramName)!;
          let parsedValue: any;

          // 타입별 파싱
          switch (settingKey) {
            case 'volume':
            case 'textSize':
              parsedValue = parseFloat(paramValue);
              break;
            case 'pollingInterval':
            case 'displayDuration':
              parsedValue = parseInt(paramValue);
              break;
            case 'enableTTS':
              parsedValue = paramValue === 'true';
              break;
            default:
              parsedValue = paramValue;
          }

          if (this.validateSetting(settingKey, parsedValue)) {
            (urlSettings as any)[settingKey] = parsedValue;
          } else {
            console.warn(`[SettingsManager] Invalid URL parameter ignored: ${paramName} = ${paramValue}`);
          }
        }
      }

      if (Object.keys(urlSettings).length > 0) {
        this.setMultiple(urlSettings, 'url');
        console.log(`[SettingsManager] Loaded ${Object.keys(urlSettings).length} settings from URL`);
      }

      return true;
    } catch (error) {
      console.error('[SettingsManager] Failed to load from URL:', error);
      return false;
    }
  }

  /**
   * 서버에 설정 저장
   */
  async saveToServer(): Promise<boolean> {
    if (!this.baseUrl) {
      console.log('[SettingsManager] No base URL provided, skipping server save');
      return true;
    }

    try {
      const response = await fetch(`${this.baseUrl}${SETTINGS_KEYS.SERVER_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.settings)
      });

      if (response.ok) {
        console.log('[SettingsManager] Settings saved to server successfully');
        return true;
      } else {
        console.error(`[SettingsManager] Server save failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('[SettingsManager] Failed to save to server:', error);
      return false;
    }
  }

  /**
   * 설정 변경 리스너 등록
   */
  addListener(listener: SettingsChangeListener): void {
    this.listeners.add(listener);
  }

  /**
   * 설정 변경 리스너 제거
   */
  removeListener(listener: SettingsChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 모든 리스너 제거
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * 설정값 검증
   */
  private validateSetting(key: keyof AppSettings, value: any): boolean {
    const validation = SETTINGS_VALIDATION[key as keyof typeof SETTINGS_VALIDATION];
    
    if (!validation) {
      return true; // 검증 규칙이 없으면 통과
    }

    switch (key) {
      case 'volume':
      case 'pollingInterval':
      case 'displayDuration':
      case 'textSize':
        const numValidation = validation as { min: number; max: number; step: number };
        return typeof value === 'number' && 
               value >= numValidation.min && 
               value <= numValidation.max;

      case 'animationType':
      case 'notificationLayout':
        const arrayValidation = validation as readonly string[];
        return arrayValidation.includes(value);

      case 'textColor':
        const regexValidation = validation as RegExp;
        return typeof value === 'string' && regexValidation.test(value);

      case 'enableTTS':
        return typeof value === 'boolean';

      case 'customSoundPath':
        return value === null || typeof value === 'string';

      default:
        return true;
    }
  }

  /**
   * 리스너들에게 변경 이벤트 알림
   */
  private notifyListeners(event: SettingsChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[SettingsManager] Listener error:', error);
      }
    });
  }

  /**
   * 배치 저장 스케줄링
   */
  private scheduleBatchSave(): void {
    if (this.batchSaveTimeout) {
      clearTimeout(this.batchSaveTimeout);
    }

    this.batchSaveTimeout = setTimeout(() => {
      this.performBatchSave();
      this.batchSaveTimeout = null;
    }, 100); // 100ms 디바운스
  }

  /**
   * 실제 배치 저장 수행
   */
  private async performBatchSave(): Promise<void> {
    if (!this.isDirty) {
      return;
    }

    try {
      // 로컬 스토리지에 저장
      localStorage.setItem(SETTINGS_KEYS.STORAGE_KEY, JSON.stringify(this.settings));
      console.log('[SettingsManager] Settings saved to localStorage');

      // 서버에 저장 (실패해도 계속 진행)
      await this.saveToServer();

      this.isDirty = false;
    } catch (error) {
      console.error('[SettingsManager] Batch save failed:', error);
    }
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    if (this.batchSaveTimeout) {
      clearTimeout(this.batchSaveTimeout);
      this.batchSaveTimeout = null;
    }

    // 마지막 저장 시도
    if (this.isDirty) {
      try {
        localStorage.setItem(SETTINGS_KEYS.STORAGE_KEY, JSON.stringify(this.settings));
      } catch (error) {
        console.error('[SettingsManager] Final save failed:', error);
      }
    }

    this.removeAllListeners();
    console.log('[SettingsManager] Destroyed');
  }
}

// 싱글톤 인스턴스 (필요시 사용)
let globalSettingsManager: SettingsManager | null = null;

export function getGlobalSettingsManager(baseUrl?: string): SettingsManager {
  if (!globalSettingsManager) {
    globalSettingsManager = new SettingsManager(baseUrl);
  }
  return globalSettingsManager;
}

export function destroyGlobalSettingsManager(): void {
  if (globalSettingsManager) {
    globalSettingsManager.destroy();
    globalSettingsManager = null;
  }
}