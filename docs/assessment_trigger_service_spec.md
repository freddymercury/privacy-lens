# Assessment Trigger Service Specification

*Version 1.0 – May 2025*

## 1. Overview

The Assessment Trigger Service is a core component of the PrivacyLens backend responsible for processing unassessed URLs. It periodically checks the `unassessed_urls` table for pending entries, attempts to locate and assess their privacy policies, and manages the lifecycle of these URLs through various status states.

A key feature of this service is its **periodic retry mechanism**, which ensures that URLs that failed to be processed in previous attempts are retried automatically according to a configurable schedule.

## 2. Service Architecture

The Assessment Trigger Service is implemented in `backend/src/services/assessmentTriggerService.js` and consists of the following main components:

| Component | Purpose |
|-----------|---------|
| `processUnassessedUrls()` | Main function that processes all pending unassessed URLs |
| `processBatchWithConcurrency()` | Handles batch processing with concurrency control |
| `processUnassessedUrl()` | Processes a single unassessed URL |
| `locateUserAgreement()` | Attempts to find the privacy policy for a domain |
| `scheduleProcessing()` | Sets up the periodic schedule for processing |
| `processSingleUrl()` | API for processing a single URL on demand |

## 3. Periodic Retry Mechanism

### 3.1 Scheduling

The service is scheduled to run at regular intervals defined by the `ASSESSMENT_TRIGGER_INTERVAL_MINUTES` environment variable (default: 600 minutes or 10 hours). This scheduling is set up in the main `index.js` file:

```javascript
// Initialize assessment trigger service
const intervalMinutes = process.env.ASSESSMENT_TRIGGER_INTERVAL_MINUTES || 600;
const maxConcurrentAssessments = process.env.MAX_CONCURRENT_ASSESSMENTS || 1;
assessmentTriggerService.scheduleProcessing(parseInt(intervalMinutes), parseInt(maxConcurrentAssessments));
```

The service also runs once immediately when the server starts, ensuring that any pending URLs are processed without waiting for the first scheduled interval.

### 3.2 URL Status Lifecycle

URLs in the `unassessed_urls` table go through the following status states:

| Status | Description | Next States |
|--------|-------------|------------|
| `Pending` | Initial state for all unassessed URLs | `Processing` |
| `Processing` | URL is currently being processed | `Failed`, `Not Found`, or removal from queue if successful |
| `Failed` | Processing failed due to an error | `Processing` (on next scheduled run) |
| `Not Found` | No privacy policy could be found | `Processing` (on next scheduled run) |

### 3.3 Retry Logic

The retry mechanism works as follows:

1. On each scheduled run, the service fetches all URLs with status `Pending` from the `unassessed_urls` table.
2. Each URL is processed according to the concurrency limit.
3. If processing fails (resulting in `Failed` or `Not Found` status), the URL remains in the table.
4. On the next scheduled run, all URLs with `Failed` or `Not Found` status are eligible to be processed again.
5. This cycle continues until either:
   - The URL is successfully processed (and removed from the queue)
   - The URL is manually removed from the queue
   - The URL reaches a configurable maximum retry limit (not currently implemented)

There is no exponential backoff or prioritization based on the number of previous failures. All pending URLs are processed in the order they were added to the queue.

### 3.4 Concurrency Control

To prevent overwhelming external services and to manage rate limits, the service implements concurrency control:

- The maximum number of concurrent assessments is defined by the `MAX_CONCURRENT_ASSESSMENTS` environment variable (default: 1).
- A global `processingUrls` Set tracks URLs currently being processed to prevent duplicate processing.
- The `processBatchWithConcurrency()` function manages the concurrency limit and ensures that no more than the specified number of URLs are processed simultaneously.

## 4. Configuration Options

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `ASSESSMENT_TRIGGER_INTERVAL_MINUTES` | 600 (10 hours) | Interval in minutes between scheduled processing runs |
| `MAX_CONCURRENT_ASSESSMENTS` | 1 | Maximum number of URLs to process concurrently |

## 5. Database Interaction

The service interacts with the following database tables:

| Table | Interaction |
|-------|-------------|
| `unassessed_urls` | Reads pending URLs, updates status, removes successfully processed URLs |
| `websites` | Stores assessment results |
| `audit_logs` | Records processing events and outcomes |
| `policies` | Adds successfully processed policies for archiving |

## 6. Integration with Other Services

The Assessment Trigger Service integrates with several other components:

| Service | Integration |
|---------|-------------|
| `policyFinderService` | Used to locate privacy policies for domains |
| `llmService` | Used to assess located privacy policies |
| `archiverJob` | Indirectly connected via the `policies` table |

After successful assessment, the service adds the policy to the `policies` table using `db.addPolicyForArchiving()`, which makes it available for the Archiver Job to process.

## 7. Audit Logging

The service creates audit log entries for various events:

| Event | Audit Log Action |
|-------|------------------|
| Processing start | `assessment_trigger_started` |
| Processing completion | `assessment_trigger_completed` |
| URL processing | `unassessed_url_processing` |
| Agreement not found | `agreement_not_found` |
| Assessment completion | `assessment_completed` |
| Assessment failure | `assessment_failed` |
| Assessment copying | `assessment_copied` |

## 8. Error Handling

The service implements comprehensive error handling:

- Errors during processing of individual URLs are caught and logged, allowing the batch to continue.
- URLs that encounter errors are marked with `Failed` status and will be retried in the next scheduled run.
- Global try/catch blocks ensure that errors in one URL don't affect the processing of others.

## 9. Recommended Practices

1. **Interval Setting**: The default 10-hour interval is suitable for most deployments. For higher-traffic systems, consider reducing this to 4-6 hours.

2. **Concurrency**: The default concurrency of 1 is conservative to avoid rate limits. For systems with higher capacity, this can be increased to 2-3, but monitor for rate limiting issues.

3. **Monitoring**: Regularly check the `unassessed_urls` table for URLs stuck in `Failed` or `Not Found` status for extended periods, as these may indicate systematic issues.

4. **Manual Intervention**: For URLs that consistently fail, consider manual investigation and potentially manual removal from the queue.

## 10. Troubleshooting

| Issue | Possible Causes | Solutions |
|-------|----------------|-----------|
| URLs stuck in `Failed` status | Rate limiting, network issues, invalid URLs | Check logs for specific errors, manually retry or remove problematic URLs |
| URLs stuck in `Not Found` status | Privacy policy not detectable, unusual site structure | Consider adding suggested policy URLs manually |
| High failure rate | External service issues, rate limiting | Reduce concurrency, increase interval, check external dependencies |
| Duplicate processing | Race conditions, server restarts | This should be prevented by the `processingUrls` Set, but check for code issues if observed |

## 11. Future Enhancements

Potential improvements to the retry mechanism include:

1. **Maximum Retry Limit**: Implement a counter for failed attempts and stop retrying after a configurable maximum.

2. **Exponential Backoff**: Increase the delay between retries for repeatedly failing URLs.

3. **Priority Queue**: Process URLs with fewer previous failures before those with many failures.

4. **Failure Categorization**: Different retry strategies based on the type of failure (e.g., network errors vs. content issues).

5. **Manual Approval Queue**: Move consistently failing URLs to a separate queue for manual review.

## 12. Conclusion

The Assessment Trigger Service's periodic retry mechanism ensures that unassessed URLs are processed reliably, with failed attempts automatically retried according to the configured schedule. This design balances thoroughness with system resource constraints and external service limitations.
