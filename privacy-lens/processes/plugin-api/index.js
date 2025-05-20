/**
 * Plugin API Process for PrivacyLens
 * 
 * This process handles browser plugin API requests.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createLogger, requestLoggerMiddleware, errorLoggerMiddleware } from '../../shared/config/logger.js';
import { contextMiddleware } from '../../shared/config/context.js';
import { initializeDatabase } from '../../shared/db/index.js';
import { apiKeyMiddleware } from '../../shared/auth/index.js';
import { initializeQueue } from '../../shared/config/queue.js';

// Initialize logger
const logger = createLogger('PluginAPI');

// Environment-based configuration with sensible defaults
const config = {
  port: parseInt(process.env.PLUGIN_API_PORT || '3001', 10),
  host: process.env.PLUGIN_API_HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per minute
};

// Create Express app
const app = express();

// Set process name for logging
process.env.PROCESS_NAME = 'plugin-api';

/**
 * Initialize the API server
 * @returns {Promise<void>}
 */
export async function initialize() {
  try {
    logger.info('Initializing Plugin API process');
    
    // Initialize the database
    await initializeDatabase();
    
    // Initialize the queue
    await initializeQueue();
    
    // Set up middleware
    setupMiddleware();
    
    // Set up routes
    setupRoutes();
    
    // Set up error handling
    setupErrorHandling();
    
    logger.info('Plugin API process initialized successfully');
  } catch (error) {
    logger.error('Error initializing Plugin API process', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Set up middleware
 */
function setupMiddleware() {
  // Security middleware
  app.use(helmet());
  
  // CORS middleware
  app.use(cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true
  }));
  
  // Compression middleware
  app.use(compression());
  
  // Body parsing middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  
  // Rate limiting middleware
  app.use(rateLimit({
    windowMs: config.rateLimitWindow,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
  }));
  
  // Request logging middleware
  app.use(requestLoggerMiddleware);
  
  // Context middleware
  app.use(contextMiddleware());
  
  logger.info('Middleware set up successfully');
}

/**
 * Set up routes
 */
function setupRoutes() {
  // Health check route
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'plugin-api' });
  });
  
  // API version route
  app.get('/api/version', (req, res) => {
    res.status(200).json({ version: '1.0.0', environment: config.environment });
  });
  
  // Public routes (no authentication required)
  
  // Get assessment for URL (public, limited information)
  app.get('/api/public/assessments/:url', async (req, res, next) => {
    try {
      const { getAssessmentForUrl } = await import('../../shared/assessment/index.js');
      
      const result = await getAssessmentForUrl(req.params.url);
      
      // If found, return limited information
      if (result.status === 'found') {
        const limitedAssessment = {
          url: result.assessment.url,
          domainName: result.assessment.domainName,
          policyType: result.assessment.policyType,
          status: result.assessment.status,
          summary: result.assessment.analysis?.summary || [],
          privacyScore: result.assessment.analysis?.privacyScore || null,
          readabilityScore: result.assessment.analysis?.readabilityScore || null,
          createdAt: result.assessment.createdAt
        };
        
        return res.status(200).json({
          status: 'found',
          assessment: limitedAssessment
        });
      }
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  // Queue URL for assessment (public, limited functionality)
  app.post('/api/public/assessments', async (req, res, next) => {
    try {
      const { queueUrlForAssessment } = await import('../../shared/assessment/index.js');
      
      const result = await queueUrlForAssessment(
        req.body.url,
        req.body.suggestedPolicyUrls || []
      );
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  // Authenticated routes (API key required)
  
  // Get assessment for URL (full information)
  app.get('/api/assessments/:url', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { getAssessmentForUrl } = await import('../../shared/assessment/index.js');
      
      const result = await getAssessmentForUrl(req.params.url);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  // Queue URL for assessment
  app.post('/api/assessments', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { queueUrlForAssessment } = await import('../../shared/assessment/index.js');
      
      const result = await queueUrlForAssessment(
        req.body.url,
        req.body.suggestedPolicyUrls || [],
        req.user.id
      );
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  // Get or create assessment for URL
  app.post('/api/assessments/get-or-create', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { getOrCreateAssessment } = await import('../../shared/assessment/index.js');
      
      const result = await getOrCreateAssessment(
        req.body.url,
        req.body.suggestedPolicyUrls || [],
        req.user.id
      );
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  // Get user profile
  app.get('/api/profile', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { getUserById } = await import('../../shared/db/users.js');
      
      const user = await getUserById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Remove sensitive information
      delete user.password;
      
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  });
  
  // Get subscription status
  app.get('/api/subscription', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { getSubscriptionForUser } = await import('../../shared/db/subscriptions.js');
      
      const subscription = await getSubscriptionForUser(req.user.id);
      
      res.status(200).json(subscription || { active: false });
    } catch (error) {
      next(error);
    }
  });
  
  // Check for updates
  app.get('/api/updates/check', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { checkForUpdates } = await import('../../shared/db/updates.js');
      
      const currentVersion = req.query.version;
      
      if (!currentVersion) {
        return res.status(400).json({ error: 'Version parameter is required' });
      }
      
      const update = await checkForUpdates(currentVersion);
      
      res.status(200).json(update);
    } catch (error) {
      next(error);
    }
  });
  
  logger.info('Routes set up successfully');
}

/**
 * Set up error handling
 */
function setupErrorHandling() {
  // Error logging middleware
  app.use(errorLoggerMiddleware);
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    const statusCode = err.status || 500;
    const message = statusCode === 500 ? 'Internal server error' : err.message;
    
    res.status(statusCode).json({
      error: message,
      status: statusCode
    });
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      status: 404
    });
  });
  
  logger.info('Error handling set up successfully');
}

/**
 * Start the API server
 * @returns {Promise<void>}
 */
export async function start() {
  try {
    logger.info('Starting Plugin API server');
    
    // Start the server
    app.listen(config.port, config.host, () => {
      logger.info(`Plugin API server listening on ${config.host}:${config.port}`);
    });
  } catch (error) {
    logger.error('Error starting Plugin API server', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop the API server
 * @returns {Promise<void>}
 */
export async function stop() {
  try {
    logger.info('Stopping Plugin API server');
    
    // Close the queue connection
    const { closeQueue } = await import('../../shared/config/queue.js');
    await closeQueue();
    
    logger.info('Plugin API server stopped successfully');
  } catch (error) {
    logger.error('Error stopping Plugin API server', { error: error.message, stack: error.stack });
    throw error;
  }
}

// If this module is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await initialize();
    await start();
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down');
      await stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal, shutting down');
      await stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error starting Plugin API process', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}
