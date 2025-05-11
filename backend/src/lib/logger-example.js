/**
 * Example usage of the PrivacyLens logging system
 * 
 * This file demonstrates how to use the different phases of the logging system.
 */

// Import the different logger implementations
import { createLogger as createLoggerPhase1 } from './logger.js';
import { createLogger as createLoggerPhase2 } from './logger-phase2.js';
import { createLogger as createLoggerPhase3 } from './logger-phase3.js';
import { createContext, runWithContext, updateContext as updateCtx } from './context.js';

// Create loggers for each phase
const loggerPhase1 = createLoggerPhase1('LoggerExample');
const loggerPhase2 = createLoggerPhase2('LoggerExample');
const loggerPhase3 = createLoggerPhase3('LoggerExample');

// Create a logger for the example script itself
const logger = createLoggerPhase3('LoggerExample');

/**
 * Demonstrates Phase 1 logging (basic console wrapper)
 */
export function demonstratePhase1() {
  logger.info('\n=== PHASE 1: Basic Console Wrapper ===\n');
  
  loggerPhase1.info('This is an info message');
  loggerPhase1.warn('This is a warning message');
  loggerPhase1.error('This is an error message');
  loggerPhase1.debug('This is a debug message (only shown in development)');
  
  // With additional data
  loggerPhase1.info('Processing item', { id: 123, status: 'active' });
  
  // With error object
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    loggerPhase1.error('Failed to process item', error);
  }
}

/**
 * Demonstrates Phase 2 logging (structured logging with Pino)
 */
export function demonstratePhase2() {
  logger.info('\n=== PHASE 2: Structured Logging with Pino ===\n');
  
  loggerPhase2.info('This is an info message');
  loggerPhase2.warn('This is a warning message');
  loggerPhase2.error('This is an error message');
  loggerPhase2.debug('This is a debug message (level depends on LOG_LEVEL)');
  
  // With additional data
  loggerPhase2.info('Processing item', { id: 123, status: 'active' });
  
  // With error object
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    loggerPhase2.error('Failed to process item', error);
  }
  
  // With sensitive data (should be redacted)
  loggerPhase2.info('User login', { 
    username: 'johndoe', 
    password: 'supersecret', // This should be redacted
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' // This should be redacted
  });
}

/**
 * Demonstrates Phase 3 logging (context propagation)
 */
export function demonstratePhase3() {
  logger.info('\n=== PHASE 3: Context Propagation ===\n');
  
  // Basic logging (similar to Phase 2)
  loggerPhase3.info('This is an info message');
  
  // With context
  const context = createContext({
    requestId: 'req-123',
    userId: 'user-456',
    operation: 'example-operation'
  });
  
  runWithContext(context, () => {
    // These logs will automatically include the context
    loggerPhase3.info('Processing with context');
    
    // Nested function call
    processItem(789);
    
    // Update context
    updateContext();
  });
}

/**
 * Helper function to demonstrate context propagation through function calls
 */
function processItem(itemId) {
  // This log will include the context from the caller
  loggerPhase3.info('Processing item in nested function', { itemId });
  
  // Simulate async operation
  setTimeout(() => {
    // Context is preserved in async operations
    loggerPhase3.info('Async operation completed', { itemId });
  }, 100);
}

/**
 * Helper function to demonstrate context updates
 */
function updateContext() {
  // Update the current context
  updateCtx({ 
    step: 'context-updated',
    timestamp: Date.now()
  });
  
  // This log will include the updated context
  loggerPhase3.info('Context has been updated');
}

/**
 * Demonstrates child loggers
 */
export function demonstrateChildLoggers() {
  logger.info('\n=== Child Loggers ===\n');
  
  // Create a child logger
  const childLogger = loggerPhase3.child({ name: 'ChildComponent' });
  
  // Log with the child logger
  childLogger.info('This is a log from a child logger');
  
  // Create a nested child logger
  const nestedChildLogger = childLogger.child({ name: 'NestedChild' });
  
  // Log with the nested child logger
  nestedChildLogger.info('This is a log from a nested child logger');
}

/**
 * Demonstrates error handling
 */
export function demonstrateErrorHandling() {
  logger.info('\n=== Error Handling ===\n');
  
  // Simple error
  loggerPhase3.error('An error occurred');
  
  // Error with additional data
  loggerPhase3.error('Failed to process request', { 
    statusCode: 500,
    path: '/api/users',
    method: 'GET'
  });
  
  // Error with Error object
  try {
    JSON.parse('invalid json');
  } catch (error) {
    loggerPhase3.error('Failed to parse JSON', error);
  }
  
  // Error with custom error object
  const customError = {
    name: 'ValidationError',
    message: 'Invalid input',
    fields: ['email', 'password'],
    details: 'Email format is invalid'
  };
  
  loggerPhase3.error('Validation failed', customError);
}

/**
 * Run all demonstrations
 */
export function runAllDemonstrations() {
  demonstratePhase1();
  demonstratePhase2();
  demonstratePhase3();
  demonstrateChildLoggers();
  demonstrateErrorHandling();
  
  logger.info('\nAll demonstrations completed. Check the logs directory for the log file.');
}

// If this file is run directly, run all demonstrations
if (process.argv[1].endsWith('logger-example.js')) {
  runAllDemonstrations();
}
