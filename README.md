# 🕵️ Privacy Lens

A comprehensive privacy assessment system for user agreements of popular websites, consisting of a Chrome plugin and a backend service with admin dashboard.

## Overview

PrivacyLens helps users understand the privacy implications of websites they visit by:

1. Automatically detecting when a user visits a website
2. Checking if a privacy assessment exists for that website
3. Displaying badge indicators ("H" for High, "M" for Medium, "L" for Low, "?" for Unknown) to show the privacy risk level
4. Providing detailed information about specific privacy concerns

The system uses LLM technology to analyze privacy policies and user agreements, evaluating them across multiple privacy risk categories.

## System Architecture

The PrivacyLens system consists of two main components:

### 1. Chrome Plugin

- Detects URLs as users browse the web
- Queries the backend service for privacy assessments
- Displays privacy risk indicators to users
- Reports unassessed URLs to the backend for future evaluation

- [Detailed Chrome Plugin Documentation](./chrome-plugin/README.md)
- [Chrome Plugin API Endpoints](./docs/chrome_plugin_endpoints.md)

### 2. Backend Service + Admin Dashboard

- Provides API endpoints for the Chrome plugin
- Stores and manages privacy assessments in a Supabase database
- Integrates with LLM (via llamaindex) for automated privacy policy assessment
- Includes an admin dashboard for managing assessments, viewing analytics, and handling unassessed URLs
- **Policy Archiver Service**: Periodically fetches tracked privacy policies, stores historical versions, calculates differences, and provides an API to access version history.

- [Detailed Backend Documentation](./backend/README.md)

## Privacy Risk Categories

PrivacyLens evaluates privacy policies across these key categories:

- **Data Collection & Use**: What personal data is collected and how it's used
- **Third-Party Sharing & Selling**: Whether and how data is shared with third parties
- **Data Storage & Security**: How data is stored, secured, and for how long
- **User Rights & Control**: What control users have over their data
- **AI & Automated Decision-Making**: How AI might be used with user data
- **Policy Changes & Updates**: How users are notified of privacy policy changes

## Risk Levels

- **High Risk (H)**: Severe privacy concerns (e.g., selling personal data, minimal user control)
- **Medium Risk (M)**: Moderate concerns with potential opt-outs
- **Low Risk (L)**: User-friendly and privacy-conscious policies
- **Unknown Risk (?)**: Not explicitly mentioned or uncertain

## Installation

### Prerequisites

- Node.js v20.x or newer
- npm
- Chrome browser
- Supabase account
- OpenAI API key (or other LLM provider supported by llamaindex)

### Setup Instructions

1. Clone this repository
2. Set up the backend service:
   ```bash
   cd privacy-guard/backend
   npm install # Installs dependencies including 'diff' for the archiver
   # Configure environment variables in .env (see backend README and .env.example)
   # Ensure SUPABASE_URL, SUPABASE_SERVICE_KEY, S3_BUCKET, and ARCHIVE_SCHEDULE are set.
   # Run database migrations:
   #   - Execute the SQL commands in 'scripts/create-auth-tables.sql' (if not already done)
   #   - Execute the SQL commands in 'scripts/create-archive-tables.sql' (for basic archiving)
   #   (You can run these manually via the Supabase SQL Editor or create a runner script)
   
   # Deep Crawler Setup (extends Policy Archiver):
   #   - Ensure new dependencies are installed (axios-retry, mime-types):
   #     (Already included if you ran `npm install` after recent updates to package.json)
   #   - Execute the SQL commands in 'scripts/create_deep_crawler_tables.sql' to create 
   #     the 'policy_assets' and 'backfill_tasks' tables.
   #   - Configure Deep Crawler Environment Variables (add to .env if customizing defaults):
   #     CRAWL_MAX_DEPTH (default: 2)
   #     CRAWL_MAX_LINKS (default: 20) - Max links to process per page
   #     CRAWL_INCLUDE_PDFS (default: false)
   #     CRAWL_DELAY_MS (default: 500) - Delay between GET requests
   #     (See backend/src/jobs/archiverJob.js and backend/src/jobs/run_backfill_batch.js for more env options)
   npm run dev
   ```
