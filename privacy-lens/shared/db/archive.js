/**
 * Archive Database Module for PrivacyLens
 * 
 * This module provides functions for working with archived privacy policies.
 */

import { getSupabaseAdminClient, getSupabaseClientWithContext, executeWithRetry, logDatabaseOperation } from './index.js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { v4 as uuidv4 } from 'uuid';
import { normalizeDomain } from '../utils/domainUtils.js';

// Initialize logger
const logger = createLogger('ArchiveDB');

// Table names
const DOMAINS_TABLE = 'domains';
const POLICY_ARCHIVES_TABLE = 'policy_archives';
const POLICY_VERSIONS_TABLE = 'policy_versions';
const POLICY_ASSETS_TABLE = 'policy_assets';
const POLICY_LINKS_TABLE = 'policy_links';
const POLICY_DIFFS_TABLE = 'policy_diffs';

/**
 * Get a policy archive by ID
 * @param {string} id - Policy archive ID
 * @returns {Promise<Object>} - Policy archive object
 */
export async function getPolicyArchiveById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${POLICY_VERSIONS_TABLE} (
            *,
            assets:${POLICY_ASSETS_TABLE} (*),
            links:${POLICY_LINKS_TABLE} (*)
          )
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getPolicyArchiveById', POLICY_ARCHIVES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy archive by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get a policy archive by domain
 * @param {string} domain - Domain name
 * @returns {Promise<Object>} - Policy archive object
 */
