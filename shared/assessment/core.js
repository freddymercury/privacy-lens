/**
 * Core assessment data structures and constants
 * Pure data definitions and validation functions for privacy assessments
 */

/**
 * Privacy risk categories for assessment
 */
const PRIVACY_CATEGORIES = [
  "Data Collection & Use",
  "Third-Party Sharing & Selling",
  "Data Storage & Security", 
  "User Rights & Control",
  "AI & Automated Decision-Making",
  "Policy Changes & Updates",
];

/**
 * Risk levels enumeration
 */
const RISK_LEVELS = {
  HIGH: "High",
  MEDIUM: "Medium", 
  LOW: "Low",
  UNKNOWN: "Unknown",
};

/**
 * Assessment status enumeration
 */
const ASSESSMENT_STATUS = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed", 
  FAILED: "Failed",
  UNKNOWN: "Unknown"
};

/**
 * Pure function to create assessment object structure
 * @param {Object} options - Assessment creation options
 * @param {string} options.url - Website URL
 * @param {string} options.riskLevel - Overall risk level
 * @param {Object} options.categories - Category assessments
 * @param {string} options.summary - Assessment summary
 * @param {string} options.policyUrl - Privacy policy URL
 * @param {string} options.policyHash - Privacy policy content hash
 * @param {boolean} options.manualEntry - Whether manually entered
 * @returns {Object} Structured assessment object
 */
function createAssessment(options) {
  const {
    url,
    riskLevel = RISK_LEVELS.UNKNOWN,
    categories = {},
    summary = "",
    policyUrl = null,
    policyHash = null,
    manualEntry = false
  } = options;

  if (!url || typeof url !== 'string') {
    throw new Error('Valid URL is required for assessment');
  }

  const timestamp = new Date().toISOString();

  return {
    url,
    privacy_assessment: {
      riskLevel: normalizeRiskLevel(riskLevel),
      categories: validateCategories(categories),
      summary: summary || "No summary provided"
    },
    user_agreement_url: policyUrl,
    user_agreement_hash: policyHash,
    last_updated: timestamp,
    manual_entry: Boolean(manualEntry)
  };
}

/**
 * Pure function to create category assessment
 * @param {string} risk - Risk level for category
 * @param {string} explanation - Explanation of risk assessment
 * @returns {Object} Category assessment object
 */
function createCategoryAssessment(risk, explanation) {
  return {
    risk: normalizeRiskLevel(risk),
    explanation: explanation || "No explanation provided"
  };
}

/**
 * Pure function to normalize risk level to standard values
 * @param {string|Object} riskLevel - Risk level from various sources
 * @returns {string} Normalized risk level
 */
function normalizeRiskLevel(riskLevel) {
  // Handle string input
  if (typeof riskLevel === 'string') {
    const level = riskLevel.toLowerCase().trim();
    if (level.includes('high')) return RISK_LEVELS.HIGH;
    if (level.includes('medium') || level.includes('moderate')) return RISK_LEVELS.MEDIUM; 
    if (level.includes('low')) return RISK_LEVELS.LOW;
    return RISK_LEVELS.UNKNOWN;
  }
  
  // Handle object input (backward compatibility)
  if (riskLevel && typeof riskLevel === 'object' && riskLevel.risk) {
    return normalizeRiskLevel(riskLevel.risk);
  }
  
  return RISK_LEVELS.UNKNOWN;
}

/**
 * Pure function to get priority value for risk levels (for comparison)
 * @param {string} riskLevel - Risk level
 * @returns {number} Priority value (higher = more severe)
 */
function getRiskPriority(riskLevel) {
  const normalized = normalizeRiskLevel(riskLevel);
  switch (normalized) {
    case RISK_LEVELS.HIGH:
      return 3;
    case RISK_LEVELS.MEDIUM:
      return 2;
    case RISK_LEVELS.LOW:
      return 1;
    case RISK_LEVELS.UNKNOWN:
    default:
      return 0;
  }
}

/**
 * Pure function to validate assessment structure
 * @param {Object} assessment - Assessment object to validate
 * @returns {boolean} Whether assessment has valid structure
 */
