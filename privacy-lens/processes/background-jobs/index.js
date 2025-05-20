/**
 * Background Jobs Process for PrivacyLens
 * 
 * This process handles background jobs and scheduled tasks.
 */

import { createLogger } from '../../shared/config/logger.js';
import { initializeDatabase } from '../../shared/db/index.js';
import { initializeQueue, QUEUE_NAMES, createQueueWorker } from '../../shared/config/queue.js';

// Initialize logger
const logger = createLogger('BackgroundJobs');

// Environment-based configuration with sensible defaults
const config = {
  environment: process.env.NODE_ENV || 'development',
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600000', 10), // 1 hour
  archiveInterval: parseInt(process.env.ARCHIVE_INTERVAL || '86400000', 10) // 24 hours
};

// Set process name for logging
process.env.PROCESS_NAME = 'background-jobs';

// Active workers
const activeWorkers = new Map();

// Active intervals
const activeIntervals = new Map();

/**
 * Initialize the background jobs process
 * @returns {Promise<void>}
 */
export async function initialize() {
  try {
    logger.info('Initializing Background Jobs process');
    
    // Initialize the database
    await initializeDatabase();
    
    // Initialize the queue
    await initializeQueue();
    
    logger.info('Background Jobs process initialized successfully');
  } catch (error) {
    logger.error('Error initializing Background Jobs process', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start the assessment worker
 * @returns {Promise<void>}
 */
export async function startAssessmentWorker() {
  try {
    logger.info('Starting assessment worker');
    
    // Import the assessment processor
    const { processAssessmentJob } = await import('../../shared/assessment/index.js');
    
    // Create the worker
    const worker = createQueueWorker(QUEUE_NAMES.ASSESSMENT_JOBS, processAssessmentJob);
    
    // Start the worker
    await worker();
    
    // Store the worker
    activeWorkers.set('assessment', true);
    
    logger.info('Assessment worker started successfully');
  } catch (error) {
    logger.error('Error starting assessment worker', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start the archive worker
 * @returns {Promise<void>}
 */
export async function startArchiveWorker() {
  try {
    logger.info('Starting archive worker');
    
    // Import the archive processor
    const { processArchiveJob } = await import('../../shared/db/archive.js');
    
    // Create the worker
    const worker = createQueueWorker(QUEUE_NAMES.ARCHIVE_JOBS, processArchiveJob);
    
    // Start the worker
    await worker();
    
    // Store the worker
    activeWorkers.set('archive', true);
    
    logger.info('Archive worker started successfully');
  } catch (error) {
    logger.error('Error starting archive worker', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start the notification worker
 * @returns {Promise<void>}
 */
export async function startNotificationWorker() {
  try {
    logger.info('Starting notification worker');
    
    // Import the notification processor
    const { processNotificationJob } = await import('../../shared/db/subscriptions.js');
    
    // Create the worker
    const worker = createQueueWorker(QUEUE_NAMES.NOTIFICATION_JOBS, processNotificationJob);
    
    // Start the worker
    await worker();
    
    // Store the worker
    activeWorkers.set('notification', true);
    
    logger.info('Notification worker started successfully');
  } catch (error) {
    logger.error('Error starting notification worker', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start the update worker
 * @returns {Promise<void>}
 */
export async function startUpdateWorker() {
  try {
    logger.info('Starting update worker');
    
    // Import the update processor
    const { processUpdateJob } = await import('../../shared/db/updates.js');
    
    // Create the worker
    const worker = createQueueWorker(QUEUE_NAMES.UPDATE_JOBS, processUpdateJob);
    
    // Start the worker
    await worker();
    
    // Store the worker
    activeWorkers.set('update', true);
    
    logger.info('Update worker started successfully');
  } catch (error) {
    logger.error('Error starting update worker', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start the unassessed URLs worker
 * @returns {Promise<void>}
 */
export async function startUnassessedUrlsWorker() {
  try {
    logger.info('Starting unassessed URLs worker');
    
    // Import the unassessed URLs processor
    const { processUnassessedUrl } = await import('../../shared/assessment/index.js');
    
    // Create the worker
    const worker = createQueueWorker(QUEUE_NAMES.UNASSESSED_URLS, processUnassessedUrl);
    
    // Start the worker
    await worker();
    
    // Store the worker
    activeWorkers.set('unassessedUrls', true);
    
    logger.info('Unassessed URLs worker started successfully');
  } catch (error) {
    logger.error('Error starting unassessed URLs worker', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start the cleanup job
 * @returns {Promise<void>}
 */
export async function startCleanupJob() {
  try {
    logger.info('Starting cleanup job');
    
    // Run the cleanup job immediately
    await runCleanupJob();
    
    // Schedule the cleanup job to run periodically
    const interval = setInterval(runCleanupJob, config.cleanupInterval);
    
    // Store the interval
    activeIntervals.set('cleanup', interval);
    
    logger.info('Cleanup job started successfully');
  } catch (error) {
    logger.error('Error starting cleanup job', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Run the cleanup job
 * @returns {Promise<void>}
 */
async function runCleanupJob() {
  try {
    logger.info('Running cleanup job');
    
    // Clean up expired tokens
    const { cleanupExpiredTokens } = await import('../../shared/db/assessments.js');
    const tokensDeleted = await cleanupExpiredTokens();
    
    // Clean up old audit logs
    const { deleteOldAuditEvents } = await import('../../shared/db/audit.js');
    const auditLogsDeleted = await deleteOldAuditEvents();
    
    logger.info('Cleanup job completed', { tokensDeleted, auditLogsDeleted });
  } catch (error) {
    logger.error('Error running cleanup job', { error: error.message, stack: error.stack });
  }
}

/**
 * Start the archive job
 * @returns {Promise<void>}
 */
export async function startArchiveJob() {
  try {
    logger.info('Starting archive job');
    
    // Run the archive job immediately
    await runArchiveJob();
    
    // Schedule the archive job to run periodically
    const interval = setInterval(runArchiveJob, config.archiveInterval);
    
    // Store the interval
    activeIntervals.set('archive', interval);
    
    logger.info('Archive job started successfully');
  } catch (error) {
    logger.error('Error starting archive job', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Run the archive job
 * @returns {Promise<void>}
 */
async function runArchiveJob() {
  try {
    logger.info('Running archive job');
    
    // Queue archive jobs for policies that need to be archived
    const { queuePoliciesForArchiving } = await import('../../shared/db/archive.js');
    const jobsQueued = await queuePoliciesForArchiving();
    
    logger.info('Archive job completed', { jobsQueued });
  } catch (error) {
    logger.error('Error running archive job', { error: error.message, stack: error.stack });
  }
}

/**
 * Start all workers and jobs
 * @returns {Promise<void>}
 */
export async function startAll() {
  try {
    logger.info('Starting all workers and jobs');
    
    // Start workers
    await Promise.all([
      startAssessmentWorker(),
      startArchiveWorker(),
      startNotificationWorker(),
      startUpdateWorker(),
      startUnassessedUrlsWorker()
    ]);
    
    // Start jobs
    await Promise.all([
      startCleanupJob(),
      startArchiveJob()
    ]);
    
    logger.info('All workers and jobs started successfully');
  } catch (error) {
    logger.error('Error starting all workers and jobs', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop all workers and jobs
 * @returns {Promise<void>}
 */
export async function stopAll() {
  try {
    logger.info('Stopping all workers and jobs');
    
    // Clear all intervals
    for (const [name, interval] of activeIntervals.entries()) {
      clearInterval(interval);
      activeIntervals.delete(name);
      logger.info(`Stopped ${name} job`);
    }
    
    // Close the queue connection
    const { closeQueue } = await import('../../shared/config/queue.js');
    await closeQueue();
    
    // Clear all workers
    activeWorkers.clear();
    
    logger.info('All workers and jobs stopped successfully');
  } catch (error) {
    logger.error('Error stopping all workers and jobs', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get the status of all workers and jobs
 * @returns {Object} - Status of all workers and jobs
 */
export function getStatus() {
  const workers = {};
  
  for (const [name, active] of activeWorkers.entries()) {
    workers[name] = { active };
  }
  
  const jobs = {};
  
  for (const [name] of activeIntervals.entries()) {
    jobs[name] = { active: true };
  }
  
  return {
    workers,
    jobs,
    environment: config.environment
  };
}

// If this module is run directly, start the process
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await initialize();
    await startAll();
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down');
      await stopAll();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal, shutting down');
      await stopAll();
      process.exit(0);
    });
    
    // Log the status
    logger.info('Background Jobs process running', getStatus());
  } catch (error) {
    logger.error('Error starting Background Jobs process', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}
