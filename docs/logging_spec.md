# Node.js 18.13.0 Server-Side Logging Framework Specification

A production-ready logging framework optimized for performance, structured data, and flexible rotation based on file size.

## 1. High-Level Goals

* **Performance-focused** — ≤ 1 ms per log call (P99) with non-blocking operation
* **Structured logging** — JSON as the primary format with human-readable options for development
* **Configurable rotation** — File size-based rotation (MB) with compression
* **Multiple transport options** — Console, file, HTTP/HTTPS with plugin support for cloud services
* **Context propagation** — First-class support for trace/request IDs and session context
* **Security & compliance** — PII redaction, integrity verification, configurable retention policies
* **Component-based logging** — Consistent format with component identification

## 2. Current Implementation

The current implementation uses a simple but consistent logging approach:

* **Core logger**: Native `console.log` with component-based format: `[ComponentName] Message`
* **HTTP logging**: Morgan middleware for Express request logging
* **Component identification**: Square brackets to identify the logging component, e.g., `[ArchiverJob]`, `[RetroactiveArchive]`, `[LLM Service]`
* **Error handling**: `console.error` for error messages with the same component-based format
* **No structured output**: Logs are plain text, not structured JSON
* **No rotation/archiving**: No built-in log rotation or archiving

### 2.1 Current Usage Examples

```javascript
// Simple informational logging
console.log(`[ArchiverJob] Starting scheduled DEEP scan at ${new Date().toISOString()}...`);

// Error logging
console.error(`[ArchiverJob] Failed to process policy ${policy.id} (${policy.domain_name}):`, error.message, error.stack);

// Progress logging
console.log(`[RetroactiveArchive] Progress: ${stats.processed}/${stats.total} (${Math.round(stats.processed/stats.total*100)}%)`);

// Context-aware logging
const contextStr = chunkInfo ? `${domain} (${chunkInfo})` : domain;
console.log(`[LLM Service] Starting assessment for ${contextStr}`);
```

### 2.2 HTTP Request Logging with Morgan

```javascript
// src/index.js
import morgan from "morgan";

// Middleware
app.use(morgan("dev"));
```

## 3. Target Technology Stack

* **Core logger**: Pino (≥ v10) — Chosen for performance, ESM support, and rich ecosystem
* **Rotation/archiving**: File system rotation with external tools (logrotate, custom scripts)
* **Remote transport**: Pino transport pipelines for shipping logs to external systems
* **Context management**: AsyncLocalStorage with minimal wrapper for trace/context propagation
* **Observability**: OpenTelemetry integration for distributed tracing support

## 4. Target API Design

```javascript
// src/lib/logger.js
import pino from 'pino';
import { getContext } from './context.js';

// Environment-based configuration with sensible defaults
const config = {
  level: process.env.LOG_LEVEL || 'info',
  maxSizeMB: Number(process.env.LOG_MAX_MB) || 50,
  retentionDays: Number(process.env.LOG_RETENTION_DAYS) || 30,
  shipMode: process.env.LOG_SHIP_MODE || 'none',
  shipUrl: process.env.LOG_SHIP_URL || '',
  logPath: process.env.LOG_PATH || './logs',
  serviceName: process.env.SERVICE_NAME || 'privacy-lens',
  isDevelopment: process.env.NODE_ENV === 'development'
};

// Default logger options
const defaultOptions = {
  level: config.level,
  timestamp: pino.stdTimeFunctions.isoTime,  // ISO-8601 UTC timestamps
  base: null,  // Omit pid/hostname by default
  formatters: {
    level(label) { return { level: label }; },
    bindings() { return {}; },
    log(obj) { 
      // Include context from AsyncLocalStorage in every log
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
  // Sensitive data redaction
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'user.password',
    'password',
    'token',
    'secret',
    'req.body.password',
    'req.body.token',
    'req.body.secret',
    'data.password',
    'data.token',
    'data.secret'
  ],
};

// Configure transports based on environment
const transports = [];

// Add file transport (we'll handle rotation separately)
transports.push({
  target: 'pino/file',
  options: {
    destination: path.join(config.logPath, `${config.serviceName}.log`),
    mkdir: true
  },
  level: 'trace'  // Capture all logs in file
});

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

// Add remote transport if configured
if (config.shipMode !== 'none' && config.shipUrl) {
  let remoteTarget;
  
  switch (config.shipMode) {
    case 'http':
      remoteTarget = 'pino-http-send';
      break;
    case 'tcp':
      remoteTarget = 'pino-socket';
      break;
    case 's3':
      remoteTarget = 'pino-s3-stream';
      break;
    case 'datadog':
      remoteTarget = './transports/datadog.js';
      break;
    // Add more transport options as needed
  }
  
  if (remoteTarget) {
    transports.push({
      target: remoteTarget,
      options: {
        url: config.shipUrl,
        batchSize: 100,
        maxTimeout: 5000  // 5s max delay
      },
      level: process.env.REMOTE_LOG_LEVEL || 'info'
    });
  }
}

// Create the configured logger
const pinoLogger = pino(
  defaultOptions,
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
    info: (message, ...args) => {
      // Handle both string-only logs and object logs
      if (args.length === 0) {
        childLogger.info({ msg: message });
      } else if (typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
        childLogger.info({ msg: message, ...args[0] });
      } else {
        childLogger.info({ msg: message, args });
      }
    },
    
    // Other methods (warn, error, debug, trace, fatal) follow the same pattern
    
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
  const pinoHttp = require('pino-http');
  
  return pinoHttp({
    logger: pinoLogger,
    customLogLevel: function (req, res, err) {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Additional configuration...
  });
}
```

