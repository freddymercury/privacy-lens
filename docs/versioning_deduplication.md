# PrivacyLens Versioning and Deduplication

This document explains how the PrivacyLens system handles versioning and deduplication of policy content across multiple crawl runs.

## Overview

The PrivacyLens archiver system is designed to efficiently store policy content while maintaining a complete history of changes. A key feature of this system is that it **only creates new versions when actual content changes are detected**, avoiding unnecessary duplication of identical content.

## Deduplication Mechanisms

The system implements deduplication at two distinct levels:

### 1. Within a Single Crawl (Asset-Level Deduplication)

When crawling a policy and its linked pages, the system:

- Computes a SHA-256 hash for each fetched asset's content
- Uses the `dedupByHash` function in `dedup.js` to eliminate duplicate assets within the same crawl
- Ensures that identical content (e.g., the same privacy statement appearing on multiple pages) is only stored once per version

```javascript
// From dedup.js
export async function dedupByHash(assets) {
  const uniqueAssets = [];
  const seenHashes = new Set();

  for (const asset of assets) {
    const currentHash = asset.asset_hash || sha256(asset.rawBody);
    asset.asset_hash = currentHash;

    if (!seenHashes.has(currentHash)) {
      seenHashes.add(currentHash);
      uniqueAssets.push(asset);
    } else {
      logger.info(`Duplicate asset found and skipped (URL: ${asset.url}, Hash: ${currentHash})`);
    }
  }

  return uniqueAssets;
}
```

### 2. Across Multiple Crawl Runs (Version-Level Deduplication)

The more significant deduplication happens between different crawl runs:

- After each crawl, the system generates a concatenated text snapshot of all assets
- A SHA-256 hash is computed for this concatenated text (`concatenatedTextHash`)
- This hash is compared with the hash from the most recent version in the database
- If the hashes match (content unchanged), no new version is created

```javascript
// From versioner.js
if (latestPolicyVersionData && latestPolicyVersionData.text_hash === concatenatedTextHash) {
  console.log(`[VersionerDeep] No change detected for policy ${policyId} (Concatenated Hash: ${concatenatedTextHash.substring(0, 8)}...)`);
  await logScanEvent(policyId, 'no_change', null, Date.now() - startTime, 'Deep crawl, concatenated hash unchanged.');
  return { changed: false, versionId: latestPolicyVersionData.id }; // Return existing versionId
}
```

## Database Records

The system creates different database records depending on whether changes are detected:

### When Content Has Not Changed

- No new `policy_versions` record is created
- A `scan_events` record with `outcome: 'no_change'` is created to maintain an audit trail
- The existing version ID is returned

### When Content Has Changed

- A new `policy_versions` record is created with an incremented `version_number`
- All assets are uploaded to storage
- New `policy_assets` records are created for each asset
- A diff is generated between the old and new versions
- A `scan_events` record with `outcome: 'changed'` is created

## Practical Example

Consider a policy that is crawled on three consecutive days:

1. **Day 1**: Initial crawl creates Version 1
2. **Day 2**: No changes detected in the policy content
   - No new version is created
   - A 'no_change' scan event is logged
   - The system still refers to Version 1
3. **Day 3**: The policy is updated with new content
   - Version 2 is created
   - All assets are stored
   - A diff between Version 1 and Version 2 is generated

After these three days, there would be only two versions in the system (Version 1 and Version 2), not three, because the system avoided creating a duplicate version when no changes were detected.

## Benefits

This deduplication approach provides several benefits:

1. **Storage Efficiency**: Avoids redundant storage of identical content
2. **Clear Change History**: Each version represents an actual change, making the history more meaningful
3. **Reduced Processing**: Skips unnecessary processing when content hasn't changed
4. **Accurate Timestamps**: The `fetched_at` timestamp on each version represents when the content actually changed, not just when it was crawled

## Implementation Details

The version-level deduplication logic is primarily implemented in:
- `backend/src/services/archiver/versioner.js` - The `upsertDeepVersion` function
- `backend/src/jobs/archiverJob.js` - The orchestration of the crawl and version creation process

The asset-level deduplication is handled in:
- `backend/src/services/archiver/dedup.js` - The `dedupByHash` function
- `backend/src/services/archiver/deepCrawler.js` - The crawling process that collects and processes assets
