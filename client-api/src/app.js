import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
// Import routes
import authRoutes from './routes/auth.js';

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

// Routes - Register auth routes
app.use('/api/auth', authRoutes);

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

export default app; 