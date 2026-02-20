/**
 * Shared Structured Logger
 *
 * Winston-based logger that automatically injects the active OpenTelemetry
 * trace context (traceId, spanId) into every log record, enabling log–trace
 * correlation in tools like Loki, ELK, or Grafana.
 *
 * Usage:
 *   import { createLogger } from '../../shared/logger';
 *   const logger = createLogger('my-service');
 *   logger.info('user created', { userId: 42 });
 *   // → { level: 'info', message: 'user created', service: 'my-service',
 *   //     traceId: '...', spanId: '...', timestamp: '...' }
 */

import winston from 'winston';
import { trace, isSpanContextValid } from '@opentelemetry/api';

// Base winston instance – transport/format shared by all service loggers
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'ISO' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

/** Returns the current active span's traceId / spanId, or empty strings. */
function getTraceContext(): { traceId: string; spanId: string } {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return { traceId: '', spanId: '' };

  const spanCtx = activeSpan.spanContext();
  if (!isSpanContextValid(spanCtx)) return { traceId: '', spanId: '' };

  return { traceId: spanCtx.traceId, spanId: spanCtx.spanId };
}

type Meta = Record<string, unknown>;

export interface Logger {
  info(message: string, meta?: Meta): void;
  warn(message: string, meta?: Meta): void;
  error(message: string, meta?: Meta): void;
  debug(message: string, meta?: Meta): void;
}

/**
 * Creates a service-scoped logger that injects trace context on every call.
 * Call once at module init and reuse the returned object.
 */
export function createLogger(serviceName: string): Logger {
  const child = baseLogger.child({ service: serviceName });

  const log = (level: string, message: string, meta?: Meta) =>
    child.log(level, message, { ...getTraceContext(), ...meta });

  return {
    info:  (msg, meta?) => log('info',  msg, meta),
    warn:  (msg, meta?) => log('warn',  msg, meta),
    error: (msg, meta?) => log('error', msg, meta),
    debug: (msg, meta?) => log('debug', msg, meta),
  };
}