3. Set up the Chrome plugin:
   ```bash
   cd privacy-guard/chrome-plugin
   npm install
   # Load the extension in Chrome (see Chrome plugin README)
   ```

## Nginx Setup (Development)

### Install Nginx (macOS/Homebrew)
```sh
brew install nginx
```

### Use the Provided Nginx Config
- The config file is at `privacy-lens/nginx.dev.conf`.
- You can run Nginx with this config directly:
  ```sh
  sudo nginx -c $(pwd)/privacy-lens/nginx.dev.conf
  ```
- Or, copy/symlink it to your Nginx config directory (e.g., `/usr/local/etc/nginx/nginx.conf` for Homebrew installs).

### Start Nginx
```sh
sudo nginx -c $(pwd)/privacy-lens/nginx.dev.conf
```
Or, if you replaced the default config:
```sh
sudo nginx
```
Or, with Homebrew:
```sh
brew services start nginx
```

### Reload/Restart Nginx After Changes
```sh
sudo nginx -s reload
```
Or:
```sh
brew services restart nginx
```

### Stop Nginx
```sh
sudo nginx -s stop
```
Or:
```sh
brew services stop nginx
```

### Notes
- Nginx will listen on port 3000 and proxy requests to the correct backend service based on the route.
- If you see an error about `mime.types`, update the `include` line in `nginx.dev.conf` to use the full path (e.g., `/usr/local/etc/nginx/mime.types`).

---

## Redis Setup (Development)

### Install Redis (macOS/Homebrew)
```sh
brew install redis
```

### Start Redis
```sh
brew services start redis
```
Or, run manually:
```sh
redis-server
```

### Stop Redis
```sh
brew services stop redis
```
Or, if running manually, just Ctrl+C the terminal.

### Usage
- The backend services expect Redis to be running on `localhost:6379` by default.
- No extra configuration is needed for development unless you want to change the port or add a password.

---

## Development

See the individual README files in each component directory for detailed development instructions:

- [Chrome Plugin Development](./chrome-plugin/README.md)
- [Backend Development](./backend/README.md)
- [Process Separation Design](./docs/process_separation_design.md)
- [Process Separation Architecture Diagram](./docs/process_separation_diagram.md)

## Policy Archive & Deep Crawler API Endpoints (Version 1)

The backend exposes the following public endpoints for accessing historical policy data, including deep crawled assets:

- **`GET /api/v1/policies/:domain/latest`**: Retrieves the latest policy snapshot (concatenated text of root and all sub-documents) and a list of all its assets.
  - Example: `/api/v1/policies/example.com/latest`
- **`GET /api/v1/policies/:domain/versions`**: Lists paginated metadata (version ID, number, fetch time, concatenated text hash) for all historical versions of a specific policy.
  - Supports `?page=` and `?limit=` query parameters.
  - Example: `/api/v1/policies/example.com/versions?page=1&limit=10`
- **`GET /api/v1/policies/:domain/versions/:versionId`**: Retrieves full details for a specific policy version, including its list of assets (sub-documents).
  - Example: `/api/v1/policies/example.com/versions/123`
- **`GET /api/v1/policies/:domain/versions/:versionId/assets/:assetId`**: Streams the raw content of a specific asset (HTML, PDF, etc.) belonging to a policy version. Typically redirects to a pre-signed storage URL.
  - Example: `/api/v1/policies/example.com/versions/123/assets/456`
- **`GET /api/v1/policies/:domain/diff/:olderVersionId/:newerVersionId`**: Returns a unified diff of the concatenated texts between two specified versions and a list of asset IDs that changed in the newer version relative to its immediate predecessor.
  - Example: `/api/v1/policies/example.com/diff/120/123`

## License

MIT
