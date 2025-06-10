# Background Jobs Overview - PrivacyLens

This document explains the background jobs that run in the PrivacyLens system to handle automated processing tasks without affecting the responsiveness of user-facing APIs.

## Overview

The PrivacyLens system uses background jobs to handle resource-intensive and time-consuming tasks that would otherwise slow down the user experience. These jobs run on scheduled intervals and process data asynchronously.

## Background Jobs Architecture

Background jobs in PrivacyLens are implemented as:
- **Scheduled Services**: Using `node-schedule` for cron-like scheduling
- **Standalone Processes**: Can run independently of the main API servers
- **Database-Driven**: Jobs read from database queues and update status accordingly
- **Fault-Tolerant**: Include retry mechanisms and error handling

## Main Background Jobs

### 1. Policy Archiver Job (`archiverJob.js`)

**Purpose**: Continuously monitors and archives privacy policies to track changes over time.

**Location**: `backend/src/jobs/archiverJob.js`

**Schedule**: Runs every hour (configurable via `ARCHIVE_SCHEDULE` environment variable)

**What it does**:
1. **Fetches Active Policies**: Queries the `policies` table for all policies that need archiving
2. **Deep Crawling**: For each policy URL, performs a comprehensive crawl to capture:
   - The main privacy policy page
   - Related pages (up to 2 levels deep)
   - PDF documents and other policy assets
   - Sub-pages containing privacy-related content
3. **Content Processing**: 
   - Normalizes and cleans the crawled content
   - Generates content hashes to detect changes
   - Stores raw HTML and cleaned text versions
4. **Version Management**: 
   - Compares new content with previous versions
   - Creates new version entries only when content actually changes
   - Generates diff summaries between versions
5. **Change Detection**: Tracks when policies are updated and what changed

**Key Features**:
- **Failure Tracking**: Skips policies that have failed multiple times recently
- **Concurrency Control**: Processes policies sequentially to avoid overwhelming target servers
- **Pre-flight Checks**: Validates URL accessibility before attempting full crawl
- **Comprehensive Logging**: Detailed logs for monitoring and debugging

**Database Tables Used**:
- `policies` - Queue of policies to archive
- `policy_versions` - Stores different versions of each policy
- `policy_assets` - Individual assets (pages, PDFs) from each crawl
- `scan_events` - Logs of archiving attempts and outcomes

**Configuration Options**:
```bash
ARCHIVE_SCHEDULE="0 * * * *"  # Hourly (cron format)
CRAWL_MAX_DEPTH=2             # How deep to crawl
CRAWL_MAX_LINKS=20            # Max links per page
CRAWL_INCLUDE_PDFS=true       # Include PDF documents
CRAWL_DELAY_MS=500            # Delay between requests
MAX_FAILURES_BEFORE_SKIP=5    # Skip after this many failures
```

### 2. Assessment Trigger Service (`assessmentTriggerService.js`)

**Purpose**: Processes unassessed URLs to find and analyze their privacy policies.

**Location**: `backend/src/services/assessmentTriggerService.js`

**Schedule**: Runs every 10 hours by default (configurable via `ASSESSMENT_TRIGGER_INTERVAL_MINUTES`)

**What it does**:
1. **Queue Processing**: Fetches URLs from the `unassessed_urls` table with "Pending" status
2. **Policy Discovery**: For each URL, attempts to locate the privacy policy using:
   - Suggested URLs (if provided)
   - Common privacy policy paths (`/privacy`, `/privacy-policy`, etc.)
   - Search engine fallback (SerpAPI)
3. **Content Analysis**: When a policy is found:
   - Extracts and cleans the policy text
   - Uses AI/LLM services to assess privacy risks
   - Categorizes risks across multiple dimensions
   - Generates privacy scores and summaries
4. **Result Storage**: Saves assessment results to the `websites` table
5. **Archive Queue**: Adds successfully assessed policies to the archiving queue
6. **Retry Logic**: Automatically retries failed assessments on subsequent runs

