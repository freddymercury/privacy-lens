/**
 * Marks assets in a new version as changed if their hash differs from the
 * corresponding asset in a previous version, or if the asset is new or removed.
 *
 * @param {Array<object>} prevVersionAssets An array of asset objects from the previous version.
 *                                          Each object should have at least 'url' and 'asset_hash'.
 *                                          Example: [{ url: '/privacy', asset_hash: 'abc', ... }]
 * @param {Array<object>} newVersionAssets An array of asset objects from the new (current) version.
 *                                         Each object should have at least 'url' and 'asset_hash'.
 *                                         These objects will be modified in place to set the 'changed' flag.
 *                                         Example: [{ url: '/privacy', asset_hash: 'def', ... }]
 * @returns {Array<object>} The newVersionAssets array, with each asset object having a 'changed' boolean property.
 *                          Also returns a list of asset URLs that were removed.
 */
export function markChangedAssets(prevVersionAssets = [], newVersionAssets = []) {
  if (!Array.isArray(prevVersionAssets)) prevVersionAssets = [];
  if (!Array.isArray(newVersionAssets)) newVersionAssets = [];

  const prevAssetsMap = new Map();
  for (const asset of prevVersionAssets) {
    if (asset && asset.url) {
      prevAssetsMap.set(asset.url, asset.asset_hash);
    }
  }

  const newAssetsMap = new Map();
  for (const asset of newVersionAssets) {
    if (asset && asset.url) {
      newAssetsMap.set(asset.url, asset); // Store the whole asset object for modification
    }
  }

  const removedAssetUrls = [];

  // Check for changed or new assets
  for (const [url, newAsset] of newAssetsMap) {
    const prevHash = prevAssetsMap.get(url);
    if (prevHash) {
      // Asset existed before
      newAsset.changed = newAsset.asset_hash !== prevHash;
    } else {
      // Asset is new
      newAsset.changed = true;
    }
  }

  // Check for removed assets
  for (const [url, prevHash] of prevAssetsMap) {
    if (!newAssetsMap.has(url)) {
      removedAssetUrls.push(url);
      // Conceptually, a removed asset is a "change".
      // The calling function will handle how to represent this,
      // e.g. by creating a placeholder in policy_assets for removed items if needed,
      // or just noting it in a diff summary. The current policy_assets schema
      // doesn't seem to store removed assets, only current ones.
    }
  }
  
  // The spec for policy_assets implies it only stores currently fetched assets.
  // The 'changed' flag on existing assets covers modifications and additions.
  // Removals are implicitly handled by assets no longer being present in the new version's policy_assets entries.
  // The `assets_changed` array in the diff API endpoint from deep_crawler_spec.md
  // (e.g., `{ "diff":"@@…", "assets_changed":[123,128] }`) would list IDs of assets
  // that are present in the new version and have `changed=true`.

  return {
    updatedNewVersionAssets: Array.from(newAssetsMap.values()), // These are the assets for the new version, marked
    removedAssetUrls: removedAssetUrls
  };
}
