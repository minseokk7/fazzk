/**
 * 연결 상태 관리 시스템
 */

import { createLogger } from './logger';
import { globalErrorHandler } from './errorHandler';
import { loadingManager } from './loadingManager';

const log = createLogger('ConnectionManager');

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';
  lastConnected?: number;
  lastDisconnected?: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  latency?: number;
  error?: string;
  connectionId?: string;
  serverInfo?: {
    version?: string;
    uptime?: number;
    clientCount?: number;
  };
}

export interface ConnectionMetrics {
  totalConnections: number;
  totalDisconnections: number;
  totalReconnects: number;
  averageLatency: number;
  uptime: number; // 총 연결 시간 (ms)
  reliability: number; // 0-100% 연결 안정성
  lastConnectionDuration: number;
}

export interface ReconnectStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean; // 재연결 시간에 랜덤 요소 추가
}

export type ConnectionListener = (state: ConnectionState) => void;
export type MetricsListener = (metrics: ConnectionMetrics) => void;

export class ConnectionManager {
  private state: ConnectionState;
  private metrics: ConnectionMetrics;
  private listeners = new Set<ConnectionListener>();
  private metricsListeners = new Set<MetricsListener>();
  
  private reconnectStrategy: ReconnectStrategy = {
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 1.5,
    jitter: true
  };

  private reconnectTimer: NodeJS.Timeout | null = null;
  private latencyTimer: NodeJS.Timeout | null = null;
  private connectionStartTime: number = 0;
  private lastPingTime: number = 0;
  private connectionHistory: Array<{ connected: number; disconnected?: number }> = [];
  private readonly maxHistorySize = 100;

  constructor(maxReconnectAttempts = 10) {
    this.state = {
      status: 'disconnected',
      reconnectAttempts: 0,
      maxReconnectAttempts
    };

    this.metrics = {
      totalConnections: 0,
      totalDisconnections: 0,
      totalReconnects: 0,
      averageLatency: 0,
      uptime: 0,
      reliability: 0,
      lastConnectionDuration: 0
    };

    log.info('ConnectionManager initialized');
  }

  /**
   * 연결 시작
   */
  startConnection(connectionId?: string): void {
    if (this.state.status === 'connecting') {
      log.warn('Already connecting');
      return;
    }

    this.connectionStartTime = Date.now();
    
    const newState: ConnectionState = {
      ...this.state,
      status: 'connecting',
      connectionId: connectionId || crypto.randomUUID()
    };
    
    // error 속성 제거 (undefined 할당 방지)
    if (newState.error !== undefined) {
      delete newState.error;
    }
    
    this.state = newState;

    log.info(`Starting connection: ${this.state.connectionId}`);
    this.notifyListeners();
  }

  /**
   * 연결 성공
   */
  onConnected(serverInfo?: ConnectionState['serverInfo']): void {
    const now = Date.now();
    const connectionTime = now - this.connectionStartTime;

    // 연결 기록 추가
    this.connectionHistory.push({ connected: now });
    if (this.connectionHistory.length > this.maxHistorySize) {
      this.connectionHistory = this.connectionHistory.slice(-this.maxHistorySize);
    }

    // 상태 업데이트
    const newState: ConnectionState = {
      ...this.state,
      status: 'connected',
      lastConnected: now,
      reconnectAttempts: 0
    };
    
    // error 속성 제거
    if (newState.error !== undefined) {
      delete newState.error;
    }
    
    // serverInfo 조건부 할당
    if (serverInfo) {
      newState.serverInfo = serverInfo;
    }
    
    this.state = newState;

    // 메트릭 업데이트
    this.metrics.totalConnections++;
    if (this.state.reconnectAttempts > 0) {
      this.metrics.totalReconnects++;
    }

    this.updateMetrics();
    this.clearReconnectTimer();

    log.info(`Connected successfully in ${connectionTime}ms`);
    this.notifyListeners();
    this.notifyMetricsListeners();

    // 지연시간 측정 시작
    this.startLatencyMeasurement();
  }

