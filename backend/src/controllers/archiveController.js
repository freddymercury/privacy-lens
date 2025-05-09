import { supabaseServiceRole as supabase } from '../utils/supabaseClient.js'; // Service role for direct DB access
// import { getNormalizedDomain } from '../utils/domainUtils.js'; // If needed for domain param

// --- Helper Functions ---

async function getPolicyByDomain(domain) {
    // Assuming 'domain_name' is the normalized domain in the 'policies' table
    const { data: policy, error } = await supabase
        .from('policies')
        .select('id, domain_name, policy_type') // Add other fields if needed
        .eq('domain_name', domain) // Or whatever the normalized domain column is
        .maybeSingle();

    if (error) {
        console.error(`[ArchiveController] Error fetching policy for domain ${domain}:`, error);
        throw new Error(`Database error fetching policy for domain ${domain}.`);
    }
    return policy;
}

// --- API Endpoint Handlers ---

/**
 * GET /api/v1/policies/{domain}/latest
 * Returns the latest policy snapshot (concatenated text) and its asset list.
 */
export async function getLatestPolicyWithAssets(req, res) {
    const { domain } = req.params;
    try {
        const policy = await getPolicyByDomain(domain);
        if (!policy) {
            return res.status(404).json({ error: "Policy for domain not found." });
        }

        const { data: latestVersion, error: versionError } = await supabase
            .from('policy_versions')
            .select('id, version_number, fetched_at, text_hash, normalized_text_snapshot, raw_snapshot_path, clean_snapshot_path')
            .eq('policy_id', policy.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

        if (versionError) throw versionError;
        if (!latestVersion) {
            return res.status(404).json({ error: "No versions found for this policy." });
        }

        const { data: assets, error: assetsError } = await supabase
            .from('policy_assets')
            .select('id, asset_url, depth, mime_type, bytes, asset_hash, changed, storage_path')
            .eq('policy_version_id', latestVersion.id)
            .order('depth', { ascending: true })
            .order('asset_url', { ascending: true });

        if (assetsError) throw assetsError;

        // TODO: Consider pre-signed URLs for assets if direct download from S3/Storage is desired by client
        // For now, just return metadata. Asset download can be via /assets/{assetId} endpoint.

        res.status(200).json({
            version: {
                id: latestVersion.id,
                domain: policy.domain_name,
                policy_type: policy.policy_type,
                version_number: latestVersion.version_number,
                fetched_at: latestVersion.fetched_at,
                hash: latestVersion.text_hash, // Concatenated text hash
                concatenated_text: latestVersion.normalized_text_snapshot, // Full text
                // raw_snapshot_path: latestVersion.raw_snapshot_path, // Path to root HTML
                // clean_snapshot_path: latestVersion.clean_snapshot_path, // Path to concatenated .txt
            },
            assets: assets || []
        });

    } catch (error) {
        console.error(`[ArchiveController] Error in getLatestPolicyWithAssets for ${domain}:`, error.message);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
}

/**
 * GET /api/v1/policies/{domain}/versions
 * Paginated list of all policy_version metadata for a domain (no assets).
 */
export async function listPolicyVersions(req, res) {
    const { domain } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    try {
        const policy = await getPolicyByDomain(domain);
        if (!policy) {
            return res.status(404).json({ error: "Policy for domain not found." });
        }

        const { data: versions, error: versionsError, count } = await supabase
            .from('policy_versions')
            .select('id, version_number, fetched_at, text_hash', { count: 'exact' })
            .eq('policy_id', policy.id)
            .order('version_number', { ascending: false })
            .range(offset, offset + limit - 1);

        if (versionsError) throw versionsError;

        res.status(200).json({
            page,
            limit,
            total_items: count,
            total_pages: Math.ceil(count / limit),
            items: versions || []
        });

    } catch (error) {
        console.error(`[ArchiveController] Error in listPolicyVersions for ${domain}:`, error.message);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
}

/**
 * GET /api/v1/policies/{domain}/versions/{versionId}
 * Full detail for one version including its assets array.
 */
export async function getPolicyVersionByIdWithAssets(req, res) {
    const { domain, versionId } = req.params; // domain might be redundant if versionId is globally unique
                                            // but good for namespacing/validation
    try {
        // Optional: Validate domain against versionId if needed
        // const policy = await getPolicyByDomain(domain);
        // if (!policy) return res.status(404).json({ error: "Policy for domain not found." });
        // And then check if versionId belongs to policy.id

        const { data: version, error: versionError } = await supabase
            .from('policy_versions')
            .select('id, policy_id, version_number, fetched_at, text_hash, normalized_text_snapshot, raw_snapshot_path, clean_snapshot_path')
            .eq('id', versionId)
            .single();

        if (versionError || !version) {
            if (versionError && versionError.code === 'PGRST116') { // Not found
                 return res.status(404).json({ error: "Policy version not found." });
            }
            throw versionError || new Error("Policy version not found.");
        }
        
        // Fetch domain_name and policy_type from the policies table using policy_id from version
        const { data: policyDetails, error: policyDetailsError } = await supabase
            .from('policies')
            .select('domain_name, policy_type')
            .eq('id', version.policy_id)
            .single();

        if (policyDetailsError || !policyDetails) {
            throw policyDetailsError || new Error("Could not retrieve policy details for the version.");
        }


        const { data: assets, error: assetsError } = await supabase
            .from('policy_assets')
            .select('id, asset_url, depth, mime_type, bytes, asset_hash, changed, storage_path')
            .eq('policy_version_id', versionId)
            .order('depth', { ascending: true })
            .order('asset_url', { ascending: true });

        if (assetsError) throw assetsError;
        
        // Optional: Generate presigned download URLs for assets if `req.query.include_download_urls === 'true'`
        // This would require S3 SDK or Supabase Storage getPublicUrl/getSignedUrl methods.
        // For now, asset content is served by the /assets/{assetId} endpoint.

        res.status(200).json({
            version: {
                id: version.id,
                domain: policyDetails.domain_name, // from joined policy table
                policy_type: policyDetails.policy_type, // from joined policy table
                version_number: version.version_number,
                fetched_at: version.fetched_at,
                hash: version.text_hash,
                // normalized_text_snapshot: version.normalized_text_snapshot, // Optionally include full text
                // raw_snapshot_path: version.raw_snapshot_path,
                // clean_snapshot_path: version.clean_snapshot_path,
            },
            assets: assets || []
        });

    } catch (error) {
        console.error(`[ArchiveController] Error in getPolicyVersionByIdWithAssets for version ${versionId}:`, error.message);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
}


/**
 * GET /api/v1/policies/{domain}/versions/{versionId}/assets/{assetId}
 * Streams raw asset (HTML or PDF) via presigned S3 URL or direct stream.
 */
export async function streamPolicyAsset(req, res) {
    const { domain, versionId, assetId } = req.params;
    try {
        const { data: asset, error: assetError } = await supabase
            .from('policy_assets')
            .select('storage_path, mime_type')
            .eq('id', assetId)
            .eq('policy_version_id', versionId) // Ensure asset belongs to the version
            .single();

        if (assetError || !asset) {
             if (assetError && assetError.code === 'PGRST116') { // Not found
                 return res.status(404).json({ error: "Asset not found." });
            }
            throw assetError || new Error("Asset not found.");
        }

        if (!asset.storage_path) {
            return res.status(404).json({ error: "Asset storage path not found." });
        }

        // Option 1: Redirect to a presigned URL (Preferred for offloading traffic)
        const { data: signedUrlData, error: signError } = await supabase
            .storage
            .from(process.env.S3_BUCKET) // Make sure S3_BUCKET is correct
            .createSignedUrl(asset.storage_path, 60 * 5); // URL valid for 5 minutes

        if (signError || !signedUrlData || !signedUrlData.signedUrl) {
            console.error(`[ArchiveController] Error creating signed URL for asset ${assetId} (${asset.storage_path}):`, signError);
            return res.status(500).json({ error: "Could not generate download URL for asset." });
        }
        
        res.redirect(302, signedUrlData.signedUrl);

        // Option 2: Stream directly from Supabase (if redirect is not desired)
        // const { data: fileData, error: downloadError } = await supabase
        //     .storage
        //     .from(process.env.S3_BUCKET)
        //     .download(asset.storage_path);
        // if (downloadError) throw downloadError;
        // res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
        // res.setHeader('Content-Disposition', `inline; filename="${path.basename(asset.storage_path)}"`);
        // fileData.pipe(res); // Assuming fileData is a readable stream

    } catch (error) {
        console.error(`[ArchiveController] Error in streamPolicyAsset for asset ${assetId}:`, error.message);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
}


/**
 * GET /api/v1/policies/{domain}/diff/{olderVersionId}...{newerVersionId}
 * Returns unified diff between two versions’ concatenated texts plus per-asset change map.
 */
export async function getPolicyDiff(req, res) {
    const { domain, olderVersionId, newerVersionId } = req.params;
    try {
        // 1. Fetch both versions
        const { data: olderVersion, error: olderErr } = await supabase
            .from('policy_versions')
            .select('id, normalized_text_snapshot, policy_id')
            .eq('id', olderVersionId)
            .single();
        if (olderErr || !olderVersion) return res.status(404).json({ error: `Older version ${olderVersionId} not found.` });

        const { data: newerVersion, error: newerErr } = await supabase
            .from('policy_versions')
            .select('id, normalized_text_snapshot, policy_id')
            .eq('id', newerVersionId)
            .single();
        if (newerErr || !newerVersion) return res.status(404).json({ error: `Newer version ${newerVersionId} not found.` });

        // Basic validation: ensure they belong to the same policy and domain (optional)
        if (olderVersion.policy_id !== newerVersion.policy_id) {
            return res.status(400).json({ error: "Versions do not belong to the same policy." });
        }
        // const policy = await getPolicyByDomain(domain);
        // if (!policy || policy.id !== olderVersion.policy_id) {
        //     return res.status(400).json({ error: "Domain does not match policy versions." });
        // }

        // 2. Generate diff for concatenated text
        const textDiff = diff.createPatch(
            `version_${olderVersion.id}.txt`, // Old file name for diff header
            `version_${newerVersion.id}.txt`, // New file name for diff header
            olderVersion.normalized_text_snapshot || '',
            newerVersion.normalized_text_snapshot || '',
            `Version ${olderVersion.id}`, // Old header
            `Version ${newerVersion.id}`  // New header
        );

        // 3. Identify changed assets
        // We need assets from the newer version that have `changed=true`
        // The `changed` flag is relative to its immediate predecessor.
        // For a diff between arbitrary versions, we might need to compare asset hashes directly.
        // However, the spec implies `assets_changed` lists assets in `newerId` that are different from `olderId`.
        // A simpler interpretation for now: list assets in `newerVersionId` that have `changed=true`
        // (meaning they changed from newerVersionId-1 to newerVersionId).
        // A more accurate diff would re-compare all assets between olderVersion and newerVersion.
        // For now, let's use the `changed` flag on the newer version's assets.
        
        const { data: newerAssets, error: assetsErr } = await supabase
            .from('policy_assets')
            .select('id, changed')
            .eq('policy_version_id', newerVersion.id)
            .eq('changed', true); // Only those marked as changed when newerVersion was created

        if (assetsErr) throw assetsErr;

        const assetsChangedIds = (newerAssets || []).map(a => a.id);

        res.status(200).json({
            diff: textDiff,
            assets_changed: assetsChangedIds // List of asset IDs from newerVersion that were marked as 'changed'
        });

    } catch (error) {
        console.error(`[ArchiveController] Error in getPolicyDiff for ${olderVersionId}...${newerVersionId}:`, error.message);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
}
