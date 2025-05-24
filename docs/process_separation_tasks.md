# Process Separation Tasks - Authentication & Assessment Endpoints

This document contains granular, testable tasks for separating authentication and assessment endpoints from the monolithic backend into a new Client API process.

## Overarching Directive: Pure Function Implementation

**Principle:** When extracting and implementing shared code, prioritize pure functions wherever possible.

**Pure Function Guidelines:**
- **Same Input → Same Output:** Functions should be deterministic
- **No Side Effects:** Don't modify external state, perform I/O, or mutate inputs
- **No External Dependencies:** Don't rely on global variables or external mutable state
- **Immutable Inputs:** Treat all input parameters as read-only

**Benefits:**
- Enhanced testability and predictability
- Reduced debugging complexity
- Better support for concurrent processing
- Easier reasoning about code behavior
- Improved cache-ability and memoization potential

**Implementation Strategy:**
- Extract side effects (DB calls, API calls, logging) to wrapper functions
- Pass dependencies as parameters rather than importing them directly
- Return new objects/arrays instead of modifying existing ones
- Use dependency injection for external services

**Example Pattern:**
```javascript
// ❌ Impure - side effects and external dependencies
function assessUrl(url) {
  const normalized = normalizeUrl(url);
  const result = database.query(`SELECT * FROM assessments WHERE url = ?`, [normalized]);
  logger.info(`Assessed ${url}`);
  return result;
}

// ✅ Pure core function + impure wrapper
function assessUrlPure(url, normalizer, assessmentData) {
  const normalized = normalizer(url);
  return assessmentData.find(assessment => assessment.url === normalized);
}

// Wrapper handles side effects
async function assessUrl(url) {
  const assessmentData = await database.getAssessments();
  const result = assessUrlPure(url, normalizeUrl, assessmentData);
  logger.info(`Assessed ${url}`);
  return result;
}
```

## Phase 1: Audit and Preparation

### Task 1.1: Audit authentication endpoints
**Goal:** Identify all authentication-related routes in the current monolith  
**Start:** Fresh codebase  
**End:** Complete list of auth endpoints documented  
**Test:** Verify all `/api/auth/*` routes are identified and documented  

- [ ] Search for all routes containing `/api/auth` in the current backend
- [ ] Document each route's HTTP method, path, and handler function
- [ ] Note any middleware used by these routes
- [ ] Save findings to a new file: `docs/audit_auth_endpoints.md`

### Task 1.2: Audit assessment endpoints  
**Goal:** Identify all assessment-related routes in the current monolith  
**Start:** Completed Task 1.1  
**End:** Complete list of assessment endpoints documented  
**Test:** Verify all assessment routes are identified and their dependencies mapped  

- [ ] Search for routes: `/api/assessment`, `/api/trigger-assessment/*`, `/api/report-unassessed`
- [ ] Document each route's HTTP method, path, and handler function
- [ ] Note any middleware used by these routes
- [ ] Append findings to `docs/audit_auth_endpoints.md` (rename to `docs/audit_client_api_endpoints.md`)

### Task 1.3: Map authentication dependencies
**Goal:** Identify all code/modules used by authentication endpoints  
**Start:** Completed Task 1.2  
**End:** Complete dependency map for auth endpoints  
**Test:** Verify all imports, utilities, and services used by auth endpoints are documented  

- [ ] For each auth endpoint handler, trace all `require`/`import` statements
- [ ] Document database tables accessed by auth logic
- [ ] Document external services called (e.g., JWT libraries, password hashing)
- [ ] Document middleware dependencies (e.g., CORS, validation)
- [ ] Save findings to `docs/auth_dependencies.md`

### Task 1.4: Map assessment dependencies
**Goal:** Identify all code/modules used by assessment endpoints  
**Start:** Completed Task 1.3  
**End:** Complete dependency map for assessment endpoints  
**Test:** Verify all imports, utilities, and services used by assessment endpoints are documented  

- [ ] For each assessment endpoint handler, trace all `require`/`import` statements
- [ ] Document database tables accessed by assessment logic
- [ ] Document external services called (e.g., LLM APIs, web scraping)
- [ ] Document middleware dependencies
- [ ] Save findings to `docs/assessment_dependencies.md`

## Phase 2: Set Up Shared Code Infrastructure

### Task 2.1: Create shared directory structure
**Goal:** Establish the `/shared` directory with proper module structure  
**Start:** Completed Phase 1  
**End:** Directory structure exists with package.json files  
**Test:** Verify directories exist and are importable as Node.js modules  

