/**
 * Users Database Module for PrivacyLens
 * 
 * This module provides functions for working with users.
 */

import { getSupabaseAdminClient, getSupabaseClientWithContext, executeWithRetry, logDatabaseOperation } from './index.js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize logger
const logger = createLogger('UsersDB');

// Table names
const USERS_TABLE = 'users';
const AUDIT_LOGS_TABLE = 'audit_logs';
const TOKENS_TABLE = 'tokens';

/**
 * Get a user by ID
 * @param {string} id - User ID
 * @returns {Promise<Object>} - User object
 */
export async function getUserById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(USERS_TABLE)
        .select(`
          *
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getUserById', USERS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting user by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get a user by email
 * @param {string} email - User email
 * @returns {Promise<Object>} - User object
 */
export async function getUserByEmail(email) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      if (!supabase) {
        logger.error('Supabase client not initialized');
        throw new Error('Database connection not configured');
      }
      
      return await supabase
        .from(USERS_TABLE)
        .select(`
          *
        `)
        .eq('email', email.toLowerCase())
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getUserByEmail', USERS_TABLE, { email }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting user by email', { error: error.message, stack: error.stack, email });
    throw error;
  }
}

/**
 * Create a new user
 * @param {Object} userData - User data
 * @param {string} userData.email - User email
 * @param {string} userData.password - User password (optional for OAuth users)
 * @param {string} userData.firstName - User first name
 * @param {string} userData.lastName - User last name
 * @param {Array<string>} userData.roleIds - Role IDs to assign to the user
 * @param {string} userData.organizationId - Organization ID to add the user to
 * @param {Object} userData.metadata - User metadata
 * @returns {Promise<Object>} - Created user object
 */
export async function createUser(userData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from(USERS_TABLE)
        .select('id')
        .eq('email', userData.email.toLowerCase())
        .single();
      
      if (!checkError && existingUser) {
        return { data: null, error: new Error('User with this email already exists') };
      }
      
      // Create the user in auth
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email.toLowerCase(),
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          first_name: userData.firstName,
          last_name: userData.lastName
        }
      });
      
      if (authError) {
        throw authError;
      }
      
      const userId = authUser.user.id;
      
      // Create audit log
      const { error: auditError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .insert({
          id: uuidv4(),
          user_id: context?.userId || null,
          action: 'user.create',
          resource_type: 'user',
          resource_id: userId,
          metadata: {
            email: userData.email,
            first_name: userData.firstName,
            last_name: userData.lastName
          },
          created_at: new Date().toISOString()
        });
      
      if (auditError) {
        logger.warn('Error creating audit log', { error: auditError.message, userId });
      }
      
      // Get the full user with profile, roles, and permissions
      return await getUserById(userId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createUser', USERS_TABLE, { email: userData.email }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating user', { error: error.message, stack: error.stack, email: userData.email });
    throw error;
  }
}

/**
 * Update a user
 * @param {string} id - User ID
 * @param {Object} userData - User data to update
 * @returns {Promise<Object>} - Updated user object
 */
export async function updateUser(id, userData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update user in auth if email or password is provided
      if (userData.email || userData.password) {
        const authUpdateData = {};
        
        if (userData.email) {
          authUpdateData.email = userData.email.toLowerCase();
        }
        
        if (userData.password) {
          authUpdateData.password = userData.password;
        }
        
        const { error: authError } = await supabase.auth.admin.updateUserById(
          id,
          authUpdateData
        );
        
        if (authError) {
          throw authError;
        }
      }
      
      // Update user profile
      const profileUpdateData = {};
      let profileUpdated = false;
      
      if (userData.firstName !== undefined) {
        profileUpdateData.first_name = userData.firstName;
        profileUpdated = true;
      }
      
      if (userData.lastName !== undefined) {
        profileUpdateData.last_name = userData.lastName;
        profileUpdated = true;
      }
      
      if (userData.firstName !== undefined || userData.lastName !== undefined) {
        // Get current profile data
        const { data: profile, error: profileError } = await supabase
          .from(USERS_TABLE)
          .select('first_name, last_name')
          .eq('id', id)
          .single();
        
        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }
        
        const firstName = userData.firstName !== undefined ? userData.firstName : (profile?.first_name || '');
        const lastName = userData.lastName !== undefined ? userData.lastName : (profile?.last_name || '');
        
        profileUpdateData.display_name = `${firstName} ${lastName}`;
        profileUpdated = true;
      }
      
      if (userData.metadata !== undefined) {
        profileUpdateData.metadata = userData.metadata;
        profileUpdated = true;
      }
      
      if (profileUpdated) {
        profileUpdateData.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from(USERS_TABLE)
          .update(profileUpdateData)
          .eq('id', id);
        
        if (updateError) {
          throw updateError;
        }
      }
      
      // Create audit log
      const { error: auditError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .insert({
          id: uuidv4(),
          user_id: context?.userId || null,
          action: 'user.update',
          resource_type: 'user',
          resource_id: id,
          metadata: {
            ...userData,
            password: userData.password ? '********' : undefined
          },
          created_at: new Date().toISOString()
        });
      
      if (auditError) {
        logger.warn('Error creating audit log', { error: auditError.message, userId: id });
      }
      
      // Get the full user with profile, roles, and permissions
      return await getUserById(id);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateUser', USERS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating user', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Delete a user
 * @param {string} id - User ID
 * @returns {Promise<Object>} - Deleted user object
 */
export async function deleteUser(id) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Get the user first
      const { data: user, error: getError } = await getUserById(id);
      
      if (getError) {
        throw getError;
      }
      
      // Delete the user from auth
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      
      if (authError) {
        throw authError;
      }
      
      // Create audit log
      const { error: auditError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .insert({
          id: uuidv4(),
          user_id: context?.userId || null,
          action: 'user.delete',
          resource_type: 'user',
          resource_id: id,
          metadata: {
            email: user.email
          },
          created_at: new Date().toISOString()
        });
      
      if (auditError) {
        logger.warn('Error creating audit log', { error: auditError.message, userId: id });
      }
      
      return { data: user, error: null };
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('deleteUser', USERS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error deleting user', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get users
 * @param {Object} options - Query options
 * @param {string} options.email - Filter by email
 * @param {string} options.roleId - Filter by role ID
 * @param {string} options.organizationId - Filter by organization ID
 * @param {number} options.limit - Maximum number of users to return
 * @param {number} options.offset - Number of users to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Users object
 */
export async function getUsers(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(USERS_TABLE)
        .select(`
          *
        `);
      
      // Apply filters
      if (options.email) {
        query = query.ilike('email', `%${options.email}%`);
      }
      
      // Apply sorting
      if (options.sortBy) {
        const order = options.sortDesc ? 'desc' : 'asc';
        query = query.order(options.sortBy, { ascending: !options.sortDesc });
      } else {
        // Default sort by created_at desc
        query = query.order('created_at', { ascending: false });
      }
      
      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }
      
      return await query;
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getUsers', USERS_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting users', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get a token by its hash
 * @param {string} tokenHash - The hash of the token
 * @returns {Promise<Object>} - Token object or null
 */
export async function getTokenByHash(tokenHash) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      return await supabase
        .from(TOKENS_TABLE)
        .select('*')
        .eq('token_hash', tokenHash)
        .single();
    };
    const result = await executeWithRetry(operation);
    logDatabaseOperation('getTokenByHash', TOKENS_TABLE, { tokenHash }, result);
    return result.data;
  } catch (error) {
    logger.error('Error getting token by hash', { error: error.message, stack: error.stack, tokenHash });
    throw error;
  }
}

/**
 * Revoke (delete) a token by its ID
 * @param {string} tokenId - The ID of the token to revoke
 * @returns {Promise<Object>} - Result of the delete operation
 */
export async function revokeToken(tokenId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      return await supabase
        .from(TOKENS_TABLE)
        .delete()
        .eq('id', tokenId);
    };
    const result = await executeWithRetry(operation);
    logDatabaseOperation('revokeToken', TOKENS_TABLE, { tokenId }, result);
    return result;
  } catch (error) {
    logger.error('Error revoking token', { error: error.message, stack: error.stack, tokenId });
    throw error;
  }
}

/**
 * Store a token in the tokens table
 * @param {Object} params - Token parameters
 * @param {string} params.userId - User ID
 * @param {string} params.tokenHash - Token hash
 * @param {string} [params.tokenType] - Token type (e.g., 'refresh', 'api_key')
 * @param {string} params.expiresAt - Expiry date (ISO string)
 * @param {string} [params.userAgent] - User agent
 * @param {string} [params.ip] - IP address
 * @returns {Promise<Object>} - Created token object
 */
export async function storeToken({ userId, tokenHash, tokenType = 'refresh', expiresAt, userAgent = null, ip = null }) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      return await supabase
        .from(TOKENS_TABLE)
        .insert({
          id: uuidv4(),
          user_id: userId,
          token_hash: tokenHash,
          token_type: tokenType,
          expires_at: expiresAt,
          user_agent: userAgent,
          ip_address: ip,
          created_at: new Date().toISOString(),
          last_used_at: new Date().toISOString()
        })
        .select()
        .single();
    };
    const result = await executeWithRetry(operation);
    logDatabaseOperation('storeToken', TOKENS_TABLE, { userId, tokenType }, result);
    return result.data;
  } catch (error) {
    logger.error('Error storing token', { error: error.message, stack: error.stack, userId });
    throw error;
  }
}

/**
 * Update the last_used_at timestamp for a token
 * @param {string} tokenId - The ID of the token
 * @returns {Promise<Object>} - Updated token object
 */
export async function updateTokenLastUsed(tokenId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      return await supabase
        .from(TOKENS_TABLE)
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', tokenId)
        .select()
        .single();
    };
    const result = await executeWithRetry(operation);
    logDatabaseOperation('updateTokenLastUsed', TOKENS_TABLE, { tokenId }, result);
    return result.data;
  } catch (error) {
    logger.error('Error updating token last used', { error: error.message, stack: error.stack, tokenId });
    throw error;
  }
}
