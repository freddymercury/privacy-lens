# Assessment Dependencies Map

## Overview
This document maps all code modules, database tables, external services, and middleware used by assessment endpoints in the PrivacyLens monolithic backend, as required by Task 1.4 of the process separation plan.

## Import/Require Dependencies

### Assessment Controller (`assessmentController.js`)

**File:** `backend/src/controllers/assessmentController.js`

#### Direct Imports:
```javascript
import * as db from "../utils/db.cjs";
import llmService from "../services/llmService.js";
import * as assessmentTriggerService from "../services/assessmentTriggerService.js";
import { supabaseServiceRole } from "../utils/supabaseClient.js";
```

#### Transitive Dependencies:
- **Through `db` module:** Supabase clients, domain utilities, logger
- **Through `llmService` module:** OpenAI/LLM APIs, axios, crypto, HTML parsing
- **Through `assessmentTriggerService` module:** Policy finder service, URL normalization
- **Node.js Built-ins:** Environment variables (`process.env`)

### Unassessed Controller (`unassessedController.js`)

**File:** `backend/src/controllers/unassessedController.js`

#### Direct Imports:
```javascript
import * as db from "../utils/db.cjs";
```

#### Transitive Dependencies:
- **Through `db` module:** Supabase clients, domain utilities, logger
- **Node.js Built-ins:** Environment variables (`process.env`)

### LLM Service (`llmService.js`)

**File:** `backend/src/services/llmService.js`

#### Direct Imports:
```javascript
import * as db from '../utils/db.cjs';
import crypto from 'crypto';
import axios from 'axios';
```

#### Dynamic Imports:
```javascript
const llamaindex = await import("llamaindex");
OpenAI = llamaindex.OpenAI;
```

#### Environment Variables:
- `OPENAI_API_KEY` - OpenAI API authentication key
- `LLM_MODEL` - LLM model to use (default: "gpt-4")
- `NODE_ENV` - Environment detection for test mocking
- `JEST_WORKER_ID` - Jest test environment detection

### Assessment Trigger Service (`assessmentTriggerService.js`)

**File:** `backend/src/services/assessmentTriggerService.js`

#### Direct Imports:
```javascript
import * as db from "../utils/db.cjs";
import llmService from "./llmService.js";
import { normalizeUrl } from "../utils/domainUtils.js";
import { supabaseServiceRole } from "../utils/supabaseClient.js";
import policyFinderService from "./policyFinderService.js";
import { createLogger } from "../lib/logger-phase3.js";
```

#### Transitive Dependencies:
- **Through `policyFinderService` module:** SERP API, Google search integration
- **Through `llmService` module:** OpenAI APIs, web scraping
- **Through `normalizeUrl` module:** Domain parsing and normalization

## Database Tables Accessed

### Websites Table (`websites`)

**Accessed by:** `getAssessment()`, `upsertAssessment()`, `getAllAssessments()`

#### Columns Used:
- `id` - Primary key
- `url` - Normalized domain URL (unique)
- `user_agreement_url` - Privacy policy URL
- `user_agreement_hash` - SHA-256 hash of policy content
- `privacy_assessment` - JSON object with assessment results
- `last_updated` - Timestamp of last assessment
- `manual_entry` - Boolean indicating manual vs automated assessment

#### Assessment JSON Structure:
```javascript
{
  "riskLevel": "High|Medium|Low|Unknown",
  "categories": {
    "Data Collection & Use": "High|Medium|Low",
    "Third-Party Sharing & Selling": "High|Medium|Low",
    "Data Storage & Security": "High|Medium|Low",
    "User Rights & Control": "High|Medium|Low",
    "AI & Automated Decision-Making": "High|Medium|Low",
    "Policy Changes & Updates": "High|Medium|Low"
  },
  "summary": "Brief assessment summary"
}
```

#### Operations:
- **SELECT:** Assessment retrieval by URL
- **INSERT/UPDATE:** Assessment creation and updates via upsert
- **SELECT ALL:** Bulk retrieval for pre-packaged database

### Unassessed URLs Table (`unassessed_urls`)

**Accessed by:** `addToUnassessedQueue()`, `getUnassessedUrls()`, `updateUnassessedStatus()`, `removeFromUnassessedQueue()`

#### Columns Used:
- `id` - Primary key
- `url` - Normalized domain URL (unique)
- `first_recorded` - Timestamp when URL was first queued
- `status` - Current processing status
- `suggested_policy_urls` - JSON array of suggested policy URLs

#### Status Values:
- `"Pending"` - Waiting for processing
- `"Processing"` - Currently being assessed
- `"Completed"` - Assessment finished
- `"Failed"` - Assessment failed
- `"Not Found"` - No privacy policy found

#### Operations:
- **SELECT:** Queue retrieval with filtering and limits
- **INSERT:** Adding new URLs to queue
- **UPDATE:** Status and suggested URL updates
- **DELETE:** Removing processed URLs from queue

### Audit Logs Table (`audit_logs`)

**Accessed by:** `createAuditLog()`

#### Assessment-Related Actions:
- `"assessment_triggered"` - Assessment initiated
- `"assessment_completed"` - Assessment finished successfully
- `"assessment_failed"` - Assessment failed
- `"unassessed_url_processing"` - URL processing started
- `"assessment_trigger_started"` - Batch processing started
- `"assessment_trigger_completed"` - Batch processing finished

#### Operations:
- **INSERT:** Log assessment events and status changes

## External Services and Libraries

### LLM/AI Services

**Primary Service:** OpenAI API
**Library:** `llamaindex` (v0.1.3) with OpenAI integration
**Environment Variables:**
- `OPENAI_API_KEY` - API authentication key
- `LLM_MODEL` - Model selection (default: "gpt-4")

