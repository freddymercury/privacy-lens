/**
 * Shared Assessment Module for PrivacyLens
 * 
 * This module provides functionality for assessing privacy policies.
 */

import fetch from 'node-fetch';
import crypto from 'crypto';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { normalizeUrl, getPolicyType, getFullUrl } from '../utils/domainUtils.js';
import { publishToQueue, QUEUE_NAMES } from '../config/queue.js';
import { 
  getAssessment, 
  getAssessmentByHash, 
  upsertAssessment, 
  addToUnassessedQueue,
  updateSuggestedPolicyUrls
} from '../db/assessments.js';
import { addPolicyForArchiving } from '../db/archive.js';
import { logAuditEvent, AUDIT_ACTIONS, ENTITY_TYPES } from '../db/audit.js';

// Initialize logger
const logger = createLogger('Assessment');

// Environment-based configuration with sensible defaults
const config = {
  llmApiKey: process.env.LLM_API_KEY || 'your-llm-api-key',
  llmApiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
  llmModel: process.env.LLM_MODEL || 'gpt-4',
  llmTimeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000', 10),
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
  maxPolicyLength: parseInt(process.env.MAX_POLICY_LENGTH || '100000', 10),
  maxRetries: parseInt(process.env.ASSESSMENT_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.ASSESSMENT_RETRY_DELAY || '1000', 10)
};

/**
 * Generate a hash for a URL
 * @param {string} url - URL to hash
 * @returns {string} - Hash of the URL
 */
export function generateUrlHash(url) {
  try {
    // Normalize the URL before hashing
    const normalizedUrl = normalizeUrl(url);
    
    // Create a hash of the normalized URL
    const hash = crypto.createHash('sha256').update(normalizedUrl).digest('hex');
    
    return hash;
  } catch (error) {
    logger.error(`Error generating URL hash for ${url}:`, error);
    throw error;
  }
}

/**
 * Fetch the content of a URL
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} - Response object with content and metadata
 */
export async function fetchUrlContent(url) {
  try {
    logger.info(`Fetching content for URL: ${url}`);
    
    // Ensure the URL has a protocol
    const fullUrl = getFullUrl(url);
    
    // Fetch the URL with a timeout
    const response = await fetch(fullUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'PrivacyLens/1.0 (+https://privacylens.org/bot)'
      }
    });
    
    if (!response.ok) {
      logger.warn(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        content: null,
        contentType: null
      };
    }
    
    // Get the content type
    const contentType = response.headers.get('content-type') || '';
    
    // Check if it's a text-based content type
    if (!contentType.includes('text/html') && 
        !contentType.includes('text/plain') && 
        !contentType.includes('application/json')) {
      logger.warn(`Unsupported content type for URL ${url}: ${contentType}`);
      return {
        success: false,
        status: response.status,
        statusText: 'Unsupported content type',
        content: null,
        contentType
      };
    }
    
    // Get the content
    const content = await response.text();
    
    // Check if the content is too large
    if (content.length > config.maxPolicyLength) {
      logger.warn(`Content too large for URL ${url}: ${content.length} bytes`);
      return {
        success: false,
        status: response.status,
        statusText: 'Content too large',
        content: content.substring(0, config.maxPolicyLength),
        contentType,
        truncated: true
      };
    }
    
    logger.info(`Successfully fetched URL ${url}: ${content.length} bytes`);
    
    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      content,
      contentType
    };
  } catch (error) {
    logger.error(`Error fetching URL ${url}:`, error);
    return {
      success: false,
      status: 0,
      statusText: error.message,
      content: null,
      contentType: null
    };
  }
}

