import { supabaseServiceRole as supabase } from "../utils/supabaseClient.js";
import { performDeepCrawl } from "../services/archiver/deepCrawler.js";
import { upsertDeepVersion } from "../services/archiver/versioner.js";
import { getNormalizedDomain } from "../utils/domainUtils.js"; // May not be needed if domains in backfill_tasks are already normalized

// Environment variables for backfill configuration
const BACKFILL_BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE, 10) || 200;
const BACKFILL_CONCURRENCY = parseInt(process.env.BACKFILL_CONCURRENCY, 10) || 5; // For parallel processing of domains in a batch

// Crawler options (can be same as archiverJob or specific for backfill)
const CRAWL_MAX_DEPTH = parseInt(process.env.CRAWL_MAX_DEPTH_BACKFILL, 10) || parseInt(process.env.CRAWL_MAX_DEPTH, 10) || 2;
const CRAWL_MAX_LINKS_PER_PAGE = parseInt(process.env.CRAWL_MAX_LINKS_BACKFILL, 10) || parseInt(process.env.CRAWL_MAX_LINKS, 10) || 20;
const CRAWL_INCLUDE_PDFS = process.env.CRAWL_INCLUDE_PDFS_BACKFILL === 'true' || process.env.CRAWL_INCLUDE_PDFS === 'true' || false;
const CRAWL_DELAY_MS = parseInt(process.env.CRAWL_DELAY_MS_BACKFILL, 10) || parseInt(process.env.CRAWL_DELAY_MS, 10) || 500;
const CRAWL_FILTER_DELAY_MS = parseInt(process.env.CRAWL_FILTER_DELAY_MS_BACKFILL, 10) || parseInt(process.env.CRAWL_FILTER_DELAY_MS, 10) || 200;
const CRAWL_REQUEST_TIMEOUT = parseInt(process.env.CRAWL_REQUEST_TIMEOUT_BACKFILL, 10) || parseInt(process.env.CRAWL_REQUEST_TIMEOUT, 10) || 15000;
const CRAWL_MAX_ASSET_SIZE_BYTES = parseInt(process.env.CRAWL_MAX_ASSET_SIZE_BYTES_BACKFILL, 10) || parseInt(process.env.CRAWL_MAX_ASSET_SIZE_BYTES, 10) || 5 * 1024 * 1024;
const CRAWL_MAX_FILTER_SIZE_BYTES = parseInt(process.env.CRAWL_MAX_FILTER_SIZE_BYTES_BACKFILL, 10) || parseInt(process.env.CRAWL_MAX_FILTER_SIZE_BYTES, 10) || 2 * 1024 * 1024;


/**
 * Fetches a batch of domains queued for backfill.
 * It also attempts to find the corresponding policy_id and root_url from the 'policies' table.
 */
async function getDomainsForBackfill(batchSize) {
  console.log(`[BackfillJob] Fetching up to ${batchSize} domains queued for backfill...`);
  const { data: tasks, error: taskError } = await supabase
    .from("backfill_tasks")
    .select("domain")
    .eq("status", "queued")
    .limit(batchSize);

  if (taskError) {
    console.error("[BackfillJob] Error fetching queued backfill tasks:", taskError);
    return [];
  }
  if (!tasks || tasks.length === 0) {
    console.log("[BackfillJob] No domains currently queued for backfill.");
    return [];
  }

  const domainsToProcess = tasks.map(t => t.domain);
  console.log(`[BackfillJob] Found ${domainsToProcess.length} domains in queue. Fetching policy details...`);

  // Fetch corresponding policy details (id, url, type) for these domains
  // This assumes 'domain_name' in 'policies' table is the normalized domain.
  const { data: policies, error: policyError } = await supabase
    .from("policies")
    .select("id, domain_name, policy_type, url")
    .in("domain_name", domainsToProcess);

  if (policyError) {
    console.error("[BackfillJob] Error fetching policy details for queued domains:", policyError);
    // Mark these tasks as failed or retry later? For now, just return empty.
    return [];
  }
  
  // Map policy details back to tasks
  const enrichedTasks = tasks.map(task => {
      const policyDetail = policies.find(p => p.domain_name === task.domain);
      if (!policyDetail) {
          console.warn(`[BackfillJob] No policy details found for domain ${task.domain} in backfill_tasks. Marking as failed.`);
          // Update status to 'failed' directly here or let the main loop handle it
          updateBackfillTaskStatus(task.domain, 'failed', 'Policy details not found in policies table.');
          return null;
      }
      return {
          domain: task.domain,
          policyId: policyDetail.id,
          policyType: policyDetail.policy_type,
          rootUrl: policyDetail.url
      };
  }).filter(Boolean); // Remove nulls for tasks that couldn't be enriched

  console.log(`[BackfillJob] ${enrichedTasks.length} domains ready for processing with policy details.`);
  return enrichedTasks;
}

