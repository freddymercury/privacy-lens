import schedule from "node-schedule";
import { supabaseServiceRole } from "../utils/supabaseClient.js";
import { performDeepCrawl } from "../services/archiver/deepCrawler.js";
import { upsertDeepVersion } from "../services/archiver/versioner.js";
import { checkUrlAccessibility } from "../services/archiver/assetFetcher.js";
import { createLogger } from "../lib/logger-phase3.js";

// Create a logger for this component
const logger = createLogger('ArchiverJob');

// Default schedule: Run every hour at the beginning of the hour.
// Can be overridden by ARCHIVE_SCHEDULE environment variable (cron format).
const cronSchedule = process.env.ARCHIVE_SCHEDULE || "0 * * * *";

// Crawler options from environment variables or defaults
const CRAWL_MAX_DEPTH = parseInt(process.env.CRAWL_MAX_DEPTH, 10) || 2;
const CRAWL_MAX_LINKS_PER_PAGE = parseInt(process.env.CRAWL_MAX_LINKS, 10) || 20; // Renamed from CRAWL_MAX_LINKS
const CRAWL_INCLUDE_PDFS = process.env.CRAWL_INCLUDE_PDFS !== 'false'; // Include PDFs by default
const CRAWL_DELAY_MS = parseInt(process.env.CRAWL_DELAY_MS, 10) || 500;
// Additional options not in spec but useful for deepCrawler.js
const CRAWL_FILTER_DELAY_MS = parseInt(process.env.CRAWL_FILTER_DELAY_MS, 10) || 200;
const CRAWL_REQUEST_TIMEOUT = parseInt(process.env.CRAWL_REQUEST_TIMEOUT, 10) || 15000;
const CRAWL_MAX_ASSET_SIZE_BYTES = parseInt(process.env.CRAWL_MAX_ASSET_SIZE_BYTES, 10) || 5 * 1024 * 1024;
const CRAWL_MAX_FILTER_SIZE_BYTES = parseInt(process.env.CRAWL_MAX_FILTER_SIZE_BYTES, 10) || 2 * 1024 * 1024;

// Error handling and retry configuration
const MAX_CONSECUTIVE_FAILURES = parseInt(process.env.MAX_CONSECUTIVE_FAILURES, 10) || 3;
const MAX_FAILURES_BEFORE_SKIP = parseInt(process.env.MAX_FAILURES_BEFORE_SKIP, 10) || 5;
const FAILURE_TRACKING_WINDOW_DAYS = parseInt(process.env.FAILURE_TRACKING_WINDOW_DAYS, 10) || 7;


let job = null; // To hold the scheduled job instance

/**
 * Fetches all active policies from the database, with failure tracking information.
 * @returns {Promise<Array<{id: string, domain_name: string, policy_type: string, url: string, failure_count: number, last_failure_date: Date}>>} - List of policies.
 */
