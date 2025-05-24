// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
// Import database connection from local database module
import { supabaseServiceRole } from './database.js';
// Import authentication middleware
import { authenticateToken } from './middleware/auth.js';

// Initialize logger
const logger = pino({
  name: 'client-api',
  level: process.env.LOG_LEVEL || 'info'
});

// Initialize Express app
const app = express();
const port = process.env.CLIENT_API_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CHROME_PLUGIN_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'client-api',
    timestamp: new Date().toISOString()
  });
});

// Database test endpoint
app.get('/test-db', async (req, res) => {
  try {
    // Simple database query to test connection
    const { data: users, error, count } = await supabaseServiceRole
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      logger.error(error, 'Database query error');
      return res.status(500).json({ 
        error: 'Database query failed',
        details: error.message
      });
    }
    
    res.status(200).json({
      status: 'database_connected',
      message: 'Database connection successful',
      users_count: count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error(err, 'Database connection error');
    res.status(500).json({
      error: 'Database connection failed',
      message: err.message
    });
  }
});

// Test protected endpoint
app.get('/test-auth', authenticateToken, (req, res) => {
  res.status(200).json({
    status: 'authenticated',
    message: 'Authentication successful',
    user: {
      id: req.user.id,
      deviceId: req.user.deviceId,
      tier: req.user.tier,
      features: req.user.features
    },
    timestamp: new Date().toISOString()
  });
});

// Basic error handling middleware
app.use((err, req, res, next) => {
  logger.error(err, 'Unhandled error');
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Database connection initialization
logger.info('Initializing database connection...');
if (supabaseServiceRole) {
  logger.info('Database connection initialized successfully');
} else {
  logger.warn('Database connection not available - check configuration');
}

// Start server
app.listen(port, () => {
  logger.info(`Client API server running on port ${port}`);
});

export default app; 