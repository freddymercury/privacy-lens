import { supabaseServiceRole as supabase } from "../../utils/supabaseClient.js";
import { sha256, uploadToStorage, generateStoragePath, generateLatestPointerPath } from "./utils.js";
import { markChangedAssets } from "./diffMarker.js";
import * as diff from "diff";
import path from 'node:path'; // For path.basename
import mime from 'mime-types'; // For mime.extension()

const STORAGE_BUCKET = process.env.S3_BUCKET;

if (!STORAGE_BUCKET) {
  console.error("FATAL: S3_BUCKET environment variable is not set for Versioner.");
}

/**
 * Helper function to log scan events.
 * Handles the case where the 'notes' column might not exist in the scan_events table.
 */
async function logScanEvent(policyId, outcome, errorMessage, durationMs, notes = null) {
  try {
    // First, check if the notes column exists in the scan_events table
    const { data: columnInfo, error: columnCheckError } = await supabase
      .from('scan_events')
      .select()
      .limit(1);
    
    // Build the event data object based on available columns
    const eventData = {
      policy_id: policyId,
      scanned_at: new Date(),
      outcome: outcome,
      duration_ms: Math.round(durationMs)
    };
    
    if (errorMessage) eventData.error_message = errorMessage;
    
    // Only include notes if the column exists or if we couldn't check
    let hasNotesColumn = true;
    if (columnCheckError) {
      // If we can't check, assume the column doesn't exist to be safe
      console.warn(`[Versioner] Could not check scan_events schema, omitting notes field: ${columnCheckError.message}`);
      hasNotesColumn = false;
    } else if (columnInfo && columnInfo.length > 0) {
      // If we got a sample row, check if it has a notes property
      const sampleRow = columnInfo[0];
      hasNotesColumn = Object.prototype.hasOwnProperty.call(sampleRow, 'notes');
    }
    
    // Only add notes if the column exists and notes were provided
    if (hasNotesColumn && notes) {
      eventData.notes = notes;
    } else if (notes) {
      // If notes were provided but the column doesn't exist, log them separately
      console.log(`[Versioner] Notes for policy ${policyId} (not stored in DB): ${notes}`);
    }

    const { error } = await supabase.from("scan_events").insert(eventData);
    if (error) {
      console.error(`[Versioner] Failed to log scan event for policy ${policyId}:`, error);
      
      // If the error is about the notes column, retry without it
      if (error.code === 'PGRST204' && error.message.includes("'notes' column")) {
        console.log(`[Versioner] Retrying scan event log without notes field for policy ${policyId}`);
        delete eventData.notes;
        const { error: retryError } = await supabase.from("scan_events").insert(eventData);
        if (retryError) {
          console.error(`[Versioner] Retry failed for scan event log for policy ${policyId}:`, retryError);
        } else {
          console.log(`[Versioner] Successfully logged scan event on retry for policy ${policyId}`);
        }
      }
    }
  } catch (logError) {
    console.error(`[Versioner] Exception while logging scan event for policy ${policyId}:`, logError);
  }
}

/**
 * Generates a storage path for an individual asset within a version's 'assets' directory.
 * Path: {domain}/{policy_type}/{yyyy}/{mm}/{timestamp}_{version}/assets/{depth}_{filename}.{ext}
 */
function generateAssetStoragePath(domainName, policyType, versionNumber, fetchedAt, asset) {
  const baseVersionPath = generateStoragePath(domainName, policyType, versionNumber, fetchedAt, ''); // Get base path part
  
  let filename = path.basename(new URL(asset.finalUrl || asset.url).pathname);
  if (!filename || filename === '/') filename = '_root'; // Handle root paths or empty filenames
  
  // Sanitize filename (simple version, might need more robust slugification)
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  const ext = asset.mimeType ? (mime.extension(asset.mimeType) || 'bin') : 'bin';
  
  // Ensure baseVersionPath ends with a slash if it doesn't
  const resolvedBase = baseVersionPath.endsWith('/') ? baseVersionPath.slice(0, -1) : baseVersionPath;
  
  return `${resolvedBase}/assets/depth${asset.depth}_${filename}.${ext}`;
}


