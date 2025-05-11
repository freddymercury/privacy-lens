// Assessment Trigger Service for PrivacyLens backend
// Handles automated processing of unassessed URLs

import * as db from "../utils/db.cjs"; // Make sure addPolicyForArchiving is exported from db.js
import llmService from "./llmService.js";
import { normalizeUrl } from "../utils/domainUtils.js";
import { supabaseServiceRole } from "../utils/supabaseClient.js"; // Import service role client
import policyFinderService from "./policyFinderService.js"; // Import the new service
import { createLogger } from "../lib/logger-phase3.js";

const logger = createLogger('AssessmentTrigger');
const { findPrivacyPolicyUrl } = policyFinderService;

// Global set to track URLs currently being processed
const processingUrls = new Set();

/**
 * Process a batch of URLs with concurrency control
 * @param {Array} urls - Array of URL entries to process
 * @param {number} concurrentLimit - Maximum number of concurrent assessments
 * @returns {Promise<Object>} - Processing results
 */
async function processBatchWithConcurrency(urls, concurrentLimit) {
  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    notFound: 0,
    skipped: 0,
  };

  // Create a queue of URLs to process
  const queue = [...urls];
  const inProgress = new Set();
  
  // Process URLs with concurrency control
  while (queue.length > 0 || inProgress.size > 0) {
    // Fill up to the concurrent limit
    while (queue.length > 0 && inProgress.size < concurrentLimit) {
      const urlEntry = queue.shift();
      
      // Skip if already being processed elsewhere
      if (processingUrls.has(urlEntry.url)) {
        logger.info(`Skipping ${urlEntry.url} - already being processed`);
        results.skipped++;
        results.processed++;
        continue;
      }
      
      // Add to tracking sets
      inProgress.add(urlEntry.url);
      processingUrls.add(urlEntry.url);
      
      // Process URL without awaiting to allow concurrency
      processUnassessedUrl(urlEntry)
        .then(result => {
          // Update results based on the outcome
          results.processed++;
          
          if (result.success) {
            results.successful++;
          } else if (result.status === "Not Found") {
            results.notFound++;
          } else {
            results.failed++;
          }
        })
        .catch(error => {
          logger.error(
            `Error processing URL ${urlEntry.url}:`,
            { error }
          );
          results.processed++;
          results.failed++;
        })
        .finally(() => {
          // Remove from tracking sets when done
          inProgress.delete(urlEntry.url);
          processingUrls.delete(urlEntry.url);
        });
    }
    
    // Wait a short time before checking again if we're at the concurrency limit
    if (inProgress.size >= concurrentLimit || (queue.length === 0 && inProgress.size > 0)) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * Process all pending unassessed URLs
 * @param {number} concurrentLimit - Maximum number of concurrent assessments
 * @returns {Promise<Object>} - Processing results
 */
async function processUnassessedUrls(concurrentLimit = 2) {
  try {
    logger.info(`Starting processing of unassessed URLs (max concurrent: ${concurrentLimit})`);

    // Get pending unassessed URLs
    const unassessedUrls = await db.getUnassessedUrls("Pending");
    logger.info(
      `Found ${unassessedUrls.length} pending URLs to process`
    );

    const results = {
      total: unassessedUrls.length,
      processed: 0,
      successful: 0,
      failed: 0,
      notFound: 0,
    };

    // Create audit log entry for process start
    await db.createAuditLog({
      action: "assessment_trigger_started", // Correct action
      details: {
        count: unassessedUrls.length, // Correct detail
        concurrentLimit // Correct detail
      },
    });

    // Process URLs with concurrency control
    if (unassessedUrls.length > 0) {
      const batchResults = await processBatchWithConcurrency(unassessedUrls, concurrentLimit);
      
      // Update the overall results
      results.processed = batchResults.processed;
      results.successful = batchResults.successful;
      results.failed = batchResults.failed;
      results.notFound = batchResults.notFound;
    }

    // Create audit log entry for process completion
    await db.createAuditLog({
      action: "assessment_trigger_completed",
      details: results,
    });

    logger.info(
      `Completed processing. Results: ${JSON.stringify(
        results
      )}`
    );
    return results;
  } catch (error) {
    logger.error(
      "Error processing unassessed URLs:",
      { error }
    );

    // Create audit log entry for process failure
    await db.createAuditLog({
      action: "assessment_trigger_failed",
      details: {
        error: error.message,
      },
    });

    throw error;
  }
}

/**
 * Process a single unassessed URL
 * @param {Object} urlEntry - Unassessed URL entry from database
 * @returns {Promise<Object>} - Processing result
 */
async function processUnassessedUrl(urlEntry) {
  const { url, suggested_policy_urls } = urlEntry; // Destructure suggested_policy_urls
  logger.info(`Processing URL: ${url}, Initial Suggested Policies: ${JSON.stringify(suggested_policy_urls)}`);

  try {
    // Update status to Processing
    await db.updateUnassessedStatus(url, "Processing");

    // Create audit log entry
    await db.createAuditLog({
      action: "unassessed_url_processing",
      details: { url },
    });

    // Check if URL already has an assessment
    const existingAssessment = await db.getAssessment(url);
    if (existingAssessment) {
      logger.info(`URL ${url} already has an assessment`);

      try {
        // Remove from unassessed queue
        await db.removeFromUnassessedQueue(url);
        logger.info(
          `Removed ${url} from unassessed queue (already assessed)`
        );
      } catch (error) {
        logger.error(
          `Error removing ${url} from unassessed queue:`,
          { error }
        );
        // Continue even if removal fails
      }

      return {
        success: true,
        status: "Already Assessed",
        url,
      };
    }

    // Try to locate user agreement, passing suggested URLs if available
    const agreementResult = await locateUserAgreement(url, suggested_policy_urls); // Use destructured variable

    if (!agreementResult) {
      logger.info(`No user agreement found for ${url}`);

      // Update status to Not Found
      await db.updateUnassessedStatus(url, "Not Found");

       // Create audit log entry
       await db.createAuditLog({
         action: "agreement_not_found",
         details: {
           url,
           // triedPaths: COMMON_AGREEMENT_PATHS, // This variable is no longer defined here
         },
       });

      return {
        success: false,
        status: "Not Found",
        url,
      };
    }

    // Agreement found, process it
    logger.info(
      `User agreement found for ${url} at ${agreementResult.agreementUrl}`
    );

    // Compute hash of agreement text
    const agreementHash = llmService.computeTextHash(agreementResult.text);

    // Check if we already have an assessment with this hash using service role client
    const { data: existingWithHash } = await supabaseServiceRole
      .from("websites")
      .select("url, user_agreement_hash")
      .eq("user_agreement_hash", agreementHash)
      .maybeSingle();

    if (existingWithHash) {
      logger.info(
        `Found existing assessment with same hash for ${existingWithHash.url}`
      );

      // Copy the existing assessment
      const existingFullAssessment = await db.getAssessment(
        existingWithHash.url
      );

      // Save assessment to database with new URL
      await db.upsertAssessment({
        url: url,
        user_agreement_url: agreementResult.agreementUrl,
        user_agreement_hash: agreementHash,
        privacy_assessment: existingFullAssessment.privacy_assessment,
        last_updated: new Date().toISOString(),
        manual_entry: false,
      });

      try {
        // Remove from unassessed queue
        await db.removeFromUnassessedQueue(url);
        logger.info(
          `Removed ${url} from unassessed queue (copied assessment)`
        );
      } catch (error) {
        logger.error(
          `Error removing ${url} from unassessed queue:`,
          { error }
        );
        // Continue even if removal fails
      }

      // Create audit log entry
      await db.createAuditLog({
        action: "assessment_copied",
        details: {
          url,
          sourceUrl: existingWithHash.url,
          agreementHash,
        },
      });

      return {
        success: true,
        status: "Completed",
        url,
        copied: true,
        sourceUrl: existingWithHash.url,
      };
    }

    // Assess privacy policy
    const assessment = await llmService.assessPrivacyPolicy(
      agreementResult.text,
      url // Pass the domain/URL for better logging
    );

    // Save assessment to database
    const savedAssessment = await db.upsertAssessment({ // Capture the result
      url: url,
      user_agreement_url: agreementResult.agreementUrl,
      user_agreement_hash: agreementHash,
      privacy_assessment: assessment,
      last_updated: new Date().toISOString(),
      manual_entry: false,
    });

    // --- Add policy to the archiver queue ---
    // Only add if the assessment was newly created (not copied) and saved successfully
    if (savedAssessment && savedAssessment.user_agreement_url) {
      try {
        await db.addPolicyForArchiving({
          domainName: url, // Use the original (or normalized) domain
          policyType: 'privacy', // Assuming privacy for now
          url: savedAssessment.user_agreement_url,
        });
        logger.info(`Added/Updated policy entry for ${url} for archiving.`);
      } catch (archiveError) {
        logger.error(`Failed to add policy entry for ${url} for archiving:`, { error: archiveError });
        // Log the error but don't fail the entire assessment process
      }
    }
    // --- End add policy ---

    try {
      // Remove from unassessed queue
      await db.removeFromUnassessedQueue(url);
      logger.info(
        `Removed ${url} from unassessed queue (new assessment)`
      );
    } catch (error) {
      logger.error(
        `Error removing ${url} from unassessed queue:`,
        { error }
      );
      // Continue even if removal fails
    }

    // Create audit log entry
    await db.createAuditLog({
      action: "assessment_completed",
      details: {
        url,
        agreementUrl: agreementResult.agreementUrl,
        result: assessment.riskLevel,
      },
    });

    return {
      success: true,
      status: "Completed",
      url,
      riskLevel: assessment.riskLevel,
    };
  } catch (error) {
    logger.error(`Error processing URL ${url}:`, { error });

    // Update status to Failed
    await db.updateUnassessedStatus(url, "Failed");

    // Create audit log entry
    await db.createAuditLog({
      action: "assessment_failed",
      details: {
        url,
        error: error.message,
      },
    });

    return {
      success: false,
      status: "Failed",
      url,
      error: error.message,
    };
  }
}

/**
 * Locate user agreement using the policyFinderService.
 * @param {string} domain - The normalized domain to check (e.g., "example.com").
 * @param {string[]} [suggestedUrls=[]] - Optional array of suggested policy URLs to try first.
 * @returns {Promise<{text: string, agreementUrl: string}|null>} - Agreement text and URL, or null if not found or not processable (e.g., PDF).
 */
async function locateUserAgreement(domain, suggestedUrls = []) {
  logger.info(`locateUserAgreement for domain: ${domain}. Received suggestedUrls: ${JSON.stringify(suggestedUrls)}`);
  // The following log is redundant if the one above shows the content, but kept for consistency with previous state if desired.
  // if (suggestedUrls && suggestedUrls.length > 0) {
  //   logger.info(`Using suggested URLs: ${suggestedUrls.join(', ')}`);
  // }

  const policyResult = await findPrivacyPolicyUrl(domain, suggestedUrls);

  if (!policyResult) {
    logger.info(`policyFinderService did not find a policy URL for ${domain}.`);
    return null;
  }

  if (policyResult.isPdf) {
    logger.info(`Found policy at ${policyResult.url}, but it is a PDF. Cannot extract text for assessment.`);
    // TODO: Potentially store the PDF URL even if we can't assess it yet.
    return null; // Cannot proceed with assessment if it's a PDF and we can't extract text.
  }

  if (!policyResult.content) {
     logger.info(`Found policy URL ${policyResult.url}, but content is missing after verification.`);
     return null; // Should not happen if verification passed, but handle defensively.
  }

  // The policyFinderService already performs basic verification (keywords, length).
  // We need to extract plain text from the HTML content for the LLM.
  const text = extractTextFromHtml(policyResult.content);

  if (text.length < 500) { // Apply a minimum length check on extracted text as well
      logger.info(`Extracted text from ${policyResult.url} is too short (${text.length} chars). Assuming not a valid policy.`);
      return null;
  }

  logger.info(`Successfully found and verified policy text from ${policyResult.url}`);
  return {
    text: text,
    agreementUrl: policyResult.url,
  };
}

/**
 * Extract text content from HTML (basic implementation).
 * @param {string} html - HTML content.
 * @returns {string} - Extracted text.
 */
function extractTextFromHtml(html) {
    if (!html) return '';
    // Basic extraction: remove script/style tags, then all other tags, then normalize whitespace.
    let text = html;
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    text = text.replace(/<[^>]*>/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    return text;
}

/**
 * Schedule periodic processing of unassessed URLs
 * @param {number} intervalMinutes - Interval in minutes
 * @param {number} concurrentLimit - Maximum number of concurrent assessments
 * @returns {Object} - Timer object
 */
function scheduleProcessing(intervalMinutes = 60, concurrentLimit = 2) {
  const intervalMs = intervalMinutes * 60 * 1000;

  logger.info(
    `Scheduling processing every ${intervalMinutes} minutes (max concurrent: ${concurrentLimit})`
  );

  // Run immediately
  processUnassessedUrls(concurrentLimit).catch((error) => {
    logger.error("Error in initial processing:", { error });
  });

  // Schedule periodic runs
  const timer = setInterval(() => {
    processUnassessedUrls(concurrentLimit).catch((error) => {
      logger.error(
        "Error in scheduled processing:",
        { error }
      );
    });
  }, intervalMs);

  return timer;
}

/**
 * Process a single URL without batch processing
 * @param {string} url - URL to process
 * @returns {Promise<Object>} - Processing result
 */
async function processSingleUrl(url) {
  logger.info(`Processing single URL: ${url}`);

  try {
    // Check if URL is already being processed
    if (processingUrls.has(url)) {
      logger.info(`URL ${url} is already being processed, skipping`);
      return {
        success: false,
        status: "Already Processing",
        url,
        message: "This URL is already being processed"
      };
    }

    // Add URL to processing set
    processingUrls.add(url);

    try {
      // Fetch the full entry from the database
      let urlEntry = await db.getUnassessedEntryByUrl(url);

      if (!urlEntry) {
        // If not found in unassessed_urls, create a default entry
        // This might happen if a URL is directly submitted for assessment
        // without being in the queue first, or if it was already processed and removed.
        logger.info(`No existing unassessed entry for ${url}. Creating default entry for processing.`);
        urlEntry = { url: url, suggested_policy_urls: [] };
        // Optionally, you might want to add it to the unassessed_urls table here
        // await db.addToUnassessedQueue(url); 
        // For now, we'll proceed with a temporary entry.
      } else {
        logger.info(`Found existing unassessed entry for ${url}: ${JSON.stringify(urlEntry)}`);
      }

      // Process this single URL using the existing function
      return await processUnassessedUrl(urlEntry);
    } finally {
      // Always remove from processing set when done
      processingUrls.delete(url);
    }
  } catch (error) {
    logger.error(
      `Error processing single URL ${url}:`,
      { error }
    );
    // Make sure to remove from processing set even on error
    processingUrls.delete(url);
    throw error;
  }
}

export {
  processUnassessedUrls,
  processUnassessedUrl,
  processSingleUrl,
  locateUserAgreement,
  scheduleProcessing,
};
