/**
 * 로딩 상태 관리 시스템
 */

import { createLogger } from './logger';

const log = createLogger('LoadingManager');

export interface LoadingState {
  id: string;
  message: string;
  progress?: number; // 0-100
  cancellable?: boolean;
  onCancel?: () => void;
  startTime: number;
  category?: 'api' | 'websocket' | 'file' | 'auth' | 'general';
  priority?: 'low' | 'medium' | 'high';
}

export interface LoadingStats {
  activeCount: number;
  totalStarted: number;
  averageDuration: number;
  longestDuration: number;
  byCategory: Record<string, number>;
}

export type LoadingListener = (states: LoadingState[]) => void;
export type LoadingStatsListener = (stats: LoadingStats) => void;

export class LoadingManager {
  private loadingStates = new Map<string, LoadingState>();
  private listeners = new Set<LoadingListener>();
  private statsListeners = new Set<LoadingStatsListener>();
  private completedOperations: Array<{ duration: number; category: string }> = [];
  private totalStarted = 0;
  private readonly maxCompletedHistory = 100;

  constructor() {
    log.info('LoadingManager initialized');
  }

  /**
   * 로딩 시작
   */
  start(
    id: string, 
    message: string, 
    options?: Partial<Omit<LoadingState, 'id' | 'message' | 'startTime'>>
  ): void {
    const state: LoadingState = {
      id,
      message,
      startTime: Date.now(),
      category: 'general',
      priority: 'medium',
      ...options
    };

    this.loadingStates.set(id, state);
    this.totalStarted++;
    
    log.debug(`Loading started: ${id} - ${message}`);
    this.notifyListeners();
    this.notifyStatsListeners();
  }

  /**
   * 진행률 업데이트
   */
  updateProgress(id: string, progress: number, message?: string): void {
    const state = this.loadingStates.get(id);
    if (!state) {
      log.warn(`Cannot update progress for unknown loading state: ${id}`);
      return;
    }

    state.progress = Math.max(0, Math.min(100, progress));
    if (message) {
      state.message = message;
    }

    log.debug(`Progress updated: ${id} - ${progress}% ${message || ''}`);
    this.notifyListeners();
  }

  /**
   * 메시지 업데이트
   */
  updateMessage(id: string, message: string): void {
    const state = this.loadingStates.get(id);
    if (!state) {
      log.warn(`Cannot update message for unknown loading state: ${id}`);
      return;
    }

    state.message = message;
    log.debug(`Message updated: ${id} - ${message}`);
    this.notifyListeners();
  }

  /**
   * 로딩 완료
   */
  finish(id: string): void {
    const state = this.loadingStates.get(id);
    if (!state) {
      log.warn(`Cannot finish unknown loading state: ${id}`);
      return;
    }

    const duration = Date.now() - state.startTime;
    
    // 완료된 작업 기록
    this.completedOperations.push({
      duration,
      category: state.category || 'general'
    });

    // 히스토리 크기 제한
    if (this.completedOperations.length > this.maxCompletedHistory) {
      this.completedOperations = this.completedOperations.slice(-this.maxCompletedHistory);
    }

    this.loadingStates.delete(id);
    
    log.debug(`Loading finished: ${id} (${duration}ms)`);
    this.notifyListeners();
    this.notifyStatsListeners();
  }

  /**
   * 로딩 취소
   */
  cancel(id: string): void {
    const state = this.loadingStates.get(id);
    if (!state) {
      log.warn(`Cannot cancel unknown loading state: ${id}`);
      return;
    }

    if (state.cancellable && state.onCancel) {
      try {
        state.onCancel();
        log.info(`Loading cancelled: ${id}`);
      } catch (error) {
        log.error(`Error cancelling loading ${id}:`, error);
      }
    }

    this.loadingStates.delete(id);
    this.notifyListeners();
    this.notifyStatsListeners();
  }