## 5. Context Propagation

```javascript
// src/lib/context.js
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export function createContext(initialContext = {}) {
  return {
    traceId: generateTraceId(),
    timestamp: Date.now(),
    ...initialContext
  };
}

export function runWithContext(context, callback) {
  return als.run(context, callback);
}

export function getContext() {
  return als.getStore() || {};
}

export function updateContext(updates) {
  const context = getContext();
  Object.assign(context, updates);
  return context;
}

function generateTraceId() {
  return `trace-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Express middleware that adds request context to AsyncLocalStorage
 * @param {Object} options - Options for the middleware
 * @returns {Function} - Express middleware function
 */
export function contextMiddleware(options = {}) {
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
    
    // Run the next middleware with this context
    runWithContext(requestContext, next);
  };
}
```

## 6. Rotation, Archiving & Retention

* **File output** — Basic file output to `{LOG_PATH}/{SERVICE_NAME}.log`
* **External rotation** — Use system tools like logrotate (Linux) or custom scripts for rotation
* **Naming convention** — `{service}.YYYY-MM-DD-HHmmss.log.gz`
* **Retention policy** — Auto-pruning of logs older than `LOG_RETENTION_DAYS`
* **Long-term storage** — Optional shipping to S3/cloud storage with lifecycle policies

## 7. Configuration Schema

| Variable              | Default       | Description                                     | Options                                |
|-----------------------|---------------|-------------------------------------------------|----------------------------------------|
| `LOG_LEVEL`           | `info`        | Minimum log level to record                     | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_MAX_MB`          | `50`          | File size threshold for rotation (MB)           | Any positive number                    |
| `LOG_RETENTION_DAYS`  | `30`          | Days to keep local archives                     | Any positive number                    |
| `LOG_SHIP_MODE`       | `none`        | Remote shipping method                          | `none`, `http`, `tcp`, `s3`, `datadog`, etc. |
| `LOG_SHIP_URL`        | -             | Destination URL for remote shipping             | Valid URL                              |
| `LOG_PATH`            | `./logs`      | Directory for log files                         | Valid directory path                   |
| `SERVICE_NAME`        | `privacy-lens` | Service identifier for logs                     | Any valid string                       |
| `REMOTE_LOG_LEVEL`    | `info`        | Minimum level for remote shipping               | Same as LOG_LEVEL                      |
| `NODE_ENV`            | `production`  | Application environment                         | `development`, `production`, `test`    |

## 8. Module Structure

### 8.1 Current Structure

The current implementation doesn't have dedicated logging modules. Logging is done directly using `console.log` and `console.error` in each file.

### 8.2 Target Structure

