import pino from 'pino';
import type { Logger } from 'pino';

/**
 * Structured logger using Pino for performance and structured logging
 */
class BlogLogger {
  private pinoLogger: Logger;

  constructor() {
    this.pinoLogger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    });
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.pinoLogger.info(data || {}, message);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.pinoLogger.warn(data || {}, message);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    if (error instanceof Error) {
      this.pinoLogger.error({ err: error }, message);
    } else {
      this.pinoLogger.error(error || {}, message);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.pinoLogger.debug(data || {}, message);
  }

  /**
   * Log success message (info level with success indicator)
   */
  success(message: string, data?: Record<string, unknown>): void {
    this.pinoLogger.info({ ...data, success: true }, `✓ ${message}`);
  }

  /**
   * Start a timer for performance tracking
   */
  startTimer(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, { duration: `${duration}ms` });
    };
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    return this.pinoLogger.child(context);
  }
}

export const logger = new BlogLogger();