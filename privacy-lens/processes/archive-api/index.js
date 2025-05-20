/**
 * Archive API Process for PrivacyLens
 * 
 * This process handles serving historical policy data and diffs.
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
const logger = createLogger('ArchiveAPI');

// Environment-based configuration with sensible defaults
const config = {
  port: parseInt(process.env.ARCHIVE_API_PORT || '3003', 10),
  host: process.env.ARCHIVE_API_HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per minute
};

// Create Express app
const app = express();

// Set process name for logging
process.env.PROCESS_NAME = 'archive-api';

/**
 * Initialize the API server
 * @returns {Promise<void>}
 */
export async function initialize() {
  try {
    logger.info('Initializing Archive API process');
    
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
    
    logger.info('Archive API process initialized successfully');
  } catch (error) {
    logger.error('Error initializing Archive API process', { error: error.message, stack: error.stack });
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
  app.use(requestLoggerMiddleware());
  
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
    res.status(200).json({ status: 'ok', service: 'archive-api' });
  });
  
  // API version route
  app.get('/api/version', (req, res) => {
    res.status(200).json({ version: '1.0.0', environment: config.environment });
  });
  
  // Public routes (no authentication required)
  
  // Get policy versions list (public, limited information)
  app.get('/api/v1/policies/:domain/versions', async (req, res, next) => {
    try {
      const { getPolicyVersions } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const limit = parseInt(req.query.limit || '10', 10);
      
      const versions = await getPolicyVersions(domain, limit);
      
      // Return limited information
      const limitedVersions = versions.map(version => ({
        id: version.id,
        domain: version.domain,
        url: version.url,
        capturedAt: version.capturedAt,
        changeType: version.changeType
      }));
      
      res.status(200).json({
        domain,
        versions: limitedVersions
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Get specific policy version (public, limited information)
  app.get('/api/v1/policies/:domain/versions/:versionId', async (req, res, next) => {
    try {
      const { getPolicyVersionById } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const versionId = req.params.versionId;
      
      const version = await getPolicyVersionById(versionId);
      
      if (!version || version.domain !== domain) {
        return res.status(404).json({ error: 'Policy version not found' });
      }
      
      // Return limited information
      const limitedVersion = {
        id: version.id,
        domain: version.domain,
        url: version.url,
        capturedAt: version.capturedAt,
        changeType: version.changeType,
        contentType: version.contentType,
        contentLength: version.content ? version.content.length : 0
      };
      
      res.status(200).json(limitedVersion);
    } catch (error) {
      next(error);
    }
  });
  
  // Authenticated routes (API key required)
  
  // Get policy versions list (full information)
  app.get('/api/v1/auth/policies/:domain/versions', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { getPolicyVersions } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const limit = parseInt(req.query.limit || '10', 10);
      
      const versions = await getPolicyVersions(domain, limit);
      
      res.status(200).json({
        domain,
        versions
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Get specific policy version (full information)
  app.get('/api/v1/auth/policies/:domain/versions/:versionId', apiKeyMiddleware(), async (req, res, next) => {
    try {
      const { getPolicyVersionById } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const versionId = req.params.versionId;
      
      const version = await getPolicyVersionById(versionId);
      
      if (!version || version.domain !== domain) {
        return res.status(404).json({ error: 'Policy version not found' });
      }
      
      res.status(200).json(version);
    } catch (error) {
      next(error);
    }
  });
  
  // Get policy content
  app.get('/api/v1/policies/:domain/versions/:versionId/content', async (req, res, next) => {
    try {
      const { getPolicyVersionById } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const versionId = req.params.versionId;
      
      const version = await getPolicyVersionById(versionId);
      
      if (!version || version.domain !== domain) {
        return res.status(404).json({ error: 'Policy version not found' });
      }
      
      if (!version.content) {
        return res.status(404).json({ error: 'Policy content not found' });
      }
      
      // Set content type header
      res.set('Content-Type', version.contentType || 'text/plain');
      
      // Send the content
      res.send(version.content);
    } catch (error) {
      next(error);
    }
  });
  
  // Get policy diff between two versions
  app.get('/api/v1/policies/:domain/diff', async (req, res, next) => {
    try {
      const { getPolicyDiff } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const fromVersionId = req.query.from;
      const toVersionId = req.query.to;
      
      if (!fromVersionId || !toVersionId) {
        return res.status(400).json({ error: 'Both from and to version IDs are required' });
      }
      
      const diff = await getPolicyDiff(fromVersionId, toVersionId);
      
      if (!diff) {
        return res.status(404).json({ error: 'Could not generate diff' });
      }
      
      res.status(200).json({
        domain,
        fromVersionId,
        toVersionId,
        diff
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Get policy assets
  app.get('/api/v1/policies/:domain/versions/:versionId/assets/:assetId', async (req, res, next) => {
    try {
      const { getPolicyAsset } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const versionId = req.params.versionId;
      const assetId = req.params.assetId;
      
      const asset = await getPolicyAsset(versionId, assetId);
      
      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      
      // Set content type header
      res.set('Content-Type', asset.contentType || 'application/octet-stream');
      
      // Send the content
      res.send(asset.content);
    } catch (error) {
      next(error);
    }
  });
  
  // Get policy assets list
  app.get('/api/v1/policies/:domain/versions/:versionId/assets', async (req, res, next) => {
    try {
      const { getPolicyAssets } = await import('../../shared/db/archive.js');
      
      const domain = req.params.domain;
      const versionId = req.params.versionId;
      
      const assets = await getPolicyAssets(versionId);
      
      // Return limited information
      const limitedAssets = assets.map(asset => ({
        id: asset.id,
        url: asset.url,
        contentType: asset.contentType,
        contentLength: asset.content ? asset.content.length : 0
      }));
      
      res.status(200).json({
        domain,
        versionId,
        assets: limitedAssets
      });
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
    logger.info('Starting Archive API server');
    
    // Start the server
    app.listen(config.port, config.host, () => {
      logger.info(`Archive API server listening on ${config.host}:${config.port}`);
    });
  } catch (error) {
    logger.error('Error starting Archive API server', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop the API server
 * @returns {Promise<void>}
 */
export async function stop() {
  try {
    logger.info('Stopping Archive API server');
    
    // Close the queue connection
    const { closeQueue } = await import('../../shared/config/queue.js');
    await closeQueue();
    
    logger.info('Archive API server stopped successfully');
  } catch (error) {
    logger.error('Error stopping Archive API server', { error: error.message, stack: error.stack });
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
    logger.error('Error starting Archive API process', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}
