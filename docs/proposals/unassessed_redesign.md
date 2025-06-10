# Unassessed URLs System Redesign Proposal

*Version 1.0 – January 2025*

## Background

This proposal addresses inconsistencies and inefficiencies in the current unassessed URLs processing system. For complete background on the current implementation, see:

- **[Assessment Trigger Service Specification](assessment_trigger_service_spec.md)** - Documents the current retry mechanism and scheduling
- **[Background Jobs Overview](background_jobs_overview.md)** - Explains how the assessment trigger service fits into the broader job system
- **[Policies Archive Flow](policies_archive_flow.md)** - Shows how unassessed URLs flow through the assessment pipeline

## Current Problem

The current `unassessed_urls` system has a conceptual flaw in its retry mechanism. The [Assessment Trigger Service Specification](assessment_trigger_service_spec.md) suggests that URLs with `"Failed"` or `"Not Found"` status should be automatically retried on subsequent scheduled runs, but this approach is fundamentally flawed because:

**If an assessment failed once, it will likely fail again for the same reasons.**

## Analysis of Failure Scenarios

### Why Automatic Retries Don't Make Sense

1. **"Not Found" Status**: If a site genuinely doesn't have a privacy policy or it's not discoverable through common paths (`/privacy`, `/privacy-policy`, etc.), retrying every 10 hours is wasteful and won't yield different results.

2. **Structural Issues**: Sites with unusual structures that break the policy finder won't magically reorganize themselves between retry attempts.

3. **Rate Limiting**: Sites that block automated requests may become more restrictive with repeated attempts, making the situation worse.

4. **Invalid URLs**: Dead domains, broken URLs, or sites that have permanently removed their privacy policies won't suddenly start working.

5. **Resource Waste**: Automatic retries consume computational resources, API calls, and network bandwidth without meaningful benefit.

### Limited Scenarios Where Retries Might Help

The few cases where retries could be valuable are:

1. **Temporary Network Issues**: Transient connectivity problems (rare)
2. **Site Maintenance**: Temporary downtime during initial assessment
3. **Rate Limiting Recovery**: If sufficient time has passed for rate limits to reset
4. **Site Updates**: Sites that add privacy policies after initially not having one (infrequent)

These scenarios represent a small minority of failures and don't justify automatic retry logic.

## Current Implementation Analysis

### What Works Well

The current system actually has several intelligent design decisions:

1. **Manual Intervention**: The admin interface (`/admin/unassessed`) allows humans to decide which failed URLs are worth retrying
2. **Suggested Policy URLs**: The `suggested_policy_urls` field allows admins to provide hints for sites where automatic discovery failed
3. **Status Preservation**: Failed URLs remain in the table for review rather than being discarded
4. **One-time Processing**: Most URLs either succeed immediately or fail for fundamental reasons

### Current Gap

The main issue is a disconnect between documentation and implementation:
- **Documentation** (in [assessment_trigger_service_spec.md](assessment_trigger_service_spec.md)) suggests automatic retries
- **Implementation** only processes URLs with `"Pending"` status, effectively preventing automatic retries
- This gap creates confusion about expected behavior

## Proposed Redesign

### 1. Clarify the Purpose

The `unassessed_urls` table should be repositioned as:

- **A processing queue** for new URLs (with retry for initial failures)
- **A manual review system** for human investigation of failures
- **A record of assessment attempts** rather than an automatic retry mechanism

### 2. Refined Status Lifecycle

| Status | Description | Automatic Processing | Manual Actions Available |
|--------|-------------|---------------------|-------------------------|
| `Pending` | New URL or manually reset for retry | ✅ Processed on next scheduled run | Reset to Pending, Delete |
| `Processing` | Currently being assessed | ❌ Skip if already processing | View status |
| `Completed` | Successfully assessed and removed | ❌ Not in table | N/A |
| `Failed` | Assessment failed due to error | ❌ Manual review required | Reset to Pending, Add suggested URLs, Delete |
| `Not Found` | No privacy policy discoverable | ❌ Manual review required | Reset to Pending, Add suggested URLs, Delete |

### 3. Enhanced Manual Tools

Improve the admin interface with:

1. **Bulk Actions**: 
   - Reset multiple failed URLs to pending
   - Bulk delete obviously invalid URLs
   - Export failed URLs for external analysis

2. **Failure Analysis**:
   - Show specific error messages for failed assessments
   - Display attempted discovery paths
   - Track retry count and last attempt timestamp

3. **Suggested URL Management**:
   - Better UI for adding/editing suggested policy URLs
   - Validation of suggested URLs before processing
   - Bulk import of suggested URLs from CSV

### 4. Smart Initial Retry Logic

For new URLs only, implement limited retry logic:

```javascript
// Only retry new URLs (first-time failures)
if (status === 'Failed' && retry_count === 0) {
  // Retry once after 1 hour for potential temporary issues
  scheduleRetry(url, delay: '1 hour', maxRetries: 1);
}
```

This handles genuine temporary issues without endless retry loops.

### 5. Updated Documentation

Revise [assessment_trigger_service_spec.md](assessment_trigger_service_spec.md) to:
- Remove references to automatic retry of failed assessments
- Clarify that only `Pending` URLs are processed automatically
- Document the manual review workflow for failed URLs
- Explain the rationale for not auto-retrying failures

## Implementation Plan

### Phase 1: Documentation Update
- [ ] Update [assessment_trigger_service_spec.md](assessment_trigger_service_spec.md)
- [ ] Update [background_jobs_overview.md](background_jobs_overview.md) to reflect new retry policy
- [ ] Add this proposal to the docs
- [ ] Update admin interface documentation

### Phase 2: Admin Interface Improvements
- [ ] Add failure reason display
- [ ] Implement bulk actions for failed URLs
- [ ] Improve suggested URL management UI
- [ ] Add retry count tracking

### Phase 3: Smart Initial Retry (Optional)
- [ ] Add retry_count column to unassessed_urls table
- [ ] Implement single retry for new failures
- [ ] Add configuration for retry delay

## Benefits

1. **Resource Efficiency**: Eliminates wasteful automatic retries
2. **Human Intelligence**: Leverages human judgment for complex failure cases
3. **Clear Expectations**: Aligns documentation with actual behavior
4. **Better Tooling**: Provides admins with better tools for managing failures
5. **Focused Processing**: Concentrates automated processing on URLs likely to succeed

## Related Documentation

- [Assessment Trigger Service Specification](assessment_trigger_service_spec.md) - Current implementation details
- [Background Jobs Overview](background_jobs_overview.md) - How assessment fits into job scheduling
- [Policies Archive Flow](policies_archive_flow.md) - Complete URL processing pipeline
- [API Endpoints](api_endpoints.md) - Admin interface endpoints for unassessed URL management

## Conclusion

The current system's reluctance to automatically retry failed assessments is actually a feature, not a bug. By embracing this design and improving the manual review tools, we can create a more efficient and effective unassessed URL management system.

The key insight is that **most assessment failures are permanent conditions that won't resolve with time**. Human intervention is required to either provide additional guidance (suggested URLs) or determine that a URL should be removed from consideration.