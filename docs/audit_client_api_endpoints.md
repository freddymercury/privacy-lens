# Client API Endpoints Audit

## Overview
This document contains a complete audit of all authentication and assessment-related routes in the current PrivacyLens monolithic backend that will be moved to the new Client API process, as required by Tasks 1.1 and 1.2 of the process separation plan.

## Client API Authentication Endpoints (`/api/auth/*`)

These endpoints are used by the Chrome plugin for user authentication:

### 1. POST `/api/auth/register`
- **Handler Function:** `apiAuthController.register`
- **File:** `backend/src/controllers/apiAuthController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Register a new user account
- **Request Body:** `{ email, password, name, deviceId }`
- **Response:** Returns user object and JWT token

### 2. POST `/api/auth/login`
- **Handler Function:** `apiAuthController.login`
- **File:** `backend/src/controllers/apiAuthController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Authenticate user and return JWT token
- **Request Body:** `{ email, password, deviceId }`
- **Response:** Returns user object and JWT token

### 3. POST `/api/auth/refresh`
- **Handler Function:** `apiAuthController.refresh`
- **File:** `backend/src/controllers/apiAuthController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Refresh expired JWT token
- **Request Body:** `{ token }`
- **Response:** Returns new JWT token

### 4. POST `/api/auth/validate`
- **Handler Function:** `apiAuthController.validate`
- **File:** `backend/src/controllers/apiAuthController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Validate if JWT token is still valid
- **Request Body:** `{ token }`
- **Response:** Returns validation status and token payload

