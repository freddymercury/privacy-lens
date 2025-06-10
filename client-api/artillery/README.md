# Artillery Load Testing for Client API

This directory contains Artillery.js load testing configurations for the PrivacyLens Client API. Artillery provides realistic HTTP load testing with detailed performance metrics.

## Overview

The load testing suite validates the Client API's performance under various load conditions, ensuring it can handle production traffic levels while maintaining acceptable response times and error rates.

## Test Configurations

### 1. Authentication Load Test (`auth-load-test.yml`)
Tests authentication endpoints under load:
- **User Registration Flow** (20% of traffic)
- **User Login Flow** (40% of traffic) 
- **Token Validation Flow** (30% of traffic)
- **Token Refresh Flow** (10% of traffic)

**Load Pattern:**
- Warm up: 10 requests/second for 60 seconds
- Ramp up: 20 requests/second for 120 seconds  
- Sustained: 50 requests/second for 60 seconds

### 2. Assessment Load Test (`assessment-load-test.yml`)
Tests assessment endpoints under load:
- **Get Assessment Flow** (50% of traffic)
- **Trigger Assessment Flow** (30% of traffic)
- **Report Unassessed URL Flow** (20% of traffic)
- **Mixed Operations** (10% of traffic)

**Load Pattern:**
- Warm up: 15 requests/second for 60 seconds
- Ramp up: 30 requests/second for 120 seconds
- Sustained: 60 requests/second for 60 seconds

## Performance Targets

Based on the Client API requirements, we target:

| Metric | Target | Acceptable |
|--------|--------|------------|
| Average Response Time | < 300ms | < 500ms |
| 95th Percentile Response Time | < 800ms | < 1000ms |
| Error Rate | < 2% | < 5% |
| Throughput | 50+ req/sec | 30+ req/sec |
| Memory Usage | Stable | < 25MB increase |

## Running Load Tests

### Prerequisites

1. **Start the Client API server:**
   ```bash
   npm run start
   # Server should be running on http://localhost:3001
   ```

2. **Verify server health:**
   ```bash
   curl http://localhost:3001/health
   ```

### Running All Tests

```bash
# Run all load tests with comprehensive reporting
npm run test:load
```

This will:
- Check server availability
- Run authentication load tests
- Run assessment load tests  
- Generate JSON and HTML reports
- Provide summary of results

### Running Individual Tests

```bash
# Authentication load test only
npm run test:load:auth

# Assessment load test only  
npm run test:load:assessment
```

### Manual Artillery Commands

```bash
# Run with custom output
npx artillery run artillery/auth-load-test.yml --output reports/custom-auth-report.json

# Generate HTML report from JSON
npx artillery report reports/auth-load-report.json --output reports/auth-report.html

# Run with environment variables
CLIENT_API_PORT=3002 npx artillery run artillery/auth-load-test.yml
```

## Test Data Generation

### Authentication Tests
- **Random Users**: Generated with unique emails and device IDs
- **Test Tokens**: Valid JWT tokens for validation/refresh testing
- **Realistic Payloads**: Proper user registration and login data

### Assessment Tests  
- **Test URLs**: Variety of domains and paths for assessment
- **Policy Text**: Sample privacy policy content for assessment creation
- **Mixed Scenarios**: Combination of read and write operations

## Reports and Analysis

### Report Locations
- **JSON Reports**: `artillery/reports/*.json` - Raw performance data
- **HTML Reports**: `artillery/reports/*.html` - Visual performance dashboards

### Key Metrics to Monitor

1. **Response Times**
   - Average, median, 95th percentile
   - Trend over test duration
   - Breakdown by endpoint

2. **Throughput**
   - Requests per second achieved
   - Successful vs failed requests
   - Concurrent user simulation

3. **Error Analysis**
   - HTTP status code distribution
   - Error rate trends
   - Specific failure patterns

4. **Resource Usage**
   - Memory consumption patterns
   - CPU utilization during load
   - Connection pool behavior

## Interpreting Results

### ✅ Good Performance Indicators
- Response times consistently under targets
- Error rate below 2%
- Stable memory usage
- Linear throughput scaling

### ⚠️ Warning Signs
- Response times increasing over test duration
- Error rate between 2-5%
- Memory usage growing continuously
- Throughput plateauing early

### ❌ Performance Issues
- Response times exceeding 1000ms
- Error rate above 5%
- Memory leaks or crashes
- Significant request failures

## Troubleshooting

### Common Issues

1. **Server Not Running**
   ```
   ❌ Server is not running or not responding
   Please start the server with: npm run start
   ```
   **Solution**: Start the Client API server first

2. **High Error Rates**
   - Check server logs for specific errors
   - Verify database connections
   - Ensure shared modules are properly configured

3. **Poor Performance**
   - Monitor system resources (CPU, memory)
   - Check for database bottlenecks
   - Review application logs for errors

4. **Test Failures**
   - Verify Artillery is installed: `npx artillery --version`
   - Check test configuration syntax
   - Ensure processor files are accessible

### Environment Variables

```bash
# Server configuration
CLIENT_API_PORT=3001          # API server port
JWT_SECRET=your_jwt_secret    # JWT signing secret

# Database configuration  
SUPABASE_URL=your_url         # Database URL
SUPABASE_ANON_KEY=your_key    # Database key
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Load Testing
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
        working-directory: ./client-api
      
      - name: Start server
        run: npm run start &
        working-directory: ./client-api
        
      - name: Wait for server
        run: sleep 10
        
      - name: Run load tests
        run: npm run test:load
        working-directory: ./client-api
        
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: load-test-reports
          path: client-api/artillery/reports/
```

## Performance Monitoring

### Baseline Establishment
1. Run load tests on clean environment
2. Record baseline metrics
3. Set up monitoring alerts
4. Regular performance regression testing

### Continuous Monitoring
- Integrate with APM tools (New Relic, DataDog)
- Set up performance alerts
- Regular load testing in staging
- Performance budgets in CI/CD

## Best Practices

1. **Test Environment**
   - Use dedicated test environment
   - Mirror production configuration
   - Isolate from other services

2. **Test Design**
   - Realistic user scenarios
   - Gradual load increase
   - Mix of read/write operations
   - Error scenario testing

3. **Analysis**
   - Compare against baselines
   - Look for trends over time
   - Correlate with application changes
   - Document performance improvements

## Files in this Directory

- `auth-load-test.yml` - Authentication endpoints load test configuration
- `assessment-load-test.yml` - Assessment endpoints load test configuration  
- `auth-processor.js` - Helper functions for auth test data generation
- `assessment-processor.js` - Helper functions for assessment test data generation
- `run-load-tests.js` - Automated test runner with reporting
- `reports/` - Generated test reports (JSON and HTML)
- `README.md` - This documentation file

## Next Steps

After establishing load testing:

1. **Performance Baselines** - Document current performance characteristics
2. **Monitoring Integration** - Set up continuous performance monitoring
3. **Optimization** - Address any performance bottlenecks identified
4. **Scaling Strategy** - Plan for horizontal/vertical scaling based on results

For questions or issues with load testing, refer to the [Artillery.js documentation](https://artillery.io/docs/) or the main project documentation. 