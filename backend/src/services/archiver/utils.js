import crypto from "node:crypto";
import { supabaseServiceRole as supabase } from "../../utils/supabaseClient.js"; // Assuming existing client setup & .js extension if it's ESM
import path from 'node:path';

/**
 * Computes the SHA-256 hash of a string or Buffer.
 * @param {string | Buffer} data - The input data.
 * @returns {string} - The SHA-256 hash in hexadecimal format.
 */
export function sha256(data) {
  if (typeof data !== 'string' && !Buffer.isBuffer(data)) {
    console.warn("[Utils] Input to sha256 is not a string or Buffer.");
    // Consider throwing an error for stricter handling
    return crypto.createHash("sha256").update(String(data)).digest("hex"); // Fallback: try to convert to string
  }
  return crypto.createHash("sha256").update(data).digest("hex");
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
export async function uploadToStorage(bucketName, filePath, data, contentType) {
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
export function generateStoragePath(domain, policyType, version, fetchedAt, extension) {
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
export function generateLatestPointerPath(domain, policyType, extension) {
    const filePath = [
        domain,
        policyType,
        `latest.${extension}`
    ].join('/');
    return filePath;
}

// Default export can be an object if preferred, or individual exports as above.
// export default {
//     sha256,
//     uploadToStorage,
//     generateStoragePath,
//     generateLatestPointerPath,
// };
