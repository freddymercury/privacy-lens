const pino = require('pino');
const pinoHttp = require('pino-http');
const { AsyncLocalStorage } = require('async_hooks');

// AsyncLocalStorage for context propagation
const als = new AsyncLocalStorage();

// Environment-based configuration
const config = {
  level: process.env.LOG_LEVEL || 'info',
  isDevelopment: process.env.NODE_ENV === 'development',
  serviceName: 'client-api'
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
        const context = getContext();
        const { component, msg, ...rest } = obj;
        return { 
          component, 
          msg,
          ...context,
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
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'req.body.secret'
    ],
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res
    }
  },
  pino.transport({
    targets: transports
  })
);

// Context management functions
function createContext(initialContext = {}) {
  return {
    traceId: generateTraceId(),
    timestamp: Date.now(),
    ...initialContext
  };
}

function runWithContext(context, callback) {
  return als.run(context, callback);
}

function getContext() {
  return als.getStore() || {};
}

function updateContext(updates) {
  const context = getContext();
  Object.assign(context, updates);
  return context;
}

function generateTraceId() {
  return `trace-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Creates a logger instance for a specific component
 * @param {string} component - The name of the component (e.g., 'AuthController')
 * @returns {Object} - Logger object with level-specific methods
 */
function createLogger(component) {
  const childLogger = pinoLogger.child({ component });
  
  return {
    info: (message, ...args) => {
      if (args.length === 0) {
        childLogger.info({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.info({ msg: message, ...args[0] });
      } else {
        childLogger.info({ msg: message, args });
      }
    },
    
    warn: (message, ...args) => {
      if (args.length === 0) {
        childLogger.warn({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.warn({ msg: message, ...args[0] });
      } else {
        childLogger.warn({ msg: message, args });
      }
    },
    
    error: (message, ...args) => {
      if (args.length === 0) {
        childLogger.error({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.error({ msg: message, ...args[0] });
      } else {
        childLogger.error({ msg: message, args });
      }
    },
    
    debug: (message, ...args) => {
      if (args.length === 0) {
        childLogger.debug({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.debug({ msg: message, ...args[0] });
      } else {
        childLogger.debug({ msg: message, args });
      }
    },
    
    trace: (message, ...args) => {
      if (args.length === 0) {
        childLogger.trace({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.trace({ msg: message, ...args[0] });
      } else {
        childLogger.trace({ msg: message, args });
      }
    },
    
    fatal: (message, ...args) => {
      if (args.length === 0) {
        childLogger.fatal({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.fatal({ msg: message, ...args[0] });
      } else {
        childLogger.fatal({ msg: message, args });
      }
    },
    
    child: (context) => {
      return createLogger(`${component}:${context.name || 'child'}`);
    }
  };
}

/**
 * Express middleware that adds request context to AsyncLocalStorage
 * @param {Object} options - Options for the middleware
 * @returns {Function} - Express middleware function
 */
function contextMiddleware(options = {}) {
  return (req, res, next) => {
    // Create a context with request information
    const requestContext = createContext({
      requestId: req.id || req.headers['x-request-id'] || generateTraceId(),
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      ...options.additionalContext
    });
    
    // Add request ID to response headers for tracing
    res.setHeader('X-Request-ID', requestContext.requestId);
    
    // Run the next middleware with this context
    runWithContext(requestContext, next);
  };
}

/**
 * Express middleware for logging HTTP requests with detailed information
 * @param {Object} options - Options for the middleware
 * @returns {Function} - Express middleware function
 */
function requestLogger(options = {}) {
  const logger = createLogger('RequestLogger');
  
  return (req, res, next) => {
    const start = Date.now();
    
    // Log incoming request
    logger.info('Request received', {
      req: {
        method: req.method,
        url: req.url,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
          'x-forwarded-for': req.headers['x-forwarded-for']
        },
        ip: req.ip,
        params: req.params,
        query: req.query
      }
    });
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      res.send = originalSend;
      
      const duration = Date.now() - start;
      
      // Log response
      logger.info('Response sent', {
        res: {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: {
            'content-type': res.getHeader('content-type'),
            'content-length': res.getHeader('content-length'),
            'x-request-id': res.getHeader('x-request-id')
          },
          duration
        }
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Express middleware for error logging
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorLogger(err, req, res, next) {
  const logger = createLogger('ErrorLogger');
  
  logger.error('Unhandled error', {
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    },
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      query: req.query,
      body: req.body
    }
  });
  
  next(err);
}

/**
 * Enhanced health check that includes system information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function healthCheck(req, res) {
  const logger = createLogger('HealthCheck');
  
  const healthData = {
    status: 'healthy',
    service: 'client-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  };
  
  logger.info('Health check requested', { health: healthData });
  
  res.status(200).json(healthData);
}

// Default logger instance
const logger = createLogger('ClientAPI');

module.exports = {
  createLogger,
  contextMiddleware,
  requestLogger,
  errorLogger,
  healthCheck,
  logger,
  createContext,
  runWithContext,
  getContext,
  updateContext
}; 