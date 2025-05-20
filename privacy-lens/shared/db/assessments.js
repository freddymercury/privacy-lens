/**
 * Assessments Database Module for PrivacyLens
 * 
 * This module provides functions for working with privacy assessments.
 */

import { getSupabaseAdminClient, getSupabaseClientWithContext, executeWithRetry, logDatabaseOperation } from './index.js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { v4 as uuidv4 } from 'uuid';
import { normalizeDomain, normalizeUrl } from '../utils/domainUtils.js';

// Initialize logger
const logger = createLogger('AssessmentsDB');

// Table names
const DOMAINS_TABLE = 'domains';
const ASSESSMENTS_TABLE = 'assessments';
const ASSESSMENT_VERSIONS_TABLE = 'assessment_versions';
const ASSESSMENT_CRITERIA_TABLE = 'assessment_criteria';
const ASSESSMENT_SCORES_TABLE = 'assessment_scores';
const ASSESSMENT_COMMENTS_TABLE = 'assessment_comments';
const SCAN_EVENTS_TABLE = 'scan_events';

/**
 * Get an assessment by ID
 * @param {string} id - Assessment ID
 * @returns {Promise<Object>} - Assessment object
 */
export async function getAssessmentById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(ASSESSMENTS_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${ASSESSMENT_VERSIONS_TABLE} (
            *,
            scores:${ASSESSMENT_SCORES_TABLE} (*),
            comments:${ASSESSMENT_COMMENTS_TABLE} (*)
          )
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getAssessmentById', ASSESSMENTS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting assessment by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get an assessment by domain
 * @param {string} domain - Domain name
 * @returns {Promise<Object>} - Assessment object
 */
export async function getAssessmentByDomain(domain) {
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
      
      // Then, get the assessment
      return await supabase
        .from(ASSESSMENTS_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${ASSESSMENT_VERSIONS_TABLE} (
            *,
            scores:${ASSESSMENT_SCORES_TABLE} (*),
            comments:${ASSESSMENT_COMMENTS_TABLE} (*)
          )
        `)
        .eq('domain_id', domainData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getAssessmentByDomain', ASSESSMENTS_TABLE, { domain: normalizedDomain }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting assessment by domain', { error: error.message, stack: error.stack, domain });
    throw error;
  }
}

/**
 * Get the latest assessment version for an assessment
 * @param {string} assessmentId - Assessment ID
 * @returns {Promise<Object>} - Assessment version object
 */
export async function getLatestAssessmentVersion(assessmentId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(ASSESSMENT_VERSIONS_TABLE)
        .select(`
          *,
          scores:${ASSESSMENT_SCORES_TABLE} (*),
          comments:${ASSESSMENT_COMMENTS_TABLE} (*)
        `)
        .eq('assessment_id', assessmentId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getLatestAssessmentVersion', ASSESSMENT_VERSIONS_TABLE, { assessmentId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting latest assessment version', { error: error.message, stack: error.stack, assessmentId });
    throw error;
  }
}

/**
 * Get an assessment version by ID
 * @param {string} id - Assessment version ID
 * @returns {Promise<Object>} - Assessment version object
 */
export async function getAssessmentVersionById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(ASSESSMENT_VERSIONS_TABLE)
        .select(`
          *,
          assessment:assessment_id (
            *,
            domain:domain_id (*)
          ),
          scores:${ASSESSMENT_SCORES_TABLE} (*),
          comments:${ASSESSMENT_COMMENTS_TABLE} (*)
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getAssessmentVersionById', ASSESSMENT_VERSIONS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting assessment version by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Create a new assessment
 * @param {Object} assessmentData - Assessment data
 * @param {string} assessmentData.domain - Domain name
 * @param {string} assessmentData.url - Assessment URL
 * @param {string} assessmentData.type - Assessment type
 * @param {Object} assessmentData.metadata - Assessment metadata
 * @param {Array<Object>} assessmentData.scores - Assessment scores
 * @param {Array<Object>} assessmentData.comments - Assessment comments
 * @returns {Promise<Object>} - Created assessment object
 */
export async function createAssessment(assessmentData) {
  try {
    // Get the current context
    const context = getContext();
    
    // Normalize the domain
    const normalizedDomain = normalizeDomain(assessmentData.domain);
    
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
      
      // Check if assessment already exists
      const { data: existingAssessment, error: assessmentError } = await supabase
        .from(ASSESSMENTS_TABLE)
        .select('id')
        .eq('domain_id', domainId)
        .single();
      
      if (!assessmentError && existingAssessment) {
        // Assessment already exists, create a new version
        return await createAssessmentVersion(existingAssessment.id, {
          scores: assessmentData.scores,
          comments: assessmentData.comments,
          metadata: assessmentData.metadata
        });
      }
      
      // Create the assessment
      const assessmentId = uuidv4();
      
      const { data: assessment, error: createError } = await supabase
        .from(ASSESSMENTS_TABLE)
        .insert({
          id: assessmentId,
          domain_id: domainId,
          url: assessmentData.url,
          type: assessmentData.type || 'standard',
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
      
      // Create the assessment version
      const versionId = uuidv4();
      
      const { data: version, error: versionError } = await supabase
        .from(ASSESSMENT_VERSIONS_TABLE)
        .insert({
          id: versionId,
          assessment_id: assessmentId,
          version: 1,
          status: 'active',
          metadata: assessmentData.metadata || {},
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (versionError) {
        throw versionError;
      }
      
      // Create scores
      if (assessmentData.scores && assessmentData.scores.length > 0) {
        const scores = assessmentData.scores.map(score => ({
          id: uuidv4(),
          assessment_version_id: versionId,
          criterion_id: score.criterionId,
          score: score.score,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: scoresError } = await supabase
          .from(ASSESSMENT_SCORES_TABLE)
          .insert(scores);
        
        if (scoresError) {
          throw scoresError;
        }
      }
      
      // Create comments
      if (assessmentData.comments && assessmentData.comments.length > 0) {
        const comments = assessmentData.comments.map(comment => ({
          id: uuidv4(),
          assessment_version_id: versionId,
          criterion_id: comment.criterionId,
          comment: comment.comment,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: commentsError } = await supabase
          .from(ASSESSMENT_COMMENTS_TABLE)
          .insert(comments);
        
        if (commentsError) {
          throw commentsError;
        }
      }
      
      // Create scan event
      const { error: scanError } = await supabase
        .from(SCAN_EVENTS_TABLE)
        .insert({
          id: uuidv4(),
          domain_id: domainId,
          assessment_id: assessmentId,
          assessment_version_id: versionId,
          event_type: 'initial_assessment',
          status: 'completed',
          metadata: {
            domain: normalizedDomain,
            url: assessmentData.url
          },
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        });
      
      if (scanError) {
        logger.warn('Error creating scan event', { error: scanError.message, assessmentId });
      }
      
      // Get the full assessment with domain and versions
      return await getAssessmentById(assessmentId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createAssessment', ASSESSMENTS_TABLE, { domain: normalizedDomain }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating assessment', { error: error.message, stack: error.stack, domain: assessmentData.domain });
    throw error;
  }
}

/**
 * Create a new assessment version
 * @param {string} assessmentId - Assessment ID
 * @param {Object} versionData - Version data
 * @param {Array<Object>} versionData.scores - Version scores
 * @param {Array<Object>} versionData.comments - Version comments
 * @param {Object} versionData.metadata - Version metadata
 * @returns {Promise<Object>} - Created assessment version object
 */
export async function createAssessmentVersion(assessmentId, versionData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Get the assessment
      const { data: assessment, error: assessmentError } = await supabase
        .from(ASSESSMENTS_TABLE)
        .select('domain_id')
        .eq('id', assessmentId)
        .single();
      
      if (assessmentError) {
        throw assessmentError;
      }
      
      // Get the latest version number
      const { data: latestVersion, error: versionError } = await supabase
        .from(ASSESSMENT_VERSIONS_TABLE)
        .select('version')
        .eq('assessment_id', assessmentId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      
      if (versionError && versionError.code !== 'PGRST116') {
        // Error other than "not found"
        throw versionError;
      }
      
      const nextVersion = latestVersion ? latestVersion.version + 1 : 1;
      
      // Create the assessment version
      const versionId = uuidv4();
      
      const { data: version, error: createError } = await supabase
        .from(ASSESSMENT_VERSIONS_TABLE)
        .insert({
          id: versionId,
          assessment_id: assessmentId,
          version: nextVersion,
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
      
      // Update the assessment's updated_at timestamp
      const { error: updateError } = await supabase
        .from(ASSESSMENTS_TABLE)
        .update({
          updated_at: new Date().toISOString()
        })
        .eq('id', assessmentId);
      
      if (updateError) {
        throw updateError;
      }
      
      // Create scores
      if (versionData.scores && versionData.scores.length > 0) {
        const scores = versionData.scores.map(score => ({
          id: uuidv4(),
          assessment_version_id: versionId,
          criterion_id: score.criterionId,
          score: score.score,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: scoresError } = await supabase
          .from(ASSESSMENT_SCORES_TABLE)
          .insert(scores);
        
        if (scoresError) {
          throw scoresError;
        }
      }
      
      // Create comments
      if (versionData.comments && versionData.comments.length > 0) {
        const comments = versionData.comments.map(comment => ({
          id: uuidv4(),
          assessment_version_id: versionId,
          criterion_id: comment.criterionId,
          comment: comment.comment,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: commentsError } = await supabase
          .from(ASSESSMENT_COMMENTS_TABLE)
          .insert(comments);
        
        if (commentsError) {
          throw commentsError;
        }
      }
      
      // Create scan event
      const { error: scanError } = await supabase
        .from(SCAN_EVENTS_TABLE)
        .insert({
          id: uuidv4(),
          domain_id: assessment.domain_id,
          assessment_id: assessmentId,
          assessment_version_id: versionId,
          event_type: 'reassessment',
          status: 'completed',
          metadata: {
            version: nextVersion
          },
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        });
      
      if (scanError) {
        logger.warn('Error creating scan event', { error: scanError.message, assessmentId, versionId });
      }
      
      return await getAssessmentVersionById(versionId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createAssessmentVersion', ASSESSMENT_VERSIONS_TABLE, { assessmentId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating assessment version', { error: error.message, stack: error.stack, assessmentId });
    throw error;
  }
}

/**
 * Update an assessment
 * @param {string} id - Assessment ID
 * @param {Object} assessmentData - Assessment data to update
 * @returns {Promise<Object>} - Updated assessment object
 */
export async function updateAssessment(id, assessmentData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the assessment
      const updateData = {
        ...assessmentData,
        updated_at: new Date().toISOString()
      };
      
      const { data: assessment, error: updateError } = await supabase
        .from(ASSESSMENTS_TABLE)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // Get the full assessment with domain and versions
      return await getAssessmentById(id);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateAssessment', ASSESSMENTS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating assessment', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get assessments
 * @param {Object} options - Query options
 * @param {string} options.domain - Filter by domain
 * @param {string} options.type - Filter by assessment type
 * @param {string} options.status - Filter by status
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {number} options.limit - Maximum number of assessments to return
 * @param {number} options.offset - Number of assessments to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Assessments object
 */
export async function getAssessments(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(ASSESSMENTS_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          versions:${ASSESSMENT_VERSIONS_TABLE} (
            *,
            scores:${ASSESSMENT_SCORES_TABLE} (*),
            comments:${ASSESSMENT_COMMENTS_TABLE} (*)
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
    
    logDatabaseOperation('getAssessments', ASSESSMENTS_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting assessments', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get assessment criteria
 * @param {Object} options - Query options
 * @param {string} options.type - Filter by criterion type
 * @param {boolean} options.active - Filter by active status
 * @returns {Promise<Object>} - Criteria object
 */
export async function getAssessmentCriteria(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(ASSESSMENT_CRITERIA_TABLE)
        .select('*');
      
      // Apply filters
      if (options.type) {
        query = query.eq('type', options.type);
      }
      
      if (options.active !== undefined) {
        query = query.eq('active', options.active);
      }
      
      // Apply sorting
      query = query.order('order', { ascending: true });
      
      return await query;
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getAssessmentCriteria', ASSESSMENT_CRITERIA_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting assessment criteria', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get an assessment criterion by ID
 * @param {string} id - Criterion ID
 * @returns {Promise<Object>} - Criterion object
 */
export async function getAssessmentCriterionById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(ASSESSMENT_CRITERIA_TABLE)
        .select('*')
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getAssessmentCriterionById', ASSESSMENT_CRITERIA_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting assessment criterion by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Create a new assessment criterion
 * @param {Object} criterionData - Criterion data
 * @param {string} criterionData.name - Criterion name
 * @param {string} criterionData.description - Criterion description
 * @param {string} criterionData.type - Criterion type
 * @param {number} criterionData.order - Criterion order
 * @param {boolean} criterionData.active - Criterion active status
 * @param {Object} criterionData.metadata - Criterion metadata
 * @returns {Promise<Object>} - Created criterion object
 */
export async function createAssessmentCriterion(criterionData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Create the criterion
      return await supabase
        .from(ASSESSMENT_CRITERIA_TABLE)
        .insert({
          id: uuidv4(),
          name: criterionData.name,
          description: criterionData.description,
          type: criterionData.type || 'standard',
          order: criterionData.order || 0,
          active: criterionData.active !== undefined ? criterionData.active : true,
          metadata: criterionData.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createAssessmentCriterion', ASSESSMENT_CRITERIA_TABLE, { name: criterionData.name }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating assessment criterion', { error: error.message, stack: error.stack, name: criterionData.name });
    throw error;
  }
}

/**
 * Update an assessment criterion
 * @param {string} id - Criterion ID
 * @param {Object} criterionData - Criterion data to update
 * @returns {Promise<Object>} - Updated criterion object
 */
export async function updateAssessmentCriterion(id, criterionData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the criterion
      const updateData = {
        ...criterionData,
        updated_at: new Date().toISOString()
      };
      
      return await supabase
        .from(ASSESSMENT_CRITERIA_TABLE)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateAssessmentCriterion', ASSESSMENT_CRITERIA_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating assessment criterion', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Delete an assessment criterion
 * @param {string} id - Criterion ID
 * @returns {Promise<Object>} - Deleted criterion object
 */
export async function deleteAssessmentCriterion(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Get the criterion first
      const { data: criterion, error: getError } = await supabase
        .from(ASSESSMENT_CRITERIA_TABLE)
        .select('*')
        .eq('id', id)
        .single();
      
      if (getError) {
        throw getError;
      }
      
      // Delete the criterion
      const { error: deleteError } = await supabase
        .from(ASSESSMENT_CRITERIA_TABLE)
        .delete()
        .eq('id', id);
      
      if (deleteError) {
        throw deleteError;
      }
      
      return { data: criterion, error: null };
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('deleteAssessmentCriterion', ASSESSMENT_CRITERIA_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error deleting assessment criterion', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get scan events
 * @param {Object} options - Query options
 * @param {string} options.domain - Filter by domain
 * @param {string} options.assessmentId - Filter by assessment ID
 * @param {string} options.eventType - Filter by event type
 * @param {string} options.status - Filter by status
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {number} options.limit - Maximum number of scan events to return
 * @param {number} options.offset - Number of scan events to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Scan events object
 */
export async function getScanEvents(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(SCAN_EVENTS_TABLE)
        .select(`
          *,
          domain:domain_id (*),
          assessment:assessment_id (*),
          assessment_version:assessment_version_id (*)
        `);
      
      // Apply filters
      if (options.domain) {
        const normalizedDomain = normalizeDomain(options.domain);
        
        if (normalizedDomain) {
          query = query.eq('domain.name', normalizedDomain);
        }
      }
      
      if (options.assessmentId) {
        query = query.eq('assessment_id', options.assessmentId);
      }
      
      if (options.eventType) {
        query = query.eq('event_type', options.eventType);
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
    
    logDatabaseOperation('getScanEvents', SCAN_EVENTS_TABLE, options, result);
    
    return result;
  } catch (error) {
    logger.error('Error getting scan events', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Create a scan event
 * @param {Object} eventData - Event data
 * @param {string} eventData.domainId - Domain ID
 * @param {string} eventData.assessmentId - Assessment ID
 * @param {string} eventData.assessmentVersionId - Assessment version ID
 * @param {string} eventData.eventType - Event type
 * @param {string} eventData.status - Event status
 * @param {Object} eventData.metadata - Event metadata
 * @returns {Promise<Object>} - Created scan event object
 */
export async function createScanEvent(eventData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Create the scan event
      return await supabase
        .from(SCAN_EVENTS_TABLE)
        .insert({
          id: uuidv4(),
          domain_id: eventData.domainId,
          assessment_id: eventData.assessmentId,
          assessment_version_id: eventData.assessmentVersionId,
          event_type: eventData.eventType,
          status: eventData.status || 'pending',
          metadata: eventData.metadata || {},
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createScanEvent', SCAN_EVENTS_TABLE, { eventType: eventData.eventType }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating scan event', { error: error.message, stack: error.stack, eventType: eventData.eventType });
    throw error;
  }
}

/**
 * Update a scan event
 * @param {string} id - Scan event ID
 * @param {Object} eventData - Event data to update
 * @returns {Promise<Object>} - Updated scan event object
 */
export async function updateScanEvent(id, eventData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the scan event
      const updateData = {
        ...eventData,
        updated_at: new Date().toISOString()
      };
      
      return await supabase
        .from(SCAN_EVENTS_TABLE)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateScanEvent', SCAN_EVENTS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating scan event', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get assessment statistics
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @returns {Promise<Object>} - Statistics object
 */
export async function getAssessmentStatistics(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      // Define the time range
      const startDate = options.startDate ? new Date(options.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
      const endDate = options.endDate ? new Date(options.endDate) : new Date();
      
      // Get total count of assessments
      const { count: totalAssessments, error: assessmentError } = await supabase
        .from(ASSESSMENTS_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (assessmentError) {
        throw assessmentError;
      }
      
      // Get total count of assessment versions
      const { count: totalVersions, error: versionError } = await supabase
        .from(ASSESSMENT_VERSIONS_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (versionError) {
        throw versionError;
      }
      
      // Get total count of scan events
      const { count: totalScanEvents, error: scanError } = await supabase
        .from(SCAN_EVENTS_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (scanError) {
        throw scanError;
      }
      
      // Get counts by event type
      const { data: eventTypeData, error: eventTypeError } = await supabase
        .from(SCAN_EVENTS_TABLE)
        .select('event_type')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (eventTypeError) {
        throw eventTypeError;
      }
      
      const eventTypeCounts = {};
      eventTypeData.forEach(event => {
        eventTypeCounts[event.event_type] = (eventTypeCounts[event.event_type] || 0) + 1;
      });
      
      return {
        data: {
          totalAssessments,
          totalVersions,
          totalScanEvents,
          eventTypeCounts,
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
    logger.error('Error getting assessment statistics', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Add URL to unassessed queue
 * @param {string} url - The URL to add to queue
 * @returns {Promise<Object>} - Created queue entry
 */
export async function addToUnassessedQueue(url) {
  const supabase = getSupabaseAdminClient();
  const normalizedUrl = normalizeUrl(url);
  logger.info(`Adding URL to unassessed queue: ${url}, Normalized: ${normalizedUrl}`);

  // Check if normalized URL already exists in queue
  const { data: existing, error: checkError } = await supabase
    .from('unassessed_urls')
    .select('url')
    .eq('url', normalizedUrl)
    .single();

  if (existing) {
    logger.info(`URL already exists in unassessed queue: ${normalizedUrl}`);
    return existing;
  }

  // Add new entry to queue with normalized URL
  const { data, error } = await supabase
    .from('unassessed_urls')
    .insert({
      url: normalizedUrl,
      first_recorded: new Date().toISOString(),
      status: 'Pending',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get an assessment by ID or domain (compatibility wrapper)
 * @param {Object} params - { id, domain }
 * @returns {Promise<Object>} - Assessment object
 */
export async function getAssessment(params) {
  if (params.id) {
    return getAssessmentById(params.id);
  }
  if (params.domain) {
    return getAssessmentByDomain(params.domain);
  }
  throw new Error('Must provide either id or domain');
}

/**
 * Get an assessment by user agreement hash
 * @param {string} hash - User agreement hash
 * @returns {Promise<Object|null>} - Assessment object or null if not found
 */
export async function getAssessmentByHash(hash) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_agreement_hash', hash)
    .single();
  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    throw error;
  }
  return data;
}

/**
 * Get all assessments
 * @returns {Promise<Array>} - Array of assessment objects
 */
export async function getAllAssessments() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('assessments')
    .select('*');
  if (error) {
    throw error;
  }
  logger.info(`Retrieved ${data.length} assessments`);
  return data;
}

/**
 * Update suggested policy URLs for an unassessed URL
 * @param {string} url - The URL to update
 * @param {string[]} policyUrls - Array of suggested policy URLs
 * @returns {Promise<Object>} - Updated queue entry
 */
export async function updateSuggestedPolicyUrls(url, policyUrls) {
  const supabase = getSupabaseAdminClient();
  const normalizedUrl = normalizeUrl(url);
  logger.info(`Updating suggested policy URLs for: ${url}, Normalized: ${normalizedUrl}`);
  const { data, error } = await supabase
    .from('unassessed_urls')
    .update({ suggested_policy_urls: policyUrls })
    .eq('url', normalizedUrl)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

/**
 * Create or update assessment for a URL
 * @param {Object} assessment - Assessment data
 * @returns {Promise<Object>} - Updated assessment data
 */
export async function upsertAssessment(assessment) {
  const supabase = getSupabaseAdminClient();
  const originalUrl = assessment.url;
  const normalizedUrl = normalizeUrl(originalUrl);
  logger.info(`Upserting assessment for URL: ${originalUrl}, Normalized: ${normalizedUrl}`);
  const normalizedAssessment = {
    ...assessment,
    url: normalizedUrl,
  };
  const { data, error } = await supabase
    .from('websites')
    .upsert(normalizedAssessment)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

/**
 * Cleanup expired or revoked tokens from the user_tokens table
 * @returns {Promise<number>} - Number of tokens deleted
 */
export async function cleanupExpiredTokens() {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  logger.info('Cleaning up expired or revoked tokens');
  // Delete tokens that are expired or revoked
  const { count, error } = await supabase
    .from('user_tokens')
    .delete()
    .or(`expires_at.lt.${now},revoked.eq.true`)
    .select('id', { count: 'exact', head: true });
  if (error) {
    logger.error('Error cleaning up expired tokens', { error });
    throw error;
  }
  logger.info(`Deleted ${count} expired or revoked tokens`);
  return count;
}

/**
 * Fetch all policies for archiving (stub for archive job)
 * @returns {Promise<Array>} - Array of policy objects
 */
export async function queuePoliciesForArchiving() {
  const supabase = getSupabaseAdminClient();
  logger.info('Fetching all policies for archiving');
  const { data, error } = await supabase
    .from('policies')
    .select('*');
  if (error) {
    logger.error('Error fetching policies for archiving', { error });
    throw error;
  }
  logger.info(`Fetched ${data.length} policies for archiving`);
  return data;
}