  /**
   * 연결 해제
   */
  onDisconnected(error?: string, code?: number): void {
    const now = Date.now();
    const wasConnected = this.state.status === 'connected';

    // 연결 기록 업데이트
    const lastConnection = this.connectionHistory[this.connectionHistory.length - 1];
    if (lastConnection && !lastConnection.disconnected) {
      lastConnection.disconnected = now;
      this.metrics.lastConnectionDuration = now - lastConnection.connected;
    }

    // 상태 업데이트
    const newState: ConnectionState = {
      ...this.state,
      status: error ? 'error' : 'disconnected',
      lastDisconnected: now
    };
    
    // error 속성 조건부 할당
    if (error) {
      newState.error = error;
    }
    
    this.state = newState;

    // 메트릭 업데이트
    if (wasConnected) {
      this.metrics.totalDisconnections++;
    }

    this.updateMetrics();
    this.stopLatencyMeasurement();

    log.info(`Disconnected${error ? ` with error: ${error}` : ''}`);
    this.notifyListeners();
    this.notifyMetricsListeners();

    // 에러 리포팅
    if (error) {
      globalErrorHandler.handleError(new Error(error), {
        component: 'ConnectionManager',
        code,
        connectionId: this.state.connectionId
      });
    }
  }

  /**
   * 재연결 시작
   */
  startReconnect(): void {
    if (this.state.status === 'connecting' || this.state.status === 'connected') {
      log.warn('Cannot start reconnect - already connecting or connected');
      return;
    }

    if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached');
      this.state = {
        ...this.state,
        status: 'error',
        error: `Max reconnect attempts reached (${this.state.maxReconnectAttempts})`
      };
      this.notifyListeners();
      return;
    }

    this.state.reconnectAttempts++;
    this.state.status = 'reconnecting';

    const delay = this.calculateReconnectDelay();
    
    log.info(`Scheduling reconnect attempt ${this.state.reconnectAttempts}/${this.state.maxReconnectAttempts} in ${delay}ms`);

    // 로딩 표시
    const loadingId = `reconnect-${this.state.reconnectAttempts}`;
    loadingManager.start(loadingId, `재연결 시도 중... (${this.state.reconnectAttempts}/${this.state.maxReconnectAttempts})`, {
      category: 'websocket',
      priority: 'high',
      cancellable: true,
      onCancel: () => this.cancelReconnect()
    });

    this.notifyListeners();

