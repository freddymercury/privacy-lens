# PrivacyLens Development Setup Guide

This guide covers setting up the PrivacyLens development environment with the new process separation architecture (Client API + Backend monolith).

## Architecture Overview

PrivacyLens now consists of two main processes:

1. **Client API** (port 3001) - Handles Chrome plugin requests
2. **Backend** (port 3000) - Handles admin dashboard and core services
3. **NGINX** - Routes requests between processes
4. **Shared modules** - Common functionality used by both processes

## Prerequisites

- **Node.js** 23.11.0 or later
- **npm** or **yarn**
- **Git**
- **NGINX** (for local development routing)
- **Supabase** account and project

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/privacy-lens.git
cd privacy-lens
```

### 2. Install Dependencies

Install dependencies for all processes:

```bash
# Install shared module dependencies
cd shared
npm install
cd ..

# Install Client API dependencies
cd client-api
npm install
cd ..

# Install Backend dependencies
cd backend
npm install
cd ..
```

### 3. Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Authentication
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h
SESSION_SECRET=your_session_secret_here

# Client API Configuration
CLIENT_API_PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Backend Configuration
PORT=3000

# Chrome Plugin
CHROME_PLUGIN_ORIGIN=chrome-extension://your-extension-id

# Stripe Configuration (for subscriptions)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Assessment Configuration
ASSESSMENT_TRIGGER_INTERVAL_MINUTES=600
MAX_CONCURRENT_ASSESSMENTS=1

# External APIs
SERPAPI_API_KEY=your_serpapi_key
```

### 4. Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the database migrations (if available)
3. Set up Row Level Security (RLS) policies
4. Configure authentication settings

## Development Workflow

### Starting the Development Environment

You have several options for running the development environment:

#### Option 1: Start All Processes Individually

```bash
# Terminal 1: Start Client API
cd client-api
npm run dev

# Terminal 2: Start Backend
cd backend
npm run dev

# Terminal 3: Start NGINX (if configured)
nginx -c /path/to/privacy-lens/nginx/privacy-lens.dev.conf
```

#### Option 2: Using Process Manager (Recommended)

Create a `ecosystem.config.js` file in the project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'client-api',
      script: './client-api/src/app.js',
      env: {
        NODE_ENV: 'development',
        CLIENT_API_PORT: 3001
      },
      watch: ['./client-api/src'],
      ignore_watch: ['node_modules', 'logs']
    },
    {
      name: 'backend',
      script: './backend/src/index.js',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: ['./backend/src'],
      ignore_watch: ['node_modules', 'logs']
    }
  ]
};
```

Then start with PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 logs  # View logs from all processes
pm2 stop all  # Stop all processes
```

### Development URLs

Once running, you can access:

- **Client API Health Check:** http://localhost:3001/health
- **Backend Health Check:** http://localhost:3000/api/health
- **Admin Dashboard:** http://localhost:3000/admin
- **API Documentation:** http://localhost:3000/api/docs (if available)

### Testing the Setup

#### Test Client API Endpoints

```bash
# Test Client API health
curl http://localhost:3001/health | jq

# Test authentication endpoint
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword",
    "deviceId": "test-device"
  }'

# Test assessment endpoint
curl "http://localhost:3001/api/assessment?url=example.com" | jq
```

#### Test Backend Endpoints

```bash
# Test Backend health
curl http://localhost:3000/api/health | jq

# Test admin login page
curl http://localhost:3000/admin/login

# Test policy archive API
curl "http://localhost:3000/api/v1/policies/example.com/latest" | jq
```

## Development Tools

### Running Tests

Each process has its own test suite:

```bash
# Test Client API
cd client-api
npm test
npm run test:coverage

# Test Backend
cd backend
npm test
npm run test:coverage

# Test shared modules
cd shared
npm test
```

### Linting and Formatting

```bash
# Lint Client API
cd client-api
npm run lint
npm run lint:fix

# Lint Backend
cd backend
npm run lint
npm run lint:fix
```

### Debugging

#### Client API Debugging

```bash
# Enable debug logging
cd client-api
LOG_LEVEL=debug npm run dev

# Use Node.js debugger
node --inspect src/app.js
```

#### Backend Debugging

```bash
# Enable debug logging
cd backend
LOG_LEVEL=debug npm run dev

# Use Node.js debugger
node --inspect src/index.js
```

### Monitoring Logs

#### Structured Logging

Both processes use structured JSON logging. You can monitor logs in real-time:

```bash
# Client API logs
cd client-api
tail -f logs/client-api.log | jq

# Backend logs
cd backend
tail -f logs/backend.log | jq

# Filter logs by level
tail -f logs/client-api.log | jq 'select(.level == "error")'

# Search for specific requests
tail -f logs/client-api.log | jq 'select(.requestId == "trace-12345")'
```

## NGINX Configuration (Optional)

For local development that mimics production routing, configure NGINX:

### 1. Install NGINX

