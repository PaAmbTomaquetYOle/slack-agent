import type { ILogger, LogMeta } from '../../application/ports';

export class ConsoleLogger implements ILogger {
  info(message: string, meta?: LogMeta): void {
    console.log(ConsoleLogger.#format('INFO', message, meta));
  }

  warn(message: string, meta?: LogMeta): void {
    console.warn(ConsoleLogger.#format('WARN', message, meta));
  }

  error(message: string, meta?: LogMeta): void {
    console.error(ConsoleLogger.#format('ERROR', message, meta));
  }

  static #format(level: string, message: string, meta?: LogMeta): string {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${level}] ${message}${suffix}`;
  }
}
