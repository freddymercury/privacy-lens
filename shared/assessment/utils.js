/**
 * Assessment utility functions for data processing and analytics
 * Pure functions for processing collections of assessments
 */

const { RISK_LEVELS, PRIVACY_CATEGORIES, normalizeRiskLevel, getRiskPriority } = require('./core');

/**
 * Pure function to group assessments by risk level
 * @param {Array} assessments - Array of assessment objects
 * @returns {Object} Assessments grouped by risk level
 */
function groupAssessmentsByRisk(assessments) {
  if (!Array.isArray(assessments)) {
    return {
      [RISK_LEVELS.HIGH]: [],
      [RISK_LEVELS.MEDIUM]: [],
      [RISK_LEVELS.LOW]: [],
      [RISK_LEVELS.UNKNOWN]: []
    };
  }

  const grouped = {
    [RISK_LEVELS.HIGH]: [],
    [RISK_LEVELS.MEDIUM]: [],
    [RISK_LEVELS.LOW]: [],
    [RISK_LEVELS.UNKNOWN]: []
  };

  for (const assessment of assessments) {
    const riskLevel = assessment?.privacy_assessment?.riskLevel || RISK_LEVELS.UNKNOWN;
    const normalizedRisk = normalizeRiskLevel(riskLevel);
    
    if (grouped[normalizedRisk]) {
      grouped[normalizedRisk].push(assessment);
    } else {
      grouped[RISK_LEVELS.UNKNOWN].push(assessment);
    }
  }

  return grouped;
}

/**
 * Pure function to count assessments by risk level
 * @param {Array} assessments - Array of assessment objects
 * @returns {Object} Count of assessments by risk level
 */
function countAssessmentsByRisk(assessments) {
  if (!Array.isArray(assessments)) {
    return {
      [RISK_LEVELS.HIGH]: 0,
      [RISK_LEVELS.MEDIUM]: 0,
      [RISK_LEVELS.LOW]: 0,
      [RISK_LEVELS.UNKNOWN]: 0,
      total: 0
    };
  }

  const counts = {
    [RISK_LEVELS.HIGH]: 0,
    [RISK_LEVELS.MEDIUM]: 0,
    [RISK_LEVELS.LOW]: 0,
    [RISK_LEVELS.UNKNOWN]: 0,
    total: assessments.length
  };

  for (const assessment of assessments) {
    const riskLevel = assessment?.privacy_assessment?.riskLevel || RISK_LEVELS.UNKNOWN;
    const normalizedRisk = normalizeRiskLevel(riskLevel);
    
    if (counts[normalizedRisk] !== undefined) {
      counts[normalizedRisk]++;
    } else {
      counts[RISK_LEVELS.UNKNOWN]++;
    }
  }

  return counts;
}

/**
 * Pure function to analyze category risk distribution across assessments
 * @param {Array} assessments - Array of assessment objects
 * @returns {Object} Category risk distribution
 */
function analyzeCategoryRiskDistribution(assessments) {
  if (!Array.isArray(assessments)) {
    return {};
  }

  const distribution = {};
  
  // Initialize distribution for all categories
  for (const category of PRIVACY_CATEGORIES) {
    distribution[category] = {
      [RISK_LEVELS.HIGH]: 0,
      [RISK_LEVELS.MEDIUM]: 0,
      [RISK_LEVELS.LOW]: 0,
      [RISK_LEVELS.UNKNOWN]: 0,
      total: 0
    };
  }

  // Count category risks across all assessments
  for (const assessment of assessments) {
    const categories = assessment?.privacy_assessment?.categories || {};
    
    for (const [categoryName, categoryData] of Object.entries(categories)) {
      if (distribution[categoryName] && categoryData && categoryData.risk) {
        const normalizedRisk = normalizeRiskLevel(categoryData.risk);
        
        if (distribution[categoryName][normalizedRisk] !== undefined) {
          distribution[categoryName][normalizedRisk]++;
          distribution[categoryName].total++;
        }
      }
    }
  }

  return distribution;
}

/**
 * Pure function to get top N highest risk assessments
 * @param {Array} assessments - Array of assessment objects
 * @param {number} limit - Number of top assessments to return
 * @returns {Array} Top N highest risk assessments
 */
