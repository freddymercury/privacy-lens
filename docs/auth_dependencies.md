# Authentication Dependencies Map

## Overview
This document maps all code modules, database tables, external services, and middleware used by authentication endpoints in the PrivacyLens monolithic backend, as required by Task 1.3 of the process separation plan.

## Import/Require Dependencies

### Client API Authentication Controller (`apiAuthController.js`)

**File:** `backend/src/controllers/apiAuthController.js`

#### Direct Imports:
```javascript
import bcrypt from 'bcrypt';
import * as db from '../utils/db.cjs';
import * as authService from '../services/authService.js';
```

#### Transitive Dependencies:
- **Through `db` module:** Supabase clients, domain utilities, logger
- **Through `authService` module:** JWT library, crypto module
- **Node.js Built-ins:** Environment variables (`process.env`)

### Admin Authentication Controller (`authController.js`)

**File:** `backend/src/controllers/authController.js`

#### Direct Imports:
```javascript
import bcrypt from "bcrypt";
import * as db from "../utils/db.cjs";
```

#### Additional Dependencies:
- **Express session:** `req.session` for session management
- **Express rendering:** `res.render()` for HTML pages
- **Express redirects:** `res.redirect()` for navigation

### Authentication Service (`authService.js`)

**File:** `backend/src/services/authService.js`

#### Direct Imports:
```javascript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as db from '../utils/db.cjs';
```

#### Environment Variables:
- `JWT_SECRET` - Secret key for JWT token signing
- `NODE_ENV` - Environment detection for development mode

#### Constants:
- `FREE_TOKEN_VALIDITY_DAYS = 30`
- `PREMIUM_TOKEN_VALIDITY_DAYS = 7`
- `MAX_ACTIVE_TOKENS = 5`

### API Authentication Middleware (`apiAuth.js`)

**File:** `backend/src/middleware/apiAuth.js`

#### Direct Imports:
```javascript
import * as authService from '../services/authService.js';
```

#### Dependencies:
- **Express request/response:** `req.headers.authorization`, `req.user`
- **HTTP status codes:** 401, 403, 500

### Admin Authentication Middleware (`auth.js`)

**File:** `backend/src/middleware/auth.js`

#### Dependencies:
- **Express session:** `req.session.user`, `req.session.returnTo`
- **Express redirects:** `res.redirect()`
- **No external imports** (pure Express middleware)

## Database Tables Accessed

### Users Table (`users`)

**Accessed by:** `getUserByEmail()`, `getUserByUsername()`, `createUser()`

#### Columns Used:
- `id` - Primary key
- `email` - User email (unique)
- `username` - User username (unique)
- `password_hash` - Bcrypt hashed password
- `name` - User display name
- `role` - User role (user, admin)
- `created_at` - Account creation timestamp

#### Operations:
- **SELECT:** Login validation, user lookup
- **INSERT:** User registration
- **UPDATE:** User profile updates (admin controller)

### User Tokens Table (`user_tokens`)

**Accessed by:** `storeToken()`, `getTokenByHash()`, `getUserActiveTokens()`, `updateTokenLastUsed()`, `revokeToken()`

#### Columns Used:
- `id` - Primary key
- `user_id` - Foreign key to users table
- `token_hash` - SHA-256 hash of JWT token
- `device_id` - Device identifier
- `expires_at` - Token expiration timestamp
- `created_at` - Token creation timestamp
- `last_used_at` - Last token usage timestamp
- `revoked` - Boolean revocation status

#### Operations:
- **SELECT:** Token validation, active token lookup
- **INSERT:** Token storage during login/refresh
- **UPDATE:** Last used timestamp, revocation status
- **DELETE:** Token cleanup (via revocation)

### Subscriptions Table (`subscriptions`)

**Accessed by:** `getUserSubscription()`, `createSubscription()`, `updateSubscription()`

#### Columns Used:
- `id` - Primary key
- `user_id` - Foreign key to users table
- `plan_type` - Subscription tier (free, monthly, annual)
- `status` - Subscription status (active, trialing, canceled)
- `stripe_subscription_id` - Stripe subscription ID
- `created_at` - Subscription creation timestamp
- `current_period_end` - Subscription period end

#### Operations:
- **SELECT:** Subscription status lookup during login
- **INSERT:** New subscription creation (webhooks)
- **UPDATE:** Subscription status changes (webhooks)

### Audit Logs Table (`audit_logs`)