export async function getPolicyArchiveByDomain(domain) {
  try {
    // Normalize the domain
    const normalizedDomain = normalizeDomain(domain);
    
    if (!normalizedDomain) {
      return { data: null, error: new Error('Invalid domain') };
    }
    
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      // First, get the domain ID
      const { data: domainData, error: domainError } = await supabase
        .from(DOMAINS_TABLE)
        .select('id')
        .eq('name', normalizedDomain)
        .single();
      
      if (domainError || !domainData) {
        return { data: null, error: domainError || new Error('Domain not found') };
      }
      
      // Then, get the policy archive
      return await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${POLICY_VERSIONS_TABLE} (
            *,
            assets:${POLICY_ASSETS_TABLE} (*),
            links:${POLICY_LINKS_TABLE} (*)
          )
        `)
        .eq('domain_id', domainData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getPolicyArchiveByDomain', POLICY_ARCHIVES_TABLE, { domain: normalizedDomain }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy archive by domain', { error: error.message, stack: error.stack, domain });
    throw error;
  }
}

/**
 * Get the latest policy version for a policy archive
 * @param {string} archiveId - Policy archive ID
 * @returns {Promise<Object>} - Policy version object
 */
export async function getLatestPolicyVersion(archiveId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(POLICY_VERSIONS_TABLE)
        .select(`
          *,
          assets:${POLICY_ASSETS_TABLE} (*),
          links:${POLICY_LINKS_TABLE} (*)
        `)
        .eq('archive_id', archiveId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getLatestPolicyVersion', POLICY_VERSIONS_TABLE, { archiveId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting latest policy version', { error: error.message, stack: error.stack, archiveId });
    throw error;
  }
}

/**
 * Get a policy version by ID
 * @param {string} id - Policy version ID
 * @returns {Promise<Object>} - Policy version object
 */
export async function getPolicyVersionById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(POLICY_VERSIONS_TABLE)
        .select(`
          *,
          archive:archive_id (
            *,
            domain:domain_id (*)
          ),
          assets:${POLICY_ASSETS_TABLE} (*),
          links:${POLICY_LINKS_TABLE} (*)
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getPolicyVersionById', POLICY_VERSIONS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy version by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Create a new policy archive
 * @param {Object} archiveData - Archive data
 * @param {string} archiveData.domain - Domain name
 * @param {string} archiveData.url - Policy URL
 * @param {string} archiveData.type - Policy type
 * @param {string} archiveData.html - Policy HTML content
 * @param {string} archiveData.text - Policy text content
 * @param {Array<Object>} archiveData.assets - Policy assets
 * @param {Array<Object>} archiveData.links - Policy links
 * @param {Object} archiveData.metadata - Archive metadata
 * @returns {Promise<Object>} - Created policy archive object
 */
export async function createPolicyArchive(archiveData) {
  try {
    // Get the current context
    const context = getContext();
    
    // Normalize the domain
    const normalizedDomain = normalizeDomain(archiveData.domain);
    
    if (!normalizedDomain) {
      return { data: null, error: new Error('Invalid domain') };
    }
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // First, get or create the domain
      let domainId;
      
      const { data: existingDomain, error: domainError } = await supabase
        .from(DOMAINS_TABLE)
        .select('id')
        .eq('name', normalizedDomain)
        .single();
      
      if (domainError && domainError.code !== 'PGRST116') {
        // Error other than "not found"
        throw domainError;
      }
      
      if (existingDomain) {
        domainId = existingDomain.id;
      } else {
        // Create the domain
        const { data: newDomain, error: createError } = await supabase
          .from(DOMAINS_TABLE)
          .insert({
            id: uuidv4(),
            name: normalizedDomain,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: context?.userId || null
          })
          .select()
          .single();
        
        if (createError) {
          throw createError;
        }
        
        domainId = newDomain.id;
      }
      
      // Check if policy archive already exists
      const { data: existingArchive, error: archiveError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select('id')
        .eq('domain_id', domainId)
        .eq('type', archiveData.type || 'privacy')
        .single();
      
      if (!archiveError && existingArchive) {
        // Archive already exists, create a new version
        return await createPolicyVersion(existingArchive.id, {
          url: archiveData.url,
          html: archiveData.html,
          text: archiveData.text,
          assets: archiveData.assets,
          links: archiveData.links,
          metadata: archiveData.metadata
        });
      }
      
      // Create the policy archive
      const archiveId = uuidv4();
      
      const { data: archive, error: createError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .insert({
          id: archiveId,
          domain_id: domainId,
          url: archiveData.url,
          type: archiveData.type || 'privacy',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (createError) {
        throw createError;
      }
      
      // Create the policy version
      const versionId = uuidv4();
      
      const { data: version, error: versionError } = await supabase
        .from(POLICY_VERSIONS_TABLE)
        .insert({
          id: versionId,
          archive_id: archiveId,
          version: 1,
          url: archiveData.url,
          html: archiveData.html,
          text: archiveData.text,
          hash: generateContentHash(archiveData.text || archiveData.html),
          status: 'active',
          metadata: archiveData.metadata || {},
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (versionError) {
        throw versionError;
      }
      
      // Create assets
      if (archiveData.assets && archiveData.assets.length > 0) {
        const assets = archiveData.assets.map(asset => ({
          id: uuidv4(),
          version_id: versionId,
          url: asset.url,
          type: asset.type,
          content: asset.content,
          hash: generateContentHash(asset.content),
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: assetsError } = await supabase
          .from(POLICY_ASSETS_TABLE)
          .insert(assets);
        
        if (assetsError) {
          throw assetsError;
        }
      }
      
      // Create links
      if (archiveData.links && archiveData.links.length > 0) {
        const links = archiveData.links.map(link => ({
          id: uuidv4(),
          version_id: versionId,
          url: link.url,
          text: link.text,
          context: link.context,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: linksError } = await supabase
          .from(POLICY_LINKS_TABLE)
          .insert(links);
        
        if (linksError) {
          throw linksError;
        }
      }
      
      // Get the full archive with domain and versions
      return await getPolicyArchiveById(archiveId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createPolicyArchive', POLICY_ARCHIVES_TABLE, { domain: normalizedDomain }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating policy archive', { error: error.message, stack: error.stack, domain: archiveData.domain });
    throw error;
  }
}

/**
 * Create a new policy version
 * @param {string} archiveId - Policy archive ID
 * @param {Object} versionData - Version data
 * @param {string} versionData.url - Policy URL
 * @param {string} versionData.html - Policy HTML content
 * @param {string} versionData.text - Policy text content
 * @param {Array<Object>} versionData.assets - Policy assets
 * @param {Array<Object>} versionData.links - Policy links
 * @param {Object} versionData.metadata - Version metadata
 * @returns {Promise<Object>} - Created policy version object
 */
export async function createPolicyVersion(archiveId, versionData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Get the archive
      const { data: archive, error: archiveError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select('domain_id, url')
        .eq('id', archiveId)
        .single();
      
      if (archiveError) {
        throw archiveError;
      }
      
      // Get the latest version number
      const { data: latestVersion, error: versionError } = await supabase
        .from(POLICY_VERSIONS_TABLE)
        .select('version, hash, text, html')
        .eq('archive_id', archiveId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      
      if (versionError && versionError.code !== 'PGRST116') {
        // Error other than "not found"
        throw versionError;
      }
      
      const nextVersion = latestVersion ? latestVersion.version + 1 : 1;
      
      // Generate hash for the new content
      const newHash = generateContentHash(versionData.text || versionData.html);
      
      // Check if content has changed
      if (latestVersion && latestVersion.hash === newHash) {
        // Content hasn't changed, return the latest version
        return await getPolicyVersionById(latestVersion.id);
      }
      
      // Create the policy version
      const versionId = uuidv4();
      
      const { data: version, error: createError } = await supabase
        .from(POLICY_VERSIONS_TABLE)
        .insert({
          id: versionId,
          archive_id: archiveId,
          version: nextVersion,
          url: versionData.url || archive.url,
          html: versionData.html,
          text: versionData.text,
          hash: newHash,
          status: 'active',
          metadata: versionData.metadata || {},
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (createError) {
        throw createError;
      }
      
      // Update the archive's updated_at timestamp
      const { error: updateError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .update({
          updated_at: new Date().toISOString()
        })
        .eq('id', archiveId);
      
      if (updateError) {
        throw updateError;
      }
      
      // Create assets
      if (versionData.assets && versionData.assets.length > 0) {
        const assets = versionData.assets.map(asset => ({
          id: uuidv4(),
          version_id: versionId,
          url: asset.url,
          type: asset.type,
          content: asset.content,
          hash: generateContentHash(asset.content),
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: assetsError } = await supabase
          .from(POLICY_ASSETS_TABLE)
          .insert(assets);
        
        if (assetsError) {
          throw assetsError;
        }
      }
      
      // Create links
      if (versionData.links && versionData.links.length > 0) {
        const links = versionData.links.map(link => ({
          id: uuidv4(),
          version_id: versionId,
          url: link.url,
          text: link.text,
          context: link.context,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: linksError } = await supabase
          .from(POLICY_LINKS_TABLE)
          .insert(links);
        
        if (linksError) {
          throw linksError;
        }
      }
      
      // Create diff if this isn't the first version
      if (latestVersion) {
        const { error: diffError } = await supabase
          .from(POLICY_DIFFS_TABLE)
          .insert({
            id: uuidv4(),
            archive_id: archiveId,
            previous_version_id: latestVersion.id,
            new_version_id: versionId,
            diff_html: generateDiff(latestVersion.html, versionData.html),
            diff_text: generateDiff(latestVersion.text, versionData.text),
            created_at: new Date().toISOString(),
            created_by: context?.userId || null
          });
        
        if (diffError) {
          logger.warn('Error creating policy diff', { error: diffError.message, archiveId, versionId });
        }
      }
      
      return await getPolicyVersionById(versionId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createPolicyVersion', POLICY_VERSIONS_TABLE, { archiveId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating policy version', { error: error.message, stack: error.stack, archiveId });
    throw error;
  }
}

/**
 * Update a policy archive
 * @param {string} id - Policy archive ID
 * @param {Object} archiveData - Archive data to update
 * @returns {Promise<Object>} - Updated policy archive object
 */
export async function updatePolicyArchive(id, archiveData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the policy archive
      const updateData = {
        ...archiveData,
        updated_at: new Date().toISOString()
      };
      
      const { data: archive, error: updateError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // Get the full archive with domain and versions
      return await getPolicyArchiveById(id);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updatePolicyArchive', POLICY_ARCHIVES_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating policy archive', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get policy archives
 * @param {Object} options - Query options
 * @param {string} options.domain - Filter by domain
 * @param {string} options.type - Filter by policy type
 * @param {string} options.status - Filter by status
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {number} options.limit - Maximum number of archives to return
 * @param {number} options.offset - Number of archives to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Policy archives object
 */
export async function getPolicyArchives(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${POLICY_VERSIONS_TABLE} (
            *,
            assets:${POLICY_ASSETS_TABLE} (*),
            links:${POLICY_LINKS_TABLE} (*)
          )
        `);
      
      // Apply filters
      if (options.domain) {
        const normalizedDomain = normalizeDomain(options.domain);
        
        if (normalizedDomain) {
          query = query.eq('domain.name', normalizedDomain);
        }
      }
      
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
    
    logDatabaseOperation('getPolicyArchives', POLICY_ARCHIVES_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy archives', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get policy versions for an archive
 * @param {string} archiveId - Policy archive ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of versions to return
 * @param {number} options.offset - Number of versions to skip
 * @returns {Promise<Object>} - Policy versions object
 */
export async function getPolicyVersions(archiveId, options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(POLICY_VERSIONS_TABLE)
        .select(`
          *,
          assets:${POLICY_ASSETS_TABLE} (*),
          links:${POLICY_LINKS_TABLE} (*)
        `)
        .eq('archive_id', archiveId)
        .order('version', { ascending: false });
      
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
    
    logDatabaseOperation('getPolicyVersions', POLICY_VERSIONS_TABLE, { archiveId, ...options }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy versions', { error: error.message, stack: error.stack, archiveId, options });
    throw error;
  }
}

/**
 * Get policy diffs between versions
 * @param {string} archiveId - Policy archive ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of diffs to return
 * @param {number} options.offset - Number of diffs to skip
 * @returns {Promise<Object>} - Policy diffs object
 */
export async function getPolicyDiffs(archiveId, options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(POLICY_DIFFS_TABLE)
        .select(`
          *,
          previous_version:previous_version_id (*),
          new_version:new_version_id (*)
        `)
        .eq('archive_id', archiveId)
        .order('created_at', { ascending: false });
      
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
    
    logDatabaseOperation('getPolicyDiffs', POLICY_DIFFS_TABLE, { archiveId, ...options }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy diffs', { error: error.message, stack: error.stack, archiveId, options });
    throw error;
  }
}

/**
 * Get a policy diff by ID
 * @param {string} id - Policy diff ID
 * @returns {Promise<Object>} - Policy diff object
 */
export async function getPolicyDiffById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(POLICY_DIFFS_TABLE)
        .select(`
          *,
          previous_version:previous_version_id (*),
          new_version:new_version_id (*)
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getPolicyDiffById', POLICY_DIFFS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy diff by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get policy diff between two versions
 * @param {string} previousVersionId - Previous version ID
 * @param {string} newVersionId - New version ID
 * @returns {Promise<Object>} - Policy diff object
 */
export async function getPolicyDiffBetweenVersions(previousVersionId, newVersionId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(POLICY_DIFFS_TABLE)
        .select(`
          *,
          previous_version:previous_version_id (*),
          new_version:new_version_id (*)
        `)
        .eq('previous_version_id', previousVersionId)
        .eq('new_version_id', newVersionId)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getPolicyDiffBetweenVersions', POLICY_DIFFS_TABLE, { previousVersionId, newVersionId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting policy diff between versions', { error: error.message, stack: error.stack, previousVersionId, newVersionId });
    throw error;
  }
}

/**
 * Generate a hash for content
 * @param {string} content - Content to hash
 * @returns {string} - Content hash
 */
function generateContentHash(content) {
  if (!content) return '';
  
  // Simple hash function for demo purposes
  // In production, use a proper hashing algorithm like SHA-256
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Generate a diff between two pieces of content
 * @param {string} oldContent - Old content
 * @param {string} newContent - New content
 * @returns {string} - Diff content
 */
function generateDiff(oldContent, newContent) {
  // This is a placeholder for a real diff algorithm
  // In production, use a proper diff library
  return JSON.stringify({
    old: oldContent,
    new: newContent
  });
}

/**
 * Get archive statistics
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @returns {Promise<Object>} - Statistics object
 */
export async function getArchiveStatistics(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      // Define the time range
      const startDate = options.startDate ? new Date(options.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
      const endDate = options.endDate ? new Date(options.endDate) : new Date();
      
      // Get total count of archives
      const { count: totalArchives, error: archiveError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (archiveError) {
        throw archiveError;
      }
      
      // Get total count of versions
      const { count: totalVersions, error: versionError } = await supabase
        .from(POLICY_VERSIONS_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (versionError) {
        throw versionError;
      }
      
      // Get counts by policy type
      const { data: typeData, error: typeError } = await supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select('type')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (typeError) {
        throw typeError;
      }
      
      const typeCounts = {};
      typeData.forEach(archive => {
        typeCounts[archive.type] = (typeCounts[archive.type] || 0) + 1;
      });
      
      return {
        data: {
          totalArchives,
          totalVersions,
          typeCounts,
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
    logger.error('Error getting archive statistics', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Search policy archives
 * @param {Object} options - Search options
 * @param {string} options.query - Search query
 * @param {string} options.domain - Filter by domain
 * @param {string} options.type - Filter by policy type
 * @param {number} options.limit - Maximum number of results to return
 * @param {number} options.offset - Number of results to skip
 * @returns {Promise<Object>} - Search results object
 */
export async function searchPolicyArchives(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(POLICY_ARCHIVES_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${POLICY_VERSIONS_TABLE} (
            *,
            assets:${POLICY_ASSETS_TABLE} (*),
            links:${POLICY_LINKS_TABLE} (*)
          )
        `);
      
      // Apply filters
      if (options.query) {
        // Search in the latest version's text content
        query = query.textSearch('versions.text', options.query);
      }
      
      if (options.domain) {
        const normalizedDomain = normalizeDomain(options.domain);
        
        if (normalizedDomain) {
          query = query.eq('domain.name', normalizedDomain);
        }
      }
      
      if (options.type) {
        query = query.eq('type', options.type);
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
    
    logDatabaseOperation('searchPolicyArchives', POLICY_ARCHIVES_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error searching policy archives', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Export policy version to JSON
 * @param {string} versionId - Policy version ID
 * @returns {Promise<Object>} - JSON data object
 */
export async function exportPolicyVersionToJson(versionId) {
  try {
    const { data: version, error } = await getPolicyVersionById(versionId);
    
    if (error) {
      throw error;
    }
    
    return { data: version, error: null };
  } catch (error) {
    logger.error('Error exporting policy version to JSON', { error: error.message, stack: error.stack, versionId });
    throw error;
  }
}

/**
 * Export policy version to HTML
 * @param {string} versionId - Policy version ID
 * @returns {Promise<Object>} - HTML data object
 */
export async function exportPolicyVersionToHtml(versionId) {
  try {
    const { data: version, error } = await getPolicyVersionById(versionId);
    
    if (error) {
      throw error;
    }
    
    if (!version || !version.html) {
      return { data: '', error: new Error('No HTML content available') };
    }
    
    return { data: version.html, error: null };
  } catch (error) {
    logger.error('Error exporting policy version to HTML', { error: error.message, stack: error.stack, versionId });
    throw error;
  }
}

/**
 * Export policy version to text
 * @param {string} versionId - Policy version ID
 * @returns {Promise<Object>} - Text data object
 */
export async function exportPolicyVersionToText(versionId) {
  try {
    const { data: version, error } = await getPolicyVersionById(versionId);
    
    if (error) {
      throw error;
    }
    
    if (!version || !version.text) {
      return { data: '', error: new Error('No text content available') };
    }
    
    return { data: version.text, error: null };
  } catch (error) {
    logger.error('Error exporting policy version to text', { error: error.message, stack: error.stack, versionId });
    throw error;
  }
}

/**
 * Stub for addPolicyForArchiving - to be implemented
 * @param {Object} params - Parameters for archiving
 * @returns {Promise<void>}
 */
export async function addPolicyForArchiving(params) {
  logger.info('addPolicyForArchiving called', params);
  // TODO: Implement actual archiving logic
  return Promise.resolve();
}
