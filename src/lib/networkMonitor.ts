/**
 * 네트워크 상태 모니터링 시스템
 */

import { createLogger } from './logger';
import { connectionManager } from './connectionManager';
import { globalErrorHandler } from './errorHandler';

const log = createLogger('NetworkMonitor');

export interface NetworkState {
  online: boolean;
  effectiveType?: string; // '4g', '3g', '2g', 'slow-2g'
  downlink?: number; // Mbps
  rtt?: number; // ms
  saveData?: boolean;
  lastChanged: number;
}

export type NetworkListener = (state: NetworkState) => void;

export class NetworkMonitor {
  private state: NetworkState;
  private listeners = new Set<NetworkListener>();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs = 30000; // 30초마다 체크

  constructor() {
    this.state = {
      online: navigator.onLine,
      lastChanged: Date.now()
    };

    this.setupEventListeners();
    this.updateNetworkInfo();
    this.startPeriodicCheck();

    log.info('NetworkMonitor initialized');
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 온라인/오프라인 이벤트
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // 네트워크 정보 변경 이벤트 (지원하는 브라우저에서만)
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        connection.addEventListener('change', this.handleConnectionChange.bind(this));
      }
    }
  }

  /**
   * 온라인 상태로 변경
   */
  private handleOnline(): void {
    log.info('Network came online');
    
    this.state = {
      ...this.state,
      online: true,
      lastChanged: Date.now()
    };

    this.updateNetworkInfo();
    this.notifyListeners();

    // 연결 관리자에 온라인 상태 알림
    if (connectionManager.getState().status === 'disconnected') {
      setTimeout(() => {
        connectionManager.forceReconnect();
      }, 1000);
    }
  }

  /**
   * 오프라인 상태로 변경
   */
  private handleOffline(): void {
    log.warn('Network went offline');
    
    this.state = {
      ...this.state,
      online: false,
      lastChanged: Date.now()
    };

    this.notifyListeners();

    // 연결 관리자에 오프라인 상태 알림
    connectionManager.onDisconnected('Network offline');
  }

  /**
   * 네트워크 연결 정보 변경
   */
  private handleConnectionChange(): void {
    log.debug('Network connection changed');
    this.updateNetworkInfo();
    this.notifyListeners();
  }

  /**
   * 네트워크 정보 업데이트
   */
  private updateNetworkInfo(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        this.state = {
          ...this.state,
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData
        };

        log.debug('Network info updated:', {
          effectiveType: this.state.effectiveType,
          downlink: this.state.downlink,
          rtt: this.state.rtt,
          saveData: this.state.saveData
        });
      }
    }
  }

  /**
   * 주기적 네트워크 상태 확인
   */
  private startPeriodicCheck(): void {
    this.checkInterval = setInterval(() => {
      this.performConnectivityCheck();
    }, this.checkIntervalMs);
  }

  /**
   * 실제 연결성 테스트
   */
  private async performConnectivityCheck(): Promise<void> {
    if (!this.state.online) return;

    try {
      const start = performance.now();
      
      // 작은 이미지 파일로 연결성 테스트
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5초 타임아웃
      });

      const latency = performance.now() - start;

      if (response.ok) {
        log.debug(`Connectivity check passed (${Math.round(latency)}ms)`);
        
        // 연결 관리자에 지연시간 업데이트
        if (connectionManager.getState().status === 'connected') {
          connectionManager.updateLatency(latency);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      log.warn('Connectivity check failed:', error);
      
      // 실제로는 온라인이지만 연결에 문제가 있는 경우
      if (this.state.online) {
        globalErrorHandler.handleError(error as Error, {
          component: 'NetworkMonitor',
          operation: 'connectivity-check'
        });
      }
    }
  }

  /**
   * 네트워크 품질 평가
   */
  getNetworkQuality(): 'excellent' | 'good' | 'fair' | 'poor' | 'offline' {
    if (!this.state.online) return 'offline';

    const { effectiveType, rtt, downlink } = this.state;

    // RTT 기반 평가
    if (rtt !== undefined) {
      if (rtt < 100) return 'excellent';
      if (rtt < 300) return 'good';
      if (rtt < 1000) return 'fair';
      return 'poor';
    }

    // 연결 타입 기반 평가
    if (effectiveType) {
      switch (effectiveType) {
        case '4g': return 'excellent';
        case '3g': return 'good';
        case '2g': return 'fair';
        case 'slow-2g': return 'poor';
      }
    }

    // 다운링크 속도 기반 평가
    if (downlink !== undefined) {
      if (downlink > 10) return 'excellent';
      if (downlink > 1.5) return 'good';
      if (downlink > 0.5) return 'fair';
      return 'poor';
    }

    return 'good'; // 기본값
  }

  /**
   * 네트워크 상태에 따른 권장사항
   */
  getRecommendations(): string[] {
    const quality = this.getNetworkQuality();
    const recommendations: string[] = [];

    switch (quality) {
      case 'offline':
        recommendations.push('네트워크 연결을 확인해주세요');
        break;
        
      case 'poor':
        recommendations.push('네트워크 상태가 좋지 않습니다');
        recommendations.push('폴링 간격을 늘려보세요');
        if (this.state.saveData) {
          recommendations.push('데이터 절약 모드가 활성화되어 있습니다');
        }
        break;
        
      case 'fair':
        recommendations.push('네트워크 상태가 보통입니다');
        break;
        
      case 'good':
      case 'excellent':
        // 권장사항 없음
        break;
    }

    return recommendations;
  }

  /**
   * 리스너 등록
   */
  addListener(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // 현재 상태 즉시 전달
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 리스너들에게 알림
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        log.error('Error in network listener:', error);
      }
    });
  }

  /**
   * 현재 상태 반환
   */
  getState(): NetworkState {
    return { ...this.state };
  }

  /**
   * 수동 연결성 테스트
   */
  async testConnectivity(): Promise<boolean> {
    try {
      await this.performConnectivityCheck();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 정리
   */
  cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));

    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        connection.removeEventListener('change', this.handleConnectionChange.bind(this));
      }
    }

    this.listeners.clear();
    log.info('NetworkMonitor cleaned up');
  }
}

// 전역 인스턴스
export const networkMonitor = new NetworkMonitor();