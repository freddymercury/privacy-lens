/**
 * Shared Authentication Module for PrivacyLens
 * 
 * This module provides authentication and authorization functionality.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { 
  getUserById, 
  getUserByEmail, 
  createUser, 
  storeToken, 
  getTokenByHash, 
  updateTokenLastUsed, 
  revokeToken 
} from '../db/users.js';
import { logAuditEvent, AUDIT_ACTIONS, ENTITY_TYPES } from '../db/audit.js';

// Initialize logger
const logger = createLogger('Auth');

// Environment-based configuration with sensible defaults
const config = {
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production',
  jwtExpiry: parseInt(process.env.JWT_EXPIRY || '86400', 10), // 24 hours
  refreshTokenExpiry: parseInt(process.env.REFRESH_TOKEN_EXPIRY || '2592000', 10), // 30 days
  tokenIssuer: process.env.TOKEN_ISSUER || 'privacy-lens',
  saltRounds: 10
};

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
export function generateToken(user) {
  try {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role || 'user',
      iss: config.tokenIssuer,
      iat: Math.floor(Date.now() / 1000)
    };
    
    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiry
    });
    
    logger.debug(`Generated JWT token for user ${user.id}`);
    return token;
  } catch (error) {
    logger.error(`Error generating token for user ${user.id}:`, error);
    throw error;
  }
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token payload
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: config.tokenIssuer
    });
    
    logger.debug(`Verified JWT token for user ${decoded.sub}`);
    return decoded;
  } catch (error) {
    logger.error(`Error verifying token:`, error);
    throw error;
  }
}

/**
 * Generate a refresh token
 * @returns {string} - Refresh token
 */
export function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
export async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(config.saltRounds);
    const hash = await bcrypt.hash(password, salt);
    
    logger.debug('Password hashed successfully');
    return hash;
  } catch (error) {
    logger.error('Error hashing password:', error);
    throw error;
  }
}

/**
 * Compare a password with a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if the password matches the hash
 */
export async function comparePassword(password, hash) {
  try {
    const match = await bcrypt.compare(password, hash);
    
    logger.debug(`Password comparison result: ${match}`);
    return match;
  } catch (error) {
    logger.error('Error comparing password:', error);
    throw error;
  }
}

/**
 * Register a new user
 * @param {Object} userData - User data
 * @param {string} userData.email - User email
 * @param {string} userData.password - User password
 * @param {string} userData.name - User name
 * @returns {Promise<Object>} - User object and tokens
 */
export async function registerUser(userData) {
  try {
    logger.info(`Registering new user with email: ${userData.email}`);
    
    // Check if user already exists
    const existingUser = await getUserByEmail(userData.email);
    
    if (existingUser) {
      logger.warn(`User with email ${userData.email} already exists`);
      throw new Error('User with this email already exists');
    }
    
    // Hash the password
    const hashedPassword = await hashPassword(userData.password);
    
    // Create the user
    const user = await createUser({
      email: userData.email,
      password: hashedPassword,
      name: userData.name,
      role: userData.role || 'user'
    });
    
    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken();
    
    // Hash the refresh token for storage
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Store the refresh token
    await storeToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + config.refreshTokenExpiry * 1000).toISOString(),
      userAgent: getContext()?.userAgent || null,
      ip: getContext()?.ip || null
    });
    
    // Log the audit event
    await logAuditEvent({
      action: AUDIT_ACTIONS.REGISTER,
      entity_type: ENTITY_TYPES.USER,
      entity_id: user.id,
      details: { email: user.email }
    });
    
    logger.info(`User registered successfully: ${user.id}`);
    
    // Return the user and tokens
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwtExpiry
      }
    };
  } catch (error) {
    logger.error(`Error registering user:`, error);
    throw error;
  }
}

/**
 * Login a user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - User object and tokens
 */