    this.reconnectTimer = setTimeout(() => {
      loadingManager.finish(loadingId);
      this.executeReconnect();
    }, delay);
  }

  /**
   * 재연결 실행
   */
  private executeReconnect(): void {
    log.info(`Executing reconnect attempt ${this.state.reconnectAttempts}`);
    
    // 연결 시도 (실제 연결 로직은 WebSocket 클라이언트에서 처리)
    this.startConnection();
    
    // 재연결 이벤트 발생
    window.dispatchEvent(new CustomEvent('connection:reconnect', {
      detail: {
        attempt: this.state.reconnectAttempts,
        maxAttempts: this.state.maxReconnectAttempts
      }
    }));
  }

  /**
   * 재연결 취소
   */
  cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.state = {
      ...this.state,
      status: 'disconnected',
      reconnectAttempts: 0
    };

    log.info('Reconnect cancelled');
    this.notifyListeners();
  }

  /**
   * 강제 재연결
   */
  forceReconnect(): void {
    this.cancelReconnect();
    this.state.reconnectAttempts = 0;
    
    // error 속성 제거
    if (this.state.error !== undefined) {
      delete this.state.error;
    }
    
    // 현재 연결 해제 요청
    window.dispatchEvent(new CustomEvent('connection:force-disconnect'));
    
    // 잠시 후 재연결 시도
    setTimeout(() => {
      this.startReconnect();
    }, 1000);
  }

  /**
   * 지연시간 업데이트
   */
  updateLatency(latency: number): void {
    this.state.latency = latency;
    
    // 평균 지연시간 계산 (이동 평균)
    if (this.metrics.averageLatency === 0) {
      this.metrics.averageLatency = latency;
    } else {
      this.metrics.averageLatency = (this.metrics.averageLatency * 0.8) + (latency * 0.2);
    }

    this.notifyListeners();
    this.notifyMetricsListeners();
  }

  /**
   * 핑 전송 시작
   */
  startPing(): void {
    this.lastPingTime = Date.now();
  }

  /**
   * 퐁 수신
   */
  onPong(): void {
    if (this.lastPingTime > 0) {
      const latency = Date.now() - this.lastPingTime;
      this.updateLatency(latency);
      this.lastPingTime = 0;
    }
  }

  /**
   * 재연결 지연시간 계산
   */
  private calculateReconnectDelay(): number {
    const { baseDelay, maxDelay, backoffFactor, jitter } = this.reconnectStrategy;
    
    let delay = baseDelay * Math.pow(backoffFactor, this.state.reconnectAttempts - 1);
    delay = Math.min(delay, maxDelay);
    
    // 지터 추가 (±25%)
    if (jitter) {
      const jitterAmount = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(1000, Math.floor(delay)); // 최소 1초
  }

  /**
   * 지연시간 측정 시작
   */
  private startLatencyMeasurement(): void {
    this.latencyTimer = setInterval(() => {
      if (this.state.status === 'connected') {
        // 핑 요청 이벤트 발생
        window.dispatchEvent(new CustomEvent('connection:ping-request'));
      }
    }, 30000); // 30초마다
  }

  /**
   * 지연시간 측정 중지
   */
  private stopLatencyMeasurement(): void {
    if (this.latencyTimer) {
      clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }
  }

  /**
   * 메트릭 업데이트
   */
  private updateMetrics(): void {
    const now = Date.now();
    
    // 업타임 계산
    let totalUptime = 0;
    this.connectionHistory.forEach(conn => {
      const start = conn.connected;
      const end = conn.disconnected || now;
      if (this.state.status === 'connected' || conn.disconnected) {
        totalUptime += end - start;
      }
    });
    this.metrics.uptime = totalUptime;

    // 안정성 계산 (최근 24시간 기준)
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const recentConnections = this.connectionHistory.filter(conn => conn.connected > dayAgo);
    
    if (recentConnections.length > 0) {
      let recentUptime = 0;
      recentConnections.forEach(conn => {
        const start = Math.max(conn.connected, dayAgo);
        const end = conn.disconnected || now;
        recentUptime += end - start;
      });
      
      const totalTime = now - Math.max(dayAgo, this.connectionHistory[0]?.connected || now);
      this.metrics.reliability = totalTime > 0 ? (recentUptime / totalTime) * 100 : 0;
    }
  }

  /**
   * 재연결 타이머 정리
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 리스너 등록
   */
  addListener(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // 현재 상태 즉시 전달
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 메트릭 리스너 등록
   */
  addMetricsListener(listener: MetricsListener): () => void {
    this.metricsListeners.add(listener);
    listener(this.metrics); // 현재 메트릭 즉시 전달
    
    return () => {
      this.metricsListeners.delete(listener);
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
        log.error('Error in connection listener:', error);
      }
    });
  }

  /**
   * 메트릭 리스너들에게 알림
   */
  private notifyMetricsListeners(): void {
    this.metricsListeners.forEach(listener => {
      try {
        listener(this.metrics);
      } catch (error) {
        log.error('Error in metrics listener:', error);
      }
    });
  }

  /**
   * 현재 상태 반환
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * 현재 메트릭 반환
   */
  getMetrics(): ConnectionMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * 재연결 전략 설정
   */
  setReconnectStrategy(strategy: Partial<ReconnectStrategy>): void {
    this.reconnectStrategy = { ...this.reconnectStrategy, ...strategy };
    log.info('Reconnect strategy updated:', this.reconnectStrategy);
  }

  /**
   * 연결 기록 반환
   */
  getConnectionHistory(): Array<{ connected: number; disconnected?: number }> {
    return [...this.connectionHistory];
  }

  /**
   * 정리
   */
  cleanup(): void {
    this.clearReconnectTimer();
    this.stopLatencyMeasurement();
    this.listeners.clear();
    this.metricsListeners.clear();
    log.info('ConnectionManager cleaned up');
  }
}

// 전역 인스턴스
export const connectionManager = new ConnectionManager();