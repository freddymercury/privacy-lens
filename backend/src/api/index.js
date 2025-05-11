// API Routes for PrivacyLens backend
import express from "express";
const router = express.Router();

// Import controllers
// Assuming other controllers will also be converted to ES modules or handled appropriately
import * as assessmentController from "../controllers/assessmentController.js";
import * as unassessedController from "../controllers/unassessedController.js";
import * as apiAuthController from "../controllers/apiAuthController.js";
import * as subscriptionController from "../controllers/subscriptionController.js";
import * as updateController from "../controllers/updateController.js";
import * as archiveCtrl from "../controllers/archiveController.js"; // Use new controller

// Import middleware
// Assuming apiAuth.js will also be converted to ES modules
import { validateToken } from "../middleware/apiAuth.js";

/**
 * Authentication Routes
 */
router.post("/auth/register", apiAuthController.register);
router.post("/auth/login", apiAuthController.login);
router.post("/auth/refresh", apiAuthController.refresh);
router.post("/auth/validate", apiAuthController.validate);
router.post("/auth/revoke", apiAuthController.revoke);

/**
 * Subscription Routes
 */
router.post("/subscription/create", validateToken, subscriptionController.createSubscription);
router.post("/subscription/update", validateToken, subscriptionController.updateSubscription);
router.post("/subscription/cancel", validateToken, subscriptionController.cancelSubscription);
router.post("/subscription/status", validateToken, subscriptionController.getSubscriptionStatus);
router.post("/subscription/webhook", subscriptionController.handleWebhook);

/**
 * Update Routes
 */
router.post("/updates/check", validateToken, updateController.checkForUpdates);
router.post("/updates/download", validateToken, updateController.downloadUpdate);
router.post("/updates/changelog", validateToken, updateController.getUpdateHistory);

/**
 * Assessment Routes
 */
router.get("/assessment", assessmentController.getAssessment);
router.get("/all-assessments", assessmentController.getAllAssessments);
router.post("/trigger-assessment/:url", assessmentController.triggerAssessment);

/**
 * Unassessed Routes
 */
router.post("/report-unassessed", unassessedController.reportUnassessed);
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
