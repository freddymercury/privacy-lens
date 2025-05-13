# How Privacy Policies Get Added and Queued for Archiving

Based on analysis of the codebase, here's how privacy policies are added and queued for archiving in the privacy-lens system:

## The Flow

1. **Initial URL Collection**:
   - URLs are initially added to the `unassessed_urls` table
   - This happens through:
     - Seed scripts (like `privacylens_b2b_seed_full.sql`)
     - Manual additions through the admin interface
     - Potentially through API endpoints

2. **Assessment Process**:
   - The `assessmentTriggerService.js` periodically processes URLs from the `unassessed_urls` table
   - It runs on a schedule defined by `ASSESSMENT_TRIGGER_INTERVAL_MINUTES` (default: 600 minutes/10 hours)
   - It processes URLs with concurrency control (`MAX_CONCURRENT_ASSESSMENTS`, default: 1)
   - For detailed information about this service and its retry mechanism, see [Assessment Trigger Service Specification](assessment_trigger_service_spec.md)

3. **Policy Discovery**:
   - For each unassessed URL, the system tries to locate the privacy policy using `policyFinderService.js`
   - The policy finder tries:
     - Suggested URLs (if provided)
     - Common paths (like `/privacy`, `/privacy-policy`, etc.)
     - Search engine fallback (using SerpAPI)

4. **Assessment and Archiving**:
   - When a privacy policy is found, it's assessed using `llmService.assessPrivacyPolicy()`
   - The assessment is stored in the `websites` table
   - **Key step**: After successful assessment, `db.addPolicyForArchiving()` is called, which:
     - Adds or updates an entry in the `policies` table with:
       - `domain_name`: The normalized domain
       - `policy_type`: The type of policy (default: 'privacy')
       - `url`: The URL where the policy was found

5. **Archiver Job**:
   - The `archiverJob.js` runs on a schedule (default: hourly)
   - It reads from the `policies` table to determine what to archive
   - For each policy, it:
     - Performs a deep crawl using `performDeepCrawl()`
     - Stores the crawled content using `upsertDeepVersion()`
     - Tracks changes over time

## Key Tables

- `unassessed_urls`: Queue of URLs to be assessed
- `websites`: Stores assessment results
- `policies`: Queue of policies to be archived
- `policy_versions`: Stores archived versions of policies
- `policy_assets`: Stores individual assets from each crawl
- `scan_events`: Logs archiving attempts and outcomes

This system creates a pipeline where websites are first assessed for their privacy policies, and then those policies are continuously monitored for changes over time.
