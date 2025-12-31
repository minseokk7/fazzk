import { writable } from 'svelte/store';

export interface MemoryStats {
  used: number;
  total: number;
  percentage: number;
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

export interface MemoryMonitorConfig {
  updateInterval: number; // 업데이트 간격 (ms)
  warningThreshold: number; // 경고 임계값 (%)
  criticalThreshold: number; // 위험 임계값 (%)
  autoCleanup: boolean; // 자동 정리 활성화
}

class MemoryMonitor {
  private config: MemoryMonitorConfig;
  private intervalId: number | null = null;
  private memoryStore = writable<MemoryStats>({
    used: 0,
    total: 0,
    percentage: 0
  });

  constructor(config: Partial<MemoryMonitorConfig> = {}) {
    this.config = {
      updateInterval: 5000, // 5초마다 업데이트
      warningThreshold: 70, // 70% 경고
      criticalThreshold: 85, // 85% 위험
      autoCleanup: true,
      ...config
    };
  }

  start() {
    if (this.intervalId) return;

    this.updateMemoryStats();
    this.intervalId = window.setInterval(() => {
      this.updateMemoryStats();
    }, this.config.updateInterval);

    console.log('[MemoryMonitor] Started monitoring');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MemoryMonitor] Stopped monitoring');
    }
  }

  private updateMemoryStats() {
    try {
      const stats = this.getMemoryStats();
      this.memoryStore.set(stats);

      // 자동 정리 로직
      if (this.config.autoCleanup) {
        if (stats.percentage >= this.config.criticalThreshold) {
          console.warn('[MemoryMonitor] Critical memory usage detected, triggering cleanup');
          this.triggerCleanup();
        } else if (stats.percentage >= this.config.warningThreshold) {
          console.warn('[MemoryMonitor] High memory usage detected:', stats.percentage + '%');
        }
      }
    } catch (error) {
      console.error('[MemoryMonitor] Error updating memory stats:', error);
    }
  }

  private getMemoryStats(): MemoryStats {
    // Performance API를 사용한 메모리 정보 (Chrome/Edge)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.jsHeapSizeLimit,
        percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize
      };
    }

    // Navigator API를 사용한 대략적인 메모리 정보
    if ('deviceMemory' in navigator) {
      const deviceMemory = (navigator as any).deviceMemory * 1024 * 1024 * 1024; // GB to bytes
      const estimatedUsed = deviceMemory * 0.3; // 대략적인 추정값
      return {
        used: estimatedUsed,
        total: deviceMemory,
        percentage: 30 // 추정값
      };
    }

    // 폴백: 기본값 반환
    return {
      used: 0,
      total: 0,
      percentage: 0
    };
  }

  private triggerCleanup() {
    try {
      // 가비지 컬렉션 강제 실행 (개발 환경에서만)
      if (window.gc && typeof window.gc === 'function') {
        window.gc();
        console.log('[MemoryMonitor] Manual garbage collection triggered');
      }

      // 커스텀 정리 이벤트 발생
      window.dispatchEvent(new CustomEvent('memory-cleanup-requested', {
        detail: { trigger: 'auto', threshold: this.config.criticalThreshold }
      }));

    } catch (error) {
      console.error('[MemoryMonitor] Error during cleanup:', error);
    }
  }

  // 수동 정리 트리거
  manualCleanup() {
    console.log('[MemoryMonitor] Manual cleanup requested');
    this.triggerCleanup();
  }

  // 메모리 통계 스토어 반환
  getStore() {
    return this.memoryStore;
  }

  // 현재 메모리 상태 반환
  getCurrentStats(): MemoryStats {
    return this.getMemoryStats();
  }

  // 설정 업데이트
  updateConfig(newConfig: Partial<MemoryMonitorConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    // 인터벌 재시작 (업데이트 간격이 변경된 경우)
    if (this.intervalId && newConfig.updateInterval) {
      this.stop();
      this.start();
    }
  }
}

// 싱글톤 인스턴스
export const memoryMonitor = new MemoryMonitor();

// 유틸리티 함수들
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getMemoryStatusColor(percentage: number): string {
  if (percentage >= 85) return '#ff4757'; // 위험 - 빨강
  if (percentage >= 70) return '#ffa502'; // 경고 - 주황
  if (percentage >= 50) return '#fffa65'; // 주의 - 노랑
  return '#2ed573'; // 정상 - 초록
}

export function getMemoryStatusText(percentage: number): string {
  if (percentage >= 85) return '위험';
  if (percentage >= 70) return '경고';
  if (percentage >= 50) return '주의';
  return '정상';
}