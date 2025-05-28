// API Routes for PrivacyLens backend
import express from "express";
const router = express.Router();

// Import controllers
// Note: Some controllers have been removed as their endpoints migrated to Client API
import * as assessmentController from "../controllers/assessmentController.js";
import * as unassessedController from "../controllers/unassessedController.js"; // Keep for admin functionality
import * as archiveCtrl from "../controllers/archiveController.js"; // Use new controller

// Import middleware - keeping for remaining endpoints that may need it
import { validateToken } from "../middleware/apiAuth.js";

/**
 * Authentication Routes - MIGRATED TO CLIENT API
 * These endpoints have been moved to the Client API process.
 * They are no longer available in the monolith backend.
 */

/**
 * Subscription Routes - MIGRATED TO CLIENT API
 * These endpoints have been moved to the Client API process.
 * They are no longer available in the monolith backend.
 */

/**
 * Update Routes - MIGRATED TO CLIENT API
 * These endpoints have been moved to the Client API process.
 * They are no longer available in the monolith backend.
 */

/**
 * Assessment Routes - PARTIALLY MIGRATED TO CLIENT API
 * - GET /assessment - MIGRATED to Client API
 * - POST /trigger-assessment/:url - MIGRATED to Client API
 * - GET /all-assessments - REMAINS in monolith (admin functionality)
 */
router.get("/all-assessments", assessmentController.getAllAssessments);

/**
 * Unassessed Routes - MIGRATED TO CLIENT API
 * - POST /report-unassessed - MIGRATED to Client API
 */
router.put(
  "/unassessed/:url/policy-urls",
  unassessedController.updateSuggestedPolicyUrls
);

/**
 * @route GET /api/health
 * @desc Health check endpoint
 * @access Public
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "PrivacyLens API is running",
  });
});

/**
 * Policy Archive Routes (V1)
 * Note: These are currently public as per the spec (using Anon key via supabaseClient).
 * Add `validateToken` middleware if authentication is required.
 * These routes are updated to use the new controller functions for deep crawl features.
 */
// GET /api/v1/policies/{domain}/latest
router.get("/v1/policies/:domain/latest", archiveCtrl.getLatestPolicyWithAssets);

// GET /api/v1/policies/{domain}/versions
router.get("/v1/policies/:domain/versions", archiveCtrl.listPolicyVersions); // This one matches existing, ensure controller is new one

// GET /api/v1/policies/{domain}/versions/{id}
router.get("/v1/policies/:domain/versions/:versionId", archiveCtrl.getPolicyVersionByIdWithAssets);

// GET /api/v1/policies/{domain}/versions/{id}/assets/{assetId}
router.get("/v1/policies/:domain/versions/:versionId/assets/:assetId", archiveCtrl.streamPolicyAsset);

// GET /api/v1/policies/{domain}/diff/{olderId}...{newerId}
// The spec shows "..."" which is not a valid route pattern. Assuming it means two params.
// Using a common pattern like /diff/:olderVersionId/to/:newerVersionId or query params.
// For now, let's assume a path like /diff/older/{olderVersionId}/newer/{newerVersionId} or similar.
// The spec example is: /api/v1/policies/{domain}/diff/{olderId}…{newerId}
// This is tricky. Let's use a query string approach or two distinct path params for clarity.
// Path: /api/v1/policies/{domain}/diff/:olderVersionId/:newerVersionId
router.get("/v1/policies/:domain/diff/:olderVersionId/:newerVersionId", archiveCtrl.getPolicyDiff);

export default router;
