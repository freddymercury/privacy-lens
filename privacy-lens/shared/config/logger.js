/**
 * Logger Module for PrivacyLens
 * 
 * This module provides a unified logging interface.
 */

import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { getContext } from './context.js';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Add colors to winston
winston.addColors(logColors);

// Create the format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create the console format
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const context = getContext();
    const requestId = context?.requestId || meta.requestId || 'unknown';
    const userId = context?.userId || meta.userId || 'unknown';
    
    let metaStr = '';
    
    if (Object.keys(meta).length > 0) {
      // Filter out sensitive data
      const filteredMeta = { ...meta };
      
      if (filteredMeta.error && filteredMeta.error.message) {
        filteredMeta.error = filteredMeta.error.message;
      }
      
      if (filteredMeta.stack) {
        delete filteredMeta.stack;
      }
      
      if (filteredMeta.password) {
        filteredMeta.password = '[REDACTED]';
      }
      
      if (filteredMeta.token) {
        filteredMeta.token = '[REDACTED]';
      }
      
      metaStr = ` ${JSON.stringify(filteredMeta)}`;
    }
    
    return `${timestamp} [${level}] [${service}] [${requestId}] [${userId}]: ${message}${metaStr}`;
  })
);

// Create the default logger
const defaultLogger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format,
  defaultMeta: { service: 'privacy-lens' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    // File transport for error logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

// Create a logger for a specific service
export function createLogger(service) {
  return defaultLogger.child({ service });
}

// Create a logger for a specific request
export function createRequestLogger(requestId, service) {
  return defaultLogger.child({ requestId, service });
}

// Create a logger for a specific user
export function createUserLogger(userId, service) {
  return defaultLogger.child({ userId, service });
}

// Create a logger for a specific request and user
export function createRequestUserLogger(requestId, userId, service) {
  return defaultLogger.child({ requestId, userId, service });
}

// Log an error with a unique error ID
export function logError(logger, message, error, meta = {}) {
  const errorId = uuidv4();
  
  logger.error(`${message} (Error ID: ${errorId})`, {
    ...meta,
    error,
    errorId
  });
  
  return errorId;
}

// Log an API request
export function logApiRequest(logger, req, meta = {}) {
  logger.http(`API Request: ${req?.method || 'N/A'} ${req?.originalUrl || 'N/A'}`, {
    ...meta,
    method: req?.method || 'N/A',
    url: req?.originalUrl || 'N/A',
    ip: req?.ip || 'N/A',
    userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || 'N/A'
  });
}

// Log an API response
export function logApiResponse(logger, req, res, responseTime, meta = {}) {
  logger.http(`API Response: ${req?.method || 'N/A'} ${req?.originalUrl || 'N/A'} ${res?.statusCode || 'N/A'} ${responseTime}ms`, {
    ...meta,
    method: req?.method || 'N/A',
    url: req?.originalUrl || 'N/A',
    statusCode: res?.statusCode || 'N/A',
    responseTime
  });
}

/**
 * Express middleware to log incoming requests
 */
export function requestLoggerMiddleware(req, res, next) {
  logApiRequest(defaultLogger, req);
  next();
}

/**
 * Express middleware to log errors
 */
export function errorLoggerMiddleware(err, req, res, next) {
  if (!req || typeof req !== 'object') {
    defaultLogger.error('errorLoggerMiddleware called with invalid req', {
      reqType: typeof req,
      stack: (new Error()).stack
    });
  }
  // Safely handle cases where req may be undefined
  const url = req?.originalUrl || 'N/A';
  const method = req?.method || 'N/A';
  const errorId = logError(defaultLogger, 'Unhandled error in request', err, { url, method });
  if (res && typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(500).json({ error: 'Internal server error', errorId });
  } else {
    // If res is not available, just log the error
    defaultLogger.error('Error occurred outside of HTTP context', { errorId });
  }
}

// Export the default logger
export default defaultLogger;