### 5. POST `/api/auth/revoke`
- **Handler Function:** `apiAuthController.revoke`
- **File:** `backend/src/controllers/apiAuthController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Revoke/invalidate JWT token (logout)
- **Request Body:** `{ token }`
- **Response:** Returns success/failure status

## Admin Authentication Endpoints (`/admin/*`)

These endpoints are used by the admin dashboard for session-based authentication:

### 6. GET `/admin/login`
- **Handler Function:** `authController.loginPage`
- **File:** `backend/src/controllers/authController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Display admin login page
- **Response:** Renders login HTML page

### 7. POST `/admin/login`
- **Handler Function:** `authController.login`
- **File:** `backend/src/controllers/authController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Process admin login credentials
- **Request Body:** `{ email, password }`
- **Response:** Sets session cookie and redirects

### 8. GET `/admin/logout`
- **Handler Function:** `authController.logout`
- **File:** `backend/src/controllers/authController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Clear admin session and logout
- **Response:** Clears session and redirects to login

## Authentication Middleware

### Client API Middleware

#### `validateToken` (from `apiAuth.js`)
- **File:** `backend/src/middleware/apiAuth.js`
- **Purpose:** Validates JWT tokens for API endpoints
- **Usage:** Applied to protected API endpoints (subscription, updates, etc.)
- **Functionality:**
  - Extracts JWT token from Authorization header
  - Validates token using `authService.validateToken()`
  - Attaches user info to `req.user`
  - Returns 401 for invalid tokens

#### `hasFeature(feature)` (from `apiAuth.js`)
- **File:** `backend/src/middleware/apiAuth.js`
- **Purpose:** Checks if user has specific feature access
- **Usage:** Can be applied to feature-specific endpoints
- **Functionality:**
  - Checks if user has required feature in token
  - Returns 403 if feature not available

### Admin Dashboard Middleware

#### `isAuthenticated` (from `auth.js`)
- **File:** `backend/src/middleware/auth.js`
- **Purpose:** Checks session-based authentication for admin routes
- **Usage:** Applied to all protected admin routes
- **Functionality:**
  - Checks for valid session with user object
  - Redirects to `/admin/login` if not authenticated
  - Stores original URL for post-login redirect

#### `isAdmin` (from `auth.js`)
- **File:** `backend/src/middleware/auth.js`
- **Purpose:** Checks if user has admin role
- **Usage:** Can be applied to admin-only routes
- **Functionality:**
  - Requires authenticated session with admin role
  - Returns 403 for non-admin users

## Route Definitions

### Client API Routes
Defined in: `backend/src/api/index.js`
- All `/api/auth/*` routes are public (no middleware)
- Routes are registered with Express router
- Used by Chrome plugin for authentication

### Admin Routes
Defined in: `backend/src/api/admin.js`
- Admin auth routes (`/admin/login`, `/admin/logout`) are public
- All other admin routes use `isAuthenticated` middleware
- Uses session-based authentication

## Dependencies

### Authentication Services
- **File:** `backend/src/services/authService.js`
- **Purpose:** Core JWT token generation and validation logic
- **Used by:** `apiAuthController` functions

### Database Utilities
- **File:** `backend/src/utils/db.cjs`
- **Purpose:** Database queries for user management
- **Used by:** Both auth controllers for user lookup/creation

### External Libraries
- **bcrypt:** Password hashing for user registration/login
- **JWT libraries:** Token generation and validation (via authService)

## Summary

**Total Authentication Endpoints:** 8
- **Client API (`/api/auth/*`):** 5 endpoints
- **Admin Dashboard (`/admin/*`):** 3 endpoints

**Middleware Files:** 2
- **API Auth Middleware:** `apiAuth.js` (JWT-based)
- **Admin Auth Middleware:** `auth.js` (session-based)

**Controllers:** 2
- **API Auth Controller:** `apiAuthController.js` (JWT-based auth)
- **Admin Auth Controller:** `authController.js` (session-based auth)

All identified endpoints and their dependencies are documented above and ready for extraction to the new Client API process.

## Assessment Endpoints Audit

### Client API Assessment Endpoints (`/api/*`)

These endpoints are used by the Chrome plugin for privacy assessments:

#### 9. GET `/api/assessment`
- **Handler Function:** `assessmentController.getAssessment`
- **File:** `backend/src/controllers/assessmentController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Get privacy assessment for a URL
- **Query Parameters:** `url` (required)
- **Response:** Returns assessment object or null if no assessment exists
- **Used by:** Chrome plugin to check if assessment exists for a URL

#### 10. GET `/api/all-assessments`
- **Handler Function:** `assessmentController.getAllAssessments`
- **File:** `backend/src/controllers/assessmentController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Get all assessments (used for pre-packaged database)
- **Response:** Returns object with all assessments keyed by domain
- **Used by:** Build process for Chrome plugin pre-packaged database

#### 11. POST `/api/trigger-assessment/:url`
- **Handler Function:** `assessmentController.triggerAssessment`
- **File:** `backend/src/controllers/assessmentController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Trigger immediate assessment for specified URL
- **URL Parameter:** `url` (required)
- **Request Body:** `{ manualText }` (optional)
- **Response:** Returns assessment object or error
- **Used by:** Chrome plugin for immediate assessment requests

#### 12. POST `/api/report-unassessed`
- **Handler Function:** `unassessedController.reportUnassessed`
- **File:** `backend/src/controllers/unassessedController.js`
- **Middleware:** None (public endpoint)
- **Purpose:** Report unassessed URL for future batch processing
- **Request Body:** `{ url }` (required)
- **Response:** Returns success/error status
- **Used by:** Chrome plugin to queue URLs for future assessment

### Admin Assessment Endpoints (`/admin/*`)

These endpoints are used by the admin dashboard (NOT part of Client API migration):

#### Admin Assessment Management (staying in Admin Dashboard process):
- `GET /admin/assessments` - List all assessments
- `GET /admin/assessments/:url` - View single assessment
- `POST /admin/assessments/:url` - Update assessment
- `POST /admin/assessments/:url/trigger` - Trigger assessment (admin)
- `DELETE /admin/assessments/:url` - Delete assessment
- `GET /admin/unassessed` - List unassessed URLs
- `POST /admin/unassessed/:url/process` - Process unassessed URL
- `DELETE /admin/unassessed/:url` - Delete unassessed URL
- `POST /admin/trigger-assessments` - Trigger all assessments

## Assessment Dependencies

### Core Assessment Services
- **File:** `backend/src/services/assessmentTriggerService.js`
- **Purpose:** Core assessment processing logic
- **Key Functions:**
  - `processSingleUrl()` - Process individual URL
  - `processUnassessedUrls()` - Batch processing
  - `locateUserAgreement()` - Find privacy policy URLs
- **Used by:** `triggerAssessment` endpoint

### LLM Service
- **File:** `backend/src/services/llmService.js`
- **Purpose:** AI-powered privacy policy assessment
- **Key Functions:**
  - `assessPrivacyPolicy()` - Analyze policy text
  - `extractUserAgreement()` - Extract policy from URL
  - `computeTextHash()` - Generate content hash
- **Used by:** Assessment processing workflow

### Database Utilities
- **File:** `backend/src/utils/db.cjs`
- **Purpose:** Database operations for assessments
- **Key Functions:**
  - `getAssessment()` - Retrieve assessment by URL
  - `getAllAssessments()` - Get all assessments
  - `upsertAssessment()` - Create/update assessment
  - `addToUnassessedQueue()` - Add URL to queue
  - `updateUnassessedStatus()` - Update processing status
- **Used by:** All assessment controllers

### External Dependencies
- **Supabase Client:** Database access and RLS
- **Web Scraping Libraries:** For policy text extraction
- **LLM APIs:** For policy analysis (OpenAI, etc.)

## Route Definitions

### Client API Assessment Routes
Defined in: `backend/src/api/index.js`
- `/api/assessment` - No middleware (public)
- `/api/all-assessments` - No middleware (public) 
- `/api/trigger-assessment/:url` - No middleware (public)
- `/api/report-unassessed` - No middleware (public)

### Unassessed Controller Routes
Defined in: `backend/src/api/index.js`
- Handle unassessed URL reporting and management
- Used by Chrome plugin for queueing URLs

## Updated Summary

**Total Client API Endpoints:** 12
- **Authentication (`/api/auth/*`):** 5 endpoints
- **Assessment (`/api/*`):** 4 endpoints  
- **Unassessed (`/api/*`):** 1 endpoint
- **Health/Utility:** 2 endpoints (health, all-assessments)

**Controllers for Client API:** 3
- **API Auth Controller:** `apiAuthController.js` (JWT-based auth)
- **Assessment Controller:** `assessmentController.js` (privacy assessments)
- **Unassessed Controller:** `unassessedController.js` (URL queue management)

**Key Services to Extract:** 3
- **Auth Service:** `authService.js` (JWT token management)
- **Assessment Trigger Service:** `assessmentTriggerService.js` (core assessment logic)
- **LLM Service:** `llmService.js` (AI policy analysis)

All identified endpoints and their dependencies are documented above and ready for extraction to the new Client API process. 