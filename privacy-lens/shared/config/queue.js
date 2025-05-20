/**
 * Queue Module for PrivacyLens
 * 
 * This module provides a unified interface for working with job queues.
 */

import Bull from 'bull';
import { createLogger } from './logger.js';
import { runJobWithContext } from './context.js';

// Initialize logger
const logger = createLogger('Queue');

// Map of queue instances
const queues = new Map();

// Default queue options
const defaultQueueOptions = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: 100
  }
};

/**
 * Create a new queue
 * @param {string} name - Queue name
 * @param {Object} options - Queue options
 * @returns {Bull.Queue} - Bull queue instance
 */
export function createQueue(name, options = {}) {
  if (queues.has(name)) {
    return queues.get(name);
  }
  
  const queueOptions = {
    ...defaultQueueOptions,
    ...options
  };
  
  const queue = new Bull(name, queueOptions);
  
  // Set up event handlers
  queue.on('error', error => {
    logger.error(`Queue ${name} error`, { error: error.message, stack: error.stack });
  });
  
  queue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} in queue ${name} failed`, {
      jobId: job.id,
      queue: name,
      error: error.message,
      stack: error.stack,
      attempts: job.attemptsMade,
      data: job.data
    });
  });
  
  queue.on('stalled', job => {
    logger.warn(`Job ${job.id} in queue ${name} stalled`, {
      jobId: job.id,
      queue: name,
      data: job.data
    });
  });
  
  // Store the queue
  queues.set(name, queue);
  
  return queue;
}

/**
 * Get a queue by name
 * @param {string} name - Queue name
 * @returns {Bull.Queue|null} - Bull queue instance or null if not found
 */
export function getQueue(name) {
  return queues.get(name) || null;
}

/**
 * Add a job to a queue
 * @param {string} queueName - Queue name
 * @param {string} jobType - Job type
 * @param {Object} data - Job data
 * @param {Object} options - Job options
 * @returns {Promise<Bull.Job>} - Created job
 */
export async function addJob(queueName, jobType, data = {}, options = {}) {
  const queue = getQueue(queueName) || createQueue(queueName);
  
  // Get the current context to pass to the job
  const context = {
    ...data.context
  };
  
  // Add the job
  const job = await queue.add(jobType, {
    ...data,
    context
  }, options);
  
  logger.info(`Added job ${job.id} to queue ${queueName}`, {
    jobId: job.id,
    queue: queueName,
    jobType,
    options
  });
  
  return job;
}

/**
 * Process jobs in a queue
 * @param {string} queueName - Queue name
 * @param {string} jobType - Job type
 * @param {Function} processor - Job processor function
 * @param {Object} options - Processor options
 * @returns {Bull.Queue} - Bull queue instance
 */
export function processJobs(queueName, jobType, processor, options = {}) {
  const queue = getQueue(queueName) || createQueue(queueName);
  
  // Create a processor wrapper that runs the job in a context
  const processorWrapper = async (job) => {
    logger.info(`Processing job ${job.id} of type ${jobType} from queue ${queueName}`, {
      jobId: job.id,
      queue: queueName,
      jobType,
      attempts: job.attemptsMade
    });
    
    try {
      // Run the job in a context
      const result = await runJobWithContext(job, async () => {
        return await processor(job);
      });
      
      logger.info(`Completed job ${job.id} of type ${jobType} from queue ${queueName}`, {
        jobId: job.id,
        queue: queueName,
        jobType
      });
      
      return result;
    } catch (error) {
      logger.error(`Error processing job ${job.id} of type ${jobType} from queue ${queueName}`, {
        jobId: job.id,
        queue: queueName,
        jobType,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  };
  
  // Register the processor
  queue.process(jobType, options.concurrency || 1, processorWrapper);
  
  logger.info(`Registered processor for job type ${jobType} in queue ${queueName}`, {
    queue: queueName,
    jobType,
    concurrency: options.concurrency || 1
  });
  
  return queue;
}

/**
 * Get job counts for a queue
 * @param {string} queueName - Queue name
 * @returns {Promise<Object>} - Job counts
 */
export async function getJobCounts(queueName) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0
    };
  }
  
  return await queue.getJobCounts();
}

/**
 * Get active jobs in a queue
 * @param {string} queueName - Queue name
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {Promise<Array<Bull.Job>>} - Active jobs
 */
export async function getActiveJobs(queueName, start = 0, end = -1) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return [];
  }
  
  return await queue.getActive(start, end);
}

/**
 * Get waiting jobs in a queue
 * @param {string} queueName - Queue name
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {Promise<Array<Bull.Job>>} - Waiting jobs
 */
export async function getWaitingJobs(queueName, start = 0, end = -1) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return [];
  }
  
  return await queue.getWaiting(start, end);
}

/**
 * Get completed jobs in a queue
 * @param {string} queueName - Queue name
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {Promise<Array<Bull.Job>>} - Completed jobs
 */
export async function getCompletedJobs(queueName, start = 0, end = -1) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return [];
  }
  
  return await queue.getCompleted(start, end);
}

/**
 * Get failed jobs in a queue
 * @param {string} queueName - Queue name
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {Promise<Array<Bull.Job>>} - Failed jobs
 */
export async function getFailedJobs(queueName, start = 0, end = -1) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return [];
  }
  
  return await queue.getFailed(start, end);
}

/**
 * Get a job by ID
 * @param {string} queueName - Queue name
 * @param {string} jobId - Job ID
 * @returns {Promise<Bull.Job|null>} - Job or null if not found
 */
export async function getJob(queueName, jobId) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return null;
  }
  
  return await queue.getJob(jobId);
}

/**
 * Clean a queue
 * @param {string} queueName - Queue name
 * @param {string} status - Job status to clean (completed, failed, delayed, active, waiting)
 * @param {number} grace - Grace period in milliseconds
 * @returns {Promise<number>} - Number of jobs cleaned
 */
export async function cleanQueue(queueName, status = 'completed', grace = 24 * 60 * 60 * 1000) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return 0;
  }
  
  const count = await queue.clean(grace, status);
  
  logger.info(`Cleaned ${count} ${status} jobs from queue ${queueName}`, {
    queue: queueName,
    status,
    count
  });
  
  return count;
}

/**
 * Pause a queue
 * @param {string} queueName - Queue name
 * @returns {Promise<void>}
 */
export async function pauseQueue(queueName) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return;
  }
  
  await queue.pause();
  
  logger.info(`Paused queue ${queueName}`, {
    queue: queueName
  });
}

/**
 * Resume a queue
 * @param {string} queueName - Queue name
 * @returns {Promise<void>}
 */
export async function resumeQueue(queueName) {
  const queue = getQueue(queueName);
  
  if (!queue) {
    return;
  }
  
  await queue.resume();
  
  logger.info(`Resumed queue ${queueName}`, {
    queue: queueName
  });
}

/**
 * Close all queues
 * @returns {Promise<void>}
 */
export async function closeQueues() {
  const promises = [];
  
  for (const [name, queue] of queues.entries()) {
    logger.info(`Closing queue ${name}`, {
      queue: name
    });
    
    promises.push(queue.close());
  }
  
  await Promise.all(promises);
  
  queues.clear();
  
  logger.info('All queues closed');
}

// Export the Bull library for advanced usage
export { Bull };

/**
 * Initialize the queue system
 * @param {Object} options - Queue initialization options
 * @returns {Promise<void>}
 */
export async function initializeQueue(options = {}) {
  logger.info('Initializing queue system');
  
  // Create default queues if specified
  if (options.defaultQueues) {
    for (const queueName of options.defaultQueues) {
      createQueue(queueName);
    }
  }
  
  logger.info('Queue system initialized successfully');
}

// Export closeQueues as closeQueue for backward compatibility
export const closeQueue = closeQueues;

// Named export for queue names used throughout the system
export const QUEUE_NAMES = {
  ASSESSMENT_JOBS: 'assessment-jobs',
  ARCHIVE_JOBS: 'archive-jobs',
  NOTIFICATION_JOBS: 'notification-jobs',
  UPDATE_JOBS: 'update-jobs',
  UNASSESSED_URLS: 'unassessed-urls',
  // Add more queue names here as needed
};

/**
 * Create a queue worker (helper for background jobs)
 * @param {string} queueName - Queue name
 * @param {Function} processor - Job processor function
 * @returns {Function} - Function to start the worker
 */
export function createQueueWorker(queueName, processor) {
  return async function startWorker() {
    const queue = getQueue(queueName) || createQueue(queueName);
    queue.process(async (job) => {
      return processor(job);
    });
  };
}

/**
 * Publish a job to a queue
 * @param {string} queueName - The name of the queue
 * @param {string} jobType - The type of job
 * @param {Object} data - The job data
 * @param {Object} options - Additional job options
 * @returns {Promise<Job>} - The created job
 */
export async function publishToQueue(queueName, jobType, data = {}, options = {}) {
  const queue = getQueue(queueName) || createQueue(queueName);
  return queue.add(jobType, data, options);
}
