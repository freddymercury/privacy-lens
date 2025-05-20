/**
 * Updates Database Module for PrivacyLens
 * 
 * This module provides functions for working with updates and notifications.
 */

import { getSupabaseAdminClient, getSupabaseClientWithContext, executeWithRetry, logDatabaseOperation } from './index.js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize logger
const logger = createLogger('UpdatesDB');

// Table names
const UPDATES_TABLE = 'updates';
const USER_UPDATES_TABLE = 'user_updates';
const USERS_TABLE = 'users';

/**
 * Get an update by ID
 * @param {string} id - Update ID
 * @returns {Promise<Object>} - Update object
 */
export async function getUpdateById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(UPDATES_TABLE)
        .select('*')
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getUpdateById', UPDATES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting update by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Create a new update
 * @param {Object} updateData - Update data
 * @param {string} updateData.title - Update title
 * @param {string} updateData.content - Update content
 * @param {string} updateData.type - Update type
 * @param {string} updateData.status - Update status
 * @param {Date} updateData.publishDate - Publish date
 * @param {Date} updateData.expiryDate - Expiry date
 * @param {Array<string>} updateData.targetUserIds - Target user IDs
 * @param {Object} updateData.metadata - Update metadata
 * @returns {Promise<Object>} - Created update object
 */
