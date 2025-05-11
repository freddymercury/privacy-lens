/**
 * Logger module for PrivacyLens backend
 * 
 * Phase 2 Implementation: Structured logging with Pino while maintaining backward compatibility.
 * This adds structured JSON logging while keeping the existing console.log format.
 */

import pino from 'pino';
import path from 'path';

// Environment-based configuration with sensible defaults
const config = {
  level: process.env.LOG_LEVEL || 'info',
  isDevelopment: process.env.NODE_ENV === 'development',
  logPath: process.env.LOG_PATH || './logs',
  serviceName: process.env.SERVICE_NAME || 'privacy-lens'
};

// Configure transports based on environment
const transports = [];

// Add pretty-print console in development
if (config.isDevelopment) {
  transports.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '[{component}] {msg}'
    },
    level: config.level
  });
} else {
  // Plain JSON console in production
  transports.push({
    target: 'pino/file',
    options: { destination: 1 },  // stdout
    level: config.level
  });
}

// Create the base Pino logger
const pinoLogger = pino(
  {
    level: config.level,
    timestamp: pino.stdTimeFunctions.isoTime,  // ISO-8601 UTC timestamps
    base: null,  // Omit pid/hostname by default
    formatters: {
      level(label) { return { level: label }; },
      bindings() { return {}; },
      log(obj) { 
        const { component, msg, ...rest } = obj;
        return { 
          component, 
          msg,
          ...rest 
        }; 
      },
    },
    redact: [
      'password',
      'token',
      'secret'
    ],
  },
  pino.transport({
    targets: transports
  })
);

/**
 * Creates a logger instance for a specific component
 * @param {string} component - The name of the component (e.g., 'ArchiverJob')
 * @returns {Object} - Logger object with level-specific methods
 */
export function createLogger(component) {
  // Create a child logger with the component name
  const childLogger = pinoLogger.child({ component });
  
  return {
    /**
     * Log an informational message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    info: (message, ...args) => {
      // Handle both string-only logs and object logs
      if (args.length === 0) {
        childLogger.info({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.info({ msg: message, ...args[0] });
      } else {
        childLogger.info({ msg: message, args });
      }
      
      // For backward compatibility, also log to console in the old format
      console.log(`[${component}] ${message}`, ...args);
    },
    
    /**
     * Log a warning message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    warn: (message, ...args) => {
      if (args.length === 0) {
        childLogger.warn({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.warn({ msg: message, ...args[0] });
      } else {
        childLogger.warn({ msg: message, args });
      }
      
      // For backward compatibility
      console.warn(`[${component}] ${message}`, ...args);
    },
    
    /**
     * Log an error message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    error: (message, ...args) => {
      // Special handling for Error objects
      if (args.length > 0 && args[0] instanceof Error) {
        const err = args[0];
        childLogger.error({ 
          msg: message, 
          error: { 
            message: err.message, 
            stack: err.stack,
            ...err
          } 
        });
        args = args.slice(1);
      } else if (args.length === 0) {
        childLogger.error({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.error({ msg: message, ...args[0] });
      } else {
        childLogger.error({ msg: message, args });
      }
      
      // For backward compatibility
      console.error(`[${component}] ${message}`, ...args);
    },
    
    /**
     * Log a debug message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    debug: (message, ...args) => {
      if (args.length === 0) {
        childLogger.debug({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.debug({ msg: message, ...args[0] });
      } else {
        childLogger.debug({ msg: message, args });
      }
      
      // For backward compatibility, but only in development
      if (config.isDevelopment) {
        console.debug(`[${component}] ${message}`, ...args);
      }
    },
    
    /**
     * Log a trace message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    trace: (message, ...args) => {
      if (args.length === 0) {
        childLogger.trace({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.trace({ msg: message, ...args[0] });
      } else {
        childLogger.trace({ msg: message, args });
      }
      
      // For backward compatibility, but only if LOG_LEVEL is trace
      if (process.env.LOG_LEVEL === 'trace') {
        console.trace(`[${component}] ${message}`, ...args);
      }
    },
    
    /**
     * Log a fatal message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    fatal: (message, ...args) => {
      if (args.length === 0) {
        childLogger.fatal({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.fatal({ msg: message, ...args[0] });
      } else {
        childLogger.fatal({ msg: message, args });
      }
      
      // For backward compatibility
      console.error(`[${component}] FATAL: ${message}`, ...args);
    },
    
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
  // For now, still use morgan for compatibility
  const morgan = require('morgan');
  return morgan(options.format || 'dev');
}
