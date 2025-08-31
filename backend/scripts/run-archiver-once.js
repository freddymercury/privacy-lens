#!/usr/bin/env node

/**
 * Standalone script to run the archiver job once and exit
 * Designed for GitHub Actions, cron jobs, or manual execution
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Import required modules
import { supabase } from '../src/utils/supabaseClient.js';
import { processDeepCrawl } from '../src/services/archiver/deepCrawler.js';
import { upsertDeepVersion } from '../src/services/archiver/versioner.js';

// Configuration
const CONFIG = {
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
  specificDomain: process.env.SPECIFIC_DOMAIN || null,
  dryRun: process.env.DRY_RUN === 'true',
};

// Logging helpers
const log = (message, ...args) => {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
};

const error = (message, ...args) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args);
};

/**
 * Get list of policies to archive
 */
async function getPoliciesToArchive() {
  try {
    if (CONFIG.specificDomain) {
      log(`Processing specific domain: ${CONFIG.specificDomain}`);
      
      // Check if domain exists in websites table
      const { data, error: dbError } = await supabase
        .from('websites')
        .select('url, user_agreement_url, suggested_policy_url')
        .eq('url', CONFIG.specificDomain)
        .single();
      
      if (dbError || !data) {
        throw new Error(`Domain ${CONFIG.specificDomain} not found in database`);
      }
      
      return [{
        domain: data.url,
        policy_url: data.user_agreement_url || data.suggested_policy_url,
        policy_type: 'privacy'
      }];
    }
    
    // Get all tracked policies
    log('Fetching all tracked policies from database...');
    
    const { data: policies, error: dbError } = await supabase
      .from('websites')
      .select('url, user_agreement_url, suggested_policy_url')
      .or('user_agreement_url.not.is.null,suggested_policy_url.not.is.null')
      .order('last_updated', { ascending: true })
      .limit(50); // Process in batches to avoid overwhelming
    
    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }
    
    if (!policies || policies.length === 0) {
      log('No policies found to archive');
      return [];
    }
    
    log(`Found ${policies.length} policies to check`);
    
    return policies.map(p => ({
      domain: p.url,
      policy_url: p.user_agreement_url || p.suggested_policy_url,
      policy_type: 'privacy'
    }));
    
  } catch (err) {
    error('Failed to get policies:', err);
    throw err;
  }
}

/**
 * Archive a single policy with retry logic
 */
async function archivePolicy(policy, retryCount = 0) {
  const { domain, policy_url, policy_type } = policy;
  
  try {
    log(`Archiving ${domain} (${policy_url})...`);
    
    if (CONFIG.dryRun) {
      log(`[DRY RUN] Would archive ${domain}`);
      return { success: true, domain, dryRun: true };
    }
    
    // Run the deep crawler
    const crawlResult = await processDeepCrawl(
      domain,
      policy_url,
      policy_type
    );
    
    if (!crawlResult || crawlResult.error) {
      throw new Error(crawlResult?.error || 'Crawl failed');
    }
    
    // Process and store the version
    const versionResult = await upsertDeepVersion({
      policyId: domain,
      policyType: policy_type,
      fetchedAt: new Date().toISOString(),
      snapshotData: crawlResult.snapshotData,
      rawHtmlAssets: crawlResult.rawAssets,
      suppressAlert: false
    });
    
    if (versionResult.changed) {
      log(`✅ ${domain}: New version created (ID: ${versionResult.versionId})`);
    } else {
      log(`⏭️  ${domain}: No changes detected`);
    }
    
    return { 
      success: true, 
      domain, 
      changed: versionResult.changed,
      versionId: versionResult.versionId 
    };
    
  } catch (err) {
    if (retryCount < CONFIG.maxRetries) {
      log(`⚠️  ${domain}: Retry ${retryCount + 1}/${CONFIG.maxRetries} after error: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
      return archivePolicy(policy, retryCount + 1);
    }
    
    error(`❌ ${domain}: Failed after ${CONFIG.maxRetries} retries:`, err);
    return { 
      success: false, 
      domain, 
      error: err.message 
    };
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  
  try {
    log('🚀 Starting Privacy Lens Archiver Job');
    log('Configuration:', {
      supabaseUrl: process.env.SUPABASE_URL ? '✓ Set' : '✗ Missing',
      supabaseKey: process.env.SUPABASE_SERVICE_KEY ? '✓ Set' : '✗ Missing',
      s3Bucket: process.env.S3_BUCKET || 'Not configured',
      specificDomain: CONFIG.specificDomain || 'All domains',
      dryRun: CONFIG.dryRun
    });
    
    // Validate required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY');
    }
    
    // Get policies to archive
    const policies = await getPoliciesToArchive();
    
    if (policies.length === 0) {
      log('No policies to archive. Exiting.');
      process.exit(0);
    }
    
    // Process policies sequentially to avoid memory issues
    const results = [];
    for (const policy of policies) {
      const result = await archivePolicy(policy);
      results.push(result);
      
      // Small delay between policies to avoid rate limiting
      if (policies.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const changed = results.filter(r => r.changed).length;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log('');
    log('📊 Archiver Job Summary:');
    log(`   Total processed: ${results.length}`);
    log(`   Successful: ${successful}`);
    log(`   Failed: ${failed}`);
    log(`   Changed: ${changed}`);
    log(`   Duration: ${duration}s`);
    
    if (failed > 0) {
      log('');
      log('Failed domains:');
      results
        .filter(r => !r.success)
        .forEach(r => log(`   - ${r.domain}: ${r.error}`));
    }
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (err) {
    error('Fatal error in archiver job:', err);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  error('Unhandled rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  error('Uncaught exception:', err);
  process.exit(1);
});

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { main as runArchiverOnce };