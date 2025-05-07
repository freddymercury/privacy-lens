// API Routes for PrivacyLens backend

const express = require("express");
const router = express.Router();

// Import controllers
const assessmentController = require("../controllers/assessmentController");
const unassessedController = require("../controllers/unassessedController");
const apiAuthController = require("../controllers/apiAuthController");
const subscriptionController = require("../controllers/subscriptionController");
const updateController = require("../controllers/updateController");
const archiveController = require("../controllers/archiveController"); // Import the new controller

// Import middleware
const { validateToken } = require("../middleware/apiAuth");

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
 */
router.get("/v1/policies/:domain", archiveController.getLatestPolicy);
router.get("/v1/policies/:domain/versions", archiveController.listPolicyVersions);
router.get("/v1/policies/:domain/versions/:verId", archiveController.getVersionWithDiff);


module.exports = router;