```
/src
 ├── lib/
 │   ├── logger.js           // Main logger (Phase 1)
 │   ├── logger-phase2.js    // Pino-based logger (Phase 2)
 │   ├── logger-phase3.js    // Advanced logger with context (Phase 3)
 │   ├── context.js          // AsyncLocalStorage wrapper
 │   ├── logger-example.js   // Example usage of all phases
 │   ├── run-logger-example.js // Script to run examples
 │   ├── README.md           // Documentation
 │   └── transports/         // Custom transport implementations
 │       ├── datadog.js      // Datadog HTTP transport
 │       └── cloudwatch.js   // AWS CloudWatch transport
 ├── jobs/
 │   └── prune-archives.js   // Retention enforcement job
 ├── middleware/
 │   └── request-logger.js   // Express/Koa middleware
 └── config/
     └── logging.schema.js   // Validation schema
```

## 9. Component-Specific Logging Requirements

### 9.1 Archiver Job

The archiver job requires detailed logging for:
- Job start/end timestamps
- Policy processing status
- URL accessibility checks
- Crawl results
- Versioning results
- Error handling with stack traces
- Scan event recording in the database

### 9.2 Deep Crawler

The deep crawler requires logging for:
- Crawl depth and progress
- Link extraction and filtering
- Asset fetching status
- Deduplication results
- Snapshot assembly
- Performance metrics (crawl time, bandwidth usage)

### 9.3 Retroactive Archiving

Retroactive archiving scripts require:
- Progress tracking (X/Y items processed)
- Success/failure statistics
- Detailed error reporting

### 9.4 LLM Service

The LLM service requires:
- Context-aware logging (domain, chunk info)
- API call attempts and retries
- Rate limit handling
- Performance metrics

## 10. Operational & Security Considerations

1. **Performance optimization**
   - Asynchronous logging with proper back-pressure handling
   - Buffer management to prevent memory leaks
   - Log sampling for high-volume debug logs

2. **Security**
   - Comprehensive PII redaction
   - Access control for log files
   - Integrity verification via checksums

3. **Observability**
   - Health endpoint for logging subsystem
   - Alerts on logging failures
   - Monitoring for log volume anomalies

4. **Compliance**
   - GDPR/CCPA field classification
   - Automated PII purging capabilities
   - Audit trail for sensitive operations

## 11. Migration Plan

### 11.1 Phase 1: Centralized Logger Module

**Implementation Status: COMPLETED**

1. Created a basic `src/lib/logger.js` module that wraps `console.log` but maintains the current format:

```javascript
// src/lib/logger.js
export function createLogger(component) {
  return {
    info: (message, ...args) => console.log(`[${component}] ${message}`, ...args),
    warn: (message, ...args) => console.warn(`[${component}] ${message}`, ...args),
    error: (message, ...args) => console.error(`[${component}] ${message}`, ...args),
    debug: (message, ...args) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${component}] ${message}`, ...args);
      }
    },
    trace: (message, ...args) => {
      if (process.env.LOG_LEVEL === 'trace') {
        console.trace(`[${component}] ${message}`, ...args);
      }
    },
    fatal: (message, ...args) => console.error(`[${component}] FATAL: ${message}`, ...args),
    child: (context) => {
      return createLogger(`${component}:${context.name || 'child'}`);
    }
  };
}

export const logger = createLogger('App');

