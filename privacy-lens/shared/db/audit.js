/**
 * Audit Database Module for PrivacyLens
 * 
 * This module provides functions for working with audit logs.
 */

import { getSupabaseAdminClient, getSupabaseClientWithContext, executeWithRetry, logDatabaseOperation } from './index.js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize logger
const logger = createLogger('AuditDB');

// Table names
const AUDIT_LOGS_TABLE = 'audit_logs';
const USERS_TABLE = 'users';

// Audit action constants
export const AUDIT_ACTIONS = {
  REGISTER: 'user.register',
  LOGIN: 'user.login',
  LOGOUT: 'user.logout',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  ASSESS: 'assessment.assess',
};

// Entity/resource type constants
export const ENTITY_TYPES = {
  USER: 'user',
  POLICY: 'policy',
  ROLE: 'role',
  API_KEY: 'api_key',
};

/**
 * Get an audit log by ID
 * @param {string} id - Audit log ID
 * @returns {Promise<Object>} - Audit log object
 */
export async function getAuditLogById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(AUDIT_LOGS_TABLE)
        .select(`
          *,
          user:user_id (*)
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getAuditLogById', AUDIT_LOGS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting audit log by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Create a new audit log
 * @param {Object} auditData - Audit data
 * @param {string} auditData.action - Action performed
 * @param {string} auditData.resourceType - Resource type
 * @param {string} auditData.resourceId - Resource ID
 * @param {Object} auditData.details - Audit details
 * @param {string} auditData.ipAddress - IP address
 * @param {string} auditData.userAgent - User agent
 * @returns {Promise<Object>} - Created audit log object
 */
export async function createAuditLog(auditData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Create the audit log
      return await supabase
        .from(AUDIT_LOGS_TABLE)
        .insert({
          id: uuidv4(),
          user_id: context?.userId || null,
          action: auditData.action,
          resource_type: auditData.resourceType,
          resource_id: auditData.resourceId,
          details: auditData.details || {},
          ip_address: auditData.ipAddress || context?.ipAddress || null,
          user_agent: auditData.userAgent || context?.userAgent || null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createAuditLog', AUDIT_LOGS_TABLE, { action: auditData.action, resourceType: auditData.resourceType }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating audit log', { error: error.message, stack: error.stack, action: auditData.action, resourceType: auditData.resourceType });
    throw error;
  }
}

/**
 * Get audit logs
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user ID
 * @param {string} options.action - Filter by action
 * @param {string} options.resourceType - Filter by resource type
 * @param {string} options.resourceId - Filter by resource ID
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {number} options.limit - Maximum number of audit logs to return
 * @param {number} options.offset - Number of audit logs to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Audit logs object
 */
export async function getAuditLogs(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(AUDIT_LOGS_TABLE)
        .select(`
          *,
          user:user_id (*)
        `);
      
      // Apply filters
      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }
      
      if (options.action) {
        query = query.eq('action', options.action);
      }
      
      if (options.resourceType) {
        query = query.eq('resource_type', options.resourceType);
      }
      
      if (options.resourceId) {
        query = query.eq('resource_id', options.resourceId);
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
    
    logDatabaseOperation('getAuditLogs', AUDIT_LOGS_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting audit logs', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Count audit logs
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user ID
 * @param {string} options.action - Filter by action
 * @param {string} options.resourceType - Filter by resource type
 * @param {string} options.resourceId - Filter by resource ID
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @returns {Promise<Object>} - Count object
 */
export async function countAuditLogs(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(AUDIT_LOGS_TABLE)
        .select('id', { count: 'exact', head: true });
      
      // Apply filters
      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }
      
      if (options.action) {
        query = query.eq('action', options.action);
      }
      
      if (options.resourceType) {
        query = query.eq('resource_type', options.resourceType);
      }
      
      if (options.resourceId) {
        query = query.eq('resource_id', options.resourceId);
      }
      
      if (options.startDate) {
        query = query.gte('created_at', new Date(options.startDate).toISOString());
      }
      
      if (options.endDate) {
        query = query.lte('created_at', new Date(options.endDate).toISOString());
      }
      
      return await query;
    };
    
    const result = await executeWithRetry(operation);
    
    return { data: result.count, error: result.error };
  } catch (error) {
    logger.error('Error counting audit logs', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get audit log actions
 * @returns {Promise<Object>} - Actions object
 */
export async function getAuditLogActions() {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(AUDIT_LOGS_TABLE)
        .select('action')
        .order('action', { ascending: true })
        .limit(1000);
    };
    
    const result = await executeWithRetry(operation);
    
    // Extract unique actions
    if (result.data) {
      const actions = [...new Set(result.data.map(log => log.action))];
      return { data: actions, error: null };
    }
    
    return { data: [], error: result.error };
  } catch (error) {
    logger.error('Error getting audit log actions', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get audit log resource types
 * @returns {Promise<Object>} - Resource types object
 */
export async function getAuditLogResourceTypes() {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(AUDIT_LOGS_TABLE)
        .select('resource_type')
        .order('resource_type', { ascending: true })
        .limit(1000);
    };
    
    const result = await executeWithRetry(operation);
    
    // Extract unique resource types
    if (result.data) {
      const resourceTypes = [...new Set(result.data.map(log => log.resource_type))];
      return { data: resourceTypes, error: null };
    }
    
    return { data: [], error: result.error };
  } catch (error) {
    logger.error('Error getting audit log resource types', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get audit log statistics
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @returns {Promise<Object>} - Statistics object
 */
export async function getAuditLogStatistics(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      // Define the time range
      const startDate = options.startDate ? new Date(options.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
      const endDate = options.endDate ? new Date(options.endDate) : new Date();
      
      // Get total count
      const { count: totalCount, error: countError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (countError) {
        throw countError;
      }
      
      // Get counts by action
      const { data: actionData, error: actionError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .select('action')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (actionError) {
        throw actionError;
      }
      
      const actionCounts = {};
      actionData.forEach(log => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      });
      
      // Get counts by resource type
      const { data: resourceData, error: resourceError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .select('resource_type')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (resourceError) {
        throw resourceError;
      }
      
      const resourceCounts = {};
      resourceData.forEach(log => {
        resourceCounts[log.resource_type] = (resourceCounts[log.resource_type] || 0) + 1;
      });
      
      // Get counts by user
      const { data: userData, error: userError } = await supabase
        .from(AUDIT_LOGS_TABLE)
        .select(`
          user_id,
          user:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (userError) {
        throw userError;
      }
      
      const userCounts = {};
      userData.forEach(log => {
        if (log.user_id) {
          if (!userCounts[log.user_id]) {
            userCounts[log.user_id] = {
              count: 0,
              user: log.user
            };
          }
          userCounts[log.user_id].count++;
        }
      });
      
      return {
        data: {
          totalCount,
          actionCounts,
          resourceCounts,
          userCounts,
          timeRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        },
        error: null
      };
    };
    
    const result = await executeWithRetry(operation);
    
    return result;
  } catch (error) {
    logger.error('Error getting audit log statistics', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Delete audit logs older than a specified date
 * @param {Date} date - Date to delete logs older than
 * @returns {Promise<Object>} - Result object
 */
export async function deleteOldAuditLogs(date) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      return await supabase
        .from(AUDIT_LOGS_TABLE)
        .delete()
        .lt('created_at', new Date(date).toISOString());
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('deleteOldAuditLogs', AUDIT_LOGS_TABLE, { date }, result);
    
    return result;
  } catch (error) {
    logger.error('Error deleting old audit logs', { error: error.message, stack: error.stack, date });
    throw error;
  }
}

