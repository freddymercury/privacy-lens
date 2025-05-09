// Authentication Service for PrivacyLens
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as db from '../utils/db.cjs';

const JWT_SECRET = process.env.JWT_SECRET || 'privacy-lens-jwt-secret';
const FREE_TOKEN_VALIDITY_DAYS = 30;
const PREMIUM_TOKEN_VALIDITY_DAYS = 7;
const MAX_ACTIVE_TOKENS = 5;

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @param {string} deviceId - Unique device identifier
 * @param {string} tier - User subscription tier (free/monthly/annual)
 * @returns {Promise<string>} - JWT token
 */
const generateToken = async (user, deviceId, tier = 'free') => {
  // Calculate expiration based on tier
  const validityDays = tier === 'free' ? FREE_TOKEN_VALIDITY_DAYS : PREMIUM_TOKEN_VALIDITY_DAYS;
  const expiresIn = validityDays * 24 * 60 * 60; // in seconds
  
  // Determine features based on tier
  const features = ['basic'];
  if (tier !== 'free') {
    features.push('advanced', 'premium');
  }
  
  // Create token payload
  const payload = {
    iss: 'privacy-lens',
    sub: user.id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    device_id: deviceId,
    tier,
    features,
    version: '1.0'
  };
  
  // Sign token
  const token = jwt.sign(payload, JWT_SECRET);
  
  // Store token in database
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);
  
  try {
    // Check if user has reached max tokens
    const activeTokens = await db.getUserActiveTokens(user.id);
    if (activeTokens && activeTokens.length >= MAX_ACTIVE_TOKENS) {
      // Remove oldest token
      const oldestToken = activeTokens.reduce((oldest, current) => 
        new Date(oldest.created_at) < new Date(current.created_at) ? oldest : current
      );
      await db.revokeToken(oldestToken.id);
    }
    
    // Store new token
    await db.storeToken({
      user_id: user.id,
      token_hash: tokenHash,
      device_id: deviceId,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      revoked: false
    });
  } catch (error) {
    console.error('Error storing token:', error);
    // Continue even if storing fails - user will need to login again if token can't be validated
  }
  
  return token;
};

/**
 * Validate JWT token
 * @param {string} token - JWT token
 * @returns {Promise<Object|null>} - Decoded token payload or null if invalid
 */
const validateToken = async (token) => {
  try {
    // Verify token signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if token is revoked
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const storedToken = await db.getTokenByHash(tokenHash);
    
    if (!storedToken || storedToken.revoked) {
      return null;
    }
    
    // Update last used timestamp (now using service role client internally)
    await db.updateTokenLastUsed(storedToken.id); // No longer needs the token passed
    
    return decoded;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
};

/**
 * Refresh JWT token
 * @param {string} token - Current JWT token
 * @returns {Promise<string|null>} - New JWT token or null if refresh failed
 */
const refreshToken = async (token) => {
  try {
    // Verify current token (ignoring expiration)
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    // Check if token is revoked
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const storedToken = await db.getTokenByHash(tokenHash);
    
    if (!storedToken || storedToken.revoked) {
      return null;
    }
    
    // Get current user subscription status using RLS client via the original token
    const user = await db.getUserById(decoded.sub); // getUserById uses service role, no token needed
    const subscription = await db.getUserSubscription(user.id, token); // Pass the original token
    const tier = subscription ? subscription.plan_type : 'free';
    
    // Revoke old token (now using service role client internally)
    await db.revokeToken(storedToken.id); // No longer needs the token passed
    
    // Generate new token
    return await generateToken(user, decoded.device_id, tier);
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
};

/**
 * Revoke JWT token
 * @param {string} token - JWT token to revoke
 * @returns {Promise<boolean>} - Whether revocation was successful
 */
const revokeToken = async (token) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const storedToken = await db.getTokenByHash(tokenHash);
    
    if (!storedToken) {
      return false;
    }
    
    // Revoke token using RLS client via the token being revoked
    await db.revokeToken(storedToken.id, token); // Pass the token
    return true;
  } catch (error) {
    console.error('Token revocation error:', error);
    return false;
  }
};

export {
  generateToken,
  validateToken,
  refreshToken,
  revokeToken
};