async function updateBackfillTaskStatus(domain, status, note = null) {
  const updatePayload = { status, finished_at: new Date() };
  if (note) updatePayload.note = note;
  if (status === 'in_progress') {
    updatePayload.started_at = new Date();
    delete updatePayload.finished_at; // Don't set finished_at when starting
  }

  const { error } = await supabase
    .from("backfill_tasks")
    .update(updatePayload)
    .eq("domain", domain);
  if (error) {
    console.error(`[BackfillJob] Error updating backfill task status for ${domain} to ${status}:`, error);
  }
}

export async function runBackfillBatch() {
  console.log(`[BackfillJob] Starting backfill batch run at ${new Date().toISOString()}...`);
  const domainsToProcess = await getDomainsForBackfill(BACKFILL_BATCH_SIZE);

  if (domainsToProcess.length === 0) {
    console.log("[BackfillJob] No domains to process in this batch. Exiting.");
    return;
  }

  const crawlOptions = {
    maxDepth: CRAWL_MAX_DEPTH,
    maxLinksPerPage: CRAWL_MAX_LINKS_PER_PAGE,
    includePdfs: CRAWL_INCLUDE_PDFS,
    crawlDelayMs: CRAWL_DELAY_MS,
    filterDelayMs: CRAWL_FILTER_DELAY_MS,
    requestTimeout: CRAWL_REQUEST_TIMEOUT,
    maxAssetSizeBytes: CRAWL_MAX_ASSET_SIZE_BYTES,
    maxFilterSizeBytes: CRAWL_MAX_FILTER_SIZE_BYTES,
  };

  // Simple sequential processing for now. Concurrency can be added with p-limit.
  for (const task of domainsToProcess) {
    console.log(`[BackfillJob] Processing backfill for domain: ${task.domain} (Policy ID: ${task.policyId})`);
    await updateBackfillTaskStatus(task.domain, 'in_progress');
    let crawlError = null;
    let versioningError = null;

    try {
      const crawlResult = await performDeepCrawl(task.rootUrl, task.policyType, crawlOptions);

      if (!crawlResult) {
        crawlError = "Deep crawl failed or returned no result.";
        console.warn(`[BackfillJob] ${crawlError} for ${task.rootUrl}.`);
      } else {
        const versioningResult = await upsertDeepVersion({
          policyId: task.policyId,
          domainName: task.domain,
          policyType: task.policyType,
          rootUrl: task.rootUrl,
          allFetchedAssets: crawlResult.allFetchedAssets,
          snapshotData: crawlResult.snapshotData,
          suppressAlert: true, // As per spec for backfill
        });

        if (versioningResult.error) {
          versioningError = versioningResult.error.message;
          console.error(`[BackfillJob] Versioning error for ${task.domain}: ${versioningError}`);
        } else {
          console.log(`[BackfillJob] Backfill versioning for ${task.domain}: ${versioningResult.changed ? 'New version created' : 'No change'}`);
        }
      }
    } catch (error) {
      crawlError = error.message; // Catch any unexpected error during crawl/versioning orchestration
      console.error(`[BackfillJob] Unhandled exception processing ${task.domain}:`, error.message, error.stack);
    }

    if (crawlError || versioningError) {
      await updateBackfillTaskStatus(task.domain, 'failed', crawlError || versioningError);
    } else {
      await updateBackfillTaskStatus(task.domain, 'completed');
    }
  }

  console.log(`[BackfillJob] Finished backfill batch run at ${new Date().toISOString()}.`);
}

// To run this job (e.g., via a cron or manually):
// import { runBackfillBatch } from './jobs/run_backfill_batch.js';
// runBackfillBatch().catch(console.error);
//
// Or if it's meant to be run as a standalone script:
// if (require.main === module) { // Not applicable for ESM directly, use a different trigger
//   runBackfillBatch().catch(err => {
//     console.error("Backfill job failed:", err);
//     process.exit(1);
//   });
// }
