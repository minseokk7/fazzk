// WebSocket 메시지 타입 정의
interface WebSocketMessage {
  type:
    | 'pong'
    | 'new_follower'
    | 'test_notification'
    | 'settings_updated'
    | 'error'
    | 'subscribe'
    | 'ping'
    | 'test_follower';
  follower?: Follower;
  settings?: any;
  message?: string;
  topics?: string[];
}

// 팔로워 타입 정의
interface Follower {
  user?: {
    nickname?: string;
    id?: string;
    profile_image_url?: string;
  };
  followed_at?: string;
}

// 이벤트 핸들러 타입
type EventHandler<T = any> = (data?: T) => void;

// 이벤트 타입 매핑
interface EventHandlers {
  new_follower: EventHandler<Follower>[];
  test_notification: EventHandler<Follower>[];
  settings_updated: EventHandler<any>[];
  connected: EventHandler<void>[];
  disconnected: EventHandler<void>[];
  error: EventHandler<Error>[];
  reconnecting: EventHandler<{ attempt: number; maxAttempts: number }>[];
}

// WebSocket 상태 타입
interface WSStatus {
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  destroyed: boolean;
  lastError?: string;
  lastConnected?: number;
}

// WebSocket 에러 타입
interface WSError extends Error {
  code?: number;
  reason?: string;
  type: 'connection' | 'message' | 'timeout' | 'server';
}

import { globalErrorHandler } from './errorHandler';
import { createLogger } from './logger';
import { loadingManager } from './loadingManager';
import { connectionManager } from './connectionManager';

const log = createLogger('WebSocket');

