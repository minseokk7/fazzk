/**
 * 메모리 누수 방지를 위한 정리 유틸리티
 */

export interface CleanupFunction {
  (): void;
}

export class CleanupManager {
  private cleanupFunctions: Set<CleanupFunction> = new Set();
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private eventListeners: Array<{
    element: EventTarget;
    event: string;
    handler: EventListener;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  /**
   * 정리 함수 등록
   */
  addCleanup(fn: CleanupFunction): void {
    this.cleanupFunctions.add(fn);
  }

  /**
   * 타이머 등록 및 관리
   */
  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    
    this.timers.add(timer);
    return timer;
  }

  /**
   * 인터벌 등록 및 관리
   */
  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    const interval = setInterval(callback, delay);
    this.intervals.add(interval);
    return interval;
  }

  /**
   * 이벤트 리스너 등록 및 관리
   */
  addEventListener(
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    element.addEventListener(event, handler, options);
    this.eventListeners.push({ 
      element, 
      event, 
      handler, 
      ...(options !== undefined && { options })
    });
  }

  /**
   * 특정 타이머 제거
   */
  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  /**
   * 특정 인터벌 제거
   */
  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  /**
   * 모든 리소스 정리
   */
  cleanup(): void {
    // 정리 함수들 실행
    this.cleanupFunctions.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.error('[CleanupManager] Error in cleanup function:', error);
      }
    });
    this.cleanupFunctions.clear();

    // 타이머들 정리
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    // 인터벌들 정리
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();

    // 이벤트 리스너들 정리
    this.eventListeners.forEach(({ element, event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.error('[CleanupManager] Error removing event listener:', error);
      }
    });
    this.eventListeners.length = 0;

    console.log('[CleanupManager] All resources cleaned up');
  }

  /**
   * 현재 등록된 리소스 개수 반환
   */
  getResourceCount(): {
    cleanupFunctions: number;
    timers: number;
    intervals: number;
    eventListeners: number;
  } {
    return {
      cleanupFunctions: this.cleanupFunctions.size,
      timers: this.timers.size,
      intervals: this.intervals.size,
      eventListeners: this.eventListeners.length,
    };
  }
}

/**
 * Svelte 컴포넌트에서 사용할 수 있는 정리 훅
 */
export function createCleanupManager(): CleanupManager {
  return new CleanupManager();
}

/**
 * 안전한 타이머 생성 함수
 */
export function safeSetTimeout(callback: () => void, delay: number): NodeJS.Timeout {
  const timer = setTimeout(() => {
    try {
      callback();
    } catch (error) {
      console.error('[safeSetTimeout] Error in callback:', error);
    }
  }, delay);
  
  return timer;
}

/**
 * 안전한 인터벌 생성 함수
 */
export function safeSetInterval(callback: () => void, delay: number): NodeJS.Timeout {
  const interval = setInterval(() => {
    try {
      callback();
    } catch (error) {
      console.error('[safeSetInterval] Error in callback:', error);
    }
  }, delay);
  
  return interval;
}

/**
 * 디바운스 함수 (메모리 효율적)
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * 스로틀 함수 (메모리 효율적)
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
        timeoutId = null;
      }, delay - (now - lastCall));
    }
  };
}