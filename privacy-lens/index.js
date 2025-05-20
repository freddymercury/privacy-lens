/**
 * PrivacyLens Main Entry Point
 * 
 * This module serves as the main entry point for the PrivacyLens application.
 * It can start all processes or specific processes based on command line arguments.
 */

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { createLogger } from './shared/config/logger.js';
import { initializeDatabase } from './shared/db/index.js';
import { initializeQueue } from './shared/config/queue.js';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize logger
const logger = createLogger('Main');

// Process definitions
const processes = {
  'client-api': {
    path: './processes/client-api/index.js',
    description: 'Client API Process',
    default: true
  },
  'plugin-api': {
    path: './processes/plugin-api/index.js',
    description: 'Plugin API Process',
    default: true
  },
  'admin-dashboard': {
    path: './processes/admin-dashboard/index.js',
    description: 'Admin Dashboard Process',
    default: true
  },
  'archive-api': {
    path: './processes/archive-api/index.js',
    description: 'Archive API Process',
    default: true
  },
  'background-jobs': {
    path: './processes/background-jobs/index.js',
    description: 'Background Jobs Process',
    default: true
  }
};

// Active child processes
const childProcesses = new Map();

/**
 * Initialize the application
 * @returns {Promise<void>}
 */
async function initialize() {
  try {
    logger.info('Initializing PrivacyLens application');
    
    // Initialize the database
    await initializeDatabase();
    
    // Initialize the queue
    await initializeQueue();
    
    logger.info('PrivacyLens application initialized successfully');
  } catch (error) {
    logger.error('Error initializing PrivacyLens application', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start a specific process
 * @param {string} processName - Name of the process to start
 * @returns {Promise<void>}
 */
async function startProcess(processName) {
  try {
    if (!processes[processName]) {
      throw new Error(`Unknown process: ${processName}`);
    }
    
    logger.info(`Starting ${processes[processName].description}`);
    
    // Check if the process is already running
    if (childProcesses.has(processName)) {
      logger.warn(`Process ${processName} is already running`);
      return;
    }
    
    // Fork the process
    const processPath = path.join(__dirname, processes[processName].path);
    const child = fork(processPath, [], {
      stdio: 'inherit',
      env: process.env
    });
    
    // Store the child process
    childProcesses.set(processName, child);
    
    // Set up event handlers
    child.on('exit', (code, signal) => {
      logger.info(`Process ${processName} exited with code ${code} and signal ${signal}`);
      
      // Remove the child process from the map
      childProcesses.delete(processName);
      
      // Restart the process if it exited unexpectedly
      if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
        logger.warn(`Process ${processName} exited unexpectedly, restarting...`);
        startProcess(processName);
      }
    });
    
    logger.info(`${processes[processName].description} started successfully`);
  } catch (error) {
    logger.error(`Error starting ${processName} process`, { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop a specific process
 * @param {string} processName - Name of the process to stop
 * @returns {Promise<void>}
 */
async function stopProcess(processName) {
  try {
    if (!processes[processName]) {
      throw new Error(`Unknown process: ${processName}`);
    }
    
    logger.info(`Stopping ${processes[processName].description}`);
    
    // Check if the process is running
    if (!childProcesses.has(processName)) {
      logger.warn(`Process ${processName} is not running`);
      return;
    }
    
    // Get the child process
    const child = childProcesses.get(processName);
    
    // Send SIGTERM to the child process
    child.kill('SIGTERM');
    
    // Wait for the process to exit
    await new Promise((resolve) => {
      child.on('exit', () => {
        logger.info(`${processes[processName].description} stopped successfully`);
        resolve();
      });
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (childProcesses.has(processName)) {
          logger.warn(`Process ${processName} did not exit gracefully, force killing...`);
          child.kill('SIGKILL');
          childProcesses.delete(processName);
          resolve();
        }
      }, 5000);
    });
  } catch (error) {
    logger.error(`Error stopping ${processName} process`, { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Start all default processes
 * @returns {Promise<void>}
 */
async function startAllProcesses() {
  try {
    logger.info('Starting all default processes');
    
    // Start all default processes
    const startPromises = Object.entries(processes)
      .filter(([, process]) => process.default)
      .map(([name]) => startProcess(name));
    
    await Promise.all(startPromises);
    
    logger.info('All default processes started successfully');
  } catch (error) {
    logger.error('Error starting all processes', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stop all running processes
 * @returns {Promise<void>}
 */
async function stopAllProcesses() {
  try {
    logger.info('Stopping all processes');
    
    // Stop all running processes
    const stopPromises = Array.from(childProcesses.keys()).map(name => stopProcess(name));
    
    await Promise.all(stopPromises);
    
    logger.info('All processes stopped successfully');
  } catch (error) {
    logger.error('Error stopping all processes', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get the status of all processes
 * @returns {Object} - Status of all processes
 */
function getStatus() {
  const status = {};
  
  for (const [name, process] of Object.entries(processes)) {
    status[name] = {
      description: process.description,
      running: childProcesses.has(name),
      default: process.default
    };
  }
  
  return status;
}

/**
 * Print the usage information
 */
function printUsage() {
  console.log('Usage: node index.js [command] [process]');
  console.log('');
  console.log('Commands:');
  console.log('  start [process]  Start a specific process or all default processes');
  console.log('  stop [process]   Stop a specific process or all running processes');
  console.log('  restart [process] Restart a specific process or all default processes');
  console.log('  status           Show the status of all processes');
  console.log('');
  console.log('Processes:');
  
  for (const [name, process] of Object.entries(processes)) {
    console.log(`  ${name}${process.default ? ' (default)' : ''}: ${process.description}`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Parse command line arguments
    const command = process.argv[2];
    const processName = process.argv[3];
    
    // Initialize the application
    await initialize();
    
    // Handle commands
    switch (command) {
      case 'start':
        if (processName) {
          await startProcess(processName);
        } else {
          await startAllProcesses();
        }
        break;
        
      case 'stop':
        if (processName) {
          await stopProcess(processName);
        } else {
          await stopAllProcesses();
        }
        break;
        
      case 'restart':
        if (processName) {
          await stopProcess(processName).catch(() => {});
          await startProcess(processName);
        } else {
          await stopAllProcesses().catch(() => {});
          await startAllProcesses();
        }
        break;
        
      case 'status':
        console.log(JSON.stringify(getStatus(), null, 2));
        break;
        
      default:
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    logger.error('Error in main function', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, shutting down');
  await stopAllProcesses();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, shutting down');
  await stopAllProcesses();
  process.exit(0);
});

// Run the main function
main();