// WebSocket 클라이언트 관리
export class WSClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // 1초
  private isConnecting: boolean = false;
  private isDestroyed: boolean = false;
  private lastError: string | null = null;
  private lastConnected: number | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly connectionTimeoutMs = 10000; // 10초
  private readonly pingIntervalMs = 30000; // 30초

  // 이벤트 핸들러들
  private eventHandlers: EventHandlers = {
    new_follower: [],
    test_notification: [],
    settings_updated: [],
    connected: [],
    disconnected: [],
    error: [],
    reconnecting: [],
  };

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace('http', 'ws');
    log.info('Client initialized with URL:', this.baseUrl);

    // 연결 관리자 이벤트 리스너 설정
    this.setupConnectionManagerEvents();
  }

  // 연결 관리자 이벤트 설정
  private setupConnectionManagerEvents(): void {
    // 재연결 요청 이벤트
    window.addEventListener('connection:reconnect', () => {
      this.connect();
    });

    // 강제 연결 해제 이벤트
    window.addEventListener('connection:force-disconnect', () => {
      if (this.ws) {
        this.ws.close(1000, 'Force disconnect');
      }
    });

    // 핑 요청 이벤트
    window.addEventListener('connection:ping-request', () => {
      if (this.isConnected()) {
        connectionManager.startPing();
        this.ping();
      }
    });
  }

  // 에러 생성 헬퍼
  private createWSError(message: string, type: WSError['type'], code?: number, reason?: string): WSError {
    const error = new Error(message) as WSError;
    error.type = type;
    error.code = code;
    error.reason = reason;
    return error;
  }

  // 에러 처리
  private handleError(error: WSError): void {
    this.lastError = error.message;
    log.error(`WebSocket error [${error.type}]:`, error.message, error);
    
    // 연결 관리자에 에러 알림
    connectionManager.onDisconnected(error.message, error.code);
    
    // 전역 에러 핸들러에 보고
    globalErrorHandler.handleError(error, {
      component: 'WebSocket',
      type: error.type,
      code: error.code,
      reason: error.reason,
      reconnectAttempts: this.reconnectAttempts
    });

    // 로컬 에러 이벤트 발생
    this.emit('error', error);
  }

  // 연결 타임아웃 설정
  private setConnectionTimeout(): void {
    this.clearConnectionTimeout();
    
    this.connectionTimeout = setTimeout(() => {
      if (this.isConnecting) {
        log.warn('Connection timeout');
        this.isConnecting = false;
        
        if (this.ws) {
          this.ws.close();
        }
        
        const error = this.createWSError(
          'Connection timeout',
          'timeout'
        );
        this.handleError(error);
        connectionManager.startReconnect();
      }
    }, this.connectionTimeoutMs);
  }

  // 연결 타임아웃 해제
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  // 핑 인터벌 시작
  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        connectionManager.startPing();
        const success = this.ping();
        if (!success) {
          log.warn('Failed to send ping, connection may be lost');
        }
      }
    }, this.pingIntervalMs);
  }

  // 핑 인터벌 중지
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // 연결
  connect(): void {
    if (this.isDestroyed) {
      log.warn('Client is destroyed, cannot connect');
      return;
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
      log.warn('Already connecting');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      log.info('Already connected');
      return;
    }

    this.isConnecting = true;
    const wsUrl = `${this.baseUrl}/ws`;
    const connectionId = crypto.randomUUID();

    log.info('Connecting to:', wsUrl);
    log.info('Base URL:', this.baseUrl);
    log.info('Connection ID:', connectionId);

    // 연결 관리자에 연결 시작 알림
    connectionManager.startConnection(connectionId);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setConnectionTimeout();

      this.ws.onopen = () => {
        log.info('Connected successfully to:', wsUrl);
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.lastConnected = Date.now();
        this.lastError = null;

        // 연결 관리자에 연결 성공 알림
        connectionManager.onConnected({
          version: '1.0.0', // 서버에서 받아올 수 있다면
          clientCount: 1
        });

        // 핑 인터벌 시작
        this.startPingInterval();

        // 팔로워 토픽 구독
        const subscribed = this.subscribe(['followers']);
        if (!subscribed) {
          log.warn('Failed to subscribe to topics after connection');
        }

        // 연결 이벤트 발생
        this.emit('connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          const error = this.createWSError(
            `Failed to parse message: ${e instanceof Error ? e.message : String(e)}`,
            'message'
          );
          this.handleError(error);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        log.info('Connection closed:', event.code, event.reason, 'URL:', wsUrl);
        this.clearConnectionTimeout();
        this.stopPingInterval();
        this.isConnecting = false;
        this.ws = null;

        // 연결 관리자에 연결 해제 알림
        const errorMessage = event.code !== 1000 ? `Connection closed: ${event.reason || 'Unknown reason'}` : undefined;
        connectionManager.onDisconnected(errorMessage, event.code);

        // 연결 해제 이벤트 발생
        this.emit('disconnected');

        // 자동 재연결 (정상 종료가 아닌 경우)
        if (!this.isDestroyed && event.code !== 1000) {
          connectionManager.startReconnect();
        }
      };

      this.ws.onerror = (error: Event) => {
        log.error('Connection error for URL:', wsUrl, 'Error:', error);
        this.clearConnectionTimeout();
        this.isConnecting = false;

        const wsError = this.createWSError(
          `WebSocket connection error for ${wsUrl}`,
          'connection'
        );
        this.handleError(wsError);
      };
    } catch (e) {
      log.error('Failed to create WebSocket for URL:', wsUrl, 'Error:', e);
      this.clearConnectionTimeout();
      this.isConnecting = false;
      
      const error = this.createWSError(
        `Failed to create WebSocket: ${e instanceof Error ? e.message : String(e)}`,
        'connection'
      );
      this.handleError(error);
      connectionManager.startReconnect();
    }
  }

  // 메시지 처리
  private handleMessage(message: WebSocketMessage): void {
    log.debug('Received message:', message);

    try {
      switch (message.type) {
        case 'pong':
          log.debug('Pong received');
          // 연결 관리자에 퐁 알림
          connectionManager.onPong();
          break;

        case 'new_follower':
          log.info('New follower received:', message.follower?.user?.nickname);
          this.emit('new_follower', message.follower);
          break;

        case 'test_notification':
          log.info('Test notification received:', message.follower?.user?.nickname);
          this.emit('test_notification', message.follower);
          break;

        case 'settings_updated':
          log.info('Settings updated');
          this.emit('settings_updated', message.settings);
          break;

        case 'error':
          const serverError = this.createWSError(
            message.message || 'Unknown server error',
            'server'
          );
          this.handleError(serverError);
          break;

        default:
          log.warn('Unknown message type:', message.type);
      }
    } catch (e) {
      const error = this.createWSError(
        `Error handling message: ${e instanceof Error ? e.message : String(e)}`,
        'message'
      );
      this.handleError(error);
    }
  }

  // 메시지 전송
  private send(message: WebSocketMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot send message - not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      log.debug('Message sent:', message.type);
      return true;
    } catch (e) {
      const error = this.createWSError(
        `Failed to send message: ${e instanceof Error ? e.message : String(e)}`,
        'message'
      );
      this.handleError(error);
      return false;
    }
  }

  // 구독
  subscribe(topics: string[]): boolean {
    return this.send({
      type: 'subscribe',
      topics: topics,
    });
  }

  // 핑
  ping(): boolean {
    return this.send({
      type: 'ping',
    });
  }

  // 테스트 팔로워 요청
  requestTestFollower(): boolean {
    return this.send({
      type: 'test_follower',
    });
  }

  // 이벤트 리스너 등록
  on<K extends keyof EventHandlers>(event: K, handler: EventHandlers[K][0]): void {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
      log.debug(`Event listener added for: ${event}`);
    } else {
      log.warn('Unknown event type:', event);
    }
  }

  // 이벤트 리스너 제거
  off<K extends keyof EventHandlers>(event: K, handler: EventHandlers[K][0]): void {
    if (this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event].splice(index, 1);
        log.debug(`Event listener removed for: ${event}`);
      }
    }
  }

  // 이벤트 발생
  private emit<K extends keyof EventHandlers>(
    event: K,
    data?: Parameters<EventHandlers[K][0]>[0]
  ): void {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          const error = this.createWSError(
            `Event handler error for ${event}: ${e instanceof Error ? e.message : String(e)}`,
            'message'
          );
          this.handleError(error);
        }
      });
    }
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // 연결 해제
  disconnect(): void {
    log.info('Disconnecting...');
    this.isDestroyed = true;

    this.clearConnectionTimeout();
    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // 모든 이벤트 핸들러 정리
    Object.keys(this.eventHandlers).forEach(event => {
      this.eventHandlers[event as keyof EventHandlers] = [] as any;
    });

    log.info('WebSocket client disconnected and cleaned up');
  }

  // 상태 정보
  getStatus(): WSStatus {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      destroyed: this.isDestroyed,
      lastError: this.lastError,
      lastConnected: this.lastConnected,
    };
  }

  // 강제 재연결
  forceReconnect(): void {
    log.info('Force reconnecting...');
    this.reconnectAttempts = 0;
    this.lastError = null;
    
    if (this.ws) {
      this.ws.close();
    }
    
    // 연결 관리자를 통한 재연결
    connectionManager.forceReconnect();
  }
}
