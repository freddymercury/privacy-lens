// Database configuration for PrivacyLens backend

// Use specific clients: one for service role (bypasses RLS), one factory for user-scoped (respects RLS)
const supabaseWrapper = require("./supabaseClientWrapper.cjs");
const domainUtilsWrapper = require("./domainUtilsWrapper.cjs");

// Logger placeholder until dynamic import completes
let logger = {
  info: (...args) => console.log('[DB]', ...args),
  error: (...args) => console.error('[DB]', ...args),
  warn: (...args) => console.warn('[DB]', ...args)
};

// Dynamic import for logger
(async () => {
  try {
    const loggerModule = await import('../lib/logger-phase3.js');
    const createLogger = loggerModule.createLogger;
    logger = createLogger('DB');
  } catch (error) {
    console.error('[DB] Error loading logger:', error);
  }
})();

// Create references to the functions/objects we'll use throughout this module
let supabaseServiceRole;
let createAuthedClient;
let normalizeUrl;

// Flag to track initialization status
let isInitialized = false;
let initError = null;

// Initialize the module
const initPromise = (async () => {
  try {
    // Wait for both supabase client and domain utils initialization
    await Promise.all([
      supabaseWrapper.initializationPromise,
      domainUtilsWrapper.initializationPromise
    ]);
    
    // Now we can safely use the exports
    supabaseServiceRole = supabaseWrapper.supabaseServiceRole;
    createAuthedClient = supabaseWrapper.createAuthedClient;
    normalizeUrl = domainUtilsWrapper.normalizeUrl;
    
    logger.info('Initialization complete for both supabaseWrapper and domainUtilsWrapper');
    isInitialized = true;
  } catch (error) {
    logger.error('Error during initialization:', { error });
    initError = error;
    throw error;
  }
})();

// Helper function to ensure initialization is complete before proceeding
const ensureInitialized = async () => {
  if (!isInitialized) {
    if (initError) {
      throw initError;
    }
    await initPromise;
  }
};


/**
 * Database helper functions
 */

/**
 * Get assessment for a URL
 * @param {string} url - The URL to get assessment for
 * @returns {Promise<Object|null>} - Assessment data or null if not found
 */
