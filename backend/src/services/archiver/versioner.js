const { supabaseServiceRole: supabase } = require("../../utils/supabaseClient");
const { sha256, uploadToStorage, generateStoragePath, generateLatestPointerPath } = require("./utils");
const diff = require("diff"); // Make sure to install: npm install diff

const STORAGE_BUCKET = process.env.S3_BUCKET; // Use the env var for bucket name

if (!STORAGE_BUCKET) {
  console.error("FATAL: S3_BUCKET environment variable is not set.");
  // Optionally exit or throw an error depending on desired behavior at startup
  // process.exit(1);
}

/**
 * Checks for changes in policy text, uploads artifacts, and updates database records.
 *
 * @param {object} params - Parameters for the versioning process.
 * @param {string} params.policyId - The UUID of the policy record in the 'policies' table.
 * @param {string} params.domainName - The canonical domain name.
 * @param {string} params.policyType - The type of the policy ('privacy', 'tos').
 * @param {string} params.url - The URL the policy was fetched from.
 * @param {string} params.rawHtml - The raw HTML content.
 * @param {string} params.cleanText - The normalized text content.
 * @returns {Promise<{changed: boolean, versionId?: string, diffSummary?: string | null, error?: Error}>} - Result object.
 */
async function upsertVersion({ policyId, domainName, policyType, url, rawHtml, cleanText }) {
  const startTime = Date.now();
  console.log(`[Versioner] Starting upsert for policyId: ${policyId} (${domainName} - ${policyType})`);

  if (!STORAGE_BUCKET) {
    return { changed: false, error: new Error("S3_BUCKET environment variable is not configured.") };
  }

  try {
    const textHash = sha256(cleanText);
    const fetchedAt = new Date(); // Consistent timestamp for this version

    // 1. Fetch latest version for this policy
    console.log(`[Versioner] Fetching latest version for policyId: ${policyId}`);
    const { data: latestVersion, error: fetchError } = await supabase
      .from("policy_versions")
      .select("id, version_number, text_hash, normalized_text_snapshot") // Select snapshot for diffing
      .eq("policy_id", policyId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(); // Use maybeSingle to handle no previous versions gracefully

    if (fetchError) {
      console.error(`[Versioner] Error fetching latest version for policy ${policyId}:`, fetchError);
      await logScanEvent(policyId, 'error', `DB fetch error: ${fetchError.message}`, Date.now() - startTime);
      return { changed: false, error: fetchError };
    }

    console.log(`[Versioner] Latest version found: ${latestVersion ? `v${latestVersion.version_number} (ID: ${latestVersion.id})` : 'None'}`);

    // 2. If hash unchanged -> log scan event and return
    if (latestVersion && latestVersion.text_hash === textHash) {
      console.log(`[Versioner] No change detected for policy ${policyId} (Hash: ${textHash.substring(0, 8)}...)`);
      await logScanEvent(policyId, 'no_change', null, Date.now() - startTime);
      return { changed: false };
    }

    console.log(`[Versioner] Change detected for policy ${policyId}. New hash: ${textHash.substring(0, 8)}...`);

    // 3. Determine new version number
    const newVersionNumber = latestVersion ? latestVersion.version_number + 1 : 1;
    console.log(`[Versioner] New version number: ${newVersionNumber}`);

    // 4. Generate storage paths
    const rawPath = generateStoragePath(domainName, policyType, newVersionNumber, fetchedAt, 'html');
    const cleanPath = generateStoragePath(domainName, policyType, newVersionNumber, fetchedAt, 'txt');
    const latestRawPath = generateLatestPointerPath(domainName, policyType, 'html');
    const latestCleanPath = generateLatestPointerPath(domainName, policyType, 'txt');

    // 5. Store raw & clean snapshots in Supabase Storage (concurrently)
    console.log(`[Versioner] Uploading artifacts to bucket: ${STORAGE_BUCKET}`);
    const [rawUploadResult, cleanUploadResult, latestRawUploadResult, latestCleanUploadResult] = await Promise.all([
      uploadToStorage(STORAGE_BUCKET, rawPath, rawHtml, 'text/html'),
      uploadToStorage(STORAGE_BUCKET, cleanPath, cleanText, 'text/plain'),
      uploadToStorage(STORAGE_BUCKET, latestRawPath, rawHtml, 'text/html'), // Update latest pointer
      uploadToStorage(STORAGE_BUCKET, latestCleanPath, cleanText, 'text/plain') // Update latest pointer
    ]);

    // Handle potential upload errors
    if (rawUploadResult.error || cleanUploadResult.error || latestRawUploadResult.error || latestCleanUploadResult.error) {
      const uploadError = rawUploadResult.error || cleanUploadResult.error || latestRawUploadResult.error || latestCleanUploadResult.error;
      console.error(`[Versioner] Storage upload failed for policy ${policyId}:`, uploadError);
      await logScanEvent(policyId, 'error', `Storage upload error: ${uploadError.message}`, Date.now() - startTime);
      // Consider cleanup of partially uploaded files if necessary
      return { changed: false, error: uploadError };
    }
    console.log(`[Versioner] Artifacts uploaded successfully.`);

    // 6. Insert new version row into policy_versions
    console.log(`[Versioner] Inserting new version record into policy_versions.`);
    const { data: newVersion, error: insertVersionError } = await supabase
      .from("policy_versions")
      .insert({
        policy_id: policyId,
        version_number: newVersionNumber,
        fetched_at: fetchedAt,
        normalized_text_snapshot: cleanText, // Store clean text directly in DB for diffing
        text_hash: textHash,
        raw_snapshot_path: rawUploadResult.path,
        clean_snapshot_path: cleanUploadResult.path,
      })
      .select()
      .single();

    if (insertVersionError) {
      console.error(`[Versioner] Error inserting new version for policy ${policyId}:`, insertVersionError);
      await logScanEvent(policyId, 'error', `DB insert version error: ${insertVersionError.message}`, Date.now() - startTime);
      // Consider cleanup of uploaded files
      return { changed: false, error: insertVersionError };
    }
    console.log(`[Versioner] New version record inserted (ID: ${newVersion.id})`);

    // 7. Generate and store diff summary if previous version exists
    let diffSummary = null;
    if (latestVersion) {
      console.log(`[Versioner] Generating diff against previous version (ID: ${latestVersion.id})`);
      try {
        // Ensure previous snapshot is available
        const previousText = latestVersion.normalized_text_snapshot;
        if (typeof previousText === 'string') {
            const changes = diff.diffWords(previousText, cleanText);
            // Create a concise summary (adjust formatting as needed)
            diffSummary = changes.map(part => {
                if (part.added) return `[+${part.value}]`;
                if (part.removed) return `[-${part.value}]`;
                // Optionally include context: return part.value.length > 20 ? '...' : part.value;
                return ''; // Ignore unchanged parts for summary
            }).join(' ').replace(/\s+/g, ' ').trim(); // Clean up whitespace

            console.log(`[Versioner] Diff generated. Summary length: ${diffSummary.length}`);

            const { error: insertDiffError } = await supabase
            .from("policy_diffs")
            .insert({
                policy_version_id_old: latestVersion.id,
                policy_version_id_new: newVersion.id,
                diff_summary_text: diffSummary,
            });

            if (insertDiffError) {
                console.error(`[Versioner] Error inserting diff for policy ${policyId}, versions ${latestVersion.id} -> ${newVersion.id}:`, insertDiffError);
                // Log this error but don't necessarily fail the whole process
                await logScanEvent(policyId, 'warning', `Diff insert error: ${insertDiffError.message}`, 0); // Use 0 duration or separate log type
            } else {
                console.log(`[Versioner] Diff record inserted successfully.`);
            }
        } else {
             console.warn(`[Versioner] Previous version ${latestVersion.id} missing normalized_text_snapshot for diffing.`);
             await logScanEvent(policyId, 'warning', `Missing previous snapshot for diff`, 0);
        }
      } catch (diffError) {
          console.error(`[Versioner] Error generating diff for policy ${policyId}:`, diffError);
          await logScanEvent(policyId, 'warning', `Diff generation error: ${diffError.message}`, 0);
      }
    }

    // 8. Log successful change event
    await logScanEvent(policyId, 'changed', null, Date.now() - startTime);
    console.log(`[Versioner] Successfully processed change for policy ${policyId}.`);

    return { changed: true, versionId: newVersion.id, diffSummary };

  } catch (error) {
    console.error(`[Versioner] Unexpected error during upsert for policy ${policyId}:`, error);
    await logScanEvent(policyId, 'error', `Unexpected error: ${error.message}`, Date.now() - startTime);
    return { changed: false, error };
  }
}

/**
 * Helper function to log scan events.
 * @param {string} policyId - The policy ID.
 * @param {'changed' | 'no_change' | 'error' | 'warning'} outcome - The result of the scan.
 * @param {string | null} errorMessage - Error message if applicable.
 * @param {number} durationMs - Duration of the scan process.
 */
async function logScanEvent(policyId, outcome, errorMessage, durationMs) {
  try {
    const { error } = await supabase.from("scan_events").insert({
      policy_id: policyId,
      scanned_at: new Date(),
      outcome: outcome,
      error_message: errorMessage,
      duration_ms: Math.round(durationMs)
    });
    if (error) {
      console.error(`[Versioner] Failed to log scan event for policy ${policyId}:`, error);
    }
  } catch (logError) {
    console.error(`[Versioner] Exception while logging scan event for policy ${policyId}:`, logError);
  }
}

module.exports = {
  upsertVersion,
};
