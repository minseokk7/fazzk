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
}

// WebSocket 상태 타입
interface WSStatus {
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  destroyed: boolean;
}

// WebSocket 클라이언트 관리
export class WSClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // 1초
  private isConnecting: boolean = false;
  private isDestroyed: boolean = false;

  // 이벤트 핸들러들
  private eventHandlers: EventHandlers = {
    new_follower: [],
    test_notification: [],
    settings_updated: [],
    connected: [],
    disconnected: [],
    error: [],
  };

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace('http', 'ws');
    console.log('[WebSocket] Client initialized with URL:', this.baseUrl);
  }

  // 연결
  connect(): void {
    if (this.isDestroyed) {
      console.log('[WebSocket] Client is destroyed, cannot connect');
      return;
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[WebSocket] Already connecting');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    this.isConnecting = true;
    const wsUrl = `${this.baseUrl}/ws`;

    console.log('[WebSocket] Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;

        // 팔로워 토픽 구독
        this.subscribe(['followers']);

        // 연결 이벤트 발생
        this.emit('connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e, event.data);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        this.isConnecting = false;
        this.ws = null;

        // 연결 해제 이벤트 발생
        this.emit('disconnected');

        // 자동 재연결 (정상 종료가 아닌 경우)
        if (!this.isDestroyed && event.code !== 1000) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error: Event) => {
        console.error('[WebSocket] Connection error:', error);
        this.isConnecting = false;

        // 오류 이벤트 발생
        this.emit('error', new Error('WebSocket connection error'));
      };
    } catch (e) {
      console.error('[WebSocket] Failed to create WebSocket:', e);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  // 재연결 스케줄링
  private scheduleReconnect(): void {
    if (this.isDestroyed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached');
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(
      `[WebSocket] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect();
      }
    }, delay);
  }

  // 메시지 처리
  private handleMessage(message: WebSocketMessage): void {
    console.log('[WebSocket] Received message:', message);

    switch (message.type) {
      case 'pong':
        console.log('[WebSocket] Pong received');
        break;

      case 'new_follower':
        console.log('[WebSocket] New follower received:', message.follower);
        console.log('[WebSocket] Follower nickname:', message.follower?.user?.nickname);
        this.emit('new_follower', message.follower);
        break;

      case 'test_notification':
        console.log('[WebSocket] Test notification received:', message.follower);
        console.log('[WebSocket] Test follower nickname:', message.follower?.user?.nickname);
        this.emit('test_notification', message.follower);
        break;

      case 'settings_updated':
        console.log('[WebSocket] Settings updated:', message.settings);
        this.emit('settings_updated', message.settings);
        break;

      case 'error':
        console.error('[WebSocket] Server error:', message.message);
        this.emit('error', new Error(message.message || 'Unknown server error'));
        break;

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }

  // 메시지 전송
  private send(message: WebSocketMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send message - not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (e) {
      console.error('[WebSocket] Failed to send message:', e);
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
    } else {
      console.warn('[WebSocket] Unknown event type:', event);
    }
  }

  // 이벤트 리스너 제거
  off<K extends keyof EventHandlers>(event: K, handler: EventHandlers[K][0]): void {
    if (this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event].splice(index, 1);
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
          console.error('[WebSocket] Event handler error:', e);
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
    console.log('[WebSocket] Disconnecting...');
    this.isDestroyed = true;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // 모든 이벤트 핸들러 정리
    Object.keys(this.eventHandlers).forEach(event => {
      this.eventHandlers[event as keyof EventHandlers] = [] as any;
    });
  }

  // 상태 정보
  getStatus(): WSStatus {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      destroyed: this.isDestroyed,
    };
  }
}