/**
 * Upserts a policy version based on deep crawl results.
 * Stores all assets, creates a concatenated snapshot, and links them in the database.
 *
 * @param {object} params Parameters for the versioning process.
 * @param {string} params.policyId - The UUID of the policy record in the 'policies' table.
 * @param {string} params.domainName - The canonical domain name.
 * @param {string} params.policyType - The type of the policy ('privacy', 'tos').
 * @param {string} params.rootUrl - The original root URL that was crawled.
 * @param {Array<object>} params.allFetchedAssets - Array of unique asset objects from deepCrawler.
 *                                                Each asset: { url, finalUrl, rawBody, depth, mimeType, bytes, asset_hash }
 * @param {object} params.snapshotData - From deepCrawler: { concatText, concatHtml, allAssetsCleanText }
 * @param {boolean} [params.suppressAlert=false] - If true, suppress alerts for this version (e.g., for backfills).
 * @returns {Promise<{changed: boolean, versionId?: string, diffSummary?: string | null, error?: Error}>}
 */
export async function upsertDeepVersion({
  policyId,
  domainName,
  policyType,
  rootUrl, // Original root URL
  allFetchedAssets, // Array of unique asset objects from deepCrawler
  snapshotData,     // { concatText, concatHtml, allAssetsCleanText array }
  suppressAlert = false
}) {
  const startTime = Date.now();
  console.log(`[VersionerDeep] Starting upsert for policyId: ${policyId} (${domainName} - ${policyType})`);

  if (!STORAGE_BUCKET) {
    return { changed: false, error: new Error("S3_BUCKET environment variable is not configured.") };
  }
  if (!allFetchedAssets || allFetchedAssets.length === 0 || !snapshotData) {
    await logScanEvent(policyId, 'error', 'No assets or snapshot data provided to versioner.', Date.now() - startTime);
    return { changed: false, error: new Error("No assets or snapshot data provided.") };
  }

  try {
    const concatenatedTextHash = sha256(snapshotData.concatText);
    const fetchedAt = new Date(); // Consistent timestamp for this version and all its assets

    // 1. Fetch latest version for this policy to compare hash and get previous assets
    console.log(`[VersionerDeep] Fetching latest version for policyId: ${policyId}`);
    const { data: latestPolicyVersionData, error: fetchError } = await supabase
      .from("policy_versions")
      .select("id, version_number, text_hash, normalized_text_snapshot") // text_hash is for concatenated text
      .eq("policy_id", policyId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error(`[VersionerDeep] Error fetching latest version for policy ${policyId}:`, fetchError);
      await logScanEvent(policyId, 'error', `DB fetch latest version error: ${fetchError.message}`, Date.now() - startTime);
      return { changed: false, error: fetchError };
    }
    
    console.log(`[VersionerDeep] Latest version found: ${latestPolicyVersionData ? `v${latestPolicyVersionData.version_number} (ID: ${latestPolicyVersionData.id})` : 'None'}`);

    // 2. If concatenated hash unchanged -> log scan event and return
    if (latestPolicyVersionData && latestPolicyVersionData.text_hash === concatenatedTextHash) {
      console.log(`[VersionerDeep] No change detected for policy ${policyId} (Concatenated Hash: ${concatenatedTextHash.substring(0, 8)}...)`);
      await logScanEvent(policyId, 'no_change', null, Date.now() - startTime, 'Deep crawl, concatenated hash unchanged.');
      return { changed: false, versionId: latestPolicyVersionData.id }; // Return existing versionId
    }

    console.log(`[VersionerDeep] Change detected for policy ${policyId}. New concatenated hash: ${concatenatedTextHash.substring(0, 8)}...`);
    const newVersionNumber = latestPolicyVersionData ? latestPolicyVersionData.version_number + 1 : 1;

    // 3. Upload all unique raw assets
    const assetUploadPromises = allFetchedAssets.map(asset => {
      const assetStoragePath = generateAssetStoragePath(domainName, policyType, newVersionNumber, fetchedAt, asset);
      // Ensure asset.mimeType is reasonable, default if necessary
      const contentType = asset.mimeType || 'application/octet-stream';
      return uploadToStorage(STORAGE_BUCKET, assetStoragePath, asset.rawBody, contentType)
        .then(result => ({ ...asset, storage_path: result.path, uploadError: result.error })); // Add storage_path to asset obj
    });
    
    const uploadedAssetsWithPaths = await Promise.all(assetUploadPromises);
    const failedAssetUploads = uploadedAssetsWithPaths.filter(a => a.uploadError);

    if (failedAssetUploads.length > 0) {
      console.error(`[VersionerDeep] Failed to upload ${failedAssetUploads.length} assets for policy ${policyId}. Errors:`, failedAssetUploads.map(a => `${a.url}: ${a.uploadError.message}`).join('; '));
      await logScanEvent(policyId, 'error', `Failed to upload ${failedAssetUploads.length} assets.`, Date.now() - startTime);
      return { changed: false, error: new Error(`Failed to upload ${failedAssetUploads.length} assets.`) };
    }
    console.log(`[VersionerDeep] All ${uploadedAssetsWithPaths.length} raw assets uploaded successfully.`);

    // 4. Upload concatenated snapshot files (.txt, .html)
    const concatTextPath = generateStoragePath(domainName, policyType, newVersionNumber, fetchedAt, 'txt');
    const concatHtmlPath = generateStoragePath(domainName, policyType, newVersionNumber, fetchedAt, 'html'); // Root HTML as per spec
    
    // The spec says "snapshot.html # root raw HTML". This implies the root document's original HTML.
    // The `deepCrawler` returns `rootAsset` which has the rawBody of the root.
    const rootAssetForSnapshotHtml = allFetchedAssets.find(a => a.url === rootUrl && a.depth === 0);
    const snapshotHtmlContent = rootAssetForSnapshotHtml ? rootAssetForSnapshotHtml.rawBody : snapshotData.concatHtml; // Fallback to assembled if root not found (should not happen)
    const snapshotHtmlMime = rootAssetForSnapshotHtml ? rootAssetForSnapshotHtml.mimeType : 'text/html';


    const [concatTextUpload, concatHtmlUpload] = await Promise.all([
      uploadToStorage(STORAGE_BUCKET, concatTextPath, snapshotData.concatText, 'text/plain'),
      uploadToStorage(STORAGE_BUCKET, concatHtmlPath, snapshotHtmlContent, snapshotHtmlMime)
    ]);

    if (concatTextUpload.error || concatHtmlUpload.error) {
      const snapshotUploadError = concatTextUpload.error || concatHtmlUpload.error;
      console.error(`[VersionerDeep] Snapshot file upload failed for policy ${policyId}:`, snapshotUploadError);
      await logScanEvent(policyId, 'error', `Snapshot upload error: ${snapshotUploadError.message}`, Date.now() - startTime);
      return { changed: false, error: snapshotUploadError };
    }
    console.log(`[VersionerDeep] Concatenated snapshot files uploaded.`);
    
    // Also update 'latest' pointers for the main snapshot files
    const latestConcatTextPath = generateLatestPointerPath(domainName, policyType, 'txt');
    const latestConcatHtmlPath = generateLatestPointerPath(domainName, policyType, 'html');
    await Promise.all([
        uploadToStorage(STORAGE_BUCKET, latestConcatTextPath, snapshotData.concatText, 'text/plain'),
        uploadToStorage(STORAGE_BUCKET, latestConcatHtmlPath, snapshotHtmlContent, snapshotHtmlMime)
    ]);
    console.log(`[VersionerDeep] 'latest' snapshot pointers updated.`);


    // 5. Insert new policy_versions row
    const { data: newPolicyVersion, error: insertVersionError } = await supabase
      .from("policy_versions")
      .insert({
        policy_id: policyId,
        version_number: newVersionNumber,
        fetched_at: fetchedAt,
        normalized_text_snapshot: snapshotData.concatText, // For diffing the whole thing
        text_hash: concatenatedTextHash, // Hash of the concatenated text
        raw_snapshot_path: concatHtmlUpload.path, // Path to the root HTML snapshot
        clean_snapshot_path: concatTextUpload.path, // Path to the concatenated clean text snapshot
        // suppress_alert: suppressAlert, // Assuming a column 'suppress_alert' exists or will be added
      })
      .select()
      .single();

    if (insertVersionError) {
      console.error(`[VersionerDeep] Error inserting new policy_versions for ${policyId}:`, insertVersionError);
      await logScanEvent(policyId, 'error', `DB insert policy_versions error: ${insertVersionError.message}`, Date.now() - startTime);
      return { changed: false, error: insertVersionError };
    }
    console.log(`[VersionerDeep] New policy_versions record inserted (ID: ${newPolicyVersion.id})`);

    // 6. Prepare and insert policy_assets records
    let previousVersionAssets = [];
    if (latestPolicyVersionData) {
        const { data: prevAssetsData, error: prevAssetsError } = await supabase
            .from('policy_assets')
            .select('asset_url, asset_hash, depth, mime_type, bytes, storage_path')
            .eq('policy_version_id', latestPolicyVersionData.id);
        if (prevAssetsError) {
            console.warn(`[VersionerDeep] Could not fetch previous assets for diff marking for version ${latestPolicyVersionData.id}: ${prevAssetsError.message}`);
        } else {
            previousVersionAssets = prevAssetsData || [];
        }
    }
    
    // The `snapshotData.allAssetsCleanText` array contains {url, text, depth, mimeType, asset_hash, bytes}
    // We need to map this to `uploadedAssetsWithPaths` to get `storage_path` and `finalUrl`.
    const assetsToInsertInDb = snapshotData.allAssetsCleanText.map(cleanAssetInfo => {
        const correspondingUploadedAsset = uploadedAssetsWithPaths.find(ua => ua.url === cleanAssetInfo.url || ua.finalUrl === cleanAssetInfo.url);
        if (!correspondingUploadedAsset || !correspondingUploadedAsset.storage_path) {
            console.error(`[VersionerDeep] CRITICAL: Could not find uploaded asset info or storage_path for ${cleanAssetInfo.url}. Skipping asset DB insert.`);
            return null; // Should not happen if uploads were successful
        }
        return {
            policy_version_id: newPolicyVersion.id,
            asset_url: correspondingUploadedAsset.finalUrl || correspondingUploadedAsset.url, // Use final URL after redirects
            depth: cleanAssetInfo.depth,
            mime_type: cleanAssetInfo.mimeType,
            bytes: cleanAssetInfo.bytes,
            asset_hash: cleanAssetInfo.asset_hash, // This is hash of individual asset's clean text or raw for PDF
            storage_path: correspondingUploadedAsset.storage_path, // Path to the raw asset in storage
            // 'changed' flag will be set by diffMarker logic below
        };
    }).filter(Boolean); // Remove nulls if any critical error occurred

    const { updatedNewVersionAssets } = markChangedAssets(previousVersionAssets, assetsToInsertInDb);
    // `updatedNewVersionAssets` now has the 'changed' flag set correctly.

    if (updatedNewVersionAssets.length > 0) {
      const { error: insertAssetsError } = await supabase
        .from("policy_assets")
        .insert(updatedNewVersionAssets);

      if (insertAssetsError) {
        console.error(`[VersionerDeep] Error inserting policy_assets for version ${newPolicyVersion.id}:`, insertAssetsError);
        await logScanEvent(policyId, 'error', `DB insert policy_assets error: ${insertAssetsError.message}`, Date.now() - startTime);
        // This is a partial failure state. The policy_versions row exists, but assets are missing.
        // Might need a cleanup or retry mechanism for policy_assets.
        return { changed: true, versionId: newPolicyVersion.id, error: insertAssetsError }; // Changed is true because version was made
      }
      console.log(`[VersionerDeep] ${updatedNewVersionAssets.length} policy_assets records inserted for version ${newPolicyVersion.id}.`);
    }


    // 7. Generate and store diff summary for the concatenated text
    let diffSummary = null;
    if (latestPolicyVersionData && latestPolicyVersionData.normalized_text_snapshot) {
      console.log(`[VersionerDeep] Generating diff for concatenated text against previous version (ID: ${latestPolicyVersionData.id})`);
      try {
        // Calculate combined text size
        const textSize = latestPolicyVersionData.normalized_text_snapshot.length + snapshotData.concatText.length;
        const SIZE_THRESHOLD = 1024 * 1024; // 1MB combined
        
        let changes;
        if (textSize > SIZE_THRESHOLD) {
          console.log(`[VersionerDeep] Using line-based diff for large texts (${(textSize / 1024).toFixed(2)} KB)`);
          changes = diff.diffLines(latestPolicyVersionData.normalized_text_snapshot, snapshotData.concatText);
        } else {
          console.log(`[VersionerDeep] Using word-based diff for normal texts (${(textSize / 1024).toFixed(2)} KB)`);
          changes = diff.diffWords(latestPolicyVersionData.normalized_text_snapshot, snapshotData.concatText);
        }
        
        // Build diff summary with truncation for very large parts
        const MAX_PART_LENGTH = 1000; // Max length per diff part
        const MAX_DIFF_LENGTH = 500000; // 500KB max total diff
        
        diffSummary = changes.map(part => {
            if (part.added) {
              const truncated = part.value.length > MAX_PART_LENGTH 
                ? `${part.value.substring(0, MAX_PART_LENGTH)}... [${part.value.length} chars]`
                : part.value;
              return `[+${truncated}]`;
            }
            if (part.removed) {
              const truncated = part.value.length > MAX_PART_LENGTH
                ? `${part.value.substring(0, MAX_PART_LENGTH)}... [${part.value.length} chars]`
                : part.value;
              return `[-${truncated}]`;
            }
            return '';
        }).join(' ').replace(/\s+/g, ' ').trim();
        
        // Truncate total diff if too large
        if (diffSummary.length > MAX_DIFF_LENGTH) {
          diffSummary = diffSummary.substring(0, MAX_DIFF_LENGTH) + '... [diff truncated due to size]';
          console.log(`[VersionerDeep] Diff summary truncated from ${diffSummary.length} to ${MAX_DIFF_LENGTH} characters`);
        }

        const { error: insertDiffError } = await supabase
          .from("policy_diffs")
          .insert({
            policy_version_id_old: latestPolicyVersionData.id,
            policy_version_id_new: newPolicyVersion.id,
            diff_summary_text: diffSummary,
          });
        if (insertDiffError) console.error(`[VersionerDeep] Error inserting diff summary:`, insertDiffError);
        else console.log(`[VersionerDeep] Diff summary record inserted.`);

      } catch (e) {
        console.error(`[VersionerDeep] Error generating concatenated text diff:`, e);
        // Store a placeholder diff message instead of crashing
        diffSummary = '[Diff generation failed due to size constraints]';
        
        // Still try to insert a record indicating diff failure
        const { error: insertDiffError } = await supabase
          .from("policy_diffs")
          .insert({
            policy_version_id_old: latestPolicyVersionData.id,
            policy_version_id_new: newPolicyVersion.id,
            diff_summary_text: diffSummary,
          });
        if (insertDiffError) console.error(`[VersionerDeep] Error inserting placeholder diff:`, insertDiffError);
      }
    }

    await logScanEvent(policyId, 'changed', null, Date.now() - startTime, `Deep crawl. New version ${newVersionNumber} created.`);
    console.log(`[VersionerDeep] Successfully processed deep crawl change for policy ${policyId}. New version ID: ${newPolicyVersion.id}`);

    return { changed: true, versionId: newPolicyVersion.id, diffSummary };

  } catch (error) {
    console.error(`[VersionerDeep] Unexpected error during upsert for policy ${policyId}:`, error);
    await logScanEvent(policyId, 'error', `Unexpected error: ${error.message}`, Date.now() - startTime);
    return { changed: false, error };
  }
}
