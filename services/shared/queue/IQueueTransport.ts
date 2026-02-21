import { context, propagation } from '@opentelemetry/api';

export interface QueueMessage {
  type: string;
  orderId: number;
  userId: number;
  userName: string;
  total: number;
  timestamp: string;
  traceContext?: Record<string, string>;
}

/**
 * Common interface for queue transports.
 * Implementations: RedisTransport (local dev), SQSTransport (AWS production).
 *
 * Trace context propagation is always the caller's responsibility —
 * inject before publish, extract before consume. Neither transport
 * handles it automatically (Redis has no OTel support; SQS would via
 * AWS Distro for OTel, but we keep it explicit here for consistency).
 */
export interface IQueueTransport {
  publish(message: QueueMessage): Promise<void>;
  consume(handler: (message: QueueMessage) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

/** Inject current trace context into the message before publishing. */
export function injectTraceContext(message: Omit<QueueMessage, 'traceContext'>): QueueMessage {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return { ...message, traceContext: carrier };
}

/**
 * Safely parse and validate a raw JSON string from a queue.
 * Returns the parsed QueueMessage or null if the payload is invalid.
 * Protects against malformed JSON and missing required fields.
 */
export function safeParseMessage(raw: string): QueueMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // not valid JSON
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const msg = parsed as Record<string, unknown>;

  // Validate required fields
  if (
    typeof msg.type !== 'string' ||
    typeof msg.orderId !== 'number' ||
    typeof msg.userId !== 'number' ||
    typeof msg.userName !== 'string' ||
    typeof msg.total !== 'number' ||
    typeof msg.timestamp !== 'string'
  ) {
    return null;
  }

  // Validate traceContext if present: must be a flat string→string map
  if (msg.traceContext !== undefined) {
    if (typeof msg.traceContext !== 'object' || msg.traceContext === null) return null;
    const tc = msg.traceContext as Record<string, unknown>;
    for (const [k, v] of Object.entries(tc)) {
      if (typeof k !== 'string' || typeof v !== 'string') return null;
    }
  }

  return msg as unknown as QueueMessage;
}