export async function loginUser(email, password) {
  try {
    logger.info(`Attempting login for user: ${email}`);
    
    // Get the user
    const user = await getUserByEmail(email);
    
    // Debug log: print the fetched user object
    logger.debug('Fetched user object in loginUser:', { user });
    
    // Defensive check: ensure user and user.password_hash exist
    if (!user || !user.password_hash) {
      logger.warn(`User not found or missing password for email: ${email}`);
      throw new Error('Invalid email or password');
    }
    
    // Compare the password
    logger.debug('Comparing password in loginUser:', { password, userPasswordHash: user.password_hash });
    const passwordMatch = await comparePassword(password, user.password_hash);
    
    if (!passwordMatch) {
      logger.warn(`Invalid password for user: ${email}`);
      throw new Error('Invalid email or password');
    }
    
    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken();
    
    // Hash the refresh token for storage
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Store the refresh token
    await storeToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + config.refreshTokenExpiry * 1000).toISOString(),
      userAgent: getContext()?.userAgent || null,
      ip: getContext()?.ip || null
    });
    
    // Log the audit event
    await logAuditEvent({
      action: AUDIT_ACTIONS.LOGIN,
      entity_type: ENTITY_TYPES.USER,
      entity_id: user.id,
      details: { email: user.email }
    });
    
    logger.info(`User logged in successfully: ${user.id}`);
    
    // Return the user and tokens
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwtExpiry
      }
    };
  } catch (error) {
    logger.error(`Error logging in user:`, error);
    throw error;
  }
}

/**
 * Refresh an access token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} - New access token
 */
export async function refreshAccessToken(refreshToken) {
  try {
    logger.info('Refreshing access token');
    
    // Hash the refresh token
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Get the token from the database
    const token = await getTokenByHash(refreshTokenHash);
    
    if (!token) {
      logger.warn('Invalid refresh token');
      throw new Error('Invalid refresh token');
    }
    
    // Check if the token is expired
    if (new Date(token.expires_at) < new Date()) {
      logger.warn('Refresh token expired');
      throw new Error('Refresh token expired');
    }
    
    // Get the user
    const user = await getUserById(token.user_id);
    
    if (!user) {
      logger.warn(`User not found for token: ${token.id}`);
      throw new Error('User not found');
    }
    
    // Generate a new access token
    const accessToken = generateToken(user);
    
    // Update the token's last used timestamp
    await updateTokenLastUsed(token.id);
    
    logger.info(`Access token refreshed for user: ${user.id}`);
    
    // Return the new access token
    return {
      accessToken,
      expiresIn: config.jwtExpiry
    };
  } catch (error) {
    logger.error('Error refreshing access token:', error);
    throw error;
  }
}

/**
 * Logout a user
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<boolean>} - True if logout was successful
 */
export async function logoutUser(refreshToken) {
  try {
    logger.info('Logging out user');
    
    // If no refresh token, consider it a success
    if (!refreshToken) {
      logger.warn('No refresh token provided for logout');
      return true;
    }
    
    // Hash the refresh token
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Get the token from the database
    const token = await getTokenByHash(refreshTokenHash);
    
    // If token not found, consider it a success
    if (!token) {
      logger.warn('Token not found for logout');
      return true;
    }
    
    // Revoke the token
    await revokeToken(token.id);
    
    // Log the audit event
    await logAuditEvent({
      action: AUDIT_ACTIONS.LOGOUT,
      entity_type: ENTITY_TYPES.USER,
      entity_id: token.user_id,
      details: { tokenId: token.id }
    });
    
    logger.info(`User logged out successfully: ${token.user_id}`);
    
    return true;
  } catch (error) {
    logger.error('Error logging out user:', error);
    throw error;
  }
}

/**
 * Create Express middleware to authenticate requests
 * @param {Object} options - Options
 * @param {boolean} options.required - Whether authentication is required
 * @returns {Function} - Express middleware function
 */