async function getPoliciesToScan() {
  logger.info("Fetching policies to scan from database...");
  
  // First, get all policies
  const { data: policies, error } = await supabaseServiceRole
    .from("policies")
    .select("id, domain_name, policy_type, url");
    // TODO: Add filtering if needed, e.g., .eq('is_active', true) or based on last_scanned_at

  if (error) {
    logger.error("Error fetching policies:", { error });
    return [];
  }
  
  if (!policies || policies.length === 0) {
    return [];
  }
  
  // Get recent scan failures for these policies
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - FAILURE_TRACKING_WINDOW_DAYS);
  
  const policyIds = policies.map(p => p.id);
  const { data: scanEvents, error: scanEventsError } = await supabaseServiceRole
    .from("scan_events")
    .select("policy_id, scanned_at, outcome")
    .in("policy_id", policyIds)
    .gte("scanned_at", cutoffDate.toISOString())
    .eq("outcome", "error");
  
  if (scanEventsError) {
    logger.error("Error fetching scan events:", { error: scanEventsError });
    // Continue with policies but without failure tracking
    logger.info(`Found ${policies.length} policies to scan (without failure tracking).`);
    return policies.map(p => ({ ...p, failure_count: 0 }));
  }
  
  // Group failures by policy_id and count them
  const failuresByPolicyId = {};
  if (scanEvents) {
    scanEvents.forEach(event => {
      if (!failuresByPolicyId[event.policy_id]) {
        failuresByPolicyId[event.policy_id] = {
          count: 0,
          dates: []
        };
      }
      failuresByPolicyId[event.policy_id].count++;
      failuresByPolicyId[event.policy_id].dates.push(new Date(event.scanned_at));
    });
  }
  
  // Merge failure data with policies
  const policiesWithFailureData = policies.map(policy => {
    const failures = failuresByPolicyId[policy.id] || { count: 0, dates: [] };
    return {
      ...policy,
      failure_count: failures.count,
      last_failure_date: failures.dates.length > 0 ? 
        new Date(Math.max(...failures.dates.map(d => d.getTime()))) : null
    };
  });
  
  // Sort policies to prioritize those with fewer failures
  policiesWithFailureData.sort((a, b) => a.failure_count - b.failure_count);
  
  logger.info(`Found ${policiesWithFailureData.length} policies to scan.`);
  return policiesWithFailureData;
}

/**
 * Logs a scan failure for a policy.
 * @param {string} policyId - The ID of the policy.
 * @param {string} errorMessage - The error message.
 * @returns {Promise<void>}
 */
async function logScanFailure(policyId, errorMessage) {
  try {
    const { error } = await supabaseServiceRole
      .from("scan_events")
      .insert({
        policy_id: policyId,
        scanned_at: new Date(),
        outcome: "error",
        error_message: errorMessage,
        duration_ms: 0 // Not tracking duration for failures at this level
      });
    
    if (error) {
      logger.error(`Error logging scan failure for policy ${policyId}:`, { error });
    }
  } catch (err) {
    logger.error(`Exception while logging scan failure for policy ${policyId}:`, { error: err });
  }
}

/**
 * Pre-checks a URL to determine if it's likely to be accessible.
 * @param {string} url - The URL to check.
 * @returns {Promise<{accessible: boolean, status?: number, error?: string}>}
 */
async function preCheckUrl(url) {
  try {
    logger.info(`Pre-checking URL accessibility: ${url}`);
    return await checkUrlAccessibility(url, {
      timeout: CRAWL_REQUEST_TIMEOUT / 2
    });
  } catch (error) {
    logger.error(`Error during URL pre-check for ${url}:`, { error });
    return { accessible: false, error: error.message };
  }
}

/**
 * The main function executed by the scheduled job.
 * Fetches policies and processes each one sequentially using deep crawl.
 */