- [ ] Create `/shared` directory in project root
- [ ] Create subdirectories: `/shared/db`, `/shared/auth`, `/shared/assessment`, `/shared/config`
- [ ] Add `package.json` to `/shared` with basic module configuration
- [ ] Add `index.js` files to each subdirectory for exports

### Task 2.2: Extract database connection logic
**Goal:** Move database connection code to `/shared/db`  
**Start:** Completed Task 2.1  
**End:** Database connection is available as a shared module  
**Test:** Import and use database connection from the shared module in the monolith  

- [ ] Identify current database connection setup in the monolith
- [ ] Copy database connection logic to `/shared/db/connection.js`
- [ ] Export connection functions from `/shared/db/index.js`
- [ ] Update monolith to import database connection from shared module
- [ ] Run existing tests to ensure database connectivity works

### Task 2.3: Extract authentication utilities
**Goal:** Move reusable auth code to `/shared/auth`  
**Start:** Completed Task 2.2  
**End:** Auth utilities are available as shared modules  
**Test:** Import and use auth utilities from shared module in the monolith  

- [ ] Copy JWT token generation/validation functions to `/shared/auth/jwt.js`
- [ ] Copy password hashing/comparison functions to `/shared/auth/password.js`
- [ ] Copy user session management to `/shared/auth/session.js`
- [ ] **Apply pure function principles:** Separate pure logic from side effects
  - [ ] Extract pure JWT validation logic (token parsing, signature verification)
  - [ ] Extract pure password hashing logic (separate from database operations)
  - [ ] Create wrapper functions for database calls and logging
- [ ] Export all functions from `/shared/auth/index.js`
- [ ] Update monolith to import auth utilities from shared module
- [ ] Run authentication tests to ensure functionality works

### Task 2.4: Extract assessment core logic
**Goal:** Move reusable assessment code to `/shared/assessment`  
**Start:** Completed Task 2.3  
**End:** Assessment logic is available as shared modules  
**Test:** Import and use assessment logic from shared module in the monolith  

- [ ] Copy URL normalization functions to `/shared/assessment/url.js`
- [ ] Copy assessment processing logic to `/shared/assessment/processor.js`
- [ ] Copy LLM integration code to `/shared/assessment/llm.js`
- [ ] **Apply pure function principles:** Isolate pure business logic
  - [ ] Extract pure URL normalization (string manipulation only)
  - [ ] Extract pure assessment scoring/calculation logic
  - [ ] Extract pure data transformation functions
  - [ ] Separate pure LLM prompt generation from API calls
  - [ ] Create wrapper functions for database queries and external API calls
- [ ] Export all functions from `/shared/assessment/index.js`
- [ ] Update monolith to import assessment logic from shared module
- [ ] Run assessment tests to ensure functionality works

### Task 2.5: Extract configuration management
**Goal:** Move configuration logic to `/shared/config`  
**Start:** Completed Task 2.4  
**End:** Configuration is available as a shared module  
**Test:** Import and use configuration from shared module in the monolith  

- [ ] Copy environment variable handling to `/shared/config/env.js`
- [ ] Copy API endpoint configurations to `/shared/config/api.js`
- [ ] Copy database configuration to `/shared/config/database.js`
- [ ] **Apply pure function principles:** Separate config parsing from side effects
  - [ ] Extract pure config validation and transformation functions
  - [ ] Extract pure default value assignment logic
  - [ ] Create pure config merging/override functions
  - [ ] Separate environment variable reading from config processing
- [ ] Export all configurations from `/shared/config/index.js`
- [ ] Update monolith to import config from shared module
- [ ] Verify all environment variables and configs work correctly

### Task 2.6: Implement pure function testing strategy
**Goal:** Establish comprehensive testing for pure functions in shared modules  
**Start:** Completed Task 2.5  
**End:** Pure functions have robust, fast-running test suites  
**Test:** All pure functions are tested with deterministic, repeatable tests  

- [ ] Create test files for each shared module (`/shared/*/test/`)
- [ ] **Focus on pure function testing benefits:**
  - [ ] Write deterministic tests (same input always produces same output)
  - [ ] Test edge cases and boundary conditions extensively
  - [ ] Create property-based tests where applicable
  - [ ] Ensure tests run quickly (no I/O, no external dependencies)
- [ ] **Test pure functions in isolation:**
  - [ ] Mock any remaining dependencies passed as parameters
  - [ ] Test with various input combinations
  - [ ] Verify immutability (inputs are not modified)
- [ ] **Create test utilities:**
  - [ ] Helper functions for generating test data
  - [ ] Assertion utilities for complex objects
  - [ ] Performance benchmarks for critical pure functions