  /**
   * 모든 로딩 상태 가져오기
   */
  getAllStates(): LoadingState[] {
    return Array.from(this.loadingStates.values())
      .sort((a, b) => {
        // 우선순위별 정렬
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority || 'medium'];
        const bPriority = priorityOrder[b.priority || 'medium'];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        // 시작 시간순 정렬
        return a.startTime - b.startTime;
      });
  }

  /**
   * 특정 카테고리의 로딩 상태 가져오기
   */
  getStatesByCategory(category: string): LoadingState[] {
    return this.getAllStates().filter(state => state.category === category);
  }

  /**
   * 특정 로딩 상태 가져오기
   */
  getState(id: string): LoadingState | undefined {
    return this.loadingStates.get(id);
  }

  /**
   * 로딩 중인지 확인
   */
  isLoading(id?: string): boolean {
    if (id) {
      return this.loadingStates.has(id);
    }
    return this.loadingStates.size > 0;
  }

  /**
   * 특정 카테고리가 로딩 중인지 확인
   */
  isCategoryLoading(category: string): boolean {
    return this.getStatesByCategory(category).length > 0;
  }

  /**
   * 로딩 통계 생성
   */
  getStats(): LoadingStats {
    const activeStates = this.getAllStates();
    const byCategory: Record<string, number> = {};

    // 카테고리별 활성 로딩 수 계산
    activeStates.forEach(state => {
      const category = state.category || 'general';
      byCategory[category] = (byCategory[category] || 0) + 1;
    });

    // 평균 지속 시간 계산
    const averageDuration = this.completedOperations.length > 0
      ? this.completedOperations.reduce((sum, op) => sum + op.duration, 0) / this.completedOperations.length
      : 0;

    // 최장 지속 시간 계산
    const longestDuration = this.completedOperations.length > 0
      ? Math.max(...this.completedOperations.map(op => op.duration))
      : 0;

    return {
      activeCount: activeStates.length,
      totalStarted: this.totalStarted,
      averageDuration: Math.round(averageDuration),
      longestDuration,
      byCategory
    };
  }

  /**
   * 리스너 등록
   */
  addListener(listener: LoadingListener): () => void {
    this.listeners.add(listener);
    log.debug('Loading listener added');
    
    // 현재 상태 즉시 전달
    listener(this.getAllStates());
    
    // 제거 함수 반환
    return () => {
      this.listeners.delete(listener);
      log.debug('Loading listener removed');
    };
  }

  /**
   * 통계 리스너 등록
   */
  addStatsListener(listener: LoadingStatsListener): () => void {
    this.statsListeners.add(listener);
    log.debug('Loading stats listener added');
    
    // 현재 통계 즉시 전달
    listener(this.getStats());
    
    // 제거 함수 반환
    return () => {
      this.statsListeners.delete(listener);
      log.debug('Loading stats listener removed');
    };
  }

  /**
   * 리스너들에게 알림
   */
  private notifyListeners(): void {
    const states = this.getAllStates();
    this.listeners.forEach(listener => {
      try {
        listener(states);
      } catch (error) {
        log.error('Error in loading listener:', error);
      }
    });
  }

  /**
   * 통계 리스너들에게 알림
   */
  private notifyStatsListeners(): void {
    const stats = this.getStats();
    this.statsListeners.forEach(listener => {
      try {
        listener(stats);
      } catch (error) {
        log.error('Error in loading stats listener:', error);
      }
    });
  }

  /**
   * 모든 로딩 상태 정리
   */
  clear(): void {
    const activeIds = Array.from(this.loadingStates.keys());
    activeIds.forEach(id => this.finish(id));
    log.info('All loading states cleared');
  }

  /**
   * 오래된 로딩 상태 정리 (5분 이상)
   */
  cleanup(): void {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5분
    const toRemove: string[] = [];

    this.loadingStates.forEach((state, id) => {
      if (now - state.startTime > timeout) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => {
      log.warn(`Cleaning up stale loading state: ${id}`);
      this.finish(id);
    });

    if (toRemove.length > 0) {
      log.info(`Cleaned up ${toRemove.length} stale loading states`);
    }
  }

  /**
   * 자동 정리 시작 (5분마다)
   */
  startAutoCleanup(): () => void {
    const interval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);

    log.info('Auto cleanup started');

    return () => {
      clearInterval(interval);
      log.info('Auto cleanup stopped');
    };
  }
}

// 전역 인스턴스
export const loadingManager = new LoadingManager();

// 편의 함수들
export const startLoading = (id: string, message: string, options?: Partial<Omit<LoadingState, 'id' | 'message' | 'startTime'>>) => {
  loadingManager.start(id, message, options);
};

export const updateLoadingProgress = (id: string, progress: number, message?: string) => {
  loadingManager.updateProgress(id, progress, message);
};

export const updateLoadingMessage = (id: string, message: string) => {
  loadingManager.updateMessage(id, message);
};

export const finishLoading = (id: string) => {
  loadingManager.finish(id);
};

export const cancelLoading = (id: string) => {
  loadingManager.cancel(id);
};

export const isLoading = (id?: string) => {
  return loadingManager.isLoading(id);
};

// 자동 정리 시작
loadingManager.startAutoCleanup();