export async function runArchiverScan() {
  logger.info(`Starting scheduled DEEP scan at ${new Date().toISOString()}...`);
  const policies = await getPoliciesToScan();

  if (!policies || policies.length === 0) {
    logger.info("No policies found to scan. Exiting job run.");
    return;
  }

  const crawlOptions = {
    maxDepth: CRAWL_MAX_DEPTH,
    maxLinksPerPage: CRAWL_MAX_LINKS_PER_PAGE,
    includePdfs: CRAWL_INCLUDE_PDFS,
    crawlDelayMs: CRAWL_DELAY_MS,
    filterDelayMs: CRAWL_FILTER_DELAY_MS,
    // keywordRegex: DEFAULT_KEYWORD_REGEX, // Use default from deepCrawler.js
    // userAgent: from deepCrawler.js default
    requestTimeout: CRAWL_REQUEST_TIMEOUT,
    maxAssetSizeBytes: CRAWL_MAX_ASSET_SIZE_BYTES,
    maxFilterSizeBytes: CRAWL_MAX_FILTER_SIZE_BYTES,
  };

  for (const policy of policies) {
    // Skip policies with excessive failures
    if (policy.failure_count >= MAX_FAILURES_BEFORE_SKIP) {
      logger.info(`Skipping policy ${policy.domain_name} (${policy.policy_type}) due to ${policy.failure_count} recent failures. Last failure: ${policy.last_failure_date?.toISOString() || 'unknown'}`);
      continue;
    }
    
    logger.info(`Processing policy: ${policy.domain_name} (${policy.policy_type}) - URL: ${policy.url}`, { 
      previousFailures: policy.failure_count 
    });
    
    // Pre-check URL accessibility
    const urlCheck = await preCheckUrl(policy.url);
    if (!urlCheck.accessible) {
      logger.warn(`URL pre-check failed for ${policy.url}: ${urlCheck.error}`);
      logger.info(`Will attempt crawl anyway as some sites block HEAD requests but allow GET.`);
      // We don't skip here, as the deep crawler will try with GET and alternative user agents
    }
    
    try {
      const crawlResult = await performDeepCrawl(policy.url, policy.policy_type, crawlOptions);

      if (!crawlResult) {
        logger.warn(`Deep crawl failed or returned no result for ${policy.url}. Skipping versioning.`);
        await logScanFailure(policy.id, `Deep crawl failed or returned no result for ${policy.url}`);
        continue;
      }

      // crawlResult contains: { rootAsset, allFetchedAssets, snapshotData, policyDomain, policyType, rootUrl }
      // Ensure policyDomain from crawlResult matches policy.domain_name if needed, though getNormalizedDomain should be consistent.
      
      const versioningResult = await upsertDeepVersion({
        policyId: policy.id,
        domainName: policy.domain_name, // or crawlResult.policyDomain
        policyType: policy.policy_type, // or crawlResult.policyType
        rootUrl: policy.url,            // or crawlResult.rootUrl
        allFetchedAssets: crawlResult.allFetchedAssets,
        snapshotData: crawlResult.snapshotData,
        // suppressAlert can be added if needed, e.g. for backfill jobs
      });

      logger.info(`Result for ${policy.domain_name} (${policy.policy_type}): ${versioningResult.changed ? `Changed (New Version ID: ${versioningResult.versionId})` : 'No Change'}${versioningResult.error ? ` Error: ${versioningResult.error.message}` : ''}`);

    } catch (error) {
      logger.error(`Failed to process policy ${policy.id} (${policy.domain_name}):`, { error });
      await logScanFailure(policy.id, `Exception during processing: ${error.message}`);
      // Error logging is handled within upsertDeepVersion via logScanEvent for versioning errors.
      // Crawl errors are logged in performDeepCrawl.
      // This catch is for unexpected errors in the orchestration here.
    }
  }

  logger.info(`Finished scheduled DEEP scan at ${new Date().toISOString()}.`);
}

/**
 * Initializes and starts the scheduled archiver job.
 */
export function startArchiverJob() {
  if (job) {
    logger.warn("Job already scheduled. Skipping initialization.");
    return;
  }

  logger.info(`Scheduling policy DEEP archive job with schedule: ${cronSchedule}`);
  job = schedule.scheduleJob(cronSchedule, runArchiverScan);

  if (job) {
    logger.info(`Job scheduled successfully. Next invocation: ${job.nextInvocation()}`);
    // Optionally run once immediately on startup:
    // if (process.env.RUN_ARCHIVER_ON_STARTUP === 'true') {
    //   logger.info("Running initial DEEP scan on startup...");
    //   runArchiverScan().catch(err => logger.error("Initial DEEP scan failed:", { error: err }));
    // }
  } else {
    logger.error("Failed to schedule DEEP job!");
  }
}

/**
 * Stops the scheduled archiver job.
 */
export function stopArchiverJob() {
  if (job) {
    logger.info("Cancelling scheduled DEEP job...");
    job.cancel();
    job = null;
    logger.info("DEEP Job cancelled.");
  } else {
    logger.info("No DEEP job scheduled to cancel.");
  }
}

// Optional: Handle graceful shutdown
function gracefulShutdown() {
  logger.info("Received shutdown signal. Shutting down scheduler...");
  stopArchiverJob();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Export potentially for manual triggering or testing
// No default export if using named exports for start/stop/run
