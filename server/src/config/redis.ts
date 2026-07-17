import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

// Create a reusable Redis connection for BullMQ
export const redisConnection = new IORedis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
});

export const AI_QUEUE_NAME = 'ai-queue';

// The Queue instance to add jobs to
export const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: true,
    removeOnFail: 100, // keep last 100 failed jobs for debugging
  },
});

// The QueueEvents instance to listen for job completions (needed for wait-until-finished)
export const aiQueueEvents = new QueueEvents(AI_QUEUE_NAME, {
  connection: redisConnection,
});
