/**
 * Logger module for PrivacyLens backend
 * 
 * Phase 3 Implementation: Advanced logging with context propagation, file output, and security features.
 * This builds on Phase 2 by adding context propagation and more advanced features.
 */

import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { getContext } from './context.js';

// Environment-based configuration with sensible defaults
const config = {
  level: process.env.LOG_LEVEL || 'info',
  isDevelopment: process.env.NODE_ENV === 'development',
  logPath: process.env.LOG_PATH || './logs',
  serviceName: process.env.SERVICE_NAME || 'privacy-lens',
  maxSize: parseInt(process.env.LOG_MAX_MB || '50', 10) * 1024 * 1024,
  retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10),
  shipMode: process.env.LOG_SHIP_MODE || 'none',
  shipUrl: process.env.LOG_SHIP_URL,
  remoteLogLevel: process.env.REMOTE_LOG_LEVEL || 'info'
};

// Ensure log directory exists
if (!fs.existsSync(config.logPath)) {
  fs.mkdirSync(config.logPath, { recursive: true });
}

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

// Add file transport - use a direct file stream instead of pino transport
const logFilePath = path.join(config.logPath, `${config.serviceName}.log`);
const fileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Add a simple file transport
transports.push({
  target: 'pino/file',
  options: { 
    destination: 1  // stdout
  },
  level: config.level
});

// Create a custom function to write to the log file
function writeToLogFile(data) {
  try {
    // Convert to JSON string if it's an object
    const logString = typeof data === 'object' ? JSON.stringify(data) + '\n' : data;
    fileStream.write(logString);
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

// Add remote transport if configured
if (config.shipMode !== 'none' && config.shipUrl) {
  // This is a placeholder for remote transport configuration
  // In a real implementation, you would add the appropriate transport
  // based on the shipMode (e.g., http, tcp, s3, datadog, etc.)
  console.log(`Remote logging configured for ${config.shipMode} to ${config.shipUrl}`);
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
      'secret',
      '*.password',
      '*.token',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res
    },
    // Disable level change events to prevent "Level changed from info to info" messages
    changeLevelName: false
  },
  pino.transport({
    targets: transports
  })
);

// Create a direct file logger without logging level changes
// This prevents the excessive "Level changed from info to info" messages
const directFileLogger = pino(
  {
    level: config.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: null,
    formatters: {
      level(label) { return { level: label }; },
      bindings() { return {}; },
      log(obj) { return obj; }
    },
    redact: [
      'password',
      'token',
      'secret',
      '*.password',
      '*.token',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    // Disable level change events to prevent "Level changed from info to info" messages
    changeLevelName: false
  },
  pino.destination({
    dest: logFilePath,
    sync: false
  })
);

// Write a startup message to the log file
directFileLogger.info({
  msg: 'Logger initialized',
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'production',
  logLevel: config.level
});

// Helper function to log to both console and file
function logToAll(level, component, message, data = {}) {
  // Log to file
  directFileLogger[level]({
    component,
    msg: message,
    timestamp: new Date().toISOString(),
    ...data
  });
  
  // Log to console via pino
  pinoLogger.child({ component })[level](message, data);
}

/**
 * Creates a logger instance for a specific component
 * @param {string} component - The name of the component (e.g., 'ArchiverJob')
 * @returns {Object} - Logger object with level-specific methods
 */
export function createLogger(component) {
  // Helper function to get context and merge with log data
  function getContextData(data = {}) {
    const context = getContext();
    if (!context) {
      return data;
    }
    
    // Extract relevant context fields
    const { 
      requestId, 
      userId, 
      userEmail,
      operation,
      ...otherContext 
    } = context;
    
    return {
      requestId,
      userId,
      userEmail,
      operation,
      ...otherContext,
      ...data
    };
  }
  
  return {
    /**
     * Log an informational message
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    info: (message, ...args) => {
      // Handle both string-only logs and object logs
      if (args.length === 0) {
        logToAll('info', component, message, getContextData());
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        logToAll('info', component, message, getContextData(args[0]));
      } else {
        logToAll('info', component, message, getContextData({ args }));
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
        logToAll('warn', component, message, getContextData());
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        logToAll('warn', component, message, getContextData(args[0]));
      } else {
        logToAll('warn', component, message, getContextData({ args }));
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
        logToAll('error', component, message, getContextData({ 
          error: { 
            message: err.message, 
            stack: err.stack,
            ...err
          } 
        }));
        args = args.slice(1);
      } else if (args.length === 0) {
        logToAll('error', component, message, getContextData());
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        logToAll('error', component, message, getContextData(args[0]));
      } else {
        logToAll('error', component, message, getContextData({ args }));
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
        logToAll('debug', component, message, getContextData());
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        logToAll('debug', component, message, getContextData(args[0]));
      } else {
        logToAll('debug', component, message, getContextData({ args }));
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
        logToAll('trace', component, message, getContextData());
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        logToAll('trace', component, message, getContextData(args[0]));
      } else {
        logToAll('trace', component, message, getContextData({ args }));
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
        logToAll('fatal', component, message, getContextData());
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        logToAll('fatal', component, message, getContextData(args[0]));
      } else {
        logToAll('fatal', component, message, getContextData({ args }));
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
  return (req, res, next) => {
    // Get start time
    const start = Date.now();
    
    // Log request
    logger.info('Request received', {
      req: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        ip: req.ip,
        params: req.params,
        query: req.query
      }
    });
    
    // Add response listener
    res.on('finish', () => {
      // Calculate duration
      const duration = Date.now() - start;
      
      // Log response
      logger.info('Response sent', {
        res: {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.getHeaders(),
          duration
        }
      });
    });
    
    next();
  };
}
