#!/usr/bin/env node

/**
 * Test script to write directly to a log file
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from './logger-phase3.js';

// Create a logger for this script
const logger = createLogger('TestLogFile');

// Create logs directory if it doesn't exist
const logPath = './logs';
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
  logger.info(`Created logs directory: ${logPath}`);
}

// Write to log file
const logFile = path.join(logPath, 'test.log');
fs.writeFileSync(logFile, `Test log entry at ${new Date().toISOString()}\n`);

logger.info(`Wrote to log file: ${logFile}`);

// Read and display the log file
const content = fs.readFileSync(logFile, 'utf8');
logger.info('Log file content:');
logger.info(content);
