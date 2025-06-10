// Load environment variables FIRST before any other imports
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/auth.js');
const assessmentRoutes = require('./routes/assessment.js');
const subscriptionRoutes = require('./routes/subscription.js');
const updateRoutes = require('./routes/update.js');
const { triggerAssessment, reportUnassessed } = require('./controllers/assessmentController.js');

// Import comprehensive logging middleware
const { 
  logger, 
  contextMiddleware, 
  requestLogger, 
  errorLogger, 
  healthCheck 
} = require('./middleware/logging.js');

// Initialize Express app
const app = express();
const port = process.env.CLIENT_API_PORT || 3001;

// Middleware - Order is important!
app.use(cors({
  origin: process.env.CHROME_PLUGIN_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Add context middleware first to enable request tracing
app.use(contextMiddleware());

// Add request logging middleware
app.use(requestLogger());

// Enhanced health check endpoint with detailed system information
app.get('/health', healthCheck);

// Routes - THIS IS THE KEY LINE THAT WAS MISSING!
app.use('/api/auth', authRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/updates', updateRoutes);

// Direct route for trigger assessment to match original API structure
app.post('/api/trigger-assessment/:url', triggerAssessment);

// Direct route for report unassessed to match original API structure
app.post('/api/report-unassessed', reportUnassessed);

// Enhanced error handling middleware with detailed logging
app.use(errorLogger);

app.use((err, req, res, next) => {
  // Send appropriate error response
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong';
  
  res.status(statusCode).json({ 
    error: statusCode >= 500 ? 'Internal server error' : 'Request error',
    message,
    requestId: res.getHeader('X-Request-ID')
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  app.listen(port, () => {
    logger.info(`Client API server running on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app; 