- [ ] Run test suite and ensure 100% coverage for pure functions

## Phase 3: Create Client API Process

### Task 3.1: Create client-api directory structure
**Goal:** Set up the new Client API process directory  
**Start:** Completed Phase 2 (including Task 2.6)  
**End:** Client API process has proper Node.js project structure  
**Test:** Verify directory structure exists and package.json is valid  

- [ ] Create `/client-api` directory in project root
- [ ] Create subdirectories: `/client-api/src`, `/client-api/src/routes`, `/client-api/src/controllers`, `/client-api/src/middleware`
- [ ] Add `package.json` with dependencies (express, cors, dotenv, etc.)
- [ ] Add basic `app.js` with Express setup
- [ ] Add `.env` file for environment variables (copy from `.env.example` if available)
- [ ] Create `.env.example` file with required environment variables
- [ ] Copy `.env.example` to `.env` and configure with actual values

### Task 3.2: Set up basic Express server
**Goal:** Create a minimal working Express server for the Client API  
**Start:** Completed Task 3.1  
**End:** Express server can start and respond to basic requests  
**Test:** Start server and verify it responds to a health check endpoint  

- [ ] Configure Express app in `/client-api/src/app.js`
- [ ] Add CORS middleware for Chrome plugin support
- [ ] Add JSON body parsing middleware
- [ ] Add basic error handling middleware
- [ ] Add a `/health` endpoint that returns 200 OK
- [ ] Add startup script to `package.json`
- [ ] Test: `npm start` runs server on specified port and `/health` returns 200

### Task 3.3: Set up database connection in client-api
**Goal:** Enable database access in the new Client API process  
**Start:** Completed Task 3.2  
**End:** Client API can connect to and query the database  
**Test:** Execute a simple database query from the Client API  

- [ ] Install shared module as dependency in `/client-api/package.json`
- [ ] Import database connection from `/shared/db` in Client API
- [ ] Add database connection initialization to app startup
- [ ] Add a test endpoint that queries the database (e.g., count users)
- [ ] Test: endpoint returns valid database data

### Task 3.4: Set up authentication middleware
**Goal:** Enable authentication checking in the Client API  
**Start:** Completed Task 3.3  
**End:** Client API can validate JWT tokens and authenticate requests  
**Test:** Protected endpoint rejects invalid tokens and accepts valid ones  

- [ ] Import auth utilities from `/shared/auth` in Client API
- [ ] Create authentication middleware in `/client-api/src/middleware/auth.js`
- [ ] Add JWT token validation logic to middleware
- [ ] Add user session/context handling to middleware
- [ ] Create a test protected endpoint that requires authentication
- [ ] Test: endpoint returns 401 for invalid tokens, 200 for valid tokens

## Phase 4: Implement Authentication Endpoints

### Task 4.1: Implement POST /api/auth/login
**Goal:** Create login endpoint in Client API  
**Start:** Completed Task 3.4  
**End:** Login endpoint accepts credentials and returns JWT token  
**Test:** POST valid credentials returns 200 with JWT, invalid returns 401  

- [ ] Create `/client-api/src/controllers/authController.js`
- [ ] Implement `login` function that validates user credentials
- [ ] Generate JWT token for successful login
- [ ] Create route handler in `/client-api/src/routes/auth.js`
- [ ] Add POST `/api/auth/login` route
- [ ] Test: Valid login returns JWT token, invalid login returns error

### Task 4.2: Implement POST /api/auth/logout
**Goal:** Create logout endpoint in Client API  
**Start:** Completed Task 4.1  
**End:** Logout endpoint invalidates user session  
**Test:** POST to logout endpoint successfully logs out user  

- [ ] Implement `logout` function in `authController.js`
- [ ] Add session/token invalidation logic
- [ ] Add POST `/api/auth/logout` route to auth routes
- [ ] Require authentication middleware for logout endpoint
- [ ] Test: Authenticated POST to logout invalidates session

### Task 4.3: Implement GET /api/auth/me
**Goal:** Create current user info endpoint in Client API  
**Start:** Completed Task 4.2  
**End:** Me endpoint returns current user information  
**Test:** GET with valid token returns user info, invalid token returns 401  

- [ ] Implement `getCurrentUser` function in `authController.js`
- [ ] Fetch and return current user information from database
- [ ] Add GET `/api/auth/me` route to auth routes
- [ ] Require authentication middleware for me endpoint
- [ ] Test: Valid token returns user data, invalid token returns 401