/**
 * Analyze a privacy policy using LLM
 * @param {string} policyContent - Content of the privacy policy
 * @param {string} url - URL of the privacy policy
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzePolicyWithLLM(policyContent, url) {
  try {
    logger.info(`Analyzing policy for URL: ${url}`);
    
    // Prepare the prompt
    const prompt = `
      You are an expert in privacy policies and data protection regulations. 
      Analyze the following privacy policy and provide a detailed assessment.
      
      URL: ${url}
      
      Privacy Policy:
      ${policyContent.substring(0, config.llmMaxTokens)}
      
      Please provide the following information:
      1. A summary of the key points (max 5 bullet points)
      2. Data collection practices (what data is collected)
      3. Data sharing practices (who the data is shared with)
      4. User rights (what rights users have regarding their data)
      5. Data retention policies (how long data is kept)
      6. Security measures (how data is protected)
      7. Concerns (any concerning practices or red flags)
      8. Overall privacy score (1-10, where 10 is most privacy-respecting)
      9. Readability score (1-10, where 10 is most readable)
      
      Format your response as a JSON object with the following structure:
      {
        "summary": ["point 1", "point 2", ...],
        "dataCollection": "detailed analysis",
        "dataSharing": "detailed analysis",
        "userRights": "detailed analysis",
        "dataRetention": "detailed analysis",
        "security": "detailed analysis",
        "concerns": ["concern 1", "concern 2", ...],
        "privacyScore": number,
        "readabilityScore": number,
        "analysis": "overall analysis"
      }
    `;
    
    // Call the LLM API
    const response = await fetch(config.llmApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.llmApiKey}`
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert privacy policy analyzer. Provide detailed, accurate analyses in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: config.llmTemperature,
        max_tokens: config.llmMaxTokens
      }),
      timeout: config.llmTimeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`LLM API error: ${response.status} ${response.statusText}`, { error: errorText });
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract the content from the response
    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let analysis;
    try {
      // Find the JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON object found in LLM response');
      }
    } catch (parseError) {
      logger.error(`Error parsing LLM response:`, parseError);
      throw new Error(`Error parsing LLM response: ${parseError.message}`);
    }
    
    logger.info(`Successfully analyzed policy for URL ${url}`);
    
    return {
      success: true,
      analysis
    };
  } catch (error) {
    logger.error(`Error analyzing policy for URL ${url}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process a single URL for assessment
 * @param {string} url - URL to process
 * @param {string[]} suggestedPolicyUrls - Suggested policy URLs
 * @param {boolean} queueIfNotPolicy - Whether to queue the URL if it's not a policy
 * @returns {Promise<Object>} - Assessment results
 */
