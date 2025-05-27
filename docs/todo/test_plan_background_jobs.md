# Background Jobs Test Plan - PrivacyLens

*Version 1.0 – December 2024*

## Overview

This document outlines a comprehensive test plan for the PrivacyLens background jobs system, including the Policy Archiver Job and Assessment Trigger Service. The plan covers unit tests, integration tests, and end-to-end testing scenarios while ensuring external API costs are minimized through proper mocking.

## Background Jobs to Test

### 1. Policy Archiver Job
- **Location**: `backend/src/jobs/archiverJob.js`
- **Dependencies**: 
  - `backend/src/services/archiver/deepCrawler.js`
  - `backend/src/services/archiver/versioner.js`
  - `backend/src/services/archiver/assetFetcher.js`
  - Database tables: `policies`, `policy_versions`, `policy_assets`, `scan_events`

### 2. Assessment Trigger Service
- **Location**: `backend/src/services/assessmentTriggerService.js`
- **Dependencies**:
  - `backend/src/services/policyFinderService.js` (includes SerpAPI calls)
  - `backend/src/services/llmService.js`
  - Database tables: `unassessed_urls`, `websites`, `policies`, `audit_logs`

## Test Structure

```
backend/test/
├── jobs/
│   ├── archiverJob.test.js
│   └── archiverJob.integration.test.js
├── services/
│   ├── assessmentTriggerService.test.js (existing)
│   ├── assessmentTriggerService.integration.test.js
│   ├── policyFinderService.test.js
│   └── archiver/
│       ├── deepCrawler.test.js
│       ├── versioner.test.js
│       ├── assetFetcher.test.js
│       └── linkFilter.test.js
├── fixtures/
│   ├── mock-policies.json
│   ├── mock-html-pages/
│   └── mock-serpapi-responses.json
└── helpers/
    ├── mockSerpAPI.js
    ├── mockDatabase.js
    └── testServer.js
```

## Test Categories

### 1. Unit Tests

#### 1.1 Policy Archiver Job (`backend/test/jobs/archiverJob.test.js`)

**Test Scenarios:**
- ✅ **Schedule Configuration**: Test job scheduling with different cron expressions
- ✅ **Policy Fetching**: Test `getPoliciesToScan()` with various database states
- ✅ **Failure Tracking**: Test failure counting and skip logic
- ✅ **URL Pre-checking**: Test `preCheckUrl()` functionality
- ✅ **Error Handling**: Test graceful error handling and logging
- ✅ **Configuration Loading**: Test environment variable parsing

**Mock Strategy:**
```javascript
// Mock all external dependencies
jest.mock("node-schedule");
jest.mock("../src/utils/supabaseClient.js");
jest.mock("../src/services/archiver/deepCrawler.js");
jest.mock("../src/services/archiver/versioner.js");
jest.mock("../src/services/archiver/assetFetcher.js");
```

#### 1.2 Assessment Trigger Service (`backend/test/services/assessmentTriggerService.test.js`)

**Existing Tests Enhancement:**
- ✅ **Concurrency Control**: Test batch processing with different concurrency limits
- ✅ **Retry Logic**: Test failed URL retry mechanism
- ✅ **Status Transitions**: Test URL status changes through processing pipeline
- ✅ **SerpAPI Fallback**: Test policy discovery with mocked SerpAPI responses
- ✅ **LLM Integration**: Test assessment generation with mocked LLM responses

#### 1.3 Policy Finder Service (`backend/test/services/policyFinderService.test.js`)

**Test Scenarios:**
- ✅ **Common Path Discovery**: Test finding policies at standard paths
- ✅ **SerpAPI Fallback**: Test search engine fallback with mocked responses
- ✅ **Content Verification**: Test policy content validation
- ✅ **URL Prioritization**: Test URL scoring and selection logic
- ✅ **Error Handling**: Test network failures and invalid responses