function getTopRiskAssessments(assessments, limit = 10) {
  if (!Array.isArray(assessments)) {
    return [];
  }

  return assessments
    .filter(assessment => assessment?.privacy_assessment?.riskLevel)
    .sort((a, b) => {
      const riskA = a.privacy_assessment.riskLevel;
      const riskB = b.privacy_assessment.riskLevel;
      
      const priorityA = getRiskPriority(riskA);
      const priorityB = getRiskPriority(riskB);
      
      // Secondary sort by URL for consistency
      if (priorityA === priorityB) {
        return (a.url || '').localeCompare(b.url || '');
      }
      
      return priorityB - priorityA; // Higher risk first
    })
    .slice(0, limit);
}

/**
 * Pure function to calculate risk percentage distribution
 * @param {Array} assessments - Array of assessment objects
 * @returns {Object} Risk percentage distribution
 */
function calculateRiskPercentages(assessments) {
  const counts = countAssessmentsByRisk(assessments);
  const total = counts.total;
  
  if (total === 0) {
    return {
      [RISK_LEVELS.HIGH]: 0,
      [RISK_LEVELS.MEDIUM]: 0,
      [RISK_LEVELS.LOW]: 0,
      [RISK_LEVELS.UNKNOWN]: 0
    };
  }

  return {
    [RISK_LEVELS.HIGH]: Math.round((counts[RISK_LEVELS.HIGH] / total) * 100),
    [RISK_LEVELS.MEDIUM]: Math.round((counts[RISK_LEVELS.MEDIUM] / total) * 100),
    [RISK_LEVELS.LOW]: Math.round((counts[RISK_LEVELS.LOW] / total) * 100),
    [RISK_LEVELS.UNKNOWN]: Math.round((counts[RISK_LEVELS.UNKNOWN] / total) * 100)
  };
}

/**
 * Pure function to filter assessments by date range
 * @param {Array} assessments - Array of assessment objects
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 * @returns {Array} Filtered assessments
 */
function filterAssessmentsByDateRange(assessments, startDate, endDate) {
  if (!Array.isArray(assessments)) {
    return [];
  }

  if (!startDate && !endDate) {
    return [...assessments]; // Return copy if no date filtering
  }

  return assessments.filter(assessment => {
    const lastUpdated = assessment?.last_updated;
    if (!lastUpdated) return false;
    
    const assessmentDate = new Date(lastUpdated);
    
    if (startDate && assessmentDate < startDate) return false;
    if (endDate && assessmentDate > endDate) return false;
    
    return true;
  });
}

/**
 * Pure function to group assessments by time period (month/week/day)
 * @param {Array} assessments - Array of assessment objects
 * @param {string} period - Time period ('month', 'week', 'day')
 * @returns {Object} Assessments grouped by time period
 */
function groupAssessmentsByTimePeriod(assessments, period = 'month') {
  if (!Array.isArray(assessments)) {
    return {};
  }

  const grouped = {};

  for (const assessment of assessments) {
    const lastUpdated = assessment?.last_updated;
    if (!lastUpdated) continue;

    const date = new Date(lastUpdated);
    let periodKey;

    switch (period) {
      case 'day':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        break;
      case 'week':
        // Get Monday of the week
        const monday = new Date(date);
        monday.setDate(date.getDate() - date.getDay() + 1);
        periodKey = `${monday.getFullYear()}-W${String(Math.ceil(monday.getDate() / 7)).padStart(2, '0')}`;
        break;
      case 'month':
      default:
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
    }

    if (!grouped[periodKey]) {
      grouped[periodKey] = [];
    }
    grouped[periodKey].push(assessment);
  }

  return grouped;
}

/**
 * Pure function to find assessments similar to a given assessment
 * @param {Object} targetAssessment - Assessment to find similar ones for
 * @param {Array} assessments - Array of all assessments
 * @param {number} limit - Maximum number of similar assessments to return
 * @returns {Array} Similar assessments ordered by similarity
 */