**Accessed by:** `createAuditLog()`

#### Columns Used:
- `id` - Primary key
- `action` - Action type (login_success, login_failed, user_registered, etc.)
- `user_id` - User who performed action (nullable)
- `details` - JSON object with action details
- `timestamp` - Action timestamp

#### Operations:
- **INSERT:** Log authentication events

## External Services and Libraries

### Password Hashing

**Library:** `bcrypt` (v5.1.1)
**Usage:**
- `bcrypt.hash(password, saltRounds)` - Hash passwords during registration
- `bcrypt.compare(password, hash)` - Validate passwords during login
- **Salt Rounds:** 10 (consistent across both controllers)

### JWT Token Management

**Library:** `jsonwebtoken` (v9.0.2)
**Usage:**
- `jwt.sign(payload, secret)` - Generate JWT tokens
- `jwt.verify(token, secret)` - Validate JWT tokens
- `jwt.verify(token, secret, {ignoreExpiration: true})` - Refresh expired tokens

**JWT Payload Structure:**
```javascript
{
  iss: 'privacy-lens',
  sub: user.id,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + expiresIn,
  device_id: deviceId,
  tier: 'free|monthly|annual',
  features: ['basic', 'advanced', 'premium'],
  version: '1.0'
}
```

### Cryptographic Hashing

**Library:** Node.js `crypto` (built-in)
**Usage:**
- `crypto.createHash('sha256').update(token).digest('hex')` - Hash JWT tokens for database storage

### Database Access

**Library:** `@supabase/supabase-js` (v2.38.0)
**Clients Used:**
- **Service Role Client:** Bypasses RLS for system operations
- **Authenticated Client:** RLS-protected operations (user-specific data)

### Session Management (Admin Only)

**Library:** `express-session` (v1.17.3)
**Usage:**
- Session storage for admin dashboard authentication
- Session-based redirects and user context

## Middleware Dependencies

### CORS Support

**Library:** `cors` (v2.8.5)
**Usage:** Enable cross-origin requests from Chrome plugin

### Request Parsing

**Built-in Express Middleware:**
- `express.json()` - Parse JSON request bodies
- `express.urlencoded()` - Parse form data

### Error Handling

**Custom middleware** for authentication error responses:
- 401 Unauthorized - Invalid or missing tokens
- 403 Forbidden - Insufficient permissions/features
- 500 Internal Server Error - Authentication system errors

## Environment Configuration

### Required Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-secret-key-here

# Database Configuration (via Supabase)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Environment
NODE_ENV=development|production

# Session Configuration (Admin Dashboard)
SESSION_SECRET=your-session-secret

# Token Configuration (optional - uses defaults)
MAX_ACTIVE_TOKENS=5
```

### Authentication Flow Environment Dependencies

1. **Registration Flow:**
   - JWT_SECRET for token generation
   - Supabase connection for user creation
   - Bcrypt for password hashing

2. **Login Flow:**
   - Supabase for user lookup and subscription check
   - Bcrypt for password validation
   - JWT_SECRET for token generation
   - Crypto for token hashing

3. **Token Validation:**
   - JWT_SECRET for signature verification
   - Supabase for revocation checking
   - Crypto for token hash lookup

## File Dependencies for Extraction

### Core Files to Extract:
1. `backend/src/controllers/apiAuthController.js` - Client API auth handlers
2. `backend/src/services/authService.js` - JWT token management
3. `backend/src/middleware/apiAuth.js` - API authentication middleware

### Shared Utilities to Extract:
1. `backend/src/utils/db.cjs` - Database access functions (auth-related subset)
2. Database connection setup from Supabase wrapper

### Admin Files (Staying in Admin Dashboard):
1. `backend/src/controllers/authController.js` - Admin session auth
2. `backend/src/middleware/auth.js` - Admin session middleware

## Summary

**Total Dependencies:**
- **External Libraries:** 3 (bcrypt, jsonwebtoken, @supabase/supabase-js)
- **Database Tables:** 4 (users, user_tokens, subscriptions, audit_logs)
- **Middleware Dependencies:** 3 (CORS, JSON parsing, error handling)
- **Environment Variables:** 6 required, 1 optional
- **Core Files:** 3 controllers + 1 service + 2 middleware files
- **Database Functions:** 12 auth-related functions in db.cjs

All dependencies are mapped and ready for extraction to the `/shared` directory structure. 