**SerpAPI Mocking Strategy:**
```javascript
// Mock axios for SerpAPI calls
jest.mock("axios");

const mockSerpAPIResponse = {
  organic_results: [
    {
      title: "Privacy Policy - Example Company",
      link: "https://example.com/privacy-policy",
      snippet: "Our privacy policy explains how we collect and use your data..."
    }
  ]
};

axios.get.mockResolvedValue({ 
  status: 200, 
  data: mockSerpAPIResponse 
});
```

#### 1.4 Archiver Components

**Deep Crawler (`backend/test/services/archiver/deepCrawler.test.js`):**
- ✅ **Crawl Depth Control**: Test maximum depth enforcement
- ✅ **Link Filtering**: Test privacy-related link detection
- ✅ **Content Extraction**: Test HTML and PDF content extraction
- ✅ **Rate Limiting**: Test crawl delays and request throttling

**Versioner (`backend/test/services/archiver/versioner.test.js`):**
- ✅ **Change Detection**: Test content hash comparison
- ✅ **Version Creation**: Test new version generation
- ✅ **Diff Generation**: Test change summary creation
- ✅ **Database Operations**: Test policy version storage

**Asset Fetcher (`backend/test/services/archiver/assetFetcher.test.js`):**
- ✅ **URL Accessibility**: Test `checkUrlAccessibility()` function
- ✅ **Content Fetching**: Test HTTP request handling
- ✅ **Error Handling**: Test timeout and network error scenarios
- ✅ **Content Type Detection**: Test PDF vs HTML detection

### 2. Integration Tests

#### 2.1 End-to-End Assessment Flow (`backend/test/services/assessmentTriggerService.integration.test.js`)

**Test Scenarios:**
- ✅ **Complete Assessment Pipeline**: Test URL → Policy Discovery → Assessment → Archive Queue
- ✅ **Database State Changes**: Verify correct database updates throughout process
- ✅ **Audit Logging**: Verify comprehensive audit trail creation
- ✅ **Error Recovery**: Test system behavior with partial failures

**Setup:**
```javascript
// Use test database with real schema
const testDb = setupTestDatabase();

// Mock external APIs but use real database operations
jest.mock("axios"); // For SerpAPI
jest.mock("../src/services/llmService.js"); // For OpenAI
```

#### 2.2 Archiver Job Integration (`backend/test/jobs/archiverJob.integration.test.js`)

**Test Scenarios:**
- ✅ **Full Archive Cycle**: Test complete policy archiving workflow
- ✅ **Version Management**: Test version creation and change detection
- ✅ **Failure Recovery**: Test job behavior with network failures
- ✅ **Concurrent Processing**: Test job behavior with multiple policies

### 3. Performance Tests

#### 3.1 Load Testing

**Assessment Trigger Service:**
- Test processing 100+ URLs concurrently
- Measure memory usage and processing time
- Test database connection pooling under load

**Archiver Job:**
- Test crawling multiple large websites
- Measure storage requirements for versions
- Test job completion time with various policy counts

### 4. Mock Implementations

#### 4.1 SerpAPI Mock (`backend/test/helpers/mockSerpAPI.js`)

```javascript
/**
 * Mock SerpAPI responses to avoid API costs during testing
 */
class MockSerpAPI {
  static createSuccessResponse(domain, policyPath = '/privacy-policy') {
    return {
      organic_results: [
        {
          title: `Privacy Policy - ${domain}`,
          link: `https://${domain}${policyPath}`,
          snippet: "Our privacy policy explains how we collect, use, and protect your personal information..."
        }
      ]
    };
  }

  static createNoResultsResponse() {
    return {
      organic_results: []
    };
  }

  static createErrorResponse(errorMessage) {
    return {
      error: errorMessage
    };
  }

  static setupMocks() {
    // Setup axios mocks for different scenarios
    const axios = require('axios');
    
    axios.get.mockImplementation((url, config) => {
      const params = config.params;
      const query = params.q;
      
      // Extract domain from search query
      const domainMatch = query.match(/site:([^\s]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        
        // Return different responses based on domain for testing
        if (domain.includes('example.com')) {
          return Promise.resolve({
            status: 200,
            data: this.createSuccessResponse(domain)
          });
        } else if (domain.includes('nopolicy.com')) {
          return Promise.resolve({
            status: 200,
            data: this.createNoResultsResponse()
          });
        } else if (domain.includes('error.com')) {
          return Promise.resolve({
            status: 200,
            data: this.createErrorResponse('API quota exceeded')
          });
        }
      }
      
      // Default success response
      return Promise.resolve({
        status: 200,
        data: this.createSuccessResponse('default.com')
      });
    });
  }
}