**Key Features**:
- **Concurrency Control**: Configurable concurrent processing limit
- **Retry Mechanism**: Failed URLs are automatically retried
- **Status Tracking**: Updates processing status throughout the workflow
- **Audit Logging**: Comprehensive logging of all processing events

**Database Tables Used**:
- `unassessed_urls` - Queue of URLs to assess
- `websites` - Stores assessment results
- `policies` - Adds successful assessments for archiving
- `audit_logs` - Records processing events

**Configuration Options**:
```bash
ASSESSMENT_TRIGGER_INTERVAL_MINUTES=600  # 10 hours
MAX_CONCURRENT_ASSESSMENTS=1             # Concurrent processing limit
OPENAI_API_KEY=your-key                  # For AI assessment
LLM_MODEL=gpt-4                          # AI model to use
```

## Background Jobs Workflow

### How URLs Enter the System
1. **Chrome Plugin Reports**: Users browsing websites trigger unassessed URL reports
2. **Admin Interface**: Administrators can manually add URLs for assessment
3. **Seed Scripts**: Bulk import of URLs from data sources

### Processing Pipeline
```
Unassessed URL → Assessment Trigger → Policy Discovery → AI Analysis → Archive Queue → Policy Archiver → Version Tracking
```

### Data Flow
1. **Unassessed URLs** are added to the `unassessed_urls` table
2. **Assessment Trigger Service** processes these URLs periodically
3. **Successful assessments** are stored in `websites` table
4. **Policies are queued** for archiving in `policies` table
5. **Archiver Job** crawls and versions the policies
6. **Historical data** is maintained for change tracking

## Monitoring and Observability

### Logging
Both background jobs use structured logging with:
- **Component identification**: Each log entry identifies the source job
- **Trace IDs**: For tracking related operations
- **Detailed context**: URLs, processing status, error details
- **Performance metrics**: Processing times and success rates

### Status Tracking
- **Processing Status**: URLs move through defined status states
- **Failure Tracking**: Failed attempts are logged and retried
- **Success Metrics**: Completion rates and processing statistics

### Health Monitoring
- **Scheduled Execution**: Jobs log start and completion times
- **Error Handling**: Comprehensive error catching and logging
- **Resource Usage**: Configurable limits to prevent resource exhaustion

## Configuration and Deployment

### Environment Variables
```bash
# Assessment Trigger Service
ASSESSMENT_TRIGGER_INTERVAL_MINUTES=600
MAX_CONCURRENT_ASSESSMENTS=1
OPENAI_API_KEY=your-openai-key
LLM_MODEL=gpt-4

# Archiver Job
ARCHIVE_SCHEDULE="0 * * * *"
CRAWL_MAX_DEPTH=2
CRAWL_MAX_LINKS=20
CRAWL_INCLUDE_PDFS=true
CRAWL_DELAY_MS=500
MAX_FAILURES_BEFORE_SKIP=5

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

### Process Management
Background jobs can be:
- **Integrated**: Run as part of the main backend process
- **Standalone**: Run as separate processes for better isolation
- **Containerized**: Deployed in Docker containers for scalability

## Troubleshooting

### Common Issues
1. **High Failure Rates**: Check network connectivity and rate limiting
2. **Slow Processing**: Adjust concurrency limits and timeouts
3. **Memory Issues**: Monitor crawl depth and asset size limits
4. **API Limits**: Verify external service quotas (OpenAI, SerpAPI)

### Debugging
- Check structured logs for detailed error information
- Monitor database tables for processing status
- Verify environment variable configuration
- Test individual URLs manually for policy discovery issues

## Future Enhancements

Potential improvements include:
- **Priority Queues**: Process high-priority URLs first
- **Smart Scheduling**: Adjust frequency based on change patterns
- **Distributed Processing**: Scale across multiple workers
- **Machine Learning**: Improve policy discovery accuracy
- **Real-time Processing**: Immediate assessment for critical URLs

## Related Documentation

- [Assessment Trigger Service Specification](assessment_trigger_service_spec.md)
- [Archive Specification](archive_spec.md)
- [Policies Archive Flow](policies_archive_flow.md)
- [Process Separation Design](process_separation_design.md) 