/**
 * Export audit logs to JSON
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - JSON data object
 */
export async function exportAuditLogsToJson(options = {}) {
  try {
    const { data: logs, error } = await getAuditLogs(options);
    
    if (error) {
      throw error;
    }
    
    return { data: logs, error: null };
  } catch (error) {
    logger.error('Error exporting audit logs to JSON', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Export audit logs to CSV
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - CSV data object
 */
export async function exportAuditLogsToCsv(options = {}) {
  try {
    const { data: logs, error } = await getAuditLogs(options);
    
    if (error) {
      throw error;
    }
    
    if (!logs || logs.length === 0) {
      return { data: '', error: null };
    }
    
    // Define CSV headers
    const headers = [
      'ID',
      'User',
      'Action',
      'Resource Type',
      'Resource ID',
      'IP Address',
      'User Agent',
      'Created At'
    ];
    
    // Convert logs to CSV rows
    const rows = logs.map(log => [
      log.id,
      log.user ? `${log.user.first_name} ${log.user.last_name} (${log.user.email})` : 'System',
      log.action,
      log.resource_type,
      log.resource_id,
      log.ip_address,
      log.user_agent,
      log.created_at
    ]);
    
    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');
    
    return { data: csvContent, error: null };
  } catch (error) {
    logger.error('Error exporting audit logs to CSV', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Log an audit event (compatibility wrapper for createAuditLog)
 * @param {Object} params - Audit event params
 * @param {string} params.action - Action performed
 * @param {string} params.entity_type - Resource/entity type
 * @param {string} params.entity_id - Resource/entity ID
 * @param {Object} params.details - Additional details
 * @returns {Promise<Object>} - Created audit log object
 */
export async function logAuditEvent({ action, entity_type, entity_id, details }) {
  return createAuditLog({
    action,
    resourceType: entity_type,
    resourceId: entity_id,
    details,
  });
}
