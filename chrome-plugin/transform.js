// Data transformation utilities for PrivacyGuard Chrome Plugin

/**
 * Transforms server response data into the format required for local database storage
 * @param {string} domain - The normalized domain for this assessment
 * @param {Object} serverResponse - The raw server response
 * @returns {Object} - Formatted object ready for IndexedDB storage
 */
function transformServerResponse(domain, serverResponse) {
  // Validate input
  if (!serverResponse || !serverResponse.assessment) {
    throw new Error('Invalid server response format');
  }

  console.log("Server response:", serverResponse);
  // Current timestamp for metadata
  const timestamp = Date.now();
  
  // Create the transformed object
  return {
    // Primary key
    domain: domain,
    
    // Assessment data (direct from server)
    assessment: {
      ...serverResponse.assessment,
      
      // Ensure riskLevel is normalized to lowercase for consistency
      riskLevel: normalizeRiskLevel(serverResponse.assessment.riskLevel),
      
      // Add policy URL if available
      policyUrl: serverResponse.assessment.policyUrl || null
    },
    
    // Add metadata
    metadata: {
      timestamp: timestamp,
      source: "server",
      version: "1.0.0", // This should match your current assessment format version
      serverTimestamp: serverResponse.timestamp || timestamp // Use server timestamp if available
    }
  };
}

/**
 * Transforms multiple server responses for bulk database operations
 * @param {Object} serverResponses - Object with domains as keys and server responses as values
 * @returns {Array} - Array of objects ready for IndexedDB storage
 */
function transformBulkServerResponses(serverResponses) {
  const transformedData = [];
  
  for (const [domain, response] of Object.entries(serverResponses)) {
    try {
      const transformedItem = transformServerResponse(domain, response);
      transformedData.push(transformedItem);
    } catch (error) {
      console.error(`[PrivacyGuard Transform] Error transforming data for domain ${domain}:`, error);
      // Continue with other domains even if one fails
    }
  }
  
  return transformedData;
}

/**
 * Normalize risk level to lowercase string format
 * @param {string|Object} riskLevel - The risk level to normalize
 * @returns {string} - Normalized risk level
 */
function normalizeRiskLevel(riskLevel) {
  // Handle different possible structures of the risk level
  if (typeof riskLevel === 'string') {
    return riskLevel.toLowerCase();
  } else if (riskLevel && typeof riskLevel === 'object' && riskLevel.risk) {
    return typeof riskLevel.risk === 'string'
      ? riskLevel.risk.toLowerCase()
      : 'unknown';
  } else {
    console.error(
      `[PrivacyGuard Transform] Unexpected risk level structure:`,
      riskLevel
    );
    return 'unknown';
  }
}

/**
 * Transform pre-packaged data for database storage
 * @param {Object} prepackagedData - The pre-packaged data
 * @returns {Array} - Array of objects ready for IndexedDB storage
 */
function transformPrepackagedData(prepackagedData) {
  if (!prepackagedData.assessments || typeof prepackagedData.assessments !== 'object') {
    throw new Error('Invalid pre-packaged database format');
  }
  
  return Object.entries(prepackagedData.assessments).map(([domain, data]) => ({
    domain,
    assessment: {
      ...data.assessment,
      riskLevel: normalizeRiskLevel(data.assessment.riskLevel),
      // Add policy URL if available in the prepackaged data
      policyUrl: data.assessment.policyUrl || null
    },
    metadata: {
      ...data.metadata,
      source: "prepackaged"
    }
  }));
}

/**
 * Format category name for display
 * @param {string} category - The category name to format
 * @returns {string} - Formatted category name
 */
function formatCategoryName(category) {
  if (!category) return "";
  return category
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Add source information to assessment display
 * @param {Object} assessment - The assessment object from database
 * @returns {Object} - Assessment with source information
 */
function addSourceInfoToAssessment(assessment) {
  if (!assessment) return null;
  
  // Create a copy to avoid modifying the original
  const enrichedAssessment = { ...assessment };
  
  // Add source information if available
  if (assessment.metadata && assessment.metadata.source) {
    enrichedAssessment.sourceInfo = {
      source: assessment.metadata.source,
      timestamp: assessment.metadata.timestamp,
      formattedDate: new Date(assessment.metadata.timestamp).toLocaleDateString()
    };
  }
  
  return enrichedAssessment;
}

// Export functions
export {
  transformServerResponse,
  transformBulkServerResponses,
  normalizeRiskLevel,
  transformPrepackagedData,
  formatCategoryName,
  addSourceInfoToAssessment
};
