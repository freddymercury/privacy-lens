// Load environment variables FIRST before any other imports
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const pino = require('pino');
const pinoHttp = require('pino-http');

// Import routes
const authRoutes = require('./routes/auth.js');
const assessmentRoutes = require('./routes/assessment.js');
const { triggerAssessment, reportUnassessed } = require('./controllers/assessmentController.js');

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

// Routes - THIS IS THE KEY LINE THAT WAS MISSING!
app.use('/api/auth', authRoutes);
app.use('/api/assessment', assessmentRoutes);

// Direct route for trigger assessment to match original API structure
app.post('/api/trigger-assessment/:url', triggerAssessment);

// Direct route for report unassessed to match original API structure
app.post('/api/report-unassessed', reportUnassessed);

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

// Start server
app.listen(port, () => {
  logger.info(`Client API server running on port ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app; 