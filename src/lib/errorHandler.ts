/**
 * 전역 에러 처리 시스템
 */

import { toastManager } from './toastManager';
import { createLogger } from './logger';

const log = createLogger('ErrorHandler');

export interface ErrorInfo {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  component?: string;
  userAgent: string;
  url: string;
  userId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  handled: boolean;
}

export interface ErrorStats {
  totalErrors: number;
  criticalErrors: number;
  errorRate: number; // 에러/분
  lastError?: ErrorInfo;
  commonErrors: Array<{
    message: string;
    count: number;
    lastOccurred: number;
  }>;
}

export class GlobalErrorHandler {
  private errors: ErrorInfo[] = [];
  private maxErrors = 100;
  private errorCounts = new Map<string, number>();
  private lastErrorTime = 0;
  private errorRateWindow = 60000; // 1분
  private isInitialized = false;

  constructor() {
    this.setupGlobalHandlers();
  }

  /**
   * 전역 에러 핸들러 설정
   */
  private setupGlobalHandlers(): void {
    if (this.isInitialized) return;

    // JavaScript 런타임 에러
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        type: 'javascript'
      });
    });

    // Promise rejection 에러
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        { type: 'promise-rejection' }
      );
    });

    // 커스텀 Svelte 에러 (컴포넌트에서 발생)
    window.addEventListener('svelte:error', ((event: CustomEvent) => {
      this.handleError(event.detail.error, {
        component: event.detail.component,
        type: 'svelte'
      });
    }) as EventListener);

    this.isInitialized = true;
    log.info('Global error handlers initialized');
  }

  /**
   * 에러 처리 메인 함수
   */
  handleError(error: Error | ErrorEvent | string, context?: any): string {
    const errorInfo = this.createErrorInfo(error, context);
    
    // 에러 저장
    this.storeError(errorInfo);
    
    // 로깅
    this.logError(errorInfo);
    
    // 사용자 피드백
    this.showUserFeedback(errorInfo);
    
    // 에러 리포팅 (개발 모드에서만)
    if (import.meta.env.DEV) {
      this.reportError(errorInfo);
    }

    return errorInfo.id;
  }

  /**
   * 에러 정보 객체 생성
   */
  private createErrorInfo(error: Error | ErrorEvent | string, context?: any): ErrorInfo {
    const now = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const errorInfo: ErrorInfo = {
      id: crypto.randomUUID(),
      timestamp: now,
      message: errorMessage,
      userAgent: navigator.userAgent,
      url: window.location.href,
      severity: this.determineSeverity(errorMessage, context),
      handled: false
    };

    // 선택적 속성들 조건부 할당
    if (errorStack) {
      errorInfo.stack = errorStack;
    }
    if (context?.component) {
      errorInfo.component = context.component;
    }
    if (context?.userId) {
      errorInfo.userId = context.userId;
    }
    if (context) {
      errorInfo.context = context;
    }

    return errorInfo;
  }

  /**
   * 에러 심각도 결정
   */
  private determineSeverity(message: string, context?: any): ErrorInfo['severity'] {
    const lowerMessage = message.toLowerCase();
    
    // Critical 에러
    if (lowerMessage.includes('network') && lowerMessage.includes('failed')) {
      return 'critical';
    }
    if (lowerMessage.includes('websocket') && lowerMessage.includes('connection')) {
      return 'critical';
    }
    if (lowerMessage.includes('cannot read') || lowerMessage.includes('undefined')) {
      return 'high';
    }
    
    // High 에러
    if (lowerMessage.includes('api') || lowerMessage.includes('fetch')) {
      return 'high';
    }
    if (context?.type === 'promise-rejection') {
      return 'high';
    }
    
    // Medium 에러
    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
      return 'medium';
    }
    
    // Low 에러 (기본값)
    return 'low';
  }

  /**
   * 에러 저장
   */
  private storeError(errorInfo: ErrorInfo): void {
    this.errors.unshift(errorInfo);
    
    // 최대 개수 제한
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // 에러 카운트 업데이트
    const errorKey = this.getErrorKey(errorInfo.message);
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // 로컬 스토리지에 저장 (최근 10개만)
    try {
      const recentErrors = this.errors.slice(0, 10).map(err => ({
        ...err,
        stack: undefined // 스택 트레이스는 저장하지 않음
      }));
      localStorage.setItem('fazzk-recent-errors', JSON.stringify(recentErrors));
    } catch (e) {
      console.warn('[ErrorHandler] Failed to save errors to localStorage:', e);
    }
  }

  /**
   * 에러 로깅
   */
  private logError(errorInfo: ErrorInfo): void {
    const logMessage = `[${errorInfo.severity.toUpperCase()}] ${errorInfo.message}`;
    
    switch (errorInfo.severity) {
      case 'critical':
        log.error(logMessage, errorInfo);
        break;
      case 'high':
        log.error(logMessage, errorInfo);
        break;
      case 'medium':
        log.warn(logMessage, errorInfo);
        break;
      case 'low':
        log.info(logMessage, errorInfo);
        break;
    }
  }

  /**
   * 사용자 피드백 표시
   */
  private showUserFeedback(errorInfo: ErrorInfo): void {
    // 중복 에러 방지 (같은 에러가 1초 내에 발생하면 무시)
    const now = Date.now();
    
    if (now - this.lastErrorTime < 1000) {
      return;
    }
    this.lastErrorTime = now;

    // 심각도에 따른 사용자 알림
    switch (errorInfo.severity) {
      case 'critical':
        toastManager.error(
          '심각한 오류 발생',
          '앱을 다시 시작해야 할 수 있습니다. 문제가 지속되면 개발자에게 문의하세요.',
          true // persistent
        );
        break;
        
      case 'high':
        toastManager.error(
          '오류 발생',
          '일부 기능이 제대로 작동하지 않을 수 있습니다.',
          false
        );
        break;
        
      case 'medium':
        toastManager.warning(
          '경고',
          '예상치 못한 문제가 발생했습니다.'
        );
        break;
        
      case 'low':
        // Low 에러는 사용자에게 표시하지 않음
        break;
    }
  }

  /**
   * 에러 리포팅 (개발 모드)
   */
  private reportError(errorInfo: ErrorInfo): void {
    console.group(`🚨 Error Report [${errorInfo.severity.toUpperCase()}]`);
    console.error('Message:', errorInfo.message);
    console.error('Component:', errorInfo.component || 'Unknown');
    console.error('Context:', errorInfo.context);
    console.error('Stack:', errorInfo.stack);
    console.error('Full Error Info:', errorInfo);
    console.groupEnd();
  }

  /**
   * 에러 키 생성 (중복 감지용)
   */
  private getErrorKey(message: string): string {
    return message.substring(0, 100); // 처음 100자만 사용
  }

  /**
   * 에러 통계 생성
   */
  getErrorStats(): ErrorStats {
    const now = Date.now();
    const recentErrors = this.errors.filter(err => now - err.timestamp < this.errorRateWindow);
    const criticalErrors = this.errors.filter(err => err.severity === 'critical').length;
    
    // 공통 에러 분석
    const commonErrors = Array.from(this.errorCounts.entries())
      .map(([message, count]) => ({
        message,
        count,
        lastOccurred: this.errors.find(err => this.getErrorKey(err.message) === message)?.timestamp || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const stats: ErrorStats = {
      totalErrors: this.errors.length,
      criticalErrors,
      errorRate: (recentErrors.length / this.errorRateWindow) * 60000, // 에러/분
      commonErrors
    };

    // 선택적 속성 조건부 할당
    if (this.errors.length > 0 && this.errors[0]) {
      stats.lastError = this.errors[0];
    }

    return stats;
  }

  /**
   * 모든 에러 가져오기
   */
  getAllErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  /**
   * 에러 지우기
   */
  clearErrors(): void {
    this.errors = [];
    this.errorCounts.clear();
    localStorage.removeItem('fazzk-recent-errors');
    log.info('All errors cleared');
  }

  /**
   * 특정 에러를 처리됨으로 표시
   */
  markAsHandled(errorId: string): void {
    const error = this.errors.find(err => err.id === errorId);
    if (error) {
      error.handled = true;
    }
  }

  /**
   * 수동 에러 리포트 (컴포넌트에서 사용)
   */
  reportManualError(message: string, context?: any, severity: ErrorInfo['severity'] = 'medium'): string {
    const error = new Error(message);
    return this.handleError(error, { ...context, manual: true, severity });
  }
}

// 전역 인스턴스 생성
export const globalErrorHandler = new GlobalErrorHandler();

// 컴포넌트에서 사용할 수 있는 헬퍼 함수들
export const reportError = (message: string, context?: any, severity?: ErrorInfo['severity']) => {
  return globalErrorHandler.reportManualError(message, context, severity);
};

export const getErrorStats = () => globalErrorHandler.getErrorStats();
export const clearAllErrors = () => globalErrorHandler.clearErrors();