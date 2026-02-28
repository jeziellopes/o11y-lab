import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { IQueueTransport, QueueMessage, safeParseMessage } from './IQueueTransport';
import { createLogger } from '../logger';

const logger = createLogger('sqs-transport');

/**
 * SQS transport for AWS production deployments.
 *
 * With AWS Distro for OpenTelemetry, SQS propagates trace context
 * automatically via message attributes. We still embed traceContext
 * in the JSON body here for consistency with the Redis transport —
 * so both consumers use the same extraction logic.
 */
export class SQSTransport implements IQueueTransport {
  private client: SQSClient;
  private queueUrl: string;
  private running = false;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const endpoint = process.env.SQS_ENDPOINT; // allows LocalStack override

    this.client = new SQSClient({ region, ...(endpoint ? { endpoint } : {}) });
    this.queueUrl = process.env.SQS_QUEUE_URL || '';

    if (!this.queueUrl) {
      throw new Error('[SQSTransport] SQS_QUEUE_URL environment variable is required');
    }

    logger.info('SQS transport initialized', { queueUrl: this.queueUrl });
  }

  async publish(message: QueueMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      })
    );
  }

  async consume(handler: (message: QueueMessage) => Promise<void>): Promise<void> {
    this.running = true;
    logger.info('Starting SQS consumer', { queueUrl: this.queueUrl });

    while (this.running) {
      try {
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 5, // long polling
          })
        );

        for (const sqsMessage of response.Messages || []) {
          try {
            const message = safeParseMessage(sqsMessage.Body!);
            if (!message) {
              logger.warn('Discarding malformed SQS message', { body: sqsMessage.Body?.slice(0, 200) });
              // Delete the unprocessable message so it doesn't block the queue
              await this.client.send(
                new DeleteMessageCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: sqsMessage.ReceiptHandle!,
                })
              );
              continue;
            }
            await handler(message);

            await this.client.send(
              new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: sqsMessage.ReceiptHandle!,
              })
            );
          } catch (err) {
            logger.error('Failed to process SQS message', { error: (err as Error).message });
            // Message stays in queue and becomes visible again after visibility timeout
          }
        }
      } catch (err) {
        logger.error('SQS receive error', { error: (err as Error).message });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async getDepth(): Promise<number> {
    const response = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
    );
    return parseInt(response.Attributes?.ApproximateNumberOfMessages ?? '0', 10);
  }

  async close(): Promise<void> {
    this.running = false;
    this.client.destroy();
  }
}