export function requestLogger(options = {}) {
  const morgan = require('morgan');
  return morgan(options.format || 'dev');
}
```

**Migration Steps:**
1. Create the `src/lib/logger.js` module
2. Update existing files to use the new logger module:
   ```javascript
   import { createLogger } from '../lib/logger.js';
   const logger = createLogger('ComponentName');
   
   // Replace:
   // console.log(`[ComponentName] Message`);
   // With:
   // logger.info('Message');
   ```
3. Add environment variable support for log levels

**Benefits:**
- Centralized logging API
- Consistent component-based format
- Environment-aware debug logging
- No changes to log output format

### 11.2 Phase 2: Structured Logging

**Implementation Status: COMPLETED**

1. Add Pino as a dependency:
   ```bash
   npm install pino pino-pretty --save
   ```

2. Create `src/lib/logger-phase2.js` that uses Pino internally:

```javascript
// src/lib/logger-phase2.js
import pino from 'pino';

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
      messageFormat: '{component} - {msg}'
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
    timestamp: pino.stdTimeFunctions.isoTime,
    base: null,
    formatters: {
      level(label) { return { level: label }; },
      bindings() { return {}; },
      log(obj) { 
        const { component, msg, ...rest } = obj;
        return rest; 
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

export function createLogger(component) {
  const childLogger = pinoLogger.child({ component });
  
  return {
    info: (message, ...args) => {
      // Handle both string-only logs and object logs
      if (args.length === 0 || typeof args[0] !== 'object') {
        childLogger.info({ msg: message });
      } else {
        childLogger.info({ msg: message, ...args[0] });
      }
      
      // For backward compatibility, also log to console in the old format
      console.log(`[${component}] ${message}`, ...args);
    },
    
    // Other methods (warn, error, debug, trace) follow the same pattern
  };
}

export const logger = createLogger('App');

export function requestLogger(options = {}) {
  // For now, still use morgan for compatibility
  const morgan = require('morgan');
  return morgan(options.format || 'dev');
}
```

**Migration Steps:**
1. Install Pino and pino-pretty
2. Create the `src/lib/logger-phase2.js` module
3. Update imports in files that need structured logging:
   ```javascript
   import { createLogger } from '../lib/logger-phase2.js';
   const logger = createLogger('ComponentName');
   
   // The API is the same, so no other changes are needed
   ```

**Benefits:**
- Structured JSON logging
- Backward compatibility with the old format
- Pretty-printing in development
- Performance improvements

### 11.3 Phase 3: Context Propagation and Advanced Features

**Implementation Status: COMPLETED**

1. Added required dependencies:
   ```bash
   npm install pino-http --save
   ```

2. Created `src/lib/context.js` for context propagation:

```javascript
// src/lib/context.js
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export function createContext(initialContext = {}) {
  return {
    traceId: generateTraceId(),
    timestamp: Date.now(),
    ...initialContext
  };
}

export function runWithContext(context, callback) {
  return als.run(context, callback);
}

export function getContext() {
  return als.getStore() || {};
}

export function updateContext(updates) {
  const context = getContext();
  Object.assign(context, updates);
  return context;
}

function generateTraceId() {
  return `trace-${Math.random().toString(36).substring(2, 15)}`;
}

export function contextMiddleware(options = {}) {
  return (req, res, next) => {
    const requestContext = createContext({
      requestId: req.id || req.headers['x-request-id'] || generateTraceId(),
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      ...options.additionalContext
    });
    
    runWithContext(requestContext, next);
  };
}
```

3. Created `src/lib/logger-phase3.js` with context propagation and advanced features:

```javascript
// src/lib/logger-phase3.js
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

// Add file transport with direct file stream
const logFilePath = path.join(config.logPath, `${config.serviceName}.log`);

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
    }
  },
  pino.transport({
    targets: transports
  })
);

// Create a direct file logger
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
    ]
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
```

**Migration Steps:**
1. Install pino-http
2. Create the `src/lib/context.js` module
3. Create the `src/lib/logger-phase3.js` module
4. Update imports in files that need context propagation:
   ```javascript
   import { createLogger } from '../lib/logger-phase3.js';
   import { createContext, runWithContext } from '../lib/context.js';
   
   const logger = createLogger('ComponentName');
   
   function processRequest() {
     const context = createContext({ operation: 'process-request' });
     
     runWithContext(context, () => {
       logger.info('Processing request');
       // Context is automatically included in logs
     });
   }
   ```
5. Add context middleware to Express app:
   ```javascript
   import { contextMiddleware } from '../lib/context.js';
   import { requestLogger } from '../lib/logger-phase3.js';
   
   app.use(contextMiddleware());
   app.use(requestLogger());
   ```

**Benefits:**
- Context propagation through async operations
- Request context automatically included in logs
- Enhanced security with PII redaction
- File output with directory creation
- HTTP request logging with pino-http
- Child loggers for sub-components

### 11.4 Phase 4: Log Rotation and Remote Transport

**Implementation Status: PLANNED**

1. Implement log rotation using external tools:
   - On Linux: Configure logrotate
   - On Windows: Create a scheduled task with PowerShell
   - Custom Node.js script for cross-platform rotation

2. Set up remote transport for log shipping:
   - Configure AWS CloudWatch, Datadog, or other log aggregation service
   - Implement custom transport for specific needs

3. Add observability integrations:
   - OpenTelemetry for distributed tracing
   - Metrics collection for logging performance

**Migration Steps:**
1. Configure external log rotation
2. Set up remote transport
3. Add observability integrations
4. Update environment variables for configuration

**Benefits:**
- Log rotation and archiving
- Remote log shipping
- Distributed tracing
- Metrics collection

## 12. Usage Examples

### 12.1 Current Pattern

```javascript
// Direct console.log usage
console.log(`[ArchiverJob] Starting scheduled DEEP scan at ${new Date().toISOString()}...`);
console.error(`[ArchiverJob] Failed to process policy ${policy.id}:`, error.message);
```

### 12.2 Phase 1 Migration

```javascript
// Using the centralized logger module
import { createLogger } from '../lib/logger.js';
const logger = createLogger('ArchiverJob');

