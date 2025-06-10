# Client API Architecture Documentation

## Overview

The Client API is a separate Node.js process that handles Chrome plugin requests for authentication, assessment, and subscription operations. This process was separated from the monolithic backend to improve scalability, maintainability, and deployment flexibility.

## Architecture

### Process Separation

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chrome Plugin │    │   NGINX Proxy   │    │  Client API     │
│                 │────│                 │────│  (Port 3001)    │
│  - Auth UI      │    │  - Route /api/* │    │  - Auth         │
│  - Assessment   │    │  - Load Balance │    │  - Assessment   │
│  - Subscription │    │  - CORS         │    │  - Subscription │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                │
                       ┌─────────────────┐
                       │  Backend        │
                       │  (Port 3000)    │
                       │  - Admin UI     │
                       │  - Archive API  │
                       │  - Background   │
                       │    Jobs         │
                       └─────────────────┘
```

### Technology Stack

- **Runtime:** Node.js 23.11.0
- **Framework:** Express.js
- **Module System:** CommonJS (require/module.exports)
- **Database:** Supabase (PostgreSQL)
- **Authentication:** JWT tokens
- **Logging:** Pino with structured logging
- **Testing:** Jest with Supertest

## API Endpoints

### Authentication Endpoints

All authentication endpoints are now handled by the Client API:

#### POST `/api/auth/register`
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name",
  "deviceId": "device_123"
}
```

**Response:**
```json
{
  "status": "success",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "token": "jwt_token"
}
```

#### POST `/api/auth/login`
Authenticate user and return JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "deviceId": "device_123"
}
```

**Response:**
```json
{
  "status": "success",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "token": "jwt_token"
}
```

#### POST `/api/auth/validate`
Validate JWT token.

**Request:**
```json
{
  "token": "jwt_token"
}
```

**Response:**
```json
{
  "status": "success",
  "valid": true,
  "payload": {
    "userId": "uuid",
    "tier": "free",
    "features": [],
    "deviceId": "device_123"
  }
}
```

#### POST `/api/auth/refresh`
Refresh expired JWT token.

**Request:**
```json
{
  "token": "expired_jwt_token"
}
```

**Response:**
```json
{
  "status": "success",
  "token": "new_jwt_token"
}
```

#### POST `/api/auth/revoke`
Revoke/invalidate JWT token (logout).

**Request:**
```json
{
  "token": "jwt_token"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Token revoked successfully"
}
```

### Assessment Endpoints

#### GET `/api/assessment?url=example.com`
Get privacy assessment for a URL.

**Response:**
```json
{
  "status": "success",
  "assessment": {
    "url": "example.com",
    "riskLevel": "High",
    "categories": {
      "Data Collection & Use": {
        "risk": "High",
        "explanation": "Assessment based on policy text analysis"
      }
    },
    "summary": "Privacy policy assessment for example.com",
    "lastUpdated": "2025-05-26T01:00:30.522Z",
    "policyUrl": "example.com"
  }
}
```

#### POST `/api/trigger-assessment/:url`
Trigger a new assessment for a URL.

**Request:**
```json
{
  "manualText": "Privacy policy text content..."
}
```

**Response:**
```json
{
  "status": "success",
  "assessment": {
    "url": "example.com",
    "riskLevel": "Medium",
    "categories": {...},
    "summary": "Assessment summary",
    "lastUpdated": "2025-05-26T02:00:00.000Z",
    "policyUrl": "example.com"
  }
}
```

#### POST `/api/report-unassessed`
Report an unassessed URL for future processing.

**Request:**
```json
{
  "url": "newsite.com"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "URL added to unassessed queue"
}
```

### Subscription Endpoints

All subscription endpoints are handled by the Client API with proper authentication.

#### POST `/api/subscription/create`
Create a new subscription.

#### POST `/api/subscription/update`
Update existing subscription.

#### POST `/api/subscription/cancel`
Cancel subscription.

#### POST `/api/subscription/status`
Get subscription status.

#### POST `/api/subscription/webhook`
Handle Stripe webhooks.

## Monitoring and Logging

### Structured Logging

The Client API uses Pino for structured JSON logging with the following features:

- **Request/Response Logging:** Every HTTP request is logged with context
- **Component-based Loggers:** Each controller has its own logger
- **Context Propagation:** Request context flows through all operations
- **Error Tracking:** Comprehensive error logging with stack traces
- **Security:** Sensitive data (passwords, tokens) is automatically redacted

### Log Format

```json
{
  "level": "info",
  "time": "2025-05-26T02:26:28.420Z",
  "component": "AuthController",
  "msg": "User login attempt",
  "traceId": "trace-3h4psjj4wa2",
  "requestId": "trace-0jml48jm6veq",
  "ip": "::ffff:127.0.0.1",
  "method": "POST",
  "path": "/api/auth/login",
  "email": "user@example.com",
  "hasPassword": true,
  "deviceId": "device_123"
}
```

### Health Check

The Client API provides a comprehensive health check endpoint:

#### GET `/health`

**Response:**
```json
{
  "status": "healthy",
  "service": "client-api",
  "timestamp": "2025-05-26T02:25:36.998Z",
  "uptime": 5.489407125,
  "memory": {
    "rss": 99958784,
    "heapTotal": 33296384,
    "heapUsed": 20420176,
    "external": 3491199,
    "arrayBuffers": 4262130
  },
  "version": "1.0.0",
  "environment": "development",
  "nodeVersion": "v23.11.0"
}
```

### Request Tracing

Every request gets a unique trace ID (`X-Request-ID` header) for tracking requests across the system.

## Shared Modules

The Client API uses shared modules from `/shared/` for common functionality:

### Authentication (`@privacy-lens/shared/auth`)
- JWT token generation and validation
- Password hashing and verification
- User authentication logic

### Assessment (`@privacy-lens/shared/assessment`)
- URL normalization
- Assessment data structures
- Privacy policy analysis utilities

### Database (`@privacy-lens/shared/db`)
- Supabase client configuration
- Database query utilities
- Connection management

### Subscription (`@privacy-lens/shared/subscription`)
- Subscription validation logic
- Stripe integration utilities
- Plan management functions

## Development Setup

### Prerequisites

- Node.js 23.11.0 or later
- npm or yarn
- Access to Supabase database
- Environment variables configured

### Installation

```bash
cd client-api
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Client API Configuration
CLIENT_API_PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Authentication
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h

# Chrome Plugin
CHROME_PLUGIN_ORIGIN=chrome-extension://your-extension-id
```

### Running the Client API

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Testing

### Test Structure

```
client-api/test/
├── controllers/           # Controller unit tests
│   ├── authController.test.js
│   └── assessmentController.test.js
├── routes/               # Route integration tests
│   ├── auth.test.js
│   └── assessment.test.js
├── integration/          # Full integration tests
│   ├── auth.integration.test.js
│   └── assessment.integration.test.js
├── load/                 # Load testing
│   └── auth.load.test.js
└── monitoring.test.js    # Monitoring and logging tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/controllers/authController.test.js

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

The Client API maintains high test coverage:

- **Controllers:** 100% coverage for all controller functions
- **Routes:** 100% coverage for all route handlers
- **Integration:** End-to-end testing for all workflows
- **Monitoring:** Comprehensive logging and health check tests

## Deployment

### Docker Deployment

The Client API can be deployed using Docker:

```dockerfile
FROM node:23.11.0-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY shared/ ./shared/

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
```

### Process Management

For production deployment, use a process manager like PM2:

```json
{
  "name": "client-api",
  "script": "src/app.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "CLIENT_API_PORT": 3001
  }
}
```

### NGINX Configuration

NGINX routes requests to the Client API:

```nginx
# Route Client API endpoints
location /api/auth/ {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/assessment {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/subscription/ {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Troubleshooting

### Common Issues

#### 1. Connection Refused
**Problem:** `curl: (7) Failed to connect to localhost port 3001`
**Solution:** 
- Check if Client API is running: `ps aux | grep node`
- Check port availability: `lsof -i :3001`
- Verify environment variables are set

#### 2. Database Connection Errors
**Problem:** `Error: Invalid Supabase URL`
**Solution:**
- Verify `SUPABASE_URL` environment variable
- Check Supabase service status
- Verify network connectivity to Supabase

#### 3. Authentication Failures
**Problem:** `Invalid or expired token`
**Solution:**
- Check JWT secret configuration
- Verify token format and expiration
- Check system clock synchronization

#### 4. CORS Errors
**Problem:** `Access-Control-Allow-Origin` errors
**Solution:**
- Verify `CHROME_PLUGIN_ORIGIN` environment variable
- Check NGINX CORS configuration
- Ensure proper preflight handling

### Debugging

#### Enable Debug Logging

```bash
LOG_LEVEL=debug npm start
```

#### Check Health Status

```bash
curl http://localhost:3001/health | jq
```

#### Monitor Logs

```bash
# Follow logs in real-time
tail -f logs/client-api.log

# Search for specific requests
grep "trace-12345" logs/client-api.log
```

## Performance Considerations

### Response Times

- **Authentication:** < 200ms average
- **Assessment:** < 500ms average (cached)
- **Health Check:** < 50ms average

### Concurrency

The Client API handles concurrent requests efficiently:
- Uses Express.js async/await patterns
- Database connection pooling via Supabase
- Stateless design for horizontal scaling

### Caching

- Assessment results are cached in the database
- JWT tokens include user context to reduce database queries
- Health check responses include caching headers

## Security

### Authentication

- JWT tokens with configurable expiration
- Secure password hashing with bcrypt
- Device-based authentication tracking

### Data Protection

- Automatic redaction of sensitive data in logs
- HTTPS enforcement in production
- Input validation and sanitization

### Rate Limiting

- Request rate limiting per IP address
- Authentication attempt limiting
- Subscription operation throttling

## Migration Notes

### From Monolith

The following endpoints were migrated from the monolithic backend:

- **Authentication:** All `/api/auth/*` endpoints
- **Assessment:** `/api/assessment` and `/api/trigger-assessment/:url`
- **Subscription:** All `/api/subscription/*` endpoints
- **Unassessed:** `/api/report-unassessed`

### Backward Compatibility

During the migration period:
- Old endpoints return 404 errors
- Chrome plugin updated to use new endpoints
- NGINX routes requests to appropriate services

### Data Migration

No data migration was required as both processes use the same Supabase database.

## Future Enhancements

### Planned Features

1. **Caching Layer:** Redis for improved performance
2. **Rate Limiting:** Advanced rate limiting with Redis
3. **Metrics:** Prometheus metrics collection
4. **Tracing:** Distributed tracing with Jaeger
5. **Auto-scaling:** Kubernetes deployment with HPA

### Monitoring Improvements

1. **Alerting:** PagerDuty integration for critical errors
2. **Dashboards:** Grafana dashboards for metrics
3. **Log Aggregation:** ELK stack for log analysis
4. **Performance Monitoring:** APM tools integration

## Conclusion

The Client API successfully separates Chrome plugin functionality from the monolithic backend, providing:

- **Improved Scalability:** Independent scaling of client-facing operations
- **Better Maintainability:** Focused codebase for client operations
- **Enhanced Monitoring:** Detailed logging and health checks
- **Robust Testing:** Comprehensive test coverage
- **Production Ready:** Full deployment and monitoring capabilities

The separation maintains all existing functionality while providing a foundation for future enhancements and scaling. 