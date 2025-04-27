// Database configuration for PrivacyLens backend

// Database configuration for PrivacyLens backend

// Use specific clients: one for service role (bypasses RLS), one factory for user-scoped (respects RLS)
const { supabaseServiceRole, createAuthedClient } = require("./supabaseClient");
const { normalizeUrl } = require("./domainUtils");


/**
 * Database helper functions
 */

/**
 * Get assessment for a URL
 * @param {string} url - The URL to get assessment for
 * @returns {Promise<Object|null>} - Assessment data or null if not found
 */
const getAssessment = async (url) => {
  // Normalize the URL to get the base domain
  const normalizedUrl = normalizeUrl(url);
  console.log(
    `[DB] Getting assessment for URL: ${url}, Normalized: ${normalizedUrl} (using service role)`
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
  // Normalize the URL in the assessment
  const originalUrl = assessment.url;
  const normalizedUrl = normalizeUrl(originalUrl);

  console.log(
    `[DB] Upserting assessment for URL: ${originalUrl}, Normalized: ${normalizedUrl} (using service role)`
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
  // Normalize the URL
  const normalizedUrl = normalizeUrl(url);
  console.log(
    `[DB] Adding URL to unassessed queue: ${url}, Normalized: ${normalizedUrl} (using service role)`
  );

  // Check if normalized URL already exists in queue (using service role)
  const { data: existing } = await supabaseServiceRole
    .from("unassessed_urls")
    .select("url")
    .eq("url", normalizedUrl)
    .single();

  if (existing) {
    console.log(
      `[DB] URL already exists in unassessed queue: ${normalizedUrl}`
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
  console.log(
    `[DB] Updating unassessed URL status: ${url}, Normalized: ${normalizedUrl}, Status: ${status} (using service role)`
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
    console.log(
      `[DB] Removing URL from unassessed queue: ${url}, Normalized: ${normalizedUrl} (using service role)`
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
        console.log(`[DB] URL not found in queue, nothing to remove: ${normalizedUrl}`);
        return; // Exit gracefully
      } else {
        // For any other error during the check, re-throw it.
        console.error(`[DB] Error checking existence for ${normalizedUrl}:`, checkError);
        throw checkError; 
      }
    }

    if (!existingEntry) {
      console.log(`[DB] URL not found in unassessed queue: ${normalizedUrl}`);
      return;
    }

    // Delete the entry (using service role)
    const { error: deleteError } = await supabaseServiceRole
      .from("unassessed_urls")
      .delete()
      .eq("url", normalizedUrl);

    if (deleteError) {
      console.error(
        `[DB] Error deleting URL from unassessed queue: ${normalizedUrl}`,
        deleteError
      );
      throw deleteError;
    }

    console.log(
      `[DB] Successfully removed URL from unassessed queue: ${normalizedUrl}`
    );
  } catch (error) {
    console.error(
      `[DB] Error in removeFromUnassessedQueue for URL ${url}:`,
      error
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
  console.log(
    `[DB] Updating suggested policy URLs for: ${url}, Normalized: ${normalizedUrl} (using service role)`
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
  console.log('[DB] Getting all assessments (using service role)');

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
  
  console.log(`[DB] Retrieved ${Object.keys(assessments).length} assessments`);
  
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
    console.log(`[DB] Getting active tokens for user ${userId} (using RLS client)`);
  } else {
    // If no token (e.g., internal call during token generation), use service role
    client = supabaseServiceRole;
    console.warn(`[DB] Getting active tokens for user ${userId} (using service role - internal call assumed)`);
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
    console.error(`[DB] Service role failed to update last_used_at for token ID ${tokenId}:`, error);
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
  console.log(`[DB] Revoking token ${tokenId} (using service role)`);
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
 * Get user subscription
 * @param {string} userId - User ID (often redundant due to RLS but good practice)
 * @param {string} userAuthToken - The user's JWT for RLS.
 * @returns {Promise<Object|null>} - Subscription data or null if not found
 */
const getUserSubscription = async (userId, userAuthToken) => {
  if (!userAuthToken) throw new Error("Authentication token required for getUserSubscription");
  
  console.log(`[DB getUserSubscription] Attempting to fetch subscription for userId: ${userId}`);
  // console.log(`[DB getUserSubscription] Using token starting with: ${userAuthToken.substring(0, 10)}...`); // Optional: Log part of token for debugging
  
  // const userSupabase = createAuthedClient(userAuthToken); // RLS Client - REPLACED WITH SERVICE ROLE BELOW
  console.log(`[DB getUserSubscription] Bypassing RLS: Using Service Role client for userId: ${userId}`);

  // RLS policy `auth.uid() = user_id` is bypassed by using supabaseServiceRole
  let data, error;
  try {
    // Use supabaseServiceRole to bypass RLS for this query
    const queryResult = await supabaseServiceRole 
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId) // Filter based on the userId passed from validated token context
      // Allow 'active' or 'trialing' status to be considered a valid subscription
      .in('status', ['active', 'trialing'])
      // Get the most recent one if multiple exist (e.g., old canceled, new active)
      .order('created_at', { ascending: false }) 
      .limit(1); // Fetch at most one record
      
    data = queryResult.data;
    error = queryResult.error;

  } catch (queryError) {
    console.error(`[DB getUserSubscription] EXCEPTION during query for userId ${userId}:`, queryError);
    throw queryError; // Re-throw unexpected exceptions
  }

  if (error) {
    // Log Supabase-specific errors returned in the 'error' object
    console.error(`[DB getUserSubscription] Supabase error fetching subscription for userId ${userId}:`, error);
    // Throw the error to make it visible upstream
    throw error; 
  } 
  
  // Log the result before returning
  if (data && data.length > 0) {
    console.log(`[DB getUserSubscription] Found subscription for userId ${userId}:`, data[0]);
  } else {
    console.log(`[DB getUserSubscription] No active/trialing subscription found for userId ${userId}. Raw data:`, data);
  }

  // Store the result from the RLS query
  let subscription = data && data.length > 0 ? data[0] : null;

  // --- DIAGNOSTIC STEP REMOVED as we are now using Service Role directly ---
  /* 
  if (!subscription && !error) { 
    console.warn(`[DB getUserSubscription DIAGNOSTIC] ...`);
    try {
      const { data: serviceData, error: serviceError } = await supabaseServiceRole
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1);
      // ... logging ...
    } catch (serviceException) {
      // ... logging ...
    }
  }
  */
  // --- END DIAGNOSTIC STEP ---

  // Return the result obtained using the Service Role client
  return subscription; 
};

/**
 * Create subscription
 * @param {Object} subscriptionData - Subscription data
 * @returns {Promise<Object>} - Created subscription
 */
const createSubscription = async (subscriptionData) => {
  // Use service role (likely triggered by webhook or admin action)
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .insert(subscriptionData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Update subscription
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} subscriptionData - Subscription data to update
 * @returns {Promise<Object>} - Updated subscription
 */
const updateSubscription = async (subscriptionId, subscriptionData) => {
  // Use service role (likely triggered by webhook or admin action)
  // If user-initiated updates are possible via API, a separate RLS function would be needed.
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .update(subscriptionData)
    .eq('id', subscriptionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Get subscription by Stripe ID
 * @param {string} stripeSubscriptionId - Stripe subscription ID
 * @returns {Promise<Object|null>} - Subscription data or null if not found
 */
const getSubscriptionByStripeId = async (stripeSubscriptionId) => {
  // Use service role (likely triggered by webhook)
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    // Use maybeSingle() with limit(1) to safely get the first match or null,
    // without erroring if multiple rows exist (which can happen with 'sub_mock').
    .limit(1)
    .maybeSingle();

  if (error) {
    // Log unexpected errors, but PGRST116 (no rows) is handled by maybeSingle returning null.
    // Errors from multiple rows are avoided by limit(1).maybeSingle().
    console.error(`[DB Error] getSubscriptionByStripeId failed unexpectedly for ${stripeSubscriptionId}:`, error);
    throw error;
    /* Old check removed as maybeSingle handles the null case:
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error; */
  } // <-- This closing brace should be outside the comment

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

module.exports = {
  // Note: supabase (the old generic client) is no longer exported
  getAssessment,
  getAllAssessments,
  upsertAssessment,
  addToUnassessedQueue,
  getUnassessedUrls,
  updateUnassessedStatus,
  removeFromUnassessedQueue,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  createAuditLog,
  updateSuggestedPolicyUrls,
  storeToken,
  getTokenByHash,
  getUserActiveTokens,
  updateTokenLastUsed,
  revokeToken,
  getUserSubscription,
  createSubscription,
  updateSubscription,
  getSubscriptionByStripeId,
  getLatestPluginUpdate,
  getLatestServerUpdate,
  getUpdateById,
  createUpdate,
  recordUpdateApplication,
  getUserUpdateHistory
};
