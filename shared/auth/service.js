const jwt = require('./jwt');
const { queries } = require('../db');

const MAX_ACTIVE_TOKENS = 5;

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @param {string} deviceId - Unique device identifier
 * @param {string} tier - User subscription tier (free/monthly/annual)
 * @param {string} secret - JWT secret
 * @returns {Promise<string>} - JWT token
 */
async function generateToken(user, deviceId, tier = 'free', secret) {
  // Generate token using pure functions
  const tokenData = jwt.generateToken(user, deviceId, tier, secret);
  
  try {
    // Check if user has reached max tokens (simplified - would need getUserActiveTokens function)
    // For now, just store the token
    
    // Store token in database
    await queries.storeToken(tokenData.tokenHash, tokenData.metadata);
  } catch (error) {
    console.error('Error storing token:', error);
    // Continue even if storing fails - user will need to login again if token can't be validated
  }
  
  return tokenData.token;
}

/**
 * Validate JWT token
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Promise<Object|null>} - Decoded token payload or null if invalid
 */
async function validateToken(token, secret) {
  return await jwt.validateToken(token, secret, queries.getTokenByHash);
}

/**
 * Refresh JWT token
 * @param {string} token - Current JWT token
 * @param {string} secret - JWT secret
 * @returns {Promise<string|null>} - New JWT token or null if refresh failed
 */
async function refreshToken(token, secret) {
  try {
    // Verify current token (ignoring expiration)
    const decoded = jwt.verifyJwtToken(token, secret, { ignoreExpiration: true });
    
    // Check if token is revoked
    const tokenHash = jwt.createTokenHash(token);
    const storedToken = await queries.getTokenByHash(tokenHash);
    
    if (!storedToken || storedToken.revoked) {
      return null;
    }
    
    // Get current user subscription status
    const user = await queries.getUserById(decoded.sub);
    const subscription = await queries.getUserSubscription(user.id, token);
    const tier = subscription ? subscription.plan_type : 'free';
    
    // Revoke old token
    await queries.revokeToken(tokenHash);
    
    // Generate new token
    return await generateToken(user, decoded.device_id, tier, secret);
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Revoke JWT token
 * @param {string} token - JWT token to revoke
 * @returns {Promise<boolean>} - Whether revocation was successful
 */
async function revokeToken(token) {
  try {
    const tokenHash = jwt.createTokenHash(token);
    const storedToken = await queries.getTokenByHash(tokenHash);
    
    if (!storedToken) {
      return false;
    }
    
    // Revoke token
    await queries.revokeToken(tokenHash);
    return true;
  } catch (error) {
    console.error('Token revocation error:', error);
    return false;
  }
}

module.exports = {
  generateToken,
  validateToken,
  refreshToken,
  revokeToken
}; 