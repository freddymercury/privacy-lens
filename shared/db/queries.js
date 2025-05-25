const { supabaseServiceRole } = require('./client');

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User data or null if not found
 */
async function getUserByEmail(email) {
  const { data, error } = await supabaseServiceRole
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - User data or null if not found
 */
async function getUserById(userId) {
  const { data, error } = await supabaseServiceRole
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Create user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - Created user
 */
async function createUser(userData) {
  const { data, error } = await supabaseServiceRole
    .from('users')
    .insert(userData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Create audit log entry
 * @param {Object} logData - Audit log data
 * @returns {Promise<Object>} - Created audit log entry
 */
async function createAuditLog(logData) {
  const { data, error } = await supabaseServiceRole
    .from('audit_logs')
    .insert({
      ...logData,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Store JWT token in database
 * @param {string} tokenHash - Hashed token
 * @param {Object} metadata - Token metadata
 * @returns {Promise<Object>} - Stored token record
 */
async function storeToken(tokenHash, metadata) {
  const { data, error } = await supabaseServiceRole
    .from('user_tokens')
    .insert({
      token_hash: tokenHash,
      ...metadata,
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get token by hash
 * @param {string} tokenHash - Token hash
 * @returns {Promise<Object|null>} - Token data or null if not found
 */
async function getTokenByHash(tokenHash) {
  const { data, error } = await supabaseServiceRole
    .from('user_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('revoked', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Revoke token by hash
 * @param {string} tokenHash - Token hash
 * @returns {Promise<boolean>} - Success status
 */
async function revokeToken(tokenHash) {
  const { error } = await supabaseServiceRole
    .from('user_tokens')
    .update({ 
      revoked: true,
      updated_at: new Date().toISOString()
    })
    .eq('token_hash', tokenHash);

  return !error;
}

/**
 * Update token last used time
 * @param {string} tokenHash - Token hash
 * @returns {Promise<boolean>} - Success status
 */
async function updateTokenLastUsed(tokenHash) {
  const { error } = await supabaseServiceRole
    .from('user_tokens')
    .update({ 
      last_used_at: new Date().toISOString()
    })
    .eq('token_hash', tokenHash);

  return !error;
}

/**
 * Get user subscription
 * @param {string} userId - User ID
 * @param {string} token - User token for RLS
 * @returns {Promise<Object|null>} - Subscription data or null if not found
 */
async function getUserSubscription(userId, token) {
  // This would use createAuthedClient if RLS is required
  // For now, using service role for simplicity
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Update user
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @param {string} token - User token for RLS
 * @returns {Promise<Object>} - Updated user
 */
async function updateUser(userId, updateData, token) {
  const { data, error } = await supabaseServiceRole
    .from('users')
    .update({
      ...updateData,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get subscription by Stripe ID
 * @param {string} stripeSubscriptionId - Stripe subscription ID
 * @returns {Promise<Object|null>} - Subscription data or null if not found
 */
async function getSubscriptionByStripeId(stripeSubscriptionId) {
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Create subscription
 * @param {Object} subscriptionData - Subscription data
 * @returns {Promise<Object>} - Created subscription
 */
async function createSubscription(subscriptionData) {
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .insert(subscriptionData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update subscription
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated subscription
 */
async function updateSubscription(subscriptionId, updateData) {
  const { data, error } = await supabaseServiceRole
    .from('subscriptions')
    .update({
      ...updateData,
      updated_at: new Date().toISOString()
    })
    .eq('id', subscriptionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  createAuditLog,
  storeToken,
  getTokenByHash,
  revokeToken,
  updateTokenLastUsed,
  getUserSubscription,
  updateUser,
  getSubscriptionByStripeId,
  createSubscription,
  updateSubscription
}; 