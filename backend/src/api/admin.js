// Admin Routes for PrivacyLens backend

import express from "express";
const router = express.Router();

// Import controllers
import * as authController from "../controllers/authController.js";
import * as adminController from "../controllers/adminController.js";

// Import middleware
import { isAuthenticated, isAdmin } from "../middleware/auth.js";

/**
 * Authentication routes
 */
router.get("/login", authController.loginPage);
router.post("/login", authController.login);
router.get("/logout", authController.logout);

/**
 * Dashboard routes (protected)
 */
router.get("/", isAuthenticated, adminController.dashboard);

/**
 * Assessment management routes (protected)
 */
router.get("/assessments", isAuthenticated, adminController.listAssessments);
router.get(
  "/assessments/:url",
  isAuthenticated,
  adminController.viewAssessment
);
router.post(
  "/assessments/:url",
  isAuthenticated,
  adminController.updateAssessment
);
router.post(
  "/assessments/:url/trigger",
  isAuthenticated,
  adminController.triggerAssessment
);
router.delete(
  "/assessments/:url",
  isAuthenticated,
  adminController.deleteAssessment
);

/**
 * Unassessed URLs management routes (protected)
 */
router.get("/unassessed", isAuthenticated, adminController.listUnassessed);
router.post(
  "/unassessed/:url/process",
  isAuthenticated,
  adminController.processUnassessed
);
router.delete(
  "/unassessed/:url",
  isAuthenticated,
  adminController.deleteUnassessed
);
router.post(
  "/trigger-assessments",
  isAuthenticated,
  adminController.triggerAllAssessments
);

/**
 * Analytics routes (protected)
 */
router.get("/analytics", isAuthenticated, adminController.analytics);

/**
 * User management routes (protected)
 */
router.get("/users", isAuthenticated, isAdmin, adminController.listUsers);
router.post("/users", isAuthenticated, isAdmin, adminController.createUser);
router.put("/users/:id", isAuthenticated, isAdmin, adminController.updateUser);
router.delete("/users/:id", isAuthenticated, isAdmin, adminController.deleteUser);

/**
 * Audit log routes (protected)
 */
router.get("/audit-logs", isAuthenticated, adminController.auditLogs);

export default router;
