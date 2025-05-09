import { sha256 } from './utils.js'; // Assuming sha256 is in utils.js within the same directory
                                     // Or adjust path if it's in a more general utils location e.g. ../../utils/db.js

/**
 * De-duplicates a list of fetched assets based on the hash of their rawBody.
 * If multiple assets have the same hash, only the first occurrence is kept.
 * This function assumes assets are objects with at least 'rawBody' and 'asset_hash' (or will add 'asset_hash').
 *
 * @param {Array<object>} assets An array of asset objects. Each object should have a 'rawBody' property.
 *                               It can optionally have an 'asset_hash' property; if not, it will be computed.
 *                               Example asset: { url: '...', rawBody: '...', depth: 0, mimeType: '...', bytes: 123 }
 * @returns {Promise<Array<object>>} A promise that resolves to an array of de-duplicated asset objects,
 *                                   each with an 'asset_hash' property added/updated.
 */
export async function dedupByHash(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }

  const uniqueAssets = [];
  const seenHashes = new Set();

  for (const asset of assets) {
    if (!asset || typeof asset.rawBody === 'undefined') {
      // Skip invalid asset objects
      console.warn('Dedup: Skipping invalid asset object:', asset);
      continue;
    }

    // Ensure asset_hash is present or compute it
    // The rawBody can be a string or a Buffer. sha256 should handle both.
    const currentHash = asset.asset_hash || sha256(asset.rawBody);
    
    // Add/update asset_hash property on the asset itself
    asset.asset_hash = currentHash;

    if (!seenHashes.has(currentHash)) {
      seenHashes.add(currentHash);
      uniqueAssets.push(asset);
    } else {
      console.log(`Dedup: Duplicate asset found and skipped (URL: ${asset.url}, Hash: ${currentHash})`);
    }
  }

  return uniqueAssets;
}
