import { createClient, RedisClientType } from 'redis';
import { IQueueTransport, QueueMessage, safeParseMessage } from './IQueueTransport';
import { createLogger } from '../logger';

const logger = createLogger('redis-transport');
const QUEUE_NAME = 'notifications';

export class RedisTransport implements IQueueTransport {
  private client: RedisClientType;
  private running = false;

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379');

    this.client = createClient({ socket: { host, port } });
    this.client.on('error', (err: Error) => logger.error('Redis client error', { error: err.message }));
    this.client.on('connect', () => logger.info(`Connected to Redis at ${host}:${port}`));
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async publish(message: QueueMessage): Promise<void> {
    await this.client.lPush(QUEUE_NAME, JSON.stringify(message));
  }

  async consume(handler: (message: QueueMessage) => Promise<void>): Promise<void> {
    this.running = true;
    logger.info('Starting Redis consumer', { queue: QUEUE_NAME });

    while (this.running) {
      try {
        const result = await this.client.brPop(QUEUE_NAME, 1);
        if (result) {
          const message = safeParseMessage(result.element);
          if (!message) {
            logger.warn('Discarding malformed message from queue', { raw: result.element.slice(0, 200) });
            continue;
          }
          await handler(message);
        }
      } catch (err) {
        logger.error('Redis consumer error', { error: (err as Error).message });
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async close(): Promise<void> {
    this.running = false;
    await this.client.quit();
  }
}
