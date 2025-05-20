/**
 * Admin Dashboard Process for PrivacyLens
 * 
 * This process handles the administrative web interface.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger, requestLoggerMiddleware, errorLoggerMiddleware } from '../../shared/config/logger.js';
import { contextMiddleware } from '../../shared/config/context.js';
import { initializeDatabase } from '../../shared/db/index.js';
import { authMiddleware, roleMiddleware } from '../../shared/auth/index.js';
import { initializeQueue } from '../../shared/config/queue.js';

// Initialize logger
const logger = createLogger('AdminDashboard');

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment-based configuration with sensible defaults
const config = {
  port: parseInt(process.env.ADMIN_DASHBOARD_PORT || '3002', 10),
  host: process.env.ADMIN_DASHBOARD_HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'privacy-lens-admin-secret',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3002'],
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per minute
};

// Create Express app
const app = express();

// Set process name for logging
process.env.PROCESS_NAME = 'admin-dashboard';

/**
 * Initialize the admin dashboard server
 * @returns {Promise<void>}
 */
export async function initialize() {
  try {
    logger.info('Initializing Admin Dashboard process');
    
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
    
    logger.info('Admin Dashboard process initialized successfully');
  } catch (error) {
    logger.error('Error initializing Admin Dashboard process', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Set up middleware
 */
function setupMiddleware() {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    }
  }));
  
  // CORS middleware
  app.use(cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
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
  
  // Session middleware
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.environment === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
  
  // Request logging middleware
  app.use(requestLoggerMiddleware());
  
  // Context middleware
  app.use(contextMiddleware());
  
  // Set up view engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../src/views'));
  
  // Serve static files
  app.use(express.static(path.join(__dirname, '../../src/public')));
  
  logger.info('Middleware set up successfully');
}

/**
 * Set up routes
 */
