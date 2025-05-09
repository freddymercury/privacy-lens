// Main entry point for PrivacyLens backend
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";

// Replicate __dirname behavior for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure dotenv to look for .env file in the parent directory (backend/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import routes
import apiRoutes from "./api/index.js"; // Ensure .js extension if api/index is also ESM
import * as adminRoutesNamespace from "./api/admin.js"; // Ensure .js extension
const adminRoutes = adminRoutesNamespace.default;

// Import services
// Assuming assessmentTriggerService will be converted to ESM
import * as assessmentTriggerService from "./services/assessmentTriggerService.js";
import { startArchiverJob } from "./jobs/archiverJob.js"; // Import the archiver job scheduler

// Create Express app
const app = express();

// Set port from environment variables or default
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "privacy-guard-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Static files for admin dashboard
app.use(express.static(path.join(__dirname, "public")));

// View engine setup for admin dashboard
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Routes
app.use("/api", apiRoutes); // apiRoutes should be an Express router instance
app.use("/admin", adminRoutes); // adminRoutes should be an Express router instance

// Admin dashboard home route
app.get("/", (req, res) => {
  res.redirect("/admin");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`PrivacyLens backend server running on port ${PORT}`);

  // Initialize assessment trigger service
  const intervalMinutes =
    process.env.ASSESSMENT_TRIGGER_INTERVAL_MINUTES || 600; // Changed from 60 to 600 (10 hours)
  const maxConcurrentAssessments = 
    process.env.MAX_CONCURRENT_ASSESSMENTS || 1; // Default to 1 concurrent assessment to avoid rate limits
  console.log(
    `Initializing assessment trigger service with interval: ${intervalMinutes} minutes, max concurrent assessments: ${maxConcurrentAssessments}`
  );
  assessmentTriggerService.scheduleProcessing(parseInt(intervalMinutes), parseInt(maxConcurrentAssessments));

  // Start the policy archiver job
  console.log("Initializing policy archiver job...");
  startArchiverJob();
});

export default app; // Export for testing
