const { supabase } = require("../utils/supabaseClient"); // Use the shared Supabase client

/**
 * GET /api/v1/policies/:domain?type=<policy_type>
 * Retrieves the latest policy version for a given domain and type.
 */
const getLatestPolicy = async (req, res, next) => {
  const { domain } = req.params;
  const policyType = req.query.type || 'privacy'; // Default to 'privacy' if type not specified

  if (!domain) {
    return res.status(400).json({ error: "Domain parameter is required." });
  }

  console.log(`[API] Request received for latest policy: ${domain} (Type: ${policyType})`);

  try {
    const { data, error } = await supabase.rpc("get_latest_policy", {
      p_domain: domain,
      p_policy_type: policyType,
    });

    if (error) {
      console.error(`[API] Error calling get_latest_policy for ${domain} (${policyType}):`, error);
      // Check for specific Supabase errors if needed, e.g., function not found
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    if (!data || data.length === 0) {
      console.log(`[API] No policy found for ${domain} (${policyType})`);
      return res.status(404).json({ error: "Policy not found for the specified domain and type." });
    }

    console.log(`[API] Successfully retrieved latest policy for ${domain} (${policyType})`);
    // The RPC function returns an array with one element or empty
    res.json(data[0]);

  } catch (err) {
    console.error(`[API] Unexpected error in getLatestPolicy for ${domain} (${policyType}):`, err);
    next(err); // Pass to global error handler
  }
};

/**
 * GET /api/v1/policies/:domain/versions?type=<policy_type>
 * Lists all historical versions (metadata) for a given domain and type.
 */
const listPolicyVersions = async (req, res, next) => {
  const { domain } = req.params;
  const policyType = req.query.type || 'privacy'; // Default to 'privacy'

  if (!domain) {
    return res.status(400).json({ error: "Domain parameter is required." });
  }

  console.log(`[API] Request received for policy versions list: ${domain} (Type: ${policyType})`);

  try {
    const { data, error } = await supabase.rpc("list_policy_versions", {
      p_domain: domain,
      p_policy_type: policyType,
    });

    if (error) {
      console.error(`[API] Error calling list_policy_versions for ${domain} (${policyType}):`, error);
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    // RPC returns an array, which might be empty if no versions exist
    console.log(`[API] Successfully retrieved ${data?.length || 0} versions for ${domain} (${policyType})`);
    res.json(data || []);

  } catch (err) {
    console.error(`[API] Unexpected error in listPolicyVersions for ${domain} (${policyType}):`, err);
    next(err);
  }
};

/**
 * GET /api/v1/policies/:domain/versions/:verId
 * Retrieves details for a specific policy version, including diff summary.
 * Note: The :domain param isn't strictly needed if verId is unique (UUID),
 * but kept for consistency with the spec/URL structure.
 */
const getVersionWithDiff = async (req, res, next) => {
  const { domain, verId } = req.params; // Domain might be unused if verId is UUID

  if (!verId) {
    return res.status(400).json({ error: "Version ID parameter (verId) is required." });
  }

  // Basic UUID validation (optional but recommended)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(verId)) {
      return res.status(400).json({ error: "Invalid Version ID format. Expected UUID." });
  }


  console.log(`[API] Request received for specific version: ${verId} (Domain context: ${domain})`);

  try {
    const { data, error } = await supabase.rpc("get_version_with_diff", {
      p_version_id: verId,
    });

    if (error) {
      console.error(`[API] Error calling get_version_with_diff for version ${verId}:`, error);
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    if (!data || data.length === 0) {
      console.log(`[API] Version not found: ${verId}`);
      return res.status(404).json({ error: "Version not found." });
    }

    console.log(`[API] Successfully retrieved version ${verId}`);
    // RPC returns an array with one element or empty
    res.json(data[0]);

  } catch (err) {
    console.error(`[API] Unexpected error in getVersionWithDiff for version ${verId}:`, err);
    next(err);
  }
};

module.exports = {
  getLatestPolicy,
  listPolicyVersions,
  getVersionWithDiff,
};