export async function processSingleUrl(url, suggestedPolicyUrls = [], queueIfNotPolicy = true) {
  try {
    logger.info(`Processing URL: ${url}`);
    
    // Generate a hash for the URL
    const urlHash = generateUrlHash(url);
    
    // Check if we already have an assessment for this URL
    const existingAssessment = await getAssessmentByHash(urlHash);
    
    if (existingAssessment) {
      logger.info(`Found existing assessment for URL ${url}`);
      return {
        status: 'existing',
        assessment: existingAssessment
      };
    }
    
    // Determine if this is a policy URL
    const policyType = getPolicyType(url);
    
    if (!policyType) {
      logger.info(`URL ${url} is not a recognized policy URL`);
      
      // If we have suggested policy URLs, update them
      if (suggestedPolicyUrls.length > 0) {
        await updateSuggestedPolicyUrls(url, suggestedPolicyUrls);
        logger.info(`Updated suggested policy URLs for ${url}`);
      }
      
      // If we should queue non-policy URLs, add it to the unassessed queue
      if (queueIfNotPolicy) {
        await addToUnassessedQueue(url, suggestedPolicyUrls);
        logger.info(`Added URL ${url} to unassessed queue`);
      }
      
      return {
        status: 'not_policy',
        suggestedPolicyUrls
      };
    }
    
    // Fetch the content of the URL
    const fetchResult = await fetchUrlContent(url);
    
    if (!fetchResult.success) {
      logger.warn(`Failed to fetch content for URL ${url}`);
      
      // Create a failed assessment record
      const assessment = {
        url,
        urlHash,
        domainName: normalizeUrl(url),
        policyType,
        status: 'failed',
        error: fetchResult.statusText,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await upsertAssessment(assessment);
      
      return {
        status: 'failed',
        error: fetchResult.statusText
      };
    }
    
    // Analyze the policy
    const analysisResult = await analyzePolicyWithLLM(fetchResult.content, url);
    
    if (!analysisResult.success) {
      logger.warn(`Failed to analyze policy for URL ${url}`);
      
      // Create a failed assessment record
      const assessment = {
        url,
        urlHash,
        domainName: normalizeUrl(url),
        policyType,
        status: 'failed',
        error: analysisResult.error,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await upsertAssessment(assessment);
      
      return {
        status: 'failed',
        error: analysisResult.error
      };
    }
    
    // Create the assessment record
    const assessment = {
      url,
      urlHash,
      domainName: normalizeUrl(url),
      policyType,
      status: 'completed',
      content: fetchResult.content,
      contentHash: crypto.createHash('sha256').update(fetchResult.content).digest('hex'),
      analysis: analysisResult.analysis,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Save the assessment
    const savedAssessment = await upsertAssessment(assessment);
    
    // Add the policy to the archiving queue
    await addPolicyForArchiving({
      domainName: assessment.domainName,
      policyUrl: url,
      policyType,
      content: fetchResult.content,
      contentHash: assessment.contentHash
    });
    
    // Log the audit event
    await logAuditEvent({
      action: AUDIT_ACTIONS.ASSESS,
      entity_type: ENTITY_TYPES.POLICY,
      entity_id: savedAssessment.id,
      details: { 
        url, 
        policyType,
        privacyScore: analysisResult.analysis.privacyScore,
        readabilityScore: analysisResult.analysis.readabilityScore
      }
    });
    
    logger.info(`Successfully processed URL ${url}`);
    
    return {
      status: 'completed',
      assessment: savedAssessment
    };
  } catch (error) {
    logger.error(`Error processing URL ${url}:`, error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Queue a URL for assessment
 * @param {string} url - URL to queue
 * @param {string[]} suggestedPolicyUrls - Suggested policy URLs
 * @param {string} userId - User ID (optional)
 * @returns {Promise<Object>} - Queue result
 */
export async function queueUrlForAssessment(url, suggestedPolicyUrls = [], userId = null) {
  try {
    logger.info(`Queueing URL for assessment: ${url}`);
    
    // Add user ID to context if provided
    if (userId) {
      const context = getContext();
      if (context) {
        context.userId = userId;
      }
    }
    
    // Check if this is a policy URL
    const policyType = getPolicyType(url);
    
    if (policyType) {
      // If it's a policy URL, process it immediately
      return await processSingleUrl(url, suggestedPolicyUrls, false);
    } else {
      // If it's not a policy URL, add it to the unassessed queue
      await addToUnassessedQueue(url, suggestedPolicyUrls);
      
      // Publish a message to the queue
      await publishToQueue(QUEUE_NAMES.UNASSESSED_URLS, {
        url,
        suggestedPolicyUrls,
        userId
      });
      
      logger.info(`URL ${url} queued for assessment`);
      
      return {
        status: 'queued',
        message: 'URL queued for assessment'
      };
    }
  } catch (error) {
    logger.error(`Error queueing URL ${url} for assessment:`, error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Get an assessment for a URL
 * @param {string} url - URL to get assessment for
 * @returns {Promise<Object>} - Assessment result
 */
export async function getAssessmentForUrl(url) {
  try {
    logger.info(`Getting assessment for URL: ${url}`);
    
    // Generate a hash for the URL
    const urlHash = generateUrlHash(url);
    
    // Get the assessment
    const assessment = await getAssessmentByHash(urlHash);
    
    if (!assessment) {
      logger.info(`No assessment found for URL ${url}`);
      return {
        status: 'not_found'
      };
    }
    
    logger.info(`Found assessment for URL ${url}`);
    
    return {
      status: 'found',
      assessment
    };
  } catch (error) {
    logger.error(`Error getting assessment for URL ${url}:`, error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Get or create an assessment for a URL
 * @param {string} url - URL to get or create assessment for
 * @param {string[]} suggestedPolicyUrls - Suggested policy URLs
 * @param {string} userId - User ID (optional)
 * @returns {Promise<Object>} - Assessment result
 */
export async function getOrCreateAssessment(url, suggestedPolicyUrls = [], userId = null) {
  try {
    logger.info(`Getting or creating assessment for URL: ${url}`);
    
    // Try to get an existing assessment
    const getResult = await getAssessmentForUrl(url);
    
    if (getResult.status === 'found') {
      return getResult;
    }
    
    // If not found, process the URL
    return await processSingleUrl(url, suggestedPolicyUrls, true);
  } catch (error) {
    logger.error(`Error getting or creating assessment for URL ${url}:`, error);
    return {
      status: 'error',
      error: error.message
    };
  }
}
