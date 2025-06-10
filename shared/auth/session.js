/**
 * Pure function to create session data object
 * @param {Object} user - User object
 * @returns {Object} Session data object
 */
function createSessionData(user) {
  if (!user || !user.id) {
    throw new Error('Valid user object with id is required');
  }
  
  return {
    id: user.id,
    username: user.username || user.email,
    role: user.role || 'user',
    name: user.name || user.username || user.email,
    email: user.email,
    createdAt: new Date().toISOString()
  };
}

/**
 * Pure function to validate session data
 * @param {Object} sessionData - Session data to validate
 * @returns {boolean} Whether session data is valid
 */
function isValidSessionData(sessionData) {
  return sessionData &&
         typeof sessionData === 'object' &&
         typeof sessionData.id === 'string' &&
         sessionData.id.length > 0 &&
         (typeof sessionData.username === 'string' || typeof sessionData.email === 'string') &&
         typeof sessionData.role === 'string';
}

/**
 * Pure function to check if session is expired
 * @param {Object} sessionData - Session data with createdAt timestamp
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @param {number} currentTime - Current timestamp (for testing)
 * @returns {boolean} Whether session is expired
 */
function isSessionExpired(sessionData, maxAgeMs, currentTime = Date.now()) {
  if (!sessionData || !sessionData.createdAt) {
    return true;
  }
  
  const sessionAge = currentTime - new Date(sessionData.createdAt).getTime();
  return sessionAge > maxAgeMs;
}

/**
 * Pure function to extract user info for request context
 * @param {Object} sessionData - Session data
 * @returns {Object} User context object
 */
function extractUserContext(sessionData) {
  if (!isValidSessionData(sessionData)) {
    return null;
  }
  
  return {
    id: sessionData.id,
    username: sessionData.username,
    role: sessionData.role,
    name: sessionData.name,
    email: sessionData.email
  };
}

/**
 * Pure function to check if user has specific role
 * @param {Object} sessionData - Session data
 * @param {string} requiredRole - Required role
 * @returns {boolean} Whether user has required role
 */
function hasRole(sessionData, requiredRole) {
  if (!isValidSessionData(sessionData)) {
    return false;
  }
  
  return sessionData.role === requiredRole;
}

/**
 * Pure function to check if user is admin
 * @param {Object} sessionData - Session data
 * @returns {boolean} Whether user is admin
 */
function isAdmin(sessionData) {
  return hasRole(sessionData, 'admin');
}

/**
 * Pure function to create audit log data for session events
 * @param {string} action - Action type (login_success, login_failed, logout)
 * @param {Object} sessionData - Session data (optional)
 * @param {Object} details - Additional details
 * @returns {Object} Audit log entry
 */
function createSessionAuditLog(action, sessionData = null, details = {}) {
  const logEntry = {
    action,
    timestamp: new Date().toISOString(),
    details: { ...details }
  };
  
  if (sessionData && sessionData.id) {
    logEntry.user_id = sessionData.id;
  }
  
  return logEntry;
}

/**
 * Pure function to sanitize session data for client response
 * @param {Object} sessionData - Session data
 * @returns {Object} Sanitized session data (without sensitive info)
 */
function sanitizeSessionForClient(sessionData) {
  if (!isValidSessionData(sessionData)) {
    return null;
  }
  
  return {
    id: sessionData.id,
    username: sessionData.username,
    name: sessionData.name,
    role: sessionData.role,
    email: sessionData.email
  };
}

/**
 * Pure function to check if session belongs to specific user
 * @param {Object} sessionData - Session data
 * @param {string} userId - User ID to check
 * @returns {boolean} Whether session belongs to user
 */
function isSessionForUser(sessionData, userId) {
  return isValidSessionData(sessionData) && sessionData.id === userId;
}

/**
 * Pure function to create return URL for redirects
 * @param {string} originalUrl - Original URL requested
 * @param {string} defaultUrl - Default URL if original is invalid
 * @returns {string} Safe return URL
 */
function createReturnUrl(originalUrl, defaultUrl = '/') {
  if (!originalUrl || typeof originalUrl !== 'string') {
    return defaultUrl;
  }
  
  // Prevent open redirects - only allow relative URLs
  if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
    return defaultUrl;
  }
  
  // Ensure URL starts with /
  if (!originalUrl.startsWith('/')) {
    return defaultUrl;
  }
  
  return originalUrl;
}

/**
 * Session middleware helper - creates session for user
 * @param {Object} req - Express request object
 * @param {Object} user - User object
 * @returns {void} Modifies req.session
 */
function createSession(req, user) {
  if (!req.session) {
    throw new Error('Session middleware not configured');
  }
  
  req.session.user = createSessionData(user);
}

/**
 * Session middleware helper - destroys session
 * @param {Object} req - Express request object
 * @param {Function} callback - Callback function
 * @returns {void}
 */
function destroySession(req, callback) {
  if (!req.session) {
    if (callback) callback();
    return;
  }
  
  req.session.destroy(callback);
}

/**
 * Session middleware helper - checks if user is authenticated
 * @param {Object} req - Express request object
 * @returns {boolean} Whether user is authenticated
 */
function isAuthenticated(req) {
  return req.session && 
         req.session.user && 
         isValidSessionData(req.session.user);
}

module.exports = {
  // Pure functions
  createSessionData,
  isValidSessionData,
  isSessionExpired,
  extractUserContext,
  hasRole,
  isAdmin,
  createSessionAuditLog,
  sanitizeSessionForClient,
  isSessionForUser,
  createReturnUrl,
  
  // Session middleware helpers
  createSession,
  destroySession,
  isAuthenticated
}; 