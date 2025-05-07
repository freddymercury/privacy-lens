const schedule = require("node-schedule");
// Use the service role client for background jobs
const { supabaseServiceRole } = require("../utils/supabaseClient"); 
const { fetchHTML } = require("../services/archiver/crawler");
const { htmlToCleanText } = require("../services/archiver/normaliser");
const { upsertVersion } = require("../services/archiver/versioner");

// Default schedule: Run every hour at the beginning of the hour.
// Can be overridden by ARCHIVE_SCHEDULE environment variable (cron format).
const cronSchedule = process.env.ARCHIVE_SCHEDULE || "0 * * * *";

let job = null; // To hold the scheduled job instance

/**
 * Fetches all active policies from the database.
 * @returns {Promise<Array<{id: string, domain_name: string, policy_type: string, url: string}>>} - List of policies.
 */
async function getPoliciesToScan() {
  console.log("[ArchiverJob] Fetching policies to scan from database...");
  // Use supabaseServiceRole here
  const { data, error } = await supabaseServiceRole 
    .from("policies")
    .select("id, domain_name, policy_type, url");
    // Add filtering if needed, e.g., .eq('is_active', true)

  if (error) {
    console.error("[ArchiverJob] Error fetching policies:", error);
    return [];
  }
  console.log(`[ArchiverJob] Found ${data.length} policies to scan.`);
  return data || [];
}

/**
 * The main function executed by the scheduled job.
 * Fetches policies and processes each one sequentially.
 */
async function runArchiverScan() {
  console.log(`[ArchiverJob] Starting scheduled scan at ${new Date().toISOString()}...`);
  const policies = await getPoliciesToScan();

  if (!policies || policies.length === 0) {
    console.log("[ArchiverJob] No policies found to scan. Exiting job run.");
    return;
  }

  // Process policies sequentially for simplicity.
  // Consider parallel processing with concurrency limits (e.g., using p-limit) for larger scale.
  for (const policy of policies) {
    console.log(`[ArchiverJob] Processing policy: ${policy.domain_name} (${policy.policy_type}) - URL: ${policy.url}`);
    try {
      const rawHtml = await fetchHTML(policy.url);
      if (!rawHtml) {
          console.warn(`[ArchiverJob] No HTML content received for ${policy.url}. Skipping.`);
          // Optionally log a specific scan event outcome like 'fetch_empty'
          continue;
      }

      const cleanText = htmlToCleanText(rawHtml);
      if (!cleanText) {
          console.warn(`[ArchiverJob] Clean text resulted in empty string for ${policy.url}. Skipping.`);
          // Optionally log a specific scan event outcome like 'normalize_empty'
          continue;
      }

      const result = await upsertVersion({
        policyId: policy.id,
        domainName: policy.domain_name,
        policyType: policy.policy_type,
        url: policy.url,
        rawHtml: rawHtml,
        cleanText: cleanText,
      });

      console.log(`[ArchiverJob] Result for ${policy.domain_name} (${policy.policy_type}): ${result.changed ? 'Changed' : 'No Change'}${result.error ? ` Error: ${result.error.message}` : ''}`);

    } catch (error) {
      console.error(`[ArchiverJob] Failed to process policy ${policy.id} (${policy.domain_name}):`, error.message);
      // Error logging is handled within upsertVersion via logScanEvent,
      // but we catch here to prevent one failure from stopping the entire job.
    }
  }

  console.log(`[ArchiverJob] Finished scheduled scan at ${new Date().toISOString()}.`);
}

/**
 * Initializes and starts the scheduled archiver job.
 */
function startArchiverJob() {
  if (job) {
    console.warn("[ArchiverJob] Job already scheduled. Skipping initialization.");
    return;
  }

  console.log(`[ArchiverJob] Scheduling policy archive job with schedule: ${cronSchedule}`);
  job = schedule.scheduleJob(cronSchedule, runArchiverScan);

  if (job) {
    console.log(`[ArchiverJob] Job scheduled successfully. Next invocation: ${job.nextInvocation()}`);
    // Optionally run once immediately on startup
    // console.log("[ArchiverJob] Running initial scan on startup...");
    // runArchiverScan().catch(err => console.error("[ArchiverJob] Initial scan failed:", err));
  } else {
    console.error("[ArchiverJob] Failed to schedule job!");
  }
}

/**
 * Stops the scheduled archiver job.
 */
function stopArchiverJob() {
  if (job) {
    console.log("[ArchiverJob] Cancelling scheduled job...");
    job.cancel();
    job = null;
    console.log("[ArchiverJob] Job cancelled.");
  } else {
    console.log("[ArchiverJob] No job scheduled to cancel.");
  }
}

// Optional: Handle graceful shutdown
process.on('SIGINT', () => {
  console.log("[ArchiverJob] Received SIGINT. Shutting down scheduler...");
  stopArchiverJob();
  process.exit(0);
});

module.exports = {
  startArchiverJob,
  stopArchiverJob,
  runArchiverScan, // Export potentially for manual triggering or testing
};
process.on('SIGTERM', () => {
  console.log("[ArchiverJob] Received SIGTERM. Shutting down scheduler...");
  stopArchiverJob();
  process.exit(0);
});
