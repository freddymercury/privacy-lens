/**
 * Context module for PrivacyLens backend
 * 
 * This module provides utilities for context propagation using AsyncLocalStorage.
 * It allows for passing context through the call stack, including async operations.
 */

import { AsyncLocalStorage } from 'async_hooks';

// Create a new AsyncLocalStorage instance
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Create a new context object
 * @param {Object} initialContext - Initial context values
 * @returns {Object} - The context object
 */
export function createContext(initialContext = {}) {
  return {
    ...initialContext,
    createdAt: Date.now()
  };
}

/**
 * Run a function with a context
 * @param {Object} context - The context to run with
 * @param {Function} fn - The function to run
 * @returns {any} - The result of the function
 */
export function runWithContext(context, fn) {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current context
 * @returns {Object|null} - The current context or null if no context is active
 */
export function getContext() {
  return asyncLocalStorage.getStore() || null;
}

/**
 * Update the current context
 * @param {Object} updates - The updates to apply to the context
 * @returns {Object|null} - The updated context or null if no context is active
 */
export function updateContext(updates) {
  const currentContext = getContext();
  if (!currentContext) {
    return null;
  }
  
  // Apply updates to the current context
  Object.assign(currentContext, updates);
  
  return currentContext;
}

/**
 * Express middleware to create a context for each request
 * @param {Object} options - Options for the middleware
 * @returns {Function} - Express middleware function
 */
export function contextMiddleware(options = {}) {
  return (req, res, next) => {
    // Create a context for the request
    const context = createContext({
      requestId: req.headers['x-request-id'] || generateRequestId(),
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      ...options.additionalContext
    });
    
    // If user is authenticated, add user info to context
    if (req.user) {
      context.userId = req.user.id;
      context.userEmail = req.user.email;
    }
    
    // Run the rest of the request with this context
    runWithContext(context, next);
  };
}

/**
 * Generate a unique request ID
 * @returns {string} - A unique request ID
 */
function generateRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