function findSimilarAssessments(targetAssessment, assessments, limit = 5) {
  if (!targetAssessment?.privacy_assessment || !Array.isArray(assessments)) {
    return [];
  }

  const targetRisk = normalizeRiskLevel(targetAssessment.privacy_assessment.riskLevel);
  const targetCategories = targetAssessment.privacy_assessment.categories || {};

  const similarities = assessments
    .filter(assessment => 
      assessment?.url !== targetAssessment.url && // Exclude self
      assessment?.privacy_assessment
    )
    .map(assessment => {
      let similarityScore = 0;
      
      // Score based on overall risk level match
      const assessmentRisk = normalizeRiskLevel(assessment.privacy_assessment.riskLevel);
      if (assessmentRisk === targetRisk) {
        similarityScore += 3;
      } else if (Math.abs(getRiskPriority(assessmentRisk) - getRiskPriority(targetRisk)) === 1) {
        similarityScore += 1; // Adjacent risk levels
      }

      // Score based on category risk matches
      const assessmentCategories = assessment.privacy_assessment.categories || {};
      let categoryMatches = 0;
      let totalCategories = 0;

      for (const category of PRIVACY_CATEGORIES) {
        const targetCategoryRisk = targetCategories[category]?.risk;
        const assessmentCategoryRisk = assessmentCategories[category]?.risk;
        
        if (targetCategoryRisk || assessmentCategoryRisk) {
          totalCategories++;
          
          if (targetCategoryRisk && assessmentCategoryRisk) {
            const normalizedTarget = normalizeRiskLevel(targetCategoryRisk);
            const normalizedAssessment = normalizeRiskLevel(assessmentCategoryRisk);
            
            if (normalizedTarget === normalizedAssessment) {
              categoryMatches++;
            }
          }
        }
      }

      if (totalCategories > 0) {
        similarityScore += (categoryMatches / totalCategories) * 2;
      }

      return {
        assessment,
        similarityScore
      };
    })
    .filter(item => item.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit)
    .map(item => item.assessment);

  return similarities;
}

/**
 * Pure function to validate assessment data integrity
 * @param {Object} assessment - Assessment to validate
 * @returns {Object} Validation result with isValid boolean and issues array
 */
function validateAssessmentIntegrity(assessment) {
  const issues = [];
  
  if (!assessment) {
    return { isValid: false, issues: ['Assessment object is null or undefined'] };
  }

  // Check required fields
  if (!assessment.url || typeof assessment.url !== 'string') {
    issues.push('Missing or invalid URL');
  }

  if (!assessment.privacy_assessment) {
    issues.push('Missing privacy assessment data');
  } else {
    const privacyAssessment = assessment.privacy_assessment;
    
    // Check risk level
    if (!privacyAssessment.riskLevel) {
      issues.push('Missing risk level');
    } else {
      const normalized = normalizeRiskLevel(privacyAssessment.riskLevel);
      if (!Object.values(RISK_LEVELS).includes(normalized)) {
        issues.push('Invalid risk level value');
      }
    }

    // Check categories
    if (privacyAssessment.categories && typeof privacyAssessment.categories === 'object') {
      for (const [categoryName, categoryData] of Object.entries(privacyAssessment.categories)) {
        if (!PRIVACY_CATEGORIES.includes(categoryName)) {
          issues.push(`Unknown category: ${categoryName}`);
        }
        
        if (!categoryData || typeof categoryData !== 'object') {
          issues.push(`Invalid category data for: ${categoryName}`);
        } else {
          if (!categoryData.risk) {
            issues.push(`Missing risk for category: ${categoryName}`);
          }
          if (!categoryData.explanation) {
            issues.push(`Missing explanation for category: ${categoryName}`);
          }
        }
      }
    }

    // Check summary
    if (!privacyAssessment.summary || typeof privacyAssessment.summary !== 'string') {
      issues.push('Missing or invalid summary');
    }
  }

  // Check timestamps
  if (assessment.last_updated) {
    const date = new Date(assessment.last_updated);
    if (isNaN(date.getTime())) {
      issues.push('Invalid last_updated timestamp');
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

module.exports = {
  // Grouping and aggregation functions
  groupAssessmentsByRisk,
  countAssessmentsByRisk,
  analyzeCategoryRiskDistribution,
  
  // Filtering and selection functions
  getTopRiskAssessments,
  filterAssessmentsByDateRange,
  groupAssessmentsByTimePeriod,
  
  // Analysis functions
  calculateRiskPercentages,
  findSimilarAssessments,
  
  // Validation functions
  validateAssessmentIntegrity
}; 