function isValidAssessment(assessment) {
  return assessment &&
         typeof assessment === 'object' &&
         typeof assessment.url === 'string' &&
         assessment.url.length > 0 &&
         assessment.privacy_assessment &&
         typeof assessment.privacy_assessment === 'object' &&
         typeof assessment.privacy_assessment.riskLevel === 'string' &&
         typeof assessment.privacy_assessment.categories === 'object' &&
         typeof assessment.privacy_assessment.summary === 'string';
}

/**
 * Pure function to validate categories object
 * @param {Object} categories - Categories to validate
 * @returns {Object} Validated categories object
 */
function validateCategories(categories) {
  if (!categories || typeof categories !== 'object') {
    return {};
  }

  const validatedCategories = {};
  
  // Only include known categories with valid structure
  for (const category of PRIVACY_CATEGORIES) {
    if (categories[category] && 
        typeof categories[category] === 'object' &&
        categories[category].risk &&
        categories[category].explanation) {
      validatedCategories[category] = {
        risk: normalizeRiskLevel(categories[category].risk),
        explanation: categories[category].explanation
      };
    }
  }

  return validatedCategories;
}

/**
 * Pure function to extract assessment summary for display
 * @param {Object} assessment - Assessment object
 * @returns {Object} Summary object for display
 */
function extractAssessmentSummary(assessment) {
  if (!isValidAssessment(assessment)) {
    return null;
  }

  return {
    url: assessment.url,
    riskLevel: assessment.privacy_assessment.riskLevel,
    summary: assessment.privacy_assessment.summary,
    lastUpdated: assessment.last_updated,
    policyUrl: assessment.user_agreement_url,
    manualEntry: assessment.manual_entry,
    categoryCount: Object.keys(assessment.privacy_assessment.categories).length
  };
}

/**
 * Pure function to calculate overall risk from categories
 * @param {Object} categories - Category assessments
 * @returns {string} Overall risk level
 */
function calculateOverallRisk(categories) {
  if (!categories || typeof categories !== 'object') {
    return RISK_LEVELS.UNKNOWN;
  }

  let maxRisk = RISK_LEVELS.UNKNOWN;
  let maxPriority = 0;

  for (const category in categories) {
    const categoryData = categories[category];
    if (categoryData && categoryData.risk) {
      const priority = getRiskPriority(categoryData.risk);
      if (priority > maxPriority) {
        maxPriority = priority;
        maxRisk = categoryData.risk;
      }
    }
  }

  return maxRisk;
}

/**
 * Pure function to compare two assessments by risk level
 * @param {Object} assessmentA - First assessment
 * @param {Object} assessmentB - Second assessment
 * @returns {number} Comparison result (-1, 0, 1)
 */
function compareAssessmentsByRisk(assessmentA, assessmentB) {
  const riskA = assessmentA?.privacy_assessment?.riskLevel || RISK_LEVELS.UNKNOWN;
  const riskB = assessmentB?.privacy_assessment?.riskLevel || RISK_LEVELS.UNKNOWN;
  
  const priorityA = getRiskPriority(riskA);
  const priorityB = getRiskPriority(riskB);
  
  return priorityB - priorityA; // Higher risk first (descending)
}

/**
 * Pure function to filter assessments by risk level
 * @param {Array} assessments - Array of assessments
 * @param {string} targetRiskLevel - Risk level to filter by
 * @returns {Array} Filtered assessments
 */
function filterAssessmentsByRisk(assessments, targetRiskLevel) {
  if (!Array.isArray(assessments)) {
    return [];
  }

  const normalizedTarget = normalizeRiskLevel(targetRiskLevel);
  
  return assessments.filter(assessment => {
    const assessmentRisk = assessment?.privacy_assessment?.riskLevel;
    return normalizeRiskLevel(assessmentRisk) === normalizedTarget;
  });
}

module.exports = {
  // Constants
  PRIVACY_CATEGORIES,
  RISK_LEVELS,
  ASSESSMENT_STATUS,
  
  // Pure assessment creation functions
  createAssessment,
  createCategoryAssessment,
  
  // Pure validation and normalization functions
  normalizeRiskLevel,
  getRiskPriority,
  isValidAssessment,
  validateCategories,
  
  // Pure analysis functions
  extractAssessmentSummary,
  calculateOverallRisk,
  compareAssessmentsByRisk,
  filterAssessmentsByRisk
}; 