### Task 4.4: Implement token refresh endpoint
**Goal:** Create token refresh functionality in Client API  
**Start:** Completed Task 4.3  
**End:** Refresh endpoint generates new JWT tokens  
**Test:** POST with valid refresh token returns new JWT token  

- [ ] Implement `refreshToken` function in `authController.js`
- [ ] Add refresh token validation and new token generation
- [ ] Add POST `/api/auth/refresh` route to auth routes
- [ ] Add refresh token middleware if needed
- [ ] Test: Valid refresh token returns new JWT, invalid returns 401

## Phase 5: Implement Assessment Endpoints

### Task 5.1: Implement GET /api/assessment
**Goal:** Create assessment query endpoint in Client API  
**Start:** Completed Task 4.4  
**End:** Assessment endpoint returns privacy assessment for given URL  
**Test:** GET with valid URL parameter returns assessment data  

- [ ] Create `/client-api/src/controllers/assessmentController.js`
- [ ] Implement `getAssessment` function that queries database for existing assessments
- [ ] Add URL parameter validation and normalization
- [ ] Create route handler in `/client-api/src/routes/assessment.js`
- [ ] Add GET `/api/assessment` route with URL query parameter
- [ ] Test: Valid URL returns assessment, unknown URL returns appropriate response

### Task 5.2: Implement POST /api/trigger-assessment/:url
**Goal:** Create immediate assessment trigger endpoint in Client API  
**Start:** Completed Task 5.1  
**End:** Trigger endpoint initiates assessment for specified URL  
**Test:** POST triggers assessment process and returns appropriate response  

- [ ] Implement `triggerAssessment` function in `assessmentController.js`
- [ ] Import assessment processing logic from `/shared/assessment`
- [ ] Add URL parameter extraction and validation
- [ ] Add POST `/api/trigger-assessment/:url` route to assessment routes
- [ ] Require authentication middleware for trigger endpoint
- [ ] Test: Valid URL triggers assessment, returns success response

### Task 5.3: Implement POST /api/report-unassessed
**Goal:** Create unassessed URL reporting endpoint in Client API  
**Start:** Completed Task 5.2  
**End:** Report endpoint stores unassessed URLs for future processing  
**Test:** POST with URL data successfully stores unassessed URL  

- [ ] Implement `reportUnassessed` function in `assessmentController.js`
- [ ] Add URL validation and normalization
- [ ] Add database insertion logic for unassessed URLs
- [ ] Add POST `/api/report-unassessed` route to assessment routes
- [ ] Add request body validation middleware
- [ ] Test: Valid URL data is stored, invalid data returns validation errors

### Task 5.4: Add assessment endpoint integration
**Goal:** Connect assessment endpoints with shared assessment logic  
**Start:** Completed Task 5.3  
**End:** Assessment endpoints use shared logic for processing  
**Test:** Assessment endpoints correctly process URLs using shared code  

- [ ] Import assessment utilities from `/shared/assessment` in controller
- [ ] Update `getAssessment` to use shared URL normalization
- [ ] Update `triggerAssessment` to use shared processing logic
- [ ] Update `reportUnassessed` to use shared URL utilities
- [ ] Test: All assessment endpoints work with shared logic

## Phase 6: Set Up Routing and Deployment

### Task 6.1: Configure development routing
**Goal:** Set up local proxy to route requests to new Client API  
**Start:** Completed Phase 5  
**End:** Local development routes auth and assessment requests to Client API  
**Test:** Chrome plugin requests are correctly routed to new endpoints  

- [ ] Install `http-proxy-middleware` or similar for local development
- [ ] Create proxy configuration to route `/api/auth/*` and assessment endpoints
- [ ] Set up proxy in main development server or separate proxy script
- [ ] Configure Chrome plugin to use proxied endpoints in development
- [ ] Test: Plugin authentication and assessment requests work through proxy

### Task 6.2: Create NGINX configuration
**Goal:** Set up NGINX to route production traffic to Client API  
**Start:** Completed Task 6.1  
**End:** NGINX configuration routes specified endpoints to Client API  
**Test:** NGINX correctly routes requests to Client API process  

- [ ] Create NGINX configuration file for Client API routing
- [ ] Configure proxy_pass for `/api/auth/*` endpoints to Client API port
- [ ] Configure proxy_pass for assessment endpoints to Client API port
- [ ] Add proper headers for Chrome plugin CORS support
- [ ] Test NGINX configuration with Client API process running

### Task 6.3: Set up process management
**Goal:** Configure Client API process to run alongside monolith  
**Start:** Completed Task 6.2  
**End:** Client API process can be started/stopped independently  
**Test:** Both processes run simultaneously without conflicts  

