// Assessment Controller for PrivacyLens backend

import * as db from "../utils/db.cjs";
import llmService from "../services/llmService.js";
import * as assessmentTriggerService from "../services/assessmentTriggerService.js";
import { supabaseServiceRole } from "../utils/supabaseClient.js"; // Added import

// getAssessment function has been migrated to Client API

// triggerAssessment function has been migrated to Client API

/**
 * Update an existing assessment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateAssessment = async (req, res) => {
  try {
    const { url } = req.params;
    const { assessment } = req.body;

    if (!url || !assessment) {
      return res.status(400).json({
        status: "error",
        message: "URL and assessment are required",
      });
    }

    // Get existing assessment
    const existingAssessment = await db.getAssessment(url);

    if (!existingAssessment) {
      return res.status(404).json({
        status: "error",
        message: "Assessment not found",
      });
    }

    // Update assessment
    const updatedAssessment = await db.upsertAssessment({
      ...existingAssessment,
      privacy_assessment: {
        ...assessment,
        // Preserve any fields not provided in the update
        ...existingAssessment.privacy_assessment,
      },
      last_updated: new Date().toISOString(),
      manual_entry: true, // Mark as manually edited
    });

    // Create audit log entry
    await db.createAuditLog({
      action: "assessment_updated",
      user_id: req.session?.user?.id || null,
      details: {
        url,
        result: assessment.riskLevel,
      },
    });

    return res.status(200).json({
      status: "success",
      assessment: {
        url: updatedAssessment.url,
        riskLevel: updatedAssessment.privacy_assessment.riskLevel,
        categories: updatedAssessment.privacy_assessment.categories,
        summary: updatedAssessment.privacy_assessment.summary,
        lastUpdated: updatedAssessment.last_updated,
        policyUrl: updatedAssessment.user_agreement_url, // Add this line
      },
    });
  } catch (error) {
    console.error("Error updating assessment:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update assessment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete an assessment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteAssessment = async (req, res) => {
  try {
    const { url } = req.params;

    if (!url) {
      return res.status(400).json({
        status: "error",
        message: "URL parameter is required",
      });
    }

    // Delete assessment from database using service role client
    const { error: deleteError } = await supabaseServiceRole.from("websites").delete().eq("url", url);

    if (deleteError) {
      console.error(`[AssessmentController] Error deleting assessment for ${url}:`, deleteError);
      throw deleteError;
    }

    // Create audit log entry
    await db.createAuditLog({
      action: "assessment_deleted",
      user_id: req.session?.user?.id || null,
      details: { url },
    });

    return res.status(200).json({
      status: "success",
      message: "Assessment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting assessment:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete assessment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get all assessments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllAssessments = async (req, res) => {
  try {
    console.log('[AssessmentController] Getting all assessments');
    
    // Get all assessments from database
    const assessments = await db.getAllAssessments();
    
    console.log(`[AssessmentController] Retrieved ${Object.keys(assessments).length} assessments`);
    
    return res.status(200).json({
      status: "success",
      assessments: assessments
    });
  } catch (error) {
    console.error("[AssessmentController] Error getting all assessments:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to get assessments",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export {
  getAllAssessments,
  updateAssessment,
  deleteAssessment,
};
