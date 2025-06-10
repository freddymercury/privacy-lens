const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Pure function to create JWT payload
 * @param {Object} user - User object with id
 * @param {string} deviceId - Device identifier
 * @param {string} tier - Subscription tier (free/monthly/annual)
 * @param {number} currentTime - Current timestamp in seconds
 * @returns {Object} JWT payload
 */
function createJwtPayload(user, deviceId, tier = 'free', currentTime = Math.floor(Date.now() / 1000)) {
  // Calculate expiration based on tier
  const FREE_TOKEN_VALIDITY_DAYS = 30;
  const PREMIUM_TOKEN_VALIDITY_DAYS = 7;
  const validityDays = tier === 'free' ? FREE_TOKEN_VALIDITY_DAYS : PREMIUM_TOKEN_VALIDITY_DAYS;
  const expiresIn = validityDays * 24 * 60 * 60; // in seconds
  
  // Determine features based on tier
  const features = ['basic'];
  if (tier !== 'free') {
    features.push('advanced', 'premium');
  }
  
  return {
    iss: 'privacy-lens',
    sub: user.id,
    iat: currentTime,
    exp: currentTime + expiresIn,
    device_id: deviceId,
    tier,
    features,
    version: '1.0'
  };
}

/**
 * Pure function to sign JWT token
 * @param {Object} payload - JWT payload
 * @param {string} secret - JWT secret
 * @returns {string} Signed JWT token
 */
function signJwtToken(payload, secret) {
  return jwt.sign(payload, secret);
}

/**
 * Pure function to verify JWT token
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret
 * @param {Object} options - JWT verification options
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid
 */
function verifyJwtToken(token, secret, options = {}) {
  return jwt.verify(token, secret, options);
}

/**
 * Pure function to create token hash
 * @param {string} token - Token to hash
 * @returns {string} SHA256 hash of token
 */
function createTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Pure function to calculate token expiration date
 * @param {string} tier - Subscription tier
 * @param {Date} baseDate - Base date for calculation
 * @returns {Date} Expiration date
 */
function calculateTokenExpiration(tier = 'free', baseDate = new Date()) {
  const FREE_TOKEN_VALIDITY_DAYS = 30;
  const PREMIUM_TOKEN_VALIDITY_DAYS = 7;
  const validityDays = tier === 'free' ? FREE_TOKEN_VALIDITY_DAYS : PREMIUM_TOKEN_VALIDITY_DAYS;
  
  const expiresAt = new Date(baseDate);
  expiresAt.setDate(expiresAt.getDate() + validityDays);
  return expiresAt;
}

/**
 * Pure function to find oldest token from a list
 * @param {Array} tokens - Array of token objects with created_at property
 * @returns {Object|null} Oldest token or null if empty array
 */
function findOldestToken(tokens) {
  if (!tokens || tokens.length === 0) return null;
  
  return tokens.reduce((oldest, current) => 
    new Date(oldest.created_at) < new Date(current.created_at) ? oldest : current
  );
}

/**
 * Pure function to extract features for tier
 * @param {string} tier - Subscription tier
 * @returns {Array} Array of feature strings
 */
function getFeaturesForTier(tier) {
  const features = ['basic'];
  if (tier !== 'free') {
    features.push('advanced', 'premium');
  }
  return features;
}

/**
 * Pure function to validate token structure
 * @param {Object} decodedToken - Decoded JWT token
 * @returns {boolean} Whether token has valid structure
 */
function isValidTokenStructure(decodedToken) {
  return decodedToken && 
         typeof decodedToken.sub === 'string' &&
         typeof decodedToken.device_id === 'string' &&
         typeof decodedToken.iss === 'string' &&
         decodedToken.iss === 'privacy-lens' &&
         Array.isArray(decodedToken.features);
}

/**
 * Generate JWT token (with side effects)
 * @param {Object} user - User object
 * @param {string} deviceId - Device identifier
 * @param {string} tier - Subscription tier
 * @param {string} secret - JWT secret
 * @returns {Object} Object containing token and metadata
 */
function generateToken(user, deviceId, tier = 'free', secret) {
  const currentTime = Math.floor(Date.now() / 1000);
  const payload = createJwtPayload(user, deviceId, tier, currentTime);
  const token = signJwtToken(payload, secret);
  const tokenHash = createTokenHash(token);
  const expiresAt = calculateTokenExpiration(tier);
  
  return {
    token,
    tokenHash,
    payload,
    expiresAt,
    metadata: {
      user_id: user.id,
      device_id: deviceId,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      revoked: false
    }
  };
}

/**
 * Validate JWT token (with side effects for database lookup)
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @param {Function} tokenLookupFn - Function to lookup token in database
 * @returns {Promise<Object|null>} Decoded token or null if invalid
 */
async function validateToken(token, secret, tokenLookupFn) {
  try {
    // Pure verification first
    const decoded = verifyJwtToken(token, secret);
    
    if (!isValidTokenStructure(decoded)) {
      return null;
    }
    
    // Side effect: lookup token in database
    const tokenHash = createTokenHash(token);
    const storedToken = await tokenLookupFn(tokenHash);
    
    if (!storedToken || storedToken.revoked) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}

module.exports = {
  // Pure functions
  createJwtPayload,
  signJwtToken,
  verifyJwtToken,
  createTokenHash,
  calculateTokenExpiration,
  findOldestToken,
  getFeaturesForTier,
  isValidTokenStructure,
  
  // Functions with side effects
  generateToken,
  validateToken
}; 