function setupRoutes() {
  // Health check route
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'admin-dashboard' });
  });
  
  // Login routes
  app.get('/login', (req, res) => {
    if (req.session.user) {
      return res.redirect('/admin');
    }
    
    res.render('login', { error: null });
  });
  
  app.post('/login', async (req, res, next) => {
    try {
      const { loginAdmin } = await import('../../shared/auth/index.js');
      
      const result = await loginAdmin(req.body.email, req.body.password);
      
      if (result.success) {
        // Store user in session
        req.session.user = {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role
        };
        
        return res.redirect('/admin');
      } else {
        res.render('login', { error: result.error || 'Invalid credentials' });
      }
    } catch (error) {
      next(error);
    }
  });
  
  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
  
  // Admin routes (require authentication)
  app.use('/admin', (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    next();
  });
  
  // Dashboard route
  app.get('/admin', async (req, res, next) => {
    try {
      const { getDashboardStats } = await import('../../shared/db/assessments.js');
      
      const stats = await getDashboardStats();
      
      res.render('dashboard', {
        user: req.session.user,
        stats,
        active: 'dashboard'
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Assessments routes
  app.get('/admin/assessments', async (req, res, next) => {
    try {
      const { getAssessments } = await import('../../shared/db/assessments.js');
      
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      const filters = {
        status: req.query.status,
        domain: req.query.domain,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };
      
      const result = await getAssessments(filters, page, pageSize);
      
      res.render('assessments', {
        user: req.session.user,
        assessments: result.assessments,
        pagination: result.pagination,
        filters,
        active: 'assessments'
      });
    } catch (error) {
      next(error);
    }
  });
  
  app.get('/admin/assessments/:id', async (req, res, next) => {
    try {
      const { getAssessmentById } = await import('../../shared/db/assessments.js');
      
      const assessment = await getAssessmentById(req.params.id);
      
      if (!assessment) {
        return res.status(404).render('error', {
          user: req.session.user,
          error: 'Assessment not found',
          active: 'assessments'
        });
      }
      
      res.render('assessment-detail', {
        user: req.session.user,
        assessment,
        active: 'assessments'
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Unassessed URLs routes
  app.get('/admin/unassessed', async (req, res, next) => {
    try {
      const { getUnassessedUrls } = await import('../../shared/db/assessments.js');
      
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      
      const result = await getUnassessedUrls(page, pageSize);
      
      res.render('unassessed', {
        user: req.session.user,
        unassessedUrls: result.unassessedUrls,
        pagination: result.pagination,
        active: 'unassessed'
      });
    } catch (error) {
      next(error);
    }
  });
  
  app.post('/admin/unassessed/process', async (req, res, next) => {
    try {
      const { queueUnassessedUrlsForProcessing } = await import('../../shared/assessment/index.js');
      
      const result = await queueUnassessedUrlsForProcessing(req.body.urls || []);
      
      res.redirect('/admin/unassessed');
    } catch (error) {
      next(error);
    }
  });
  
  // User management routes (admin only)
  app.use('/admin/users', (req, res, next) => {
    if (req.session.user.role !== 'admin') {
      return res.status(403).render('error', {
        user: req.session.user,
        error: 'Access denied',
        active: 'users'
      });
    }
    
    next();
  });
  
  app.get('/admin/users', async (req, res, next) => {
    try {
      const { getUsers } = await import('../../shared/db/users.js');
      
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      
      const result = await getUsers(page, pageSize);
      
      res.render('users', {
        user: req.session.user,
        users: result.users,
        pagination: result.pagination,
        active: 'users'
      });
    } catch (error) {
      next(error);
    }
  });
  
  app.get('/admin/users/new', (req, res) => {
    res.render('user-form', {
      user: req.session.user,
      userData: {},
      isNew: true,
      error: null,
      active: 'users'
    });
  });
  
  app.post('/admin/users/new', async (req, res, next) => {
    try {
      const { createUser } = await import('../../shared/db/users.js');
      
      const userData = {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: req.body.role
      };
      
      await createUser(userData);
      
      res.redirect('/admin/users');
    } catch (error) {
      res.render('user-form', {
        user: req.session.user,
        userData: req.body,
        isNew: true,
        error: error.message,
        active: 'users'
      });
    }
  });
  
  app.get('/admin/users/:id/edit', async (req, res, next) => {
    try {
      const { getUserById } = await import('../../shared/db/users.js');
      
      const userData = await getUserById(req.params.id);
      
      if (!userData) {
        return res.status(404).render('error', {
          user: req.session.user,
          error: 'User not found',
          active: 'users'
        });
      }
      
      res.render('user-form', {
        user: req.session.user,
        userData,
        isNew: false,
        error: null,
        active: 'users'
      });
    } catch (error) {
      next(error);
    }
  });
  
  app.post('/admin/users/:id/edit', async (req, res, next) => {
    try {
      const { updateUser } = await import('../../shared/db/users.js');
      
      const userData = {
        name: req.body.name,
        email: req.body.email,
        role: req.body.role
      };
      
      // Only update password if provided
      if (req.body.password) {
        userData.password = req.body.password;
      }
      
      await updateUser(req.params.id, userData);
      
      res.redirect('/admin/users');
    } catch (error) {
      const { getUserById } = await import('../../shared/db/users.js');
      
      const userData = await getUserById(req.params.id);
      
      res.render('user-form', {
        user: req.session.user,
        userData: {
          ...userData,
          ...req.body
        },
        isNew: false,
        error: error.message,
        active: 'users'
      });
    }
  });
  
  // Audit log routes (admin only)
  app.use('/admin/audit-logs', (req, res, next) => {
    if (req.session.user.role !== 'admin') {
      return res.status(403).render('error', {
        user: req.session.user,
        error: 'Access denied',
        active: 'audit-logs'
      });
    }
    
    next();
  });
  
  app.get('/admin/audit-logs', async (req, res, next) => {
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
      
      res.render('audit-logs', {
        user: req.session.user,
        auditLogs: result.auditEvents,
        pagination: result.pagination,
        filters,
        active: 'audit-logs'
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Analytics routes
  app.get('/admin/analytics', async (req, res, next) => {
    try {
      const { getAnalyticsData } = await import('../../shared/db/assessments.js');
      
      const timeframe = req.query.timeframe || '30d';
      
      const data = await getAnalyticsData(timeframe);
      
      res.render('analytics', {
        user: req.session.user,
        data,
        timeframe,
        active: 'analytics'
      });
    } catch (error) {
      next(error);
    }
  });
  
  // API routes for admin dashboard
  app.get('/admin/api/stats', async (req, res, next) => {
    try {
      const { getDashboardStats } = await import('../../shared/db/assessments.js');
      
      const stats = await getDashboardStats();
      
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });
  
  app.get('/admin/api/analytics', async (req, res, next) => {
    try {
      const { getAnalyticsData } = await import('../../shared/db/assessments.js');
      
      const timeframe = req.query.timeframe || '30d';
      
      const data = await getAnalyticsData(timeframe);
      
      res.json(data);
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
    
    if (req.xhr || req.path.startsWith('/admin/api/')) {
      return res.status(statusCode).json({
        error: message,
        status: statusCode
      });
    }
    
    res.status(statusCode).render('error', {
      user: req.session.user,
      error: message,
      active: ''
    });
  });
  
  // 404 handler
  app.use((req, res) => {
    if (req.xhr || req.path.startsWith('/admin/api/')) {
      return res.status(404).json({
        error: 'Not found',
        status: 404
      });
    }
    
    res.status(404).render('error', {
      user: req.session.user,
      error: 'Page not found',
      active: ''
    });
  });
  
  logger.info('Error handling set up successfully');
}

/**
 * Start the admin dashboard server
 * @returns {Promise<void>}
 */
export async function start() {
  try {
    logger.info('Starting Admin Dashboard server');
    
    // Start the server
    app.listen(config.port, config.host, () => {
      logger.info(`Admin Dashboard server listening on ${config.host}:${config.port}`);
    });
  } catch (error) {
    logger.error('Error starting Admin Dashboard server', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop the admin dashboard server
 * @returns {Promise<void>}
 */
export async function stop() {
  try {
    logger.info('Stopping Admin Dashboard server');
    
    // Close the queue connection
    const { closeQueue } = await import('../../shared/config/queue.js');
    await closeQueue();
    
    logger.info('Admin Dashboard server stopped successfully');
  } catch (error) {
    logger.error('Error stopping Admin Dashboard server', { error: error.message, stack: error.stack });
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
    logger.error('Error starting Admin Dashboard process', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}
