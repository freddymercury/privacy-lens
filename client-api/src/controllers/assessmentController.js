const { supabaseServiceRole } = require('../../../shared/db/client.js');
const { normalizeUrl } = require('../../../shared/assessment/domain.js');
const { computeTextHash, createAssessmentPrompt } = require('../../../shared/assessment/llm.js');
const { createAssessment, isValidAssessment } = require('../../../shared/assessment/core.js');

/**
 * Pure function to format assessment for API response
 * @param {Object} assessment - Raw assessment data from database
 * @returns {Object} - Formatted assessment for API response
 */
const formatAssessmentForResponse = (assessment) => {
  if (!isValidAssessment(assessment)) {
    return null;
  }

  return {
    url: assessment.url,
    riskLevel: assessment.privacy_assessment.riskLevel,
    categories: assessment.privacy_assessment.categories,
    summary: assessment.privacy_assessment.summary,
    lastUpdated: assessment.last_updated,
    policyUrl: assessment.user_agreement_url,
  };
};

/**
 * Get privacy assessment for a URL (pure function approach)
 * @param {string} url - The URL to get assessment for
 * @param {Object} assessment - Raw assessment data from database
 * @param {Function} urlNormalizer - Pure function to normalize URL
 * @param {Function} formatter - Pure function to format response
 * @returns {Object} - Assessment data or null
 */
const getAssessmentPure = (url, assessment, urlNormalizer, formatter) => {
  if (!url) {
    throw new Error('URL parameter is required');
  }

  const normalizedUrl = urlNormalizer(url);

  if (assessment) {
    // Use formatter function to prepare response data
    return formatter(assessment);
  }

  return null;
};

/**
 * Pure function to create a mock assessment for demonstration
 * @param {string} url - The URL being assessed
 * @param {string} text - The policy text
 * @returns {Object} Mock assessment object
 */
const createMockAssessment = (url, text) => {
  // Simple heuristic-based assessment for demonstration
  const textLower = text.toLowerCase();
  let riskLevel = 'Medium';
  
  // High risk indicators
  if (textLower.includes('sell') || textLower.includes('third party') || textLower.includes('advertising')) {
    riskLevel = 'High';
  }
  // Low risk indicators
  else if (textLower.includes('not sell') || textLower.includes('privacy-focused') || textLower.includes('minimal data')) {
    riskLevel = 'Low';
  }

  return {
    riskLevel,
    categories: {
      "Data Collection & Use": {
        risk: riskLevel,
        explanation: "Assessment based on policy text analysis"
      }
    },
    summary: `Privacy policy assessment for ${url}. Risk level: ${riskLevel}`
  };
};

/**
 * Get privacy assessment for a URL
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAssessment = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: "error",
        message: "URL parameter is required",
      });
    }

    // Get assessment from database
    const { data: assessment, error } = await supabaseServiceRole
      .from('websites')
      .select('*')
      .eq('url', normalizeUrl(url))
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw error;
    }

    // Use pure function to process the result
    const result = getAssessmentPure(url, assessment, normalizeUrl, formatAssessmentForResponse);

    return res.status(200).json({
      status: "success",
      assessment: result,
    });

  } catch (error) {
    console.error("Error getting assessment:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to get assessment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Trigger a new assessment for a URL
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const triggerAssessment = async (req, res) => {
  try {
    const { url } = req.params;
    const { manualText } = req.body;

    console.log(`[AssessmentController] Triggering assessment for URL: ${url}`);

    if (!url) {
      console.log(`[AssessmentController] Error: URL parameter is missing`);
      return res.status(400).json({
        status: "error",
        message: "URL parameter is required",
      });
    }

    // For now, we only support manual text input in the client-api
    // Full automated assessment would require additional services
    if (!manualText) {
      return res.status(400).json({
        status: "error",
        message: "Manual text is required for assessment in client API. Automated assessment not yet implemented.",
      });
    }

    console.log(`[AssessmentController] Using manually provided text`);
    
    // Normalize the URL
    const normalizedUrl = normalizeUrl(url);
    
    // Create assessment data
    const agreementData = {
      text: manualText,
      hash: computeTextHash(manualText),
      url: normalizedUrl,
    };

    // Create a mock assessment (in a real implementation, this would call an LLM service)
    console.log(
      `[AssessmentController] Creating assessment for ${normalizedUrl} (text length: ${agreementData.text.length} chars)`
    );
    
    const assessment = createMockAssessment(normalizedUrl, agreementData.text);
    
    console.log(
      `[AssessmentController] Assessment complete with risk level: ${assessment.riskLevel}`
    );

    // Create the assessment object using shared core function
    const assessmentObject = createAssessment({
      url: normalizedUrl,
      riskLevel: assessment.riskLevel,
      categories: assessment.categories,
      summary: assessment.summary,
      policyUrl: normalizedUrl, // Use the URL as policy URL for manual entries
      policyHash: agreementData.hash,
      manualEntry: true
    });

    // Save assessment to database
    console.log(
      `[AssessmentController] Saving assessment to database for URL: ${normalizedUrl}`
    );
    
    const { data: savedAssessment, error: saveError } = await supabaseServiceRole
      .from('websites')
      .upsert({
        url: normalizedUrl,
        user_agreement_url: assessmentObject.user_agreement_url,
        user_agreement_hash: assessmentObject.user_agreement_hash,
        privacy_assessment: assessmentObject.privacy_assessment,
        last_updated: assessmentObject.last_updated,
        manual_entry: assessmentObject.manual_entry
      })
      .select()
      .single();

    if (saveError) {
      throw saveError;
    }

    console.log(`[AssessmentController] Assessment saved successfully`);

    // Return the assessment in the expected format
    return res.status(200).json({
      status: "success",
      assessment: {
        url: savedAssessment.url,
        riskLevel: savedAssessment.privacy_assessment.riskLevel,
        categories: savedAssessment.privacy_assessment.categories,
        summary: savedAssessment.privacy_assessment.summary,
        lastUpdated: savedAssessment.last_updated,
        policyUrl: savedAssessment.user_agreement_url,
      },
    });

  } catch (error) {
    console.error("[AssessmentController] Error triggering assessment:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to trigger assessment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Report an unassessed URL for future processing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const reportUnassessed = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        status: "error",
        message: "URL is required",
      });
    }

    // Normalize the URL
    const normalizedUrl = normalizeUrl(url);

    // Check if URL already has an assessment
    const { data: existingAssessment, error: checkError } = await supabaseServiceRole
      .from('websites')
      .select('url')
      .eq('url', normalizedUrl)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw checkError;
    }

    if (existingAssessment) {
      // URL already has an assessment, no need to add to queue
      return res.status(200).json({
        status: "success",
        message: "URL already has an assessment",
      });
    }

    // Add URL to unassessed queue
    const { error: insertError } = await supabaseServiceRole
      .from('unassessed_urls')
      .upsert({
        url: normalizedUrl,
        first_recorded: new Date().toISOString(),
        status: 'Pending'
      });

    if (insertError) {
      throw insertError;
    }

    return res.status(200).json({
      status: "success",
      message: "URL added to unassessed queue",
    });

  } catch (error) {
    console.error("Error reporting unassessed URL:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to report unassessed URL",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getAssessment,
  getAssessmentPure,
  triggerAssessment,
  reportUnassessed,
}; 