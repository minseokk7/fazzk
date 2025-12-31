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
  timestamp: number;
}

export type ToastType = ToastNotification['type'];

class ToastManagerClass {
  private toasts: ToastNotification[] = [];
  private listeners: Set<(toasts: ToastNotification[]) => void> = new Set();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  // 리스너 등록
  subscribe(listener: (toasts: ToastNotification[]) => void): () => void {
    this.listeners.add(listener);
    // 현재 토스트 목록을 즉시 전달
    listener([...this.toasts]);
    
    // 구독 해제 함수 반환
    return () => {
      this.listeners.delete(listener);
    };
  }

  // 리스너들에게 변경사항 알림
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener([...this.toasts]);
    });
  }

  // 토스트 표시
  show(toast: Omit<ToastNotification, 'id' | 'timestamp'>): string {
    // 중복 방지: 같은 제목과 타입의 토스트가 이미 있으면 기존 것을 제거
    const existingToast = this.toasts.find(t => 
      t.title === toast.title && 
      t.type === toast.type &&
      t.message === toast.message
    );
    if (existingToast) {
      this.remove(existingToast.id);
    }

    const id = crypto.randomUUID();
    const newToast: ToastNotification = {
      ...toast,
      id,
      timestamp: Date.now()
    };

    this.toasts.push(newToast);
    this.notifyListeners();

    // 자동 제거 설정
    if (!toast.persistent && toast.duration !== 0) {
      const duration = toast.duration || this.getDefaultDuration(toast.type);
      const timeout = setTimeout(() => {
        this.remove(id);
      }, duration);
      
      this.timeouts.set(id, timeout);
    }

    console.log(`[Toast] ${toast.type.toUpperCase()}: ${toast.title} - ${toast.message}`);
    return id;
  }

  // 기본 지속 시간 계산
  private getDefaultDuration(type: ToastType): number {
    switch (type) {
      case 'success':
        return 3000;
      case 'info':
        return 4000;
      case 'warning':
        return 5000;
      case 'error':
        return 7000;
      default:
        return 4000;
    }
  }

  // 토스트 제거
  remove(id: string): void {
    const index = this.toasts.findIndex(toast => toast.id === id);
    if (index !== -1) {
      this.toasts.splice(index, 1);
      this.notifyListeners();
    }

    // 타이머 정리
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  // 모든 토스트 제거
  clear(): void {
    // 모든 타이머 정리
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    
    this.toasts = [];
    this.notifyListeners();
  }

  // 특정 타입의 토스트만 제거
  clearByType(type: ToastType): void {
    const toRemove = this.toasts.filter(toast => toast.type === type);
    toRemove.forEach(toast => this.remove(toast.id));
  }

  // 편의 메서드들
  success(title: string, message: string, options?: Partial<ToastNotification>): string {
    return this.show({
      type: 'success',
      title,
      message,
      ...options
    });
  }

  error(title: string, message: string, persistent = false, options?: Partial<ToastNotification>): string {
    return this.show({
      type: 'error',
      title,
      message,
      persistent,
      ...options
    });
  }

  warning(title: string, message: string, options?: Partial<ToastNotification>): string {
    return this.show({
      type: 'warning',
      title,
      message,
      ...options
    });
  }

  info(title: string, message: string, options?: Partial<ToastNotification>): string {
    return this.show({
      type: 'info',
      title,
      message,
      ...options
    });
  }

  // 현재 토스트 목록 가져오기
  getToasts(): ToastNotification[] {
    return [...this.toasts];
  }

  // 토스트 개수 가져오기
  getCount(): number {
    return this.toasts.length;
  }

  // 특정 타입의 토스트 개수 가져오기
  getCountByType(type: ToastType): number {
    return this.toasts.filter(toast => toast.type === type).length;
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const toastManager = new ToastManagerClass();

// 전역에서 사용할 수 있도록 window 객체에 추가 (개발용)
if (typeof window !== 'undefined') {
  (window as any).toastManager = toastManager;
}