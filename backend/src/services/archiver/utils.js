const crypto = require("node:crypto");
const { supabaseServiceRole: supabase } = require("../../utils/supabaseClient"); // Assuming existing client setup
const path = require('node:path');

/**
 * Computes the SHA-256 hash of a string.
 * @param {string} str - The input string.
 * @returns {string} - The SHA-256 hash in hexadecimal format.
 */
function sha256(str) {
  if (typeof str !== 'string') {
    console.warn("[Utils] Input to sha256 is not a string.");
    return ''; // Or throw an error
  }
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Uploads data (string or Buffer) to Supabase Storage.
 *
 * @param {string} bucketName - The name of the Supabase Storage bucket.
 * @param {string} filePath - The destination path within the bucket (e.g., 'domain.com/privacy/2023/01/01/timestamp_v1.html').
 * @param {string | Buffer} data - The content to upload.
 * @param {string} contentType - The MIME type of the content (e.g., 'text/html', 'text/plain').
 * @returns {Promise<{path: string, error: Error | null}>} - Object containing the storage path or an error.
 */
async function uploadToStorage(bucketName, filePath, data, contentType) {
  console.log(`[Utils] Uploading to Supabase Storage: ${bucketName}/${filePath}`);
  try {
    const { data: uploadData, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, data, {
        contentType: contentType,
        upsert: true, // Overwrite if exists (useful for 'latest' pointers)
      });

    if (error) {
      console.error(`[Utils] Supabase Storage upload error for ${filePath}:`, error);
      throw error; // Re-throw Supabase error
    }

    console.log(`[Utils] Successfully uploaded to ${uploadData.path}`);
    // Supabase returns the full path including bucket name, but we often just need the relative path
    // However, the returned `path` from uploadData is usually just the filePath we provided.
    // Let's return the intended filePath for consistency.
    return { path: filePath, error: null };

  } catch (error) {
    console.error(`[Utils] Failed to upload ${filePath} to bucket ${bucketName}:`, error.message);
    return { path: null, error };
  }
}

/**
 * Generates the storage path for policy artifacts based on convention.
 * /{domain}/{policy_type}/{yyyy}/{mm}/{timestamp}_{version}.{ext}
 *
 * @param {string} domain - Canonical domain name.
 * @param {string} policyType - Type of policy ('privacy', 'tos').
 * @param {number} version - The version number.
 * @param {Date} fetchedAt - The timestamp when the policy was fetched.
 * @param {'html' | 'txt'} extension - The file extension.
 * @returns {string} - The generated storage path.
 */
function generateStoragePath(domain, policyType, version, fetchedAt, extension) {
    const year = fetchedAt.getFullYear();
    const month = String(fetchedAt.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const timestamp = fetchedAt.toISOString().replace(/[:.]/g, '-'); // ISO string safe for paths

    // Use path.join for cross-platform compatibility, though S3 uses forward slashes
    // Ensure forward slashes for the final S3 path
    const filePath = [
        domain,
        policyType,
        String(year),
        month,
        `${timestamp}_v${version}.${extension}`
    ].join('/');

    return filePath;
}

/**
 * Generates the path for the 'latest' pointer file.
 * /{domain}/{policy_type}/latest.{ext}
 *
 * @param {string} domain - Canonical domain name.
 * @param {string} policyType - Type of policy ('privacy', 'tos').
 * @param {'html' | 'txt'} extension - The file extension.
 * @returns {string} - The generated storage path for the latest pointer.
 */
function generateLatestPointerPath(domain, policyType, extension) {
    const filePath = [
        domain,
        policyType,
        `latest.${extension}`
    ].join('/');
    return filePath;
}

module.exports = {
    sha256,
    uploadToStorage,
    generateStoragePath,
    generateLatestPointerPath,
};
