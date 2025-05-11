/**
 * Logger module for PrivacyLens backend
 * 
 * Phase 1 Implementation: Basic wrapper around console.log with consistent component-based format.
 * This maintains the existing logging pattern while providing a centralized API.
 */

/**
 * Creates a logger instance for a specific component
 * @param {string} component - The name of the component (e.g., 'ArchiverJob')
 * @returns {Object} - Logger object with level-specific methods
 */
export function createLogger(component) {
  return {
    /**
     * Log an informational message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    info: (message, ...args) => console.log(`[${component}] ${message}`, ...args),
    
    /**
     * Log a warning message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    warn: (message, ...args) => console.warn(`[${component}] ${message}`, ...args),
    
    /**
     * Log an error message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    error: (message, ...args) => console.error(`[${component}] ${message}`, ...args),
    
    /**
     * Log a debug message (only in development)
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    debug: (message, ...args) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${component}] ${message}`, ...args);
      }
    },
    
    /**
     * Log a trace message (only if LOG_LEVEL is trace)
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    trace: (message, ...args) => {
      if (process.env.LOG_LEVEL === 'trace') {
        console.trace(`[${component}] ${message}`, ...args);
      }
    },
    
    /**
     * Log a fatal message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    fatal: (message, ...args) => console.error(`[${component}] FATAL: ${message}`, ...args),
    
    /**
     * Create a child logger with additional context
     * @param {Object} context - Additional context to include in logs
     * @returns {Object} - A new logger instance with the additional context
     */
    child: (context) => {
      return createLogger(`${component}:${context.name || 'child'}`);
    }
  };
}

/**
 * Default logger instance for general use
 */
export const logger = createLogger('App');

/**
 * Express middleware for logging HTTP requests
 * @param {Object} options - Options for the middleware
 * @returns {Function} - Express middleware function
 */
export function requestLogger(options = {}) {
  const morgan = require('morgan');
  return morgan(options.format || 'dev');
}