**Usage:**
- Privacy policy analysis and assessment
- Text chunking for large documents
- Risk categorization and scoring
- Automated summary generation

**API Configuration:**
```javascript
llm = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.LLM_MODEL || "gpt-4",
  temperature: 0.2,
  maxTokens: 1500
});
```

### Web Scraping

**Library:** `axios` (v1.9.0) with `axios-retry` (v4.0.0)
**Usage:**
- Privacy policy URL discovery
- Privacy policy content extraction
- HTML content retrieval and parsing

**Configuration:**
```javascript
axios.get(url, {
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
  },
  maxRedirects: 5
});
```

**Common Privacy Policy Paths:**
```javascript
[
  "/privacy-policy", "/privacy_policy", "/privacypolicy", "/privacy",
  "/terms-of-service", "/terms_of_service", "/termsofservice", "/terms",
  "/legal/privacy", "/legal/terms"
]
```

### HTML Parsing

**Library:** `jsdom` (v26.1.0)
**Usage:**
- Extract text content from HTML pages
- Clean HTML markup for LLM processing
- Parse privacy policy documents

### Search API (Optional)

**Service:** SERP API
**Library:** `serpapi` (v2.1.0)
**Environment Variable:** `SERPAPI_API_KEY`
**Usage:** Enhanced privacy policy discovery through Google search

### Cryptographic Hashing

**Library:** Node.js `crypto` (built-in)
**Usage:**
- `crypto.createHash('sha256').update(text).digest('hex')` - Generate content hashes for change detection

### Database Access

**Library:** `@supabase/supabase-js` (v2.38.0)
**Clients Used:**
- **Service Role Client:** System operations bypassing RLS
- **Authenticated Client:** User-scoped operations (not used in current assessment endpoints)

## Middleware Dependencies

### URL Normalization

**Module:** `backend/src/utils/domainUtils.js`
**Function:** `normalizeUrl()`
**Usage:**
- Standardize domain names for consistent storage
- Remove protocols, subdomains, and trailing paths
- Handle special cases (www removal, etc.)

### Logging

**Module:** `backend/src/lib/logger-phase3.js`
**Usage:**
- Structured logging for assessment processes
- Error tracking and debugging
- Performance monitoring

### Error Handling

**Custom error handling** for assessment operations:
- 400 Bad Request - Missing or invalid URL parameters
- 404 Not Found - Assessment not found after processing
- 500 Internal Server Error - LLM API failures, web scraping errors

## Processing Configuration

### Environment Variables

```bash
# LLM Configuration
OPENAI_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4

# Assessment Processing
MAX_CONCURRENT_ASSESSMENTS=2
ASSESSMENT_TRIGGER_INTERVAL_MINUTES=600

# Search API (Optional)
SERPAPI_API_KEY=your-serpapi-key

# Database Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Environment
NODE_ENV=development|production|test
```

### Assessment Processing Constants

```javascript
// Risk categories
PRIVACY_CATEGORIES = [
  "Data Collection & Use",
  "Third-Party Sharing & Selling", 
  "Data Storage & Security",
  "User Rights & Control",
  "AI & Automated Decision-Making",
  "Policy Changes & Updates"
];

// Risk levels
RISK_LEVELS = {
  HIGH: "High",
  MEDIUM: "Medium", 
  LOW: "Low",
  UNKNOWN: "Unknown"
};

// Processing limits
FREE_TOKEN_VALIDITY_DAYS = 30;
MAX_CHUNK_SIZE = 3000; // characters
LLM_MAX_TOKENS = 1500;
HTTP_TIMEOUT = 15000; // milliseconds
MAX_RETRIES = 5;
```

## File Dependencies for Extraction

### Core Files to Extract:
1. `backend/src/controllers/assessmentController.js` - Assessment endpoint handlers
2. `backend/src/controllers/unassessedController.js` - Unassessed URL management
3. `backend/src/services/llmService.js` - LLM integration and policy analysis
4. `backend/src/services/assessmentTriggerService.js` - Assessment processing logic

### Shared Utilities to Extract:
1. `backend/src/utils/db.cjs` - Database access functions (assessment-related subset)
2. `backend/src/utils/domainUtils.js` - URL normalization utilities
3. `backend/src/utils/supabaseClient.js` - Database client configuration
4. `backend/src/lib/logger-phase3.js` - Logging utilities

### Supporting Services:
1. `backend/src/services/policyFinderService.js` - Policy URL discovery
2. Policy path constants and configuration

### Admin Files (Staying in Admin Dashboard):
- Assessment management routes in `adminController.js`
- Assessment-related admin views and templates

## Summary

**Total Dependencies:**
- **External APIs:** 2 (OpenAI/LLM, optional SERP API)
- **External Libraries:** 5 (llamaindex, axios, jsdom, crypto, @supabase/supabase-js)
- **Database Tables:** 3 (websites, unassessed_urls, audit_logs)
- **Environment Variables:** 7 required, 3 optional
- **Core Files:** 4 controllers/services + 4 shared utilities
- **Database Functions:** 8 assessment-related functions in db.cjs

**Key Assessment Flow:**
1. **URL Reporting** → `unassessedController.reportUnassessed()` → Queue in `unassessed_urls`
2. **Assessment Trigger** → `assessmentController.triggerAssessment()` → Process via `assessmentTriggerService`
3. **Policy Discovery** → Web scraping + policy finder service → Extract policy text
4. **LLM Analysis** → `llmService.assessPrivacyPolicy()` → Generate risk assessment
5. **Storage** → `db.upsertAssessment()` → Store in `websites` table
6. **Retrieval** → `assessmentController.getAssessment()` → Return to Chrome plugin

All dependencies are mapped and ready for extraction to the `/shared` directory structure. 