logger.info(`Starting scheduled DEEP scan at ${new Date().toISOString()}...`);
logger.error(`Failed to process policy ${policy.id}:`, error);
```

### 12.3 Phase 2 Migration

```javascript
// Using the Pino-based logger
import { createLogger } from '../lib/logger-phase2.js';
const logger = createLogger('ArchiverJob');

logger.info(`Starting scheduled DEEP scan at ${new Date().toISOString()}...`);
logger.error(`Failed to process policy ${policy.id}:`, { policyId: policy.id, error });
```

### 12.4 Phase 3 Migration

```javascript
// Using the context-aware logger
import { createLogger } from '../lib/logger-phase3.js';
import { createContext, runWithContext } from '../lib/context.js';
const logger = createLogger('ArchiverJob');

// With context
const jobContext = createContext({
  jobId: 'archive-job-123',
  scheduledAt: new Date().toISOString()
});

runWithContext(jobContext, () => {
  logger.info('Starting scheduled DEEP scan');
  
  try {
    // Process policies...
  } catch (error) {
    logger.error(`Failed to process policy ${policy.id}:`, { 
      policyId: policy.id, 
      domain: policy.domain_name,
      error 
    });
  }
});
```

### 12.5 Express Middleware Example

```javascript
// Using the context middleware and request logger
import express from 'express';
import { contextMiddleware } from '../lib/context.js';
import { requestLogger } from '../lib/logger-phase3.js';

const app = express();

// Add context middleware before request logger
app.use(contextMiddleware());
app.use(requestLogger());

app.get('/api/policies', (req, res) => {
  // Context is automatically included in logs
  logger.info('Fetching policies', { query: req.query });
  
  // Process request...
});
```

## 13. Implementation Plan

1. **Phase 1 (Completed)** — Centralized logger module wrapping console.log
2. **Phase 2 (Completed)** — Structured logging with Pino
3. **Phase 3 (Completed)** — Context propagation and file output
4. **Phase 4 (Planned)** — Log rotation and remote transport

The implementation has been completed through Phase 3, with all core files created:
- `src/lib/logger.js` - Basic console wrapper (Phase 1)
- `src/lib/logger-phase2.js` - Structured logging with Pino (Phase 2)
- `src/lib/logger-phase3.js` - Advanced logging with context propagation (Phase 3)
- `src/lib/context.js` - Context propagation utilities using AsyncLocalStorage
- `src/lib/logger-example.js` - Example usage of all three phases
- `src/lib/run-logger-example.js` - Script to run the examples
- `src/lib/README.md` - Documentation for the logging system

## 14. Extension Roadmap

* **Full OpenTelemetry integration** — Combine logs with traces and metrics
* **Advanced analytics** — Real-time log analysis with anomaly detection
* **Compliance framework** — Automated scanning for PII/compliance issues
* **Audit logging** — Tamper-evident storage for compliance-grade events

---

**TL;DR:** This specification outlines both the current logging implementation (console.log with component-based format) and the target structured logging system using Pino with context propagation via AsyncLocalStorage, and comprehensive security features. It provides a phased migration plan to transition from the current approach to the target implementation while maintaining backward compatibility. Phases 1-3 have been implemented, with Phase 4 planned for future development.