```bash
# macOS
brew install nginx

# Ubuntu/Debian
sudo apt-get install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 2. Configure NGINX

Create `/usr/local/etc/nginx/privacy-lens.dev.conf`:

```nginx
server {
    listen 8080;
    server_name localhost;

    # Client API routes
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

    location /api/report-unassessed {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend routes (everything else)
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Start NGINX

```bash
nginx -c /usr/local/etc/nginx/privacy-lens.dev.conf
```

Now you can access the application through NGINX at http://localhost:8080

## Chrome Plugin Development

### 1. Load the Plugin

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `chrome-plugin` directory

### 2. Configure Plugin for Local Development

Update the plugin's configuration to point to your local development environment:

```javascript
// In chrome-plugin/config.js or similar
const API_BASE_URL = 'http://localhost:8080'; // If using NGINX
// OR
const API_BASE_URL = 'http://localhost:3001'; // Direct to Client API
```

### 3. Test Plugin Functionality

1. Navigate to any website
2. Click the PrivacyLens extension icon
3. Test authentication, assessment, and subscription features

## Common Development Tasks

### Adding New Endpoints

#### To Client API

1. Create controller function in `client-api/src/controllers/`
2. Add route in `client-api/src/routes/`
3. Update `client-api/src/app.js` to include the route
4. Add tests in `client-api/test/`

#### To Backend

1. Create controller function in `backend/src/controllers/`
2. Add route in `backend/src/api/` or `backend/src/api/admin.js`
3. Add tests in `backend/test/`

### Updating Shared Modules

1. Make changes in `shared/` directory
2. Test changes in both Client API and Backend
3. Update version in `shared/package.json` if needed
4. Both processes will automatically use updated shared modules

### Database Schema Changes

1. Create migration scripts (if using migrations)
2. Update Supabase schema through the dashboard
3. Update RLS policies if needed
4. Test with both processes

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :3001
lsof -i :3000

# Kill process
kill -9 <PID>
```

#### Database Connection Issues

1. Verify Supabase URL and keys in `.env`
2. Check network connectivity
3. Verify RLS policies allow access
4. Check Supabase project status

#### Module Resolution Issues

```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### CORS Issues

1. Verify `CHROME_PLUGIN_ORIGIN` in `.env`
2. Check CORS configuration in both processes
3. Ensure proper preflight handling

### Debug Commands

```bash
# Check process status
ps aux | grep node

# Check port usage
netstat -tulpn | grep :3001
netstat -tulpn | grep :3000

# Test connectivity
curl -v http://localhost:3001/health
curl -v http://localhost:3000/api/health

# Check logs for errors
tail -f client-api/logs/*.log
tail -f backend/logs/*.log
```

## Performance Optimization

### Development Performance

1. **Use nodemon for auto-restart:**
   ```bash
   npm install -g nodemon
   nodemon client-api/src/app.js
   ```

2. **Enable source maps for debugging:**
   ```bash
   NODE_OPTIONS="--enable-source-maps" npm run dev
   ```

3. **Use PM2 cluster mode for testing:**
   ```bash
   pm2 start ecosystem.config.js --env development
   ```

### Database Performance

1. **Use connection pooling** (already configured in shared modules)
2. **Monitor query performance** in Supabase dashboard
3. **Add database indexes** for frequently queried fields

## Security Considerations

### Development Security

1. **Never commit secrets** to version control
2. **Use different secrets** for development and production
3. **Regularly rotate API keys** and tokens
4. **Use HTTPS** in production-like environments

### Testing Security

1. **Test authentication flows** thoroughly
2. **Verify input validation** on all endpoints
3. **Test rate limiting** functionality
4. **Check for SQL injection** vulnerabilities

## Deployment Preparation

### Pre-deployment Checklist

1. **All tests pass** for both processes
2. **Environment variables** configured for production
3. **Database migrations** applied
4. **NGINX configuration** updated for production
5. **SSL certificates** configured
6. **Monitoring and logging** set up
7. **Backup procedures** in place

### Production Environment Variables

```env
NODE_ENV=production
LOG_LEVEL=info
CLIENT_API_PORT=3001
PORT=3000

# Use production database
SUPABASE_URL=your_production_supabase_url
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key

# Production secrets
JWT_SECRET=strong_production_jwt_secret
SESSION_SECRET=strong_production_session_secret
STRIPE_SECRET_KEY=your_production_stripe_key
```

## Contributing

### Code Style

1. **Follow existing patterns** in each process
2. **Use meaningful variable names** and comments
3. **Write tests** for new functionality
4. **Update documentation** for API changes

### Pull Request Process

1. **Create feature branch** from main
2. **Make changes** with tests
3. **Update documentation** if needed
4. **Test thoroughly** in development environment
5. **Submit pull request** with clear description

### Code Review Guidelines

1. **Test all endpoints** mentioned in the PR
2. **Verify logging** is appropriate
3. **Check error handling** is comprehensive
4. **Ensure security** best practices are followed

This development setup guide should help you get started with the PrivacyLens development environment. For additional help, refer to the individual README files in each process directory or the API documentation. 