module.exports = MockSerpAPI;
```

#### 4.2 Database Mock (`backend/test/helpers/mockDatabase.js`)

```javascript
/**
 * Database mocking utilities for consistent test data
 */
class MockDatabase {
  static createMockPolicies() {
    return [
      {
        id: 'policy-1',
        domain_name: 'example.com',
        policy_type: 'privacy',
        url: 'https://example.com/privacy-policy',
        failure_count: 0,
        last_failure_date: null
      },
      {
        id: 'policy-2',
        domain_name: 'test.com',
        policy_type: 'privacy',
        url: 'https://test.com/privacy',
        failure_count: 2,
        last_failure_date: new Date('2024-12-01')
      }
    ];
  }

  static createMockUnassessedUrls() {
    return [
      {
        url: 'example.com',
        status: 'Pending',
        suggested_policy_urls: null,
        created_at: new Date()
      },
      {
        url: 'test.com',
        status: 'Pending',
        suggested_policy_urls: ['https://test.com/privacy-policy'],
        created_at: new Date()
      }
    ];
  }

  static setupMocks() {
    // Setup Supabase mocks
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis()
    };

    return mockSupabase;
  }
}

module.exports = MockDatabase;
```

#### 4.3 Test Server (`backend/test/helpers/testServer.js`)

```javascript
/**
 * Mock HTTP server for testing web crawling functionality
 */
const express = require('express');

class TestServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.setupRoutes();
  }

  setupRoutes() {
    // Mock privacy policy pages
    this.app.get('/privacy-policy', (req, res) => {
      res.send(`
        <html>
          <head><title>Privacy Policy</title></head>
          <body>
            <h1>Privacy Policy</h1>
            <p>We collect personal information when you use our services...</p>
            <a href="/terms">Terms of Service</a>
            <a href="/contact">Contact Us</a>
          </body>
        </html>
      `);
    });

    // Mock terms page
    this.app.get('/terms', (req, res) => {
      res.send(`
        <html>
          <head><title>Terms of Service</title></head>
          <body>
            <h1>Terms of Service</h1>
            <p>By using our service, you agree to these terms...</p>
          </body>
        </html>
      `);
    });

    // Mock 404 page
    this.app.get('/nonexistent', (req, res) => {
      res.status(404).send('Page not found');
    });

    // Mock slow response for timeout testing
    this.app.get('/slow', (req, res) => {
      setTimeout(() => {
        res.send('Slow response');
      }, 10000);
    });
  }

  async start(port = 3333) {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Test server running on port ${port}`);
        resolve(port);
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Test server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = TestServer;
```

## Test Execution Strategy

### 1. Environment Setup

**Test Environment Variables:**
```bash
# Test database
SUPABASE_URL=test-supabase-url
SUPABASE_SERVICE_ROLE_KEY=test-key

# Disable external API calls
SERPAPI_API_KEY=test-key-disabled
OPENAI_API_KEY=test-key-disabled

# Test-specific settings
NODE_ENV=test
CRAWL_MAX_DEPTH=1
CRAWL_MAX_LINKS=5
CRAWL_DELAY_MS=100
```

### 2. Test Data Management

**Database Setup:**
- Use separate test database or database transactions
- Create test fixtures for consistent data
- Clean up after each test run

**Mock Data:**
- Store mock responses in JSON fixtures
- Version control mock data for consistency
- Update mocks when external APIs change

### 3. Continuous Integration

**Test Pipeline:**
```yaml
# .github/workflows/test-background-jobs.yml
name: Background Jobs Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: cd backend && npm install
      
      - name: Run unit tests
        run: cd backend && npm run test:jobs
      
      - name: Run integration tests
        run: cd backend && npm run test:integration
      
      - name: Generate coverage report
        run: cd backend && npm run test:coverage
```

## Test Commands

**Package.json Scripts:**
```json
{
  "scripts": {
    "test:jobs": "jest test/jobs/ --verbose",
    "test:jobs:watch": "jest test/jobs/ --watch",
    "test:archiver": "jest test/services/archiver/ --verbose",
    "test:assessment": "jest test/services/assessmentTriggerService* --verbose",
    "test:integration": "jest test/**/*.integration.test.js --verbose",
    "test:background-jobs": "jest test/jobs/ test/services/archiver/ test/services/assessmentTriggerService* --verbose",
    "test:coverage": "jest --coverage --collectCoverageFrom='src/jobs/**/*.js' --collectCoverageFrom='src/services/assessmentTriggerService.js' --collectCoverageFrom='src/services/archiver/**/*.js'"
  }
}
```

## Success Criteria

### 1. Code Coverage
- **Unit Tests**: >90% coverage for all background job components
- **Integration Tests**: >80% coverage for end-to-end workflows
- **Critical Paths**: 100% coverage for error handling and retry logic

### 2. Performance Benchmarks
- **Assessment Processing**: <5 seconds per URL (mocked external calls)
- **Archive Processing**: <30 seconds per policy (small test sites)
- **Memory Usage**: <500MB for processing 100 URLs concurrently

### 3. Reliability Tests
- **Error Recovery**: All tests pass with 10% random failure injection
- **Timeout Handling**: Graceful handling of network timeouts
- **Database Failures**: Proper error logging and retry behavior

## Implementation Priority

### Phase 1: Core Unit Tests (Week 1)
1. ✅ Create `archiverJob.test.js` with basic functionality tests
2. ✅ Enhance existing `assessmentTriggerService.test.js` with SerpAPI mocking
3. ✅ Create `policyFinderService.test.js` with comprehensive SerpAPI scenarios
4. ✅ Create mock helpers (`mockSerpAPI.js`, `mockDatabase.js`)

### Phase 2: Archiver Component Tests (Week 2)
1. ✅ Create `deepCrawler.test.js` with crawling logic tests
2. ✅ Create `versioner.test.js` with change detection tests
3. ✅ Create `assetFetcher.test.js` with HTTP handling tests
4. ✅ Create test server for controlled crawling tests

### Phase 3: Integration Tests (Week 3)
1. ✅ Create `assessmentTriggerService.integration.test.js`
2. ✅ Create `archiverJob.integration.test.js`
3. ✅ Setup test database with real schema
4. ✅ Create end-to-end workflow tests

### Phase 4: Performance & CI (Week 4)
1. ✅ Add performance benchmarking tests
2. ✅ Setup CI pipeline for automated testing
3. ✅ Create test coverage reporting
4. ✅ Document test maintenance procedures

## Maintenance

### 1. Mock Data Updates
- Review and update SerpAPI mock responses quarterly
- Update test fixtures when database schema changes
- Validate mock responses against real API responses

### 2. Test Environment
- Regularly clean test database
- Monitor test execution time and optimize slow tests
- Update test dependencies and security patches

### 3. Documentation
- Keep test documentation in sync with code changes
- Document new test scenarios for feature additions
- Maintain troubleshooting guide for test failures

## Related Documentation

- [Background Jobs Overview](./background_jobs_overview.md)
- [Assessment Trigger Service Specification](./assessment_trigger_service_spec.md)
- [Development Setup Guide](./development_setup.md)
- [API Testing Guide](./api_testing_guide.md) 