# Archiver Job Improvements

This document outlines the improvements made to the archiver job to enhance error handling, resilience, and logging.

## Changes Made

### 1. Enhanced Asset Fetcher (`assetFetcher.js`)
- Improved retry logic with exponential backoff and jitter
- Added alternative user agents to bypass potential blocks
- Enhanced error diagnostics with detailed error information
- Added URL accessibility check function to pre-check URLs
- Increased maximum retries from 3 to 5

### 2. Improved Deep Crawler (`deepCrawler.js`)
- Added URL pre-check before attempting full fetch
- Implemented last-resort fetch with alternative user agent
- Enhanced error logging with detailed error information
- Better handling of non-HTML root assets

### 3. Enhanced Archiver Job (`archiverJob.js`)
- Added failure tracking to skip problematic URLs after multiple failures
- Implemented URL pre-check before crawling
- Added policy prioritization based on failure history
- Enhanced error logging and scan failure tracking

### 4. Fixed Versioner (`versioner.js`)
- Fixed issue with missing 'notes' column in scan_events table
- Added schema detection to handle missing columns gracefully
- Improved error handling and retry logic for scan event logging

### 5. Added Database Migration Scripts
- Created SQL script to add 'notes' column to scan_events table
- Added JavaScript utility to execute the SQL script

## Configuration Options

The following environment variables can be set to configure the archiver job:

```
# Crawler options
CRAWL_MAX_DEPTH=2
CRAWL_MAX_LINKS=20
CRAWL_INCLUDE_PDFS=false
CRAWL_DELAY_MS=500
CRAWL_FILTER_DELAY_MS=200
CRAWL_REQUEST_TIMEOUT=15000
CRAWL_MAX_ASSET_SIZE_BYTES=5242880
CRAWL_MAX_FILTER_SIZE_BYTES=2097152

# Error handling and retry configuration
ASSET_FETCHER_MAX_RETRIES=5
ASSET_FETCHER_RETRY_DELAY_BASE=1000
MAX_CONSECUTIVE_FAILURES=3
MAX_FAILURES_BEFORE_SKIP=5
FAILURE_TRACKING_WINDOW_DAYS=7
```

## Adding the 'notes' Column to scan_events Table

To add the missing 'notes' column to the scan_events table, run the following command:

```bash
node backend/scripts/add-notes-column-to-scan-events.js
```

This script will:
1. Check if the 'notes' column already exists
2. Add the column if it doesn't exist
3. Log the result of the operation

## Troubleshooting

If you encounter issues with the archiver job:

1. Check the logs for detailed error information
2. Verify that the database has the required schema (run the migration script if needed)
3. Check if the problematic URLs are accessible from your server
4. Consider adjusting the retry and timeout settings for problematic domains
5. For domains that consistently fail, you may need to implement custom handling or manually exclude them

## Future Improvements

Potential future improvements to consider:

1. Implement proxy rotation for sites that block crawlers
2. Add support for JavaScript-rendered content using headless browsers
3. Implement more sophisticated rate limiting per domain
4. Add support for authentication for sites that require login
5. Implement a mechanism to automatically recover from partial failures