export async function createUpdate(updateData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Create the update
      const updateId = uuidv4();
      
      const { data: update, error: updateError } = await supabase
        .from(UPDATES_TABLE)
        .insert({
          id: updateId,
          title: updateData.title,
          content: updateData.content,
          type: updateData.type || 'general',
          status: updateData.status || 'draft',
          publish_date: updateData.publishDate ? new Date(updateData.publishDate).toISOString() : null,
          expiry_date: updateData.expiryDate ? new Date(updateData.expiryDate).toISOString() : null,
          metadata: updateData.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // If there are target users, create user_updates records
      if (updateData.targetUserIds && updateData.targetUserIds.length > 0) {
        const userUpdates = updateData.targetUserIds.map(userId => ({
          id: uuidv4(),
          update_id: updateId,
          user_id: userId,
          status: 'unread',
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: userUpdatesError } = await supabase
          .from(USER_UPDATES_TABLE)
          .insert(userUpdates);
        
        if (userUpdatesError) {
          logger.warn('Error creating user updates', { error: userUpdatesError.message, updateId });
        }
      }
      
      return update;
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createUpdate', UPDATES_TABLE, { title: updateData.title }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating update', { error: error.message, stack: error.stack, title: updateData.title });
    throw error;
  }
}

/**
 * Update an update
 * @param {string} id - Update ID
 * @param {Object} updateData - Update data to update
 * @returns {Promise<Object>} - Updated update object
 */
export async function updateUpdate(id, updateData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the update
      const updateObj = {
        ...updateData,
        updated_at: new Date().toISOString()
      };
      
      // Convert dates to ISO strings
      if (updateObj.publishDate) {
        updateObj.publish_date = new Date(updateObj.publishDate).toISOString();
        delete updateObj.publishDate;
      }
      
      if (updateObj.expiryDate) {
        updateObj.expiry_date = new Date(updateObj.expiryDate).toISOString();
        delete updateObj.expiryDate;
      }
      
      // Remove targetUserIds from updateObj
      const targetUserIds = updateObj.targetUserIds;
      delete updateObj.targetUserIds;
      
      const { data: update, error: updateError } = await supabase
        .from(UPDATES_TABLE)
        .update(updateObj)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // If there are target users, update user_updates records
      if (targetUserIds !== undefined) {
        // Delete existing user_updates
        const { error: deleteError } = await supabase
          .from(USER_UPDATES_TABLE)
          .delete()
          .eq('update_id', id);
        
        if (deleteError) {
          logger.warn('Error deleting user updates', { error: deleteError.message, updateId: id });
        }
        
        // Create new user_updates
        if (targetUserIds && targetUserIds.length > 0) {
          const userUpdates = targetUserIds.map(userId => ({
            id: uuidv4(),
            update_id: id,
            user_id: userId,
            status: 'unread',
            created_at: new Date().toISOString(),
            created_by: update.created_by
          }));
          
          const { error: userUpdatesError } = await supabase
            .from(USER_UPDATES_TABLE)
            .insert(userUpdates);
          
          if (userUpdatesError) {
            logger.warn('Error creating user updates', { error: userUpdatesError.message, updateId: id });
          }
        }
      }
      
      return update;
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateUpdate', UPDATES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating update', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Delete an update
 * @param {string} id - Update ID
 * @returns {Promise<Object>} - Deleted update object
 */
export async function deleteUpdate(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Delete user_updates first
      const { error: userUpdatesError } = await supabase
        .from(USER_UPDATES_TABLE)
        .delete()
        .eq('update_id', id);
      
      if (userUpdatesError) {
        logger.warn('Error deleting user updates', { error: userUpdatesError.message, updateId: id });
      }
      
      // Delete the update
      return await supabase
        .from(UPDATES_TABLE)
        .delete()
        .eq('id', id)
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('deleteUpdate', UPDATES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error deleting update', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Publish an update
 * @param {string} id - Update ID
 * @param {Date} publishDate - Publish date
 * @returns {Promise<Object>} - Published update object
 */
export async function publishUpdate(id, publishDate = new Date()) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Publish the update
      return await supabase
        .from(UPDATES_TABLE)
        .update({
          status: 'published',
          publish_date: new Date(publishDate).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('publishUpdate', UPDATES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error publishing update', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get updates
 * @param {Object} options - Query options
 * @param {string} options.type - Filter by type
 * @param {string} options.status - Filter by status
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {number} options.limit - Maximum number of updates to return
 * @param {number} options.offset - Number of updates to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Updates object
 */
export async function getUpdates(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(UPDATES_TABLE)
        .select('*');
      
      // Apply filters
      if (options.type) {
        query = query.eq('type', options.type);
      }
      
      if (options.status) {
        query = query.eq('status', options.status);
      }
      
      if (options.startDate) {
        query = query.gte('created_at', new Date(options.startDate).toISOString());
      }
      
      if (options.endDate) {
        query = query.lte('created_at', new Date(options.endDate).toISOString());
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
    
    logDatabaseOperation('getUpdates', UPDATES_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting updates', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get active updates
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Active updates object
 */
export async function getActiveUpdates(options = {}) {
  try {
    const now = new Date().toISOString();
    
    return await getUpdates({
      ...options,
      status: 'published',
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      sortBy: options.sortBy || 'publish_date',
      sortDesc: options.sortDesc !== undefined ? options.sortDesc : true
    });
  } catch (error) {
    logger.error('Error getting active updates', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get user updates
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {string} options.status - Filter by status
 * @param {number} options.limit - Maximum number of updates to return
 * @param {number} options.offset - Number of updates to skip
 * @returns {Promise<Object>} - User updates object
 */
export async function getUserUpdates(userId, options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(USER_UPDATES_TABLE)
        .select(`
          *,
          update:update_id (*)
        `)
        .eq('user_id', userId);
      
      // Apply filters
      if (options.status) {
        query = query.eq('status', options.status);
      }
      
      // Apply sorting
      query = query.order('created_at', { ascending: false });
      
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
    
    logDatabaseOperation('getUserUpdates', USER_UPDATES_TABLE, { userId, ...options }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting user updates', { error: error.message, stack: error.stack, userId });
    throw error;
  }
}

/**
 * Mark user update as read
 * @param {string} id - User update ID
 * @returns {Promise<Object>} - Updated user update object
 */
export async function markUserUpdateAsRead(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(USER_UPDATES_TABLE)
        .update({
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('markUserUpdateAsRead', USER_UPDATES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error marking user update as read', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Mark all user updates as read
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Result object
 */
export async function markAllUserUpdatesAsRead(userId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(USER_UPDATES_TABLE)
        .update({
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'unread');
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('markAllUserUpdatesAsRead', USER_UPDATES_TABLE, { userId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error marking all user updates as read', { error: error.message, stack: error.stack, userId });
    throw error;
  }
}

/**
 * Count unread user updates
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Count of unread updates
 */
export async function countUnreadUserUpdates(userId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      const { count, error } = await supabase
        .from(USER_UPDATES_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'unread');
      
      if (error) {
        throw error;
      }
      
      return { data: count, error: null };
    };
    
    const result = await executeWithRetry(operation);
    
    return result.data || 0;
  } catch (error) {
    logger.error('Error counting unread user updates', { error: error.message, stack: error.stack, userId });
    return 0;
  }
}

/**
 * Create a user update
 * @param {Object} userUpdateData - User update data
 * @param {string} userUpdateData.updateId - Update ID
 * @param {string} userUpdateData.userId - User ID
 * @param {string} userUpdateData.status - Status
 * @returns {Promise<Object>} - Created user update object
 */
export async function createUserUpdate(userUpdateData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Create the user update
      return await supabase
        .from(USER_UPDATES_TABLE)
        .insert({
          id: uuidv4(),
          update_id: userUpdateData.updateId,
          user_id: userUpdateData.userId,
          status: userUpdateData.status || 'unread',
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createUserUpdate', USER_UPDATES_TABLE, { updateId: userUpdateData.updateId, userId: userUpdateData.userId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating user update', { error: error.message, stack: error.stack, updateId: userUpdateData.updateId, userId: userUpdateData.userId });
    throw error;
  }
}

/**
 * Delete a user update
 * @param {string} id - User update ID
 * @returns {Promise<Object>} - Deleted user update object
 */
export async function deleteUserUpdate(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      return await supabase
        .from(USER_UPDATES_TABLE)
        .delete()
        .eq('id', id)
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('deleteUserUpdate', USER_UPDATES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error deleting user update', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Send update to all users
 * @param {string} updateId - Update ID
 * @returns {Promise<Object>} - Result object
 */
export async function sendUpdateToAllUsers(updateId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from(USERS_TABLE)
        .select('id');
      
      if (usersError) {
        throw usersError;
      }
      
      if (!users || users.length === 0) {
        return { data: null, error: null };
      }
      
      // Create user updates
      const userUpdates = users.map(user => ({
        id: uuidv4(),
        update_id: updateId,
        user_id: user.id,
        status: 'unread',
        created_at: new Date().toISOString()
      }));
      
      return await supabase
        .from(USER_UPDATES_TABLE)
        .insert(userUpdates);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('sendUpdateToAllUsers', USER_UPDATES_TABLE, { updateId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error sending update to all users', { error: error.message, stack: error.stack, updateId });
    throw error;
  }
}