- [ ] Add Client API startup script to main package.json
- [ ] Configure Client API to run on different port than monolith
- [ ] Add process monitoring/restart capability (PM2 or similar)
- [ ] Create docker configuration for Client API if using containers
- [ ] Test: Both processes start successfully and handle requests

### Task 6.4: Update Chrome plugin configuration
**Goal:** Configure Chrome plugin to use new Client API endpoints  
**Start:** Completed Task 6.3  
**End:** Chrome plugin successfully communicates with new Client API  
**Test:** Plugin authentication and assessment features work with new API  

- [ ] Update plugin API_BASE_URL to point to NGINX or Client API directly
- [ ] Test plugin login/logout functionality with new auth endpoints
- [ ] Test plugin assessment requests with new assessment endpoints
- [ ] Update plugin error handling for new endpoint responses
- [ ] Verify all plugin features work with separated endpoints

## Phase 7: Testing and Cleanup

### Task 7.1: Create integration tests for Client API
**Goal:** Ensure Client API endpoints work correctly in isolation  
**Start:** Completed Task 6.4  
**End:** Comprehensive test suite validates all Client API functionality  
**Test:** All tests pass and cover major use cases  

- [ ] Create test setup for Client API with test database
- [ ] Write tests for all authentication endpoints
- [ ] Write tests for all assessment endpoints
- [ ] Write tests for authentication middleware
- [ ] Write tests for error handling and edge cases
- [ ] Run test suite and ensure all tests pass

### Task 7.2: Performance and load testing
**Goal:** Verify Client API performs adequately under load  
**Start:** Completed Task 7.1  
**End:** Client API meets performance requirements  
**Test:** Load tests show acceptable response times and throughput  

- [ ] Set up load testing tools (k6, Artillery, or similar)
- [ ] Create load test scenarios for authentication endpoints
- [ ] Create load test scenarios for assessment endpoints
- [ ] Run load tests and measure response times
- [ ] Verify performance meets or exceeds monolith performance

### Task 7.3: Update monitoring and logging
**Goal:** Ensure Client API has proper observability  
**Start:** Completed Task 7.2  
**End:** Client API logs and metrics are properly collected  
**Test:** Logs and metrics are generated and accessible  

- [ ] Add structured logging to Client API using same format as monolith
- [ ] Add request/response logging middleware
- [ ] Add error logging and alerting
- [ ] Add health check endpoint with detailed status
- [ ] Test: Logs are generated and metrics are collectible

### Task 7.4: Remove migrated code from monolith
**Goal:** Clean up monolith by removing migrated endpoint logic  
**Start:** Completed Task 7.3  
**End:** Monolith no longer contains auth or assessment endpoint code  
**Test:** Monolith starts successfully without migrated code  

- [ ] Remove authentication route handlers from monolith
- [ ] Remove assessment route handlers from monolith  
- [ ] Remove related controller code that's been migrated
- [ ] Update monolith imports to use shared modules where applicable
- [ ] Test: Monolith starts and serves remaining endpoints correctly

### Task 7.5: Update documentation
**Goal:** Document the new Client API process and architecture  
**Start:** Completed Task 7.4  
**End:** Complete documentation for separated endpoints  
**Test:** Documentation is accurate and helpful for developers  

- [ ] Update API documentation to reflect new endpoint locations
- [ ] Document Client API process setup and deployment
- [ ] Update development setup instructions
- [ ] Document debugging and troubleshooting for Client API
- [ ] Update architecture diagrams to show process separation

## Success Criteria

- [ ] All authentication endpoints (`/api/auth/*`) work in Client API process
- [ ] All assessment endpoints work in Client API process  
- [ ] Chrome plugin successfully authenticates and requests assessments
- [ ] Client API process runs independently of monolith
- [ ] NGINX correctly routes requests to Client API
- [ ] Performance is equal to or better than monolith
- [ ] All tests pass for both Client API and remaining monolith
- [ ] Documentation is updated and accurate

## Notes

- Each task should be completed and tested before moving to the next
- If a task reveals additional complexity, break it down into smaller sub-tasks
- Test thoroughly at each step to avoid compound issues
- Keep the monolith functional throughout the process
- Maintain backward compatibility until full migration is complete
- **Pure Function Priority:** When refactoring, always prioritize extracting pure functions first, then wrap them with impure functions that handle side effects
- **Testing Strategy:** Pure functions should have extensive test coverage since they're easier to test and more critical to system reliability