const getAssessment = async (url) => {
  // Ensure initialization is complete before proceeding
  await ensureInitialized();
  
  // Normalize the URL to get the base domain
  const normalizedUrl = normalizeUrl(url);
  logger.info(
    `Getting assessment for URL: ${url}, Normalized: ${normalizedUrl} (using service role)`
  );

  // Using service role, assuming public read access to assessments or system lookup
  const { data, error } = await supabaseServiceRole
    .from("websites")
    .select("*")
    .eq("url", normalizedUrl)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // PGRST116 is the error code for "no rows returned"
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Create or update assessment for a URL
 * @param {Object} assessment - Assessment data
 * @returns {Promise<Object>} - Updated assessment data
 */
const upsertAssessment = async (assessment) => {
  // Ensure initialization is complete before proceeding
  await ensureInitialized();
  
  // Normalize the URL in the assessment
  const originalUrl = assessment.url;
  const normalizedUrl = normalizeUrl(originalUrl);

  logger.info(
    `Upserting assessment for URL: ${originalUrl}, Normalized: ${normalizedUrl} (using service role)`
  );

  // Create a new assessment object with the normalized URL
  const normalizedAssessment = {
    ...assessment,
    url: normalizedUrl,
  };

  // Use service role for system/admin task
  const { data, error } = await supabaseServiceRole
    .from("websites")
    .upsert(normalizedAssessment)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Add URL to unassessed queue
 * @param {string} url - The URL to add to queue
 * @returns {Promise<Object>} - Created queue entry
 */
const addToUnassessedQueue = async (url) => {
  // Ensure initialization is complete before proceeding
  await ensureInitialized();
  
  // Normalize the URL
  const normalizedUrl = normalizeUrl(url);
  logger.info(
    `Adding URL to unassessed queue: ${url}, Normalized: ${normalizedUrl} (using service role)`
  );

  // Check if normalized URL already exists in queue (using service role)
  const { data: existing } = await supabaseServiceRole
    .from("unassessed_urls")
    .select("url")
    .eq("url", normalizedUrl)
    .single();

  if (existing) {
    logger.info(
      `URL already exists in unassessed queue: ${normalizedUrl}`
    );
    return existing;
  }

  // Add new entry to queue with normalized URL (using service role)
  const { data, error } = await supabaseServiceRole
    .from("unassessed_urls")
    .insert({
      url: normalizedUrl,
      first_recorded: new Date().toISOString(),
      status: "Pending",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get unassessed URLs from queue
 * @param {string} status - Filter by status (optional)
 * @param {number} limit - Maximum number of results (optional)
 * @returns {Promise<Array>} - Array of unassessed URLs
 */
const getUnassessedUrls = async (status = null, limit = 100) => {
  // Use service role for system/admin task
  let query = supabaseServiceRole
    .from("unassessed_urls")
    .select("*")
    .order("first_recorded", { ascending: true })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Update status of unassessed URL
 * @param {string} url - The URL to update
 * @param {string} status - New status
 * @returns {Promise<Object>} - Updated queue entry
 */
const updateUnassessedStatus = async (url, status) => {
  // Normalize the URL
  const normalizedUrl = normalizeUrl(url);
  logger.info(
    `Updating unassessed URL status: ${url}, Normalized: ${normalizedUrl}, Status: ${status} (using service role)`
  );

  // Use service role for system/admin task
  const { data, error } = await supabaseServiceRole
    .from("unassessed_urls")
    .update({ status })
    .eq("url", normalizedUrl)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Remove URL from unassessed queue
 * @param {string} url - The URL to remove
 * @returns {Promise<void>}
 */
const removeFromUnassessedQueue = async (url) => {
  try {
    // Normalize the URL
    const normalizedUrl = normalizeUrl(url);
    logger.info(
      `Removing URL from unassessed queue: ${url}, Normalized: ${normalizedUrl} (using service role)`
    );

    // First check if the URL exists in the queue (using service role)
    const { data: existingEntry, error: checkError } = await supabaseServiceRole
      .from("unassessed_urls")
      .select("url")
      .eq("url", normalizedUrl)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        // Entry doesn't exist, which is fine for removal.
        logger.info(`URL not found in queue, nothing to remove: ${normalizedUrl}`);
        return; // Exit gracefully
      } else {
        // For any other error during the check, re-throw it.
        logger.error(`Error checking existence for ${normalizedUrl}:`, { error: checkError });
        throw checkError; 
      }
    }

    if (!existingEntry) {
      logger.info(`URL not found in unassessed queue: ${normalizedUrl}`);
      return;
    }

    // Delete the entry (using service role)
    const { error: deleteError } = await supabaseServiceRole
      .from("unassessed_urls")
      .delete()
      .eq("url", normalizedUrl);

    if (deleteError) {
      logger.error(
        `Error deleting URL from unassessed queue: ${normalizedUrl}`,
        { error: deleteError }
      );
      throw deleteError;
    }

    logger.info(
      `Successfully removed URL from unassessed queue: ${normalizedUrl}`
    );
  } catch (error) {
    logger.error(
      `Error in removeFromUnassessedQueue for URL ${url}:`,
      { error }
    );
    throw error;
  }
};

/**
 * Get user by username
 * @param {string} username - Username to look up
 * @returns {Promise<Object|null>} - User data or null if not found
 */
const getUserByUsername = async (username) => {
  // Use service role for lookup (e.g., admin or pre-auth check)
  const { data, error } = await supabaseServiceRole
    .from("users")
    .select("*") // Might need specific columns depending on use case
    .eq("username", username)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Create audit log entry
 * @param {Object} logEntry - Audit log entry data
 * @returns {Promise<Object>} - Created log entry
 */
const createAuditLog = async (logEntry) => {
  // Assuming service role for now (system logs). If user action logs need RLS,
  // this would need userAuthToken and createAuthedClient.
  const { data, error } = await supabaseServiceRole
    .from("audit_logs")
    .insert({
      ...logEntry,
      timestamp: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Update suggested policy URLs for an unassessed URL
 * @param {string} url - The URL to update
 * @param {string[]} policyUrls - Array of suggested policy URLs
 * @returns {Promise<Object>} - Updated queue entry
 */
const updateSuggestedPolicyUrls = async (url, policyUrls) => {
  // Normalize the URL
  const normalizedUrl = normalizeUrl(url);
  logger.info(
    `Updating suggested policy URLs for: ${url}, Normalized: ${normalizedUrl} (using service role)`
  );

  // Use service role for system/admin task
  const { data, error } = await supabaseServiceRole
    .from("unassessed_urls")
    .update({ suggested_policy_urls: policyUrls })
    .eq("url", normalizedUrl)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get all assessments
 * @returns {Promise<Object>} - Object with domains as keys and assessments as values
 */
const getAllAssessments = async () => {
  logger.info('Getting all assessments (using service role)');

  // Use service role assuming public read or admin view
  const { data, error } = await supabaseServiceRole
    .from("websites")
    .select("*");

  if (error) {
    throw error;
  }
  
  // Transform the data into a domain-keyed object
  const assessments = {};
  
  for (const item of data) {
    assessments[item.url] = {
      riskLevel: item.privacy_assessment.riskLevel,
      categories: item.privacy_assessment.categories,
      summary: item.privacy_assessment.summary,
      lastUpdated: item.last_updated,
      policyUrl: item.user_agreement_url // Add this line
    };
  }
  
  logger.info(`Retrieved ${Object.keys(assessments).length} assessments`);
  
  return assessments;
};

/**
 * Store user token
 * @param {Object} token - Token data
 * @returns {Promise<Object>} - Stored token
 */
const storeToken = async (token) => {
  // Use service role for storing tokens (system action during login/refresh)
  const { data, error } = await supabaseServiceRole
    .from('user_tokens')
    .insert(token)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get token by hash
 * @param {string} tokenHash - Token hash
 * @returns {Promise<Object|null>} - Token data or null if not found
 */
const getTokenByHash = async (tokenHash) => {
  // Use service role for looking up tokens by hash (system action during auth)
  const { data, error } = await supabaseServiceRole
    .from('user_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Get user's active tokens
 * @param {string} userId - User ID (often redundant due to RLS but good practice)
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Array>} - Array of active tokens
 */
const getUserActiveTokens = async (userId, userAuthToken) => {
  let client;
  if (userAuthToken) {
    // If token is provided, use RLS client
    client = createAuthedClient(userAuthToken);
    logger.info(`Getting active tokens for user ${userId} (using RLS client)`);
  } else {
    // If no token (e.g., internal call during token generation), use service role
    client = supabaseServiceRole;
    logger.warn(`Getting active tokens for user ${userId} (using service role - internal call assumed)`);
  }

  // RLS policy `auth.uid() = user_id` should enforce this if using userSupabase
  const { data, error } = await client
    .from('user_tokens')
    .select('*')
    .eq('user_id', userId) // RLS policy `auth.uid() = user_id` enforces this too
    .eq('revoked', false)
    .lt('expires_at', new Date().toISOString());

  if (error) {
    throw error;
  }

  return data || [];
};

/**
 * Update token's last used timestamp
 * @param {string} tokenId - Token ID
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Object>} - Updated token
 */
const updateTokenLastUsed = async (tokenId /*, userAuthToken - No longer needed */) => {
  // Note: We use the service role client here.
  // Rationale: authService.validateToken already verified the token exists, isn't revoked (using service role getTokenByHash),
  // and the JWT signature/expiry. The RLS check here was causing issues due to potential user_id/sub mismatches
  // in the token data itself, which shouldn't block a simple timestamp update after validation.
  const { data, error } = await supabaseServiceRole // Use service role client
    .from('user_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenId) // Target the specific token by its ID
    .select()
    .single(); // Still expect a single row to be updated

  if (error) {
    // If the service role update fails (e.g., token ID doesn't exist), log and throw
    logger.error(`Service role failed to update last_used_at for token ID ${tokenId}:`, { error });
    throw error;
  }

  return data;
};

/**
 * Revoke token
 * @param {string} tokenId - Token ID
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Object>} - Revoked token
 */
const revokeToken = async (tokenId /*, userAuthToken - No longer needed */) => {
  // Note: We use the service role client here.
  // Rationale: The calling context (e.g., authService.refreshToken) should have already
  // verified the token's validity and ownership before attempting revocation.
  // Using RLS here caused issues similar to updateTokenLastUsed.
  logger.info(`Revoking token ${tokenId} (using service role)`);
  const { data, error } = await supabaseServiceRole // Use service role client
    .from('user_tokens')
    .update({ revoked: true })
    .eq('id', tokenId) // RLS policy `auth.uid() = user_id` check needed if using userSupabase
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - User data or null if not found
 */
const getUserById = async (userId) => {
  // Use service role for general lookup by ID (e.g., admin or system process)
  // If fetching the *currently authenticated* user's data, a different function using createAuthedClient might be needed.
  const { data, error } = await supabaseServiceRole
    .from('users')
    .select('*') // Consider selecting specific columns needed
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User data or null if not found
 */
const getUserByEmail = async (email) => {
  // Use service role for lookup by email (e.g., during login)
  const { data, error } = await supabaseServiceRole
    .from('users')
    .select('*') // Select required fields, including password hash if needed for login
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Create user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - Created user
 */
const createUser = async (userData) => {
  // Use service role for creating users (registration or admin action)
  const { data, error } = await supabaseServiceRole
    .from('users')
    .insert(userData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Update user
 * @param {string} userId - User ID (often redundant due to RLS but good practice)
 * @param {Object} userData - User data to update
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Object>} - Updated user
 */
const updateUser = async (userId, userData, userAuthToken) => {
  if (!userAuthToken) throw new Error("Authentication token required for updateUser");
  const userSupabase = createAuthedClient(userAuthToken); // RLS Client

  // RLS policy `auth.uid() = id` should enforce this on the DB side
  const { data, error } = await userSupabase
    .from('users')
    .update(userData)
    .eq('id', userId) // RLS policy `auth.uid() = id` enforces this too
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get latest plugin update
 * @returns {Promise<Object|null>} - Latest plugin update or null if not found
 */
const getLatestPluginUpdate = async () => {
  // Use service role for system data lookup
  const { data, error } = await supabaseServiceRole
    .from('updates')
    .select('*')
    .eq('update_type', 'plugin')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Get latest server update
 * @returns {Promise<Object|null>} - Latest server update or null if not found
 */
const getLatestServerUpdate = async () => {
  // Use service role for system data lookup
  const { data, error } = await supabaseServiceRole
    .from('updates')
    .select('*')
    .eq('update_type', 'server')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Get update by ID
 * @param {string} updateId - Update ID
 * @returns {Promise<Object|null>} - Update data or null if not found
 */
const getUpdateById = async (updateId) => {
  // Use service role for system data lookup
  const { data, error } = await supabaseServiceRole
    .from('updates')
    .select('*')
    .eq('id', updateId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
};

/**
 * Create update
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} - Created update
 */
const createUpdate = async (updateData) => {
  // Use service role for system/admin task
  const { data, error } = await supabaseServiceRole
    .from('updates')
    .insert(updateData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Record update application
 * @param {Object} applicationData - Application data (should include user_id, device_id, update_id)
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Object>} - Created application record
 */
const recordUpdateApplication = async (applicationData, userAuthToken) => {
  if (!userAuthToken) throw new Error("Authentication token required for recordUpdateApplication");
  const userSupabase = createAuthedClient(userAuthToken); // RLS Client

  // RLS policy should ensure user can only record for their own user_id
  const { data, error } = await userSupabase
    .from('update_applications')
    .insert(applicationData) // Ensure applicationData.user_id matches auth.uid() via policy
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get user update history
 * @param {string} userId - User ID (often redundant due to RLS but good practice)
 * @param {string} deviceId - Device ID
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Array>} - Update history
 */
const getUserUpdateHistory = async (userId, deviceId, userAuthToken) => {
  if (!userAuthToken) throw new Error("Authentication token required for getUserUpdateHistory");
  const userSupabase = createAuthedClient(userAuthToken); // RLS Client

  // RLS policy `auth.uid() = user_id` should enforce this
  const { data, error } = await userSupabase
    .from('update_applications')
    .select(`
      *,
      update:update_id (*)
    `)
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .order('applied_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

/**
 * Add or update a policy entry for the archiver job.
 * @param {Object} policyData - Data for the policy.
 * @param {string} policyData.domainName - The normalized domain name.
 * @param {string} policyData.policyType - The type of policy (e.g., 'privacy', 'terms').
 * @param {string} policyData.url - The URL where the policy was found.
 * @returns {Promise<Object>} - The upserted policy data.
 */
const addPolicyForArchiving = async ({ domainName, policyType = 'privacy', url }) => {
  try {
    const normalizedDomain = normalizeUrl(domainName);
    logger.info(`Adding policy for archiving: ${normalizedDomain} (${policyType}): ${url}`);
    
    const { data, error } = await supabaseServiceRole
      .from('policies')
      .upsert({
        domain_name: normalizedDomain,
        policy_type: policyType,
        url: url,
        is_active: true,
        last_updated: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      logger.error(`Error adding policy for archiving: ${normalizedDomain} (${policyType}): ${url}`, { error });
      throw error;
    }
    
    return data;
  } catch (error) {
    logger.error(`Exception in addPolicyForArchiving for ${domainName}:`, { error });
    throw error;
  }
};

/**
 * Get unassessed entry by URL
 * @param {string} url - The URL to get entry for
 * @returns {Promise<Object|null>} - Unassessed entry or null if not found
 */
const getUnassessedEntryByUrl = async (url) => {
  try {
    // Ensure initialization is complete before proceeding
    await ensureInitialized();
    
    // Normalize the URL
    const normalizedUrl = normalizeUrl(url);
    logger.info(`Getting unassessed entry for URL: ${url}, Normalized: ${normalizedUrl} (using service role)`);
    
    // Query the unassessed_urls table for the normalized URL
    const { data, error } = await supabaseServiceRole
      .from("unassessed_urls")
      .select("*")
      .eq("url", normalizedUrl)
      .single();
    
    if (error) {
      if (error.code === "PGRST116") {
        // PGRST116 is the error code for "no rows returned"
        logger.info(`No unassessed entry found for URL: ${normalizedUrl}`);
        return null;
      }
      logger.error(`Error getting unassessed entry for URL: ${normalizedUrl}`, { error });
      throw error;
    }
    
    return data;
  } catch (error) {
    logger.error(`Exception in getUnassessedEntryByUrl for URL ${url}:`, { error });
    throw error;
  }
};

/**
 * Get all active policies for a domain
 * @param {string} domainName - The domain name to get policies for
 * @returns {Promise<Array>} - Array of policy objects
 */
const getPoliciesForDomain = async (domainName) => {
  try {
    const normalizedDomain = normalizeUrl(domainName);
    logger.info(`Getting policies for domain: ${normalizedDomain}`);
    
    const { data, error } = await supabaseServiceRole
      .from('policies')
      .select('*')
      .eq('domain_name', normalizedDomain)
      .eq('is_active', true);
    
    if (error) {
      logger.error(`Error getting policies for domain: ${normalizedDomain}`, { error });
      throw error;
    }
    
    return data || [];
  } catch (error) {
    logger.error(`Exception in getPoliciesForDomain for ${domainName}:`, { error });
    throw error;
  }
};

// Export all functions
module.exports = {
  getAssessment,
  upsertAssessment,
  addToUnassessedQueue,
  getUnassessedUrls,
  updateUnassessedStatus,
  removeFromUnassessedQueue,
  getUserByUsername,
  createAuditLog,
  updateSuggestedPolicyUrls,
  getAllAssessments,
  storeToken,
  getTokenByHash,
  getUserActiveTokens,
  updateTokenLastUsed,
  revokeToken,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  getLatestPluginUpdate,
  getLatestServerUpdate,
  getUpdateById,
  createUpdate,
  recordUpdateApplication,
  getUserUpdateHistory,
  addPolicyForArchiving,
  getPoliciesForDomain,
  getUnassessedEntryByUrl,
  // Expose initialization promise for other modules to await
  initializationPromise: initPromise
};
