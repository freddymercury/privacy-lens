/**
 * Context Module for PrivacyLens
 * 
 * This module provides a way to store and retrieve context information
 * throughout the request lifecycle.
 */

import { AsyncLocalStorage } from 'async_hooks';

// Create a new AsyncLocalStorage instance
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Initialize the context for a request
 * @param {Object} context - Context object
 * @param {Function} callback - Callback function to execute within the context
 * @returns {Promise<any>} - Result of the callback
 */
export async function initContext(context, callback) {
  return asyncLocalStorage.run(context, callback);
}

/**
 * Get the current context
 * @returns {Object|null} - Current context or null if not set
 */
export function getContext() {
  return asyncLocalStorage.getStore() || null;
}

/**
 * Set a value in the current context
 * @param {string} key - Key to set
 * @param {any} value - Value to set
 * @returns {boolean} - True if successful, false otherwise
 */
export function setContextValue(key, value) {
  const context = getContext();
  
  if (!context) {
    return false;
  }
  
  context[key] = value;
  return true;
}

/**
 * Get a value from the current context
 * @param {string} key - Key to get
 * @returns {any} - Value or undefined if not found
 */
export function getContextValue(key) {
  const context = getContext();
  
  if (!context) {
    return undefined;
  }
  
  return context[key];
}

/**
 * Create a middleware to initialize the context for Express
 * @returns {Function} - Express middleware
 */
export function createContextMiddleware() {
  return (req, res, next) => {
    // Create a new context for the request
    const context = {
      requestId: req.headers['x-request-id'] || req.id || generateRequestId(),
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      startTime: Date.now(),
      source: 'api'
    };
    
    // Add the context to the request for easy access
    req.context = context;
    
    // Run the rest of the request in the context
    initContext(context, next);
  };
}

/**
 * Run a job with a context
 * @param {Object} job - Job object
 * @param {Function} callback - Callback function to execute within the context
 * @returns {Promise<any>} - Result of the callback
 */
export async function runJobWithContext(job, callback) {
  // Create a new context for the job
  const context = {
    requestId: job.id,
    userId: job.context?.userId,
    source: 'job',
    jobType: job.type,
    queueName: job.queueName,
    startTime: Date.now(),
    ...job.context
  };
  
  // Run the job in the context
  return initContext(context, callback);
}

/**
 * Generate a request ID
 * @returns {string} - Request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create a context for testing
 * @param {Object} contextData - Context data
 * @returns {Object} - Test context
 */
export function createTestContext(contextData = {}) {
  return {
    requestId: `test_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
    userId: 'test_user',
    source: 'test',
    startTime: Date.now(),
    ...contextData
  };
}

/**
 * Run a function with a test context
 * @param {Object} contextData - Context data
 * @param {Function} callback - Callback function to execute within the context
 * @returns {Promise<any>} - Result of the callback
 */
export async function runWithTestContext(contextData, callback) {
  const context = createTestContext(contextData);
  return initContext(context, callback);
}

/**
 * Create a context for a CLI command
 * @param {Object} contextData - Context data
 * @returns {Object} - CLI context
 */
export function createCliContext(contextData = {}) {
  return {
    requestId: `cli_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
    userId: 'cli_user',
    source: 'cli',
    startTime: Date.now(),
    ...contextData
  };
}

/**
 * Run a function with a CLI context
 * @param {Object} contextData - Context data
 * @param {Function} callback - Callback function to execute within the context
 * @returns {Promise<any>} - Result of the callback
 */
export async function runWithCliContext(contextData, callback) {
  const context = createCliContext(contextData);
  return initContext(context, callback);
}

export { createContextMiddleware as contextMiddleware };
