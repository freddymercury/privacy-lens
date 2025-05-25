import { validateToken, createTokenHash } from '@privacy-lens/shared/auth/jwt.js';
import { supabaseServiceRole } from '../database.js';

/**
 * Pure function to extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}

/**
 * Database lookup function for token validation
 * @param {string} tokenHash - Hashed token to lookup
 * @returns {Promise<Object|null>} Token record or null
 */
async function lookupToken(tokenHash) {
  try {
    const { data: token, error } = await supabaseServiceRole
      .from('user_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();
    
    if (error) {
      console.error('Token lookup error:', error);
      return null;
    }
    
    return token;
  } catch (err) {
    console.error('Token lookup exception:', err);
    return null;
  }
}

/**
 * Authentication middleware
 * Validates JWT tokens and adds user context to request
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied',
      message: 'No token provided' 
    });
  }
  
  // Validate token using shared JWT utilities
  validateToken(token, process.env.JWT_SECRET, lookupToken)
    .then(decoded => {
      if (!decoded) {
        return res.status(401).json({ 
          error: 'Access denied',
          message: 'Invalid or expired token' 
        });
      }
      
      // Add user context to request
      req.user = {
        id: decoded.sub,
        deviceId: decoded.device_id,
        tier: decoded.tier,
        features: decoded.features,
        tokenPayload: decoded
      };
      
      next();
    })
    .catch(err => {
      console.error('Token validation error:', err);
      res.status(500).json({ 
        error: 'Authentication error',
        message: 'Token validation failed' 
      });
    });
}

/**
 * Optional authentication middleware
 * Validates token if present but doesn't require it
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    // No token provided, continue without user context
    req.user = null;
    return next();
  }
  
  // Validate token if provided
  validateToken(token, process.env.JWT_SECRET, lookupToken)
    .then(decoded => {
      if (decoded) {
        req.user = {
          id: decoded.sub,
          deviceId: decoded.device_id,
          tier: decoded.tier,
          features: decoded.features,
          tokenPayload: decoded
        };
      } else {
        req.user = null;
      }
      
      next();
    })
    .catch(err => {
      console.error('Optional auth error:', err);
      req.user = null;
      next();
    });
}

/**
 * Middleware to require specific features
 * @param {Array} requiredFeatures - Array of required feature strings
 */
export function requireFeatures(requiredFeatures) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Access denied',
        message: 'Authentication required' 
      });
    }
    
    const userFeatures = req.user.features || [];
    const hasAllFeatures = requiredFeatures.every(feature => 
      userFeatures.includes(feature)
    );
    
    if (!hasAllFeatures) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Insufficient permissions',
        required_features: requiredFeatures,
        user_features: userFeatures
      });
    }
    
    next();
  };
} 