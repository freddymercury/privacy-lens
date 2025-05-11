# PrivacyLens Logging System

This directory contains the logging system for the PrivacyLens backend. The system is designed to provide structured logging with context propagation and file output.

## Overview

The logging system is implemented in three phases:

1. **Phase 1**: Basic console wrapper (`logger.js`)
2. **Phase 2**: Structured logging with Pino (`logger-phase2.js`)
3. **Phase 3**: Context propagation and file output (`logger-phase3.js`)

Each phase builds on the previous one, adding more features and capabilities.

## Usage

### Basic Usage (Phase 1)

```javascript
import { createLogger } from '../lib/logger.js';

const logger = createLogger('ComponentName');

logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');
logger.debug('This is a debug message (only shown in development)');
logger.trace('This is a trace message (only shown if LOG_LEVEL=trace)');
logger.fatal('This is a fatal message');
```

### Structured Logging (Phase 2)

```javascript
import { createLogger } from '../lib/logger-phase2.js';

const logger = createLogger('ComponentName');

// Log with additional structured data
logger.info('Processing item', { id: 123, status: 'active' });

// Log errors with full stack traces
try {
  // Some code that might throw
} catch (error) {
  logger.error('Failed to process item', error);
}
```

### Context Propagation (Phase 3)

```javascript
import { createLogger } from '../lib/logger-phase3.js';
import { createContext, runWithContext } from '../lib/context.js';

const logger = createLogger('ComponentName');

// Create a context for a job
const jobContext = createContext({
  jobId: 'job-123',
  operation: 'data-processing',
  userId: 'user-456'
});

// Run with context
runWithContext(jobContext, async () => {
  logger.info('Starting job');
  
  // All logs within this function will include the context
  await processData();
  
  logger.info('Job completed');
});

// Child loggers
const childLogger = logger.child({ name: 'ChildComponent' });
childLogger.info('This log comes from a child logger');
```

### Express Middleware

```javascript
import express from 'express';
import { contextMiddleware } from '../lib/context.js';
import { requestLogger } from '../lib/logger-phase3.js';

const app = express();

// Add context middleware before request logger
app.use(contextMiddleware());
app.use(requestLogger());

app.get('/api/data', (req, res) => {
  // Context is automatically included in logs
  logger.info('Fetching data', { query: req.query });
  
  // Process request...
  res.json({ success: true });
});
```

## Configuration

The logging system can be configured using environment variables:

| Variable              | Default       | Description                                     |
|-----------------------|---------------|-------------------------------------------------|
| `LOG_LEVEL`           | `info`        | Minimum log level to record                     |
| `LOG_PATH`            | `./logs`      | Directory for log files                         |
| `SERVICE_NAME`        | `privacy-lens` | Service identifier for logs                     |
| `NODE_ENV`            | `production`  | Application environment                         |

## Log Levels

The logging system supports the following log levels (in order of increasing severity):

1. `trace` - Detailed debugging information
2. `debug` - Debugging information
3. `info` - Informational messages
4. `warn` - Warning messages
5. `error` - Error messages
6. `fatal` - Critical errors that cause the application to crash

## Examples

See `logger-example.js` for examples of how to use the logging system. You can run the examples using:

```bash
NODE_ENV=development node src/lib/run-logger-example.js
```

## File Output

Logs are written to `{LOG_PATH}/{SERVICE_NAME}.log` in JSON format. Each log entry includes:

- Timestamp
- Log level
- Component name
- Message
- Context data (if available)
- Additional data passed to the log method

Example log entry:

```json
{"level":"info","time":"2025-05-10T23:32:19.474Z","msg":"Logger initialized","timestamp":"2025-05-10T23:32:19.474Z","environment":"development","logLevel":"info"}
```

## Security

The logging system automatically redacts sensitive information such as passwords and tokens. The following fields are redacted:

- `password`
- `token`
- `secret`
- `*.password`
- `*.token`
- `*.secret`
- `req.headers.authorization`
- `req.headers.cookie`

## Future Enhancements

- Log rotation and archiving
- Remote transport for log shipping
- OpenTelemetry integration
- Advanced analytics and alerting
