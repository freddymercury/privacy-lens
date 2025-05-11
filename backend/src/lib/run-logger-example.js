#!/usr/bin/env node

/**
 * Script to run the logger examples
 * 
 * This script demonstrates the usage of the different logger implementations.
 * It loads environment variables from .env and runs the examples.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createLogger } from './logger-phase3.js';

// Create a logger for this script
const logger = createLogger('LoggerExample');

// Replicate __dirname behavior for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Ensure logs directory exists
const logPath = process.env.LOG_PATH || './logs';
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
  logger.info(`Created logs directory: ${logPath}`);
}

// Import and run the examples
import { runAllDemonstrations } from './logger-example.js';

logger.info('=== PrivacyLens Logger Examples ===');
logger.info('Environment:');
logger.info(`- NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
logger.info(`- LOG_LEVEL: ${process.env.LOG_LEVEL || 'info (default)'}`);
logger.info(`- LOG_PATH: ${process.env.LOG_PATH || './logs (default)'}`);
logger.info(`- SERVICE_NAME: ${process.env.SERVICE_NAME || 'privacy-lens (default)'}`);
logger.info('');

// Run the demonstrations
runAllDemonstrations();

// Wait for any async operations to complete
setTimeout(() => {
  logger.info('\n=== Example Complete ===');
  logger.info(`Check the log file at: ${path.resolve(logPath, `${process.env.SERVICE_NAME || 'privacy-lens'}.log`)}`);
}, 500);
