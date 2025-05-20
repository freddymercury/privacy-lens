/**
 * Database Module for PrivacyLens
 * 
 * This module provides a unified interface for database operations.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';

// Initialize logger
const logger = createLogger('Database');

// Supabase client instances
let supabaseClient = null;
let supabaseAdminClient = null;

/**
 * Initialize the database connection
 * @param {Object} options - Database connection options
 * @returns {Object} - Supabase client
 */
export function initDatabase(options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
  const supabaseServiceKey = options.supabaseServiceKey || process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and key are required');
  }
  
  // Create the client
  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });
  
  // Create the admin client if service key is provided
  if (supabaseServiceKey) {
    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });
  } else {
    supabaseAdminClient = supabaseClient;
  }
  
  logger.info('Database initialized');
  
  return supabaseClient;
}

/**
 * Get the Supabase client
 * @returns {Object} - Supabase client
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    initDatabase();
  }
  
  return supabaseClient;
}

/**
 * Get the Supabase admin client
 * @returns {Object} - Supabase admin client
 */
export function getSupabaseAdminClient() {
  if (!supabaseAdminClient) {
    initDatabase();
  }
  
  return supabaseAdminClient;
}

/**
 * Get the Supabase client with context
 * @returns {Object} - Supabase client with context
 */
export function getSupabaseClientWithContext() {
  const client = getSupabaseClient();
  const context = getContext();
  
  if (context?.userId) {
    return client.auth.setSession({
      access_token: context.accessToken,
      refresh_token: context.refreshToken
    });
  }
  
  return client;
}

/**
 * Execute a database operation with retry
 * @param {Function} operation - Database operation to execute
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} - Operation result
 */
export async function executeWithRetry(operation, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const retryDelay = options.retryDelay || 1000;
  const retryMultiplier = options.retryMultiplier || 2;
  
  let retries = 0;
  let delay = retryDelay;
  
  while (true) {
    try {
      const result = await operation();
      
      if (result.error) {
        // Check if the error is retryable
        if (isRetryableError(result.error) && retries < maxRetries) {
          retries++;
          
          logger.warn(`Retryable error, retrying (${retries}/${maxRetries})`, {
            error: result.error.message,
            code: result.error.code,
            retries,
            maxRetries
          });
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Increase delay for next retry
          delay *= retryMultiplier;
          
          continue;
        }
      }
      
      return result;
    } catch (error) {
      // Check if the error is retryable
      if (isRetryableError(error) && retries < maxRetries) {
        retries++;
        
        logger.warn(`Retryable error, retrying (${retries}/${maxRetries})`, {
          error: error.message,
          retries,
          maxRetries
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Increase delay for next retry
        delay *= retryMultiplier;
        
        continue;
      }
      
      // Non-retryable error or max retries reached
      return { data: null, error };
    }
  }
}

/**
 * Check if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} - True if retryable, false otherwise
 */
function isRetryableError(error) {
  // Network errors are retryable
  if (error.message && (
    error.message.includes('network') ||
    error.message.includes('timeout') ||
    error.message.includes('connection') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT')
  )) {
    return true;
  }
  
  // Rate limit errors are retryable
  if (error.code === 429 || (error.message && error.message.includes('rate limit'))) {
    return true;
  }
  
  // Some server errors are retryable
  if (error.code >= 500 && error.code < 600) {
    return true;
  }
  
  return false;
}

/**
 * Log a database operation
 * @param {string} operation - Operation name
 * @param {string} table - Table name
 * @param {Object} params - Operation parameters
 * @param {Object} result - Operation result
 */
export function logDatabaseOperation(operation, table, params, result) {
  if (result.error) {
    logger.error(`Database operation ${operation} on table ${table} failed`, {
      operation,
      table,
      params,
      error: result.error.message,
      code: result.error.code
    });
  } else {
    logger.debug(`Database operation ${operation} on table ${table} succeeded`, {
      operation,
      table,
      params
    });
  }
}

/**
 * Create a transaction
 * @param {Function} callback - Transaction callback
 * @returns {Promise<Object>} - Transaction result
 */
export async function transaction(callback) {
  const client = getSupabaseAdminClient();
  
  try {
    // Start a transaction
    const { data: startResult, error: startError } = await client.rpc('begin_transaction');
    
    if (startError) {
      throw startError;
    }
    
    try {
      // Execute the callback
      const result = await callback(client);
      
      // Commit the transaction
      const { error: commitError } = await client.rpc('commit_transaction');
      
      if (commitError) {
        throw commitError;
      }
      
      return result;
    } catch (error) {
      // Rollback the transaction
      await client.rpc('rollback_transaction').catch(rollbackError => {
        logger.error('Error rolling back transaction', { error: rollbackError.message });
      });
      
      throw error;
    }
  } catch (error) {
    logger.error('Transaction error', { error: error.message, stack: error.stack });
    return { data: null, error };
  }
}

// Export the Supabase client for advanced usage
export { createClient };

// Export initDatabase as initializeDatabase for backward compatibility
export const initializeDatabase = initDatabase;
