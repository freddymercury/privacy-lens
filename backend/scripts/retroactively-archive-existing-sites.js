// Script to retroactively archive existing sites in the websites table
// This script queries the websites table and adds entries to the policies table
// for archiving by the regular archiver job

import { supabaseServiceRole } from "../src/utils/supabaseClient.js";
import * as db from "../src/utils/db.cjs";

/**
 * Main function to retroactively archive existing sites
 */
async function retroactivelyArchiveExistingSites() {
  try {
    console.log("[RetroactiveArchive] Starting retroactive archiving of existing sites...");

    // Query the websites table to get all existing sites
    const { data: websites, error } = await supabaseServiceRole
      .from("websites")
      .select("url, user_agreement_url");

    if (error) {
      console.error("[RetroactiveArchive] Error fetching websites:", error);
      return;
    }

    console.log(`[RetroactiveArchive] Found ${websites.length} websites to process`);

    // Track statistics
    const stats = {
      total: websites.length,
      processed: 0,
      success: 0,
      skipped: 0,
      failed: 0
    };

    // Process each website
    for (const website of websites) {
      stats.processed++;
      
      // Skip if no user_agreement_url is available
      if (!website.user_agreement_url) {
        console.log(`[RetroactiveArchive] Skipping ${website.url} - no user_agreement_url available`);
        stats.skipped++;
        continue;
      }

      try {
        // Add policy for archiving
        await db.addPolicyForArchiving({
          domainName: website.url, // The normalized domain name
          policyType: 'privacy',   // Default policy type
          url: website.user_agreement_url // The URL where the policy was found
        });
        
        console.log(`[RetroactiveArchive] Successfully added policy for ${website.url} (${website.user_agreement_url})`);
        stats.success++;
      } catch (error) {
        console.error(`[RetroactiveArchive] Error adding policy for ${website.url}:`, error);
        stats.failed++;
      }

      // Log progress every 10 websites
      if (stats.processed % 10 === 0 || stats.processed === stats.total) {
        console.log(`[RetroactiveArchive] Progress: ${stats.processed}/${stats.total} (${Math.round(stats.processed/stats.total*100)}%)`);
      }
    }

    // Log final statistics
    console.log("[RetroactiveArchive] Completed retroactive archiving");
    console.log(`[RetroactiveArchive] Total: ${stats.total}`);
    console.log(`[RetroactiveArchive] Processed: ${stats.processed}`);
    console.log(`[RetroactiveArchive] Success: ${stats.success}`);
    console.log(`[RetroactiveArchive] Skipped: ${stats.skipped}`);
    console.log(`[RetroactiveArchive] Failed: ${stats.failed}`);

  } catch (error) {
    console.error("[RetroactiveArchive] Unexpected error:", error);
  }
}

// Execute the main function
retroactivelyArchiveExistingSites()
  .then(() => {
    console.log("[RetroactiveArchive] Script execution completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("[RetroactiveArchive] Script execution failed:", error);
    process.exit(1);
  });