export function authMiddleware(options = { required: true }) {
  return async (req, res, next) => {
    try {
      // Get the authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        if (options.required) {
          logger.warn('No authorization header provided');
          return res.status(401).json({ error: 'Authentication required' });
        } else {
          return next();
        }
      }
      
      // Check if it's a Bearer token
      if (!authHeader.startsWith('Bearer ')) {
        logger.warn('Invalid authorization header format');
        return res.status(401).json({ error: 'Invalid authorization header format' });
      }
      
      // Extract the token
      const token = authHeader.substring(7);
      
      // Verify the token
      const decoded = verifyToken(token);
      
      // Get the user
      const user = await getUserById(decoded.sub);
      
      if (!user) {
        logger.warn(`User not found for token: ${decoded.sub}`);
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Add the user to the request
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      };
      
      // Add the user ID to the context
      const context = getContext();
      if (context) {
        context.userId = user.id;
      }
      
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        logger.warn('Invalid or expired token');
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      
      logger.error('Error in auth middleware:', error);
      
      if (options.required) {
        return res.status(500).json({ error: 'Internal server error' });
      } else {
        return next();
      }
    }
  };
}

/**
 * Create Express middleware to check user roles
 * @param {string[]} roles - Allowed roles
 * @returns {Function} - Express middleware function
 */
export function roleMiddleware(roles) {
  return (req, res, next) => {
    // Check if the user exists
    if (!req.user) {
      logger.warn('No user found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if the user has one of the allowed roles
    if (!roles.includes(req.user.role)) {
      logger.warn(`User ${req.user.id} does not have required role. Has: ${req.user.role}, Required: ${roles.join(', ')}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

/**
 * Create API key for plugin authentication
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - API key details
 */
export async function createApiKey(userId) {
  try {
    logger.info(`Creating API key for user: ${userId}`);
    
    // Get the user
    const user = await getUserById(userId);
    
    if (!user) {
      logger.warn(`User not found: ${userId}`);
      throw new Error('User not found');
    }
    
    // Generate a random API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    
    // Hash the API key for storage
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Store the API key as a token
    const token = await storeToken({
      userId: user.id,
      tokenHash: apiKeyHash,
      tokenType: 'api_key',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      userAgent: getContext()?.userAgent || null,
      ip: getContext()?.ip || null
    });
    
    // Log the audit event
    await logAuditEvent({
      action: AUDIT_ACTIONS.CREATE,
      entity_type: 'api_key',
      entity_id: token.id,
      details: { userId: user.id }
    });
    
    logger.info(`API key created for user: ${user.id}`);
    
    // Return the API key details
    return {
      apiKey,
      expiresAt: token.expires_at
    };
  } catch (error) {
    logger.error(`Error creating API key:`, error);
    throw error;
  }
}

/**
 * Verify an API key
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - User object
 */
export async function verifyApiKey(apiKey) {
  try {
    logger.info('Verifying API key');
    
    // Hash the API key
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Get the token from the database
    const token = await getTokenByHash(apiKeyHash);
    
    if (!token) {
      logger.warn('Invalid API key');
      throw new Error('Invalid API key');
    }
    
    // Check if the token is expired
    if (new Date(token.expires_at) < new Date()) {
      logger.warn('API key expired');
      throw new Error('API key expired');
    }
    
    // Check if it's an API key
    if (token.token_type !== 'api_key') {
      logger.warn('Token is not an API key');
      throw new Error('Invalid API key');
    }
    
    // Get the user
    const user = await getUserById(token.user_id);
    
    if (!user) {
      logger.warn(`User not found for API key: ${token.id}`);
      throw new Error('User not found');
    }
    
    // Update the token's last used timestamp
    await updateTokenLastUsed(token.id);
    
    logger.info(`API key verified for user: ${user.id}`);
    
    // Return the user
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
  } catch (error) {
    logger.error('Error verifying API key:', error);
    throw error;
  }
}

/**
 * Create Express middleware to authenticate API keys
 * @returns {Function} - Express middleware function
 */
export function apiKeyMiddleware() {
  return async (req, res, next) => {
    try {
      // Get the API key from the header or query parameter
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      
      if (!apiKey) {
        logger.warn('No API key provided');
        return res.status(401).json({ error: 'API key required' });
      }
      
      // Verify the API key
      const user = await verifyApiKey(apiKey);
      
      // Add the user to the request
      req.user = user;
      
      // Add the user ID to the context
      const context = getContext();
      if (context) {
        context.userId = user.id;
      }
      
      next();
    } catch (error) {
      logger.warn('Invalid API key:', error.message);
      return res.status(401).json({ error: 'Invalid API key' });
    }
  };
}
