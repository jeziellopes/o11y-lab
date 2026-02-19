/**
 * Notification Service
 * Consumes messages from the queue transport and processes notifications
 * Demonstrates async processing with distributed tracing
 */

// Initialize OpenTelemetry BEFORE importing other modules
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'notification-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Now import application modules
import express, { Request, Response } from 'express';
import { trace, context, propagation, SpanStatusCode, ROOT_CONTEXT } from '@opentelemetry/api';
import { createQueueTransport, QueueMessage, IQueueTransport } from '../../shared/queue';

type Notification = QueueMessage;

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

let queue: IQueueTransport | null = null;

// Initialize transport and start consuming
createQueueTransport().then((t: IQueueTransport) => {
  queue = t;
  queue.consume(processNotification).catch((err: unknown) =>
    console.error('Queue consumer error:', err)
  );
}).catch((err: unknown) => console.error('Failed to initialize queue transport:', err));

async function processNotification(notification: Notification) {
    
    const tracer = trace.getTracer('notification-service');

  try {
    const extractedContext = notification.traceContext
      ? propagation.extract(ROOT_CONTEXT, notification.traceContext)
      : ROOT_CONTEXT;

    // Extract trace context from message
    await context.with(extractedContext, async () => {
      const span = tracer.startSpan('process-notification');
      
      span.setAttribute('notification.type', notification.type);
      span.setAttribute('notification.orderId', notification.orderId);
      span.setAttribute('notification.userId', notification.userId);
      
      console.log(`Processing notification: ${notification.type}`);
      console.log(`Order ID: ${notification.orderId}, User: ${notification.userName}, Total: $${notification.total}`);
      
      span.addEvent('Notification received from queue');
      
      // Simulate notification processing (email, SMS, push, etc.)
      await simulateNotificationSending(notification, span);
      
      span.addEvent('Notification processed successfully');
      span.end();
    });
  } catch (error) {
    console.error('Error processing notification:', error);
    const span = tracer.startSpan('process-notification-error');
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    span.end();
  }
}

async function simulateNotificationSending(notification: Notification, span: any) {
  const tracer = trace.getTracer('notification-service');
  
  return new Promise((resolve) => {
    const ctx = trace.setSpan(context.active(), span);
    const sendSpan = tracer.startSpan('send-notification', {}, ctx);
    
    sendSpan.setAttribute('notification.channel', 'email');
    sendSpan.addEvent('Sending email notification');
    
    // Simulate email sending delay
    setTimeout(() => {
      console.log(`✉️  Email sent to user ${notification.userName} for order ${notification.orderId}`);
      sendSpan.addEvent('Email sent successfully');
      sendSpan.end();
      resolve(true);
    }, 100);
  });
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'notification-service',
    queueActive: queue !== null,
  });
});

// Get service stats
app.get('/stats', (req: Request, res: Response) => {
  res.json({
    service: 'notification-service',
    queueActive: queue !== null,
    transport: process.env.QUEUE_TRANSPORT || 'redis',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Notification Service listening on port ${PORT}`);
  console.log(`Queue transport: ${process.env.QUEUE_TRANSPORT || 'redis'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');

  if (queue) {
    await queue.close();
  }

  sdk.shutdown()
    .then(() => {
      console.log('OpenTelemetry terminated');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error during shutdown', error);
      process.exit(1);
    });
});
