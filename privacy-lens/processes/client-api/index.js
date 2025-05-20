console.log('CLIENT-API INDEX.JS IS RUNNING');
/**
 * Client API Process for PrivacyLens
 * 
 * This process handles client-facing API requests.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createLogger, requestLoggerMiddleware, errorLoggerMiddleware } from '../../shared/config/logger.js';
import { contextMiddleware } from '../../shared/config/context.js';
import { initializeDatabase } from '../../shared/db/index.js';
import { authMiddleware, roleMiddleware } from '../../shared/auth/index.js';
import { initializeQueue } from '../../shared/config/queue.js';

// Initialize logger
const logger = createLogger('ClientAPI');

// Environment-based configuration with sensible defaults
const config = {
  port: parseInt(process.env.CLIENT_API_PORT || '3000', 10),
  host: process.env.CLIENT_API_HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per minute
};

console.log('process.env.CLIENT_API_PORT:', process.env.CLIENT_API_PORT);
console.log('process.env.CLIENT_API_HOST:', process.env.CLIENT_API_HOST);
console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('process.env.CORS_ORIGINS:', process.env.CORS_ORIGINS);
console.log('process.env.RATE_LIMIT_WINDOW:', process.env.RATE_LIMIT_WINDOW);
console.log('process.env.RATE_LIMIT_MAX:', process.env.RATE_LIMIT_MAX);
console.log('config:', config);

// Create Express app
const app = express();

// Set process name for logging
process.env.PROCESS_NAME = 'client-api';

/**
 * Initialize the API server
 * @returns {Promise<void>}
 */
export async function initialize() {
  try {
    console.log('Initializing Client API process');
    await initializeDatabase();
    await initializeQueue();
    console.log('Calling setupMiddleware');
    setupMiddleware();
    console.log('Calling setupRoutes');
    setupRoutes();
    console.log('Calling setupErrorHandling');
    setupErrorHandling();
    console.log('Client API process initialized successfully');
  } catch (error) {
    console.error('Error initializing Client API process', { error: error.message, stack: error.stack });
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
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
  console.log('setupRoutes called');
  // Only /ping route is active
  app.get('/ping', (req, res) => {
    console.log('Received /ping request');
    res.send('pong');
    console.log('Responded to /ping request');
  });
  
  app.post('/api/auth/login', async (req, res, next) => {
    console.log('Received /api/auth/login request', { body: req.body });
    try {
      const { loginUser } = await import('../../shared/auth/index.js');
      console.log('Imported loginUser');
      const result = await loginUser(req.body.email, req.body.password);
      console.log('loginUser returned', { result });
      res.status(200).json(result);
      console.log('Responded to /api/auth/login request');
    } catch (error) {
      console.error('Error in /api/auth/login', { error });
      next(error);
    }
  });
  
  app.post('/api/auth/refresh', async (req, res, next) => {
    try {
      const { refreshAccessToken } = await import('../../shared/auth/index.js');
      
      const result = await refreshAccessToken(req.body.refreshToken);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const { logoutUser } = await import('../../shared/auth/index.js');
      
      await logoutUser(req.body.refreshToken);
      
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });
  
  // Assessment routes
  app.get('/api/assessments/:url', authMiddleware(), async (req, res, next) => {
    try {
      const { getAssessmentForUrl } = await import('../../shared/assessment/index.js');
      
      const result = await getAssessmentForUrl(req.params.url);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  app.post('/api/assessments', authMiddleware(), async (req, res, next) => {
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
  
  // User routes (admin only)
  app.get('/api/users', authMiddleware(), roleMiddleware(['admin']), async (req, res, next) => {
    try {
      const { getUsers } = await import('../../shared/db/users.js');
      
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      
      const result = await getUsers(page, pageSize);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  app.get('/api/users/:id', authMiddleware(), roleMiddleware(['admin']), async (req, res, next) => {
    try {
      const { getUserById } = await import('../../shared/db/users.js');
      
      const user = await getUserById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  });
  
  // Audit log routes (admin only)
  app.get('/api/audit-logs', authMiddleware(), roleMiddleware(['admin']), async (req, res, next) => {
    try {
      const { getAuditEvents } = await import('../../shared/db/audit.js');
      
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      
      const filters = {
        action: req.query.action,
        entity_type: req.query.entity_type,
        entity_id: req.query.entity_id,
        user_id: req.query.user_id,
        start_date: req.query.start_date,
        end_date: req.query.end_date
      };
      
      const result = await getAuditEvents(filters, page, pageSize);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  
  // User profile route
  app.get('/api/profile', authMiddleware(), async (req, res, next) => {
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
  
  // Update user profile route
  app.put('/api/profile', authMiddleware(), async (req, res, next) => {
    try {
      const { updateUser } = await import('../../shared/db/users.js');
      
      // Only allow updating certain fields
      const allowedFields = ['name', 'email'];
      const updateData = {};
      
      allowedFields.forEach(field => {
        if (req.body[field]) {
          updateData[field] = req.body[field];
        }
      });
      
      const user = await updateUser(req.user.id, updateData);
      
      // Remove sensitive information
      delete user.password;
      
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  });
  
  // API key routes
  app.post('/api/api-keys', authMiddleware(), async (req, res, next) => {
    try {
      const { createApiKey } = await import('../../shared/auth/index.js');
      
      const result = await createApiKey(req.user.id);
      
      res.status(201).json(result);
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
    console.log('About to start Client API server');
    console.log('config.port:', config.port, 'config.host:', config.host);
    // Start the server
    app.listen(config.port, config.host, () => {
      console.log(`Client API server listening on ${config.host}:${config.port}`);
    });
    console.log('app.listen called');
  } catch (error) {
    console.error('Error starting Client API server', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop the API server
 * @returns {Promise<void>}
 */
export async function stop() {
  try {
    logger.info('Stopping Client API server');
    
    // Close the queue connection
    const { closeQueue } = await import('../../shared/config/queue.js');
    await closeQueue();
    
    logger.info('Client API server stopped successfully');
  } catch (error) {
    logger.error('Error stopping Client API server', { error: error.message, stack: error.stack });
    throw error;
  }
}

// If this module is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log('Starting client-api process directly');
    await initialize();
    console.log('Initialization complete, starting server');
    await start();
    console.log('Server started successfully');
    
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
    logger.error('Error starting Client API process', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}
