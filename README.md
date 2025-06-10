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

[Detailed Chrome Plugin Documentation](./chrome-plugin/README.md)

### 2. Backend Service + Admin Dashboard

- Provides API endpoints for the Chrome plugin
- Stores and manages privacy assessments in a Supabase database
- Integrates with LLM (via llamaindex) for automated privacy policy assessment
- Includes an admin dashboard for managing assessments, viewing analytics, and handling unassessed URLs
- **Policy Archiver Service**: Periodically fetches tracked privacy policies, stores historical versions, calculates differences, and provides an API to access version history.

[Detailed Backend Documentation](./backend/README.md)

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

## Development

See the individual README files in each component directory for detailed development instructions:

- [Chrome Plugin Development](./chrome-plugin/README.md)
- [Backend Development](./backend/README.md)

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

## Running NGINX with the Dev Config on macOS

These steps will set up and run NGINX using the provided `nginx/privacy-lens.dev.conf` for local development:

1. **Install NGINX (if not already installed):**
   ```sh
   brew install nginx
   ```

2. **Find your NGINX config directory:**
   - Homebrew usually installs NGINX config at `/usr/local/etc/nginx/` (Intel) or `/opt/homebrew/etc/nginx/` (Apple Silicon).
   - Check with:
     ```sh
     nginx -t
     ```
     The output will show the config path (look for `nginx.conf`).

3. **Copy the dev config to the NGINX config directory:**
   ```sh
   cp nginx/privacy-lens.dev.conf /usr/local/etc/nginx/servers/
   ```
   - If the `servers` directory does not exist, create it or use `conf.d` or include directly in `nginx.conf`.
   - You can also symlink instead of copying.
   - **Important:** Make sure you do not have duplicate `server_name` entries for `privacy-lens.dev` or `localhost` in any other config files in `/usr/local/etc/nginx/servers/`, `/conf.d/`, or your main `nginx.conf`.

4. **Include the config in your main `nginx.conf`:**
   - Open `/usr/local/etc/nginx/nginx.conf` in a text editor.
   - Add this line inside the `http { ... }` block (if not already present):
     ```
     include servers/*;
     ```
     or, if using `conf.d`:
     ```
     include conf.d/*;
     ```

5. **Test the NGINX config:**
   ```sh
   sudo nginx -t
   ```
   - Fix any errors if reported.

6. **Start or reload NGINX:**
   ```sh
   sudo nginx
   # or, if already running:
   sudo nginx -s reload
   ```

7. **Access your API via NGINX:**
   - Open `http://privacy-lens.dev` or `http://localhost` in your browser or plugin config.
   - NGINX will proxy requests to your backend on port 3000.

8. **Stop NGINX (when done):**
   ```sh
   sudo nginx -s stop
   ```

**Note:**
- You may need to add `127.0.0.1 privacy-lens.dev` to your `/etc/hosts` file for the custom domain to work locally.
- If you change the config, always reload NGINX with `sudo nginx -s reload`.
- If you see warnings about conflicting `server_name`, check for and remove duplicate server blocks as described above.

## Chrome Plugin API Base URL: Development vs. Production

The Chrome plugin and its build scripts automatically select the correct API base URL for development or production:

- **Production:**
  - The plugin uses `https://api.privacy-lens.example.com/api` for all API calls when running as a published extension or in production environments.

- **Development (local):**
  - The plugin uses `http://localhost:3000/api` when running locally (e.g., loaded as an unpacked extension from your dev machine).
  - Node.js scripts (such as the build script for prepackaged data) will use the local API endpoint if you set the environment variable `PRIVACY_LENS_DEV=1`.

### Example: Running the Build Script for Local Development

To generate the prepackaged database using your local backend API, run:

```sh
PRIVACY_LENS_DEV=1 npm run build
```

This ensures the build script fetches data from your local backend instead of the production API.

**Note:**
- You do not need to change any code or config to switch between dev and prod. The correct API base URL is selected automatically based on environment.
- For browser code, the plugin will use the correct URL based on where it is loaded (localhost or production domain).
- For Node.js scripts, use the `PRIVACY_LENS_DEV=1` environment variable for local development.

## Chrome Plugin: Forcing Use of the Local Dev API

When developing the Chrome plugin, you may want to force it to use your local backend (http://localhost:3000/api) even when browsing non-localhost sites. You can do this without changing any code by setting a flag in the plugin popup's DevTools console:

**How to force the plugin to use the dev API:**

1. Load the plugin as an unpacked extension in Chrome (`chrome://extensions/` > "Load unpacked").
2. Open the plugin popup.
3. Right-click inside the popup and choose "Inspect" to open the DevTools for the popup.
4. In the DevTools console, enter:
   ```js
   window.PRIVACY_LENS_DEV = true;
   ```
5. Reload the popup. The plugin will now use `http://localhost:3000/api` for all API calls.

**Note:**
- This does not persist between popup reloads. You may need to set it again if you close and reopen the popup.
- This is the recommended way to test the plugin with your local backend during development, without modifying source code or risking accidental production builds with the dev API.

## License

All Rights Reserved - Dennis Park dennis.park@gmail.com
