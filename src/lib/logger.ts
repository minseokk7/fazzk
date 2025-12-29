/**
 * 프론트엔드 로깅 시스템
 * 개발 환경에서는 콘솔 출력, 프로덕션에서는 선택적 로깅
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, category: string, message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel[level as keyof typeof LogLevel])) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${category}]`;

    if (this.isDevelopment) {
      console.log(`${prefix} ${message}`, ...args);
    } else if (level === 'ERROR' || level === 'WARN') {
      // 프로덕션에서는 에러와 경고만 로깅
      console[level.toLowerCase() as 'error' | 'warn'](
        `${timestamp} ${prefix} ${message}`,
        ...args
      );
    }
  }

  debug(category: string, message: string, ...args: any[]): void {
    this.formatMessage('DEBUG', category, message, ...args);
  }

  info(category: string, message: string, ...args: any[]): void {
    this.formatMessage('INFO', category, message, ...args);
  }

  warn(category: string, message: string, ...args: any[]): void {
    this.formatMessage('WARN', category, message, ...args);
  }

  error(category: string, message: string, ...args: any[]): void {
    this.formatMessage('ERROR', category, message, ...args);
  }
}

export const logger = new Logger();

// 카테고리별 로거 헬퍼
export const createLogger = (category: string) => ({
  debug: (message: string, ...args: any[]) => logger.debug(category, message, ...args),
  info: (message: string, ...args: any[]) => logger.info(category, message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn(category, message, ...args),
  error: (message: string, ...args: any[]) => logger.error(category, message, ...args),
});
