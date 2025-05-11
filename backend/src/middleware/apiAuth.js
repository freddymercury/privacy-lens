// API Authentication Middleware for PrivacyLens

import * as authService from '../services/authService.js';

/**
 * Validate JWT token middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Validate token
    const decoded = await authService.validateToken(token);
    if (!decoded) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      deviceId: decoded.device_id,
      tier: decoded.tier,
      features: decoded.features
    };

    next();
  } catch (error) {
    console.error('Token validation middleware error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};

/**
 * Check if user has specific feature
 * @param {string} feature - Feature name to check
 * @returns {Function} - Express middleware function
 */
const hasFeature = (feature) => {
  return (req, res, next) => {
    if (!req.user || !req.user.features || !req.user.features.includes(feature)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Feature '${feature}' required.`
      });
    }
    next();
  };
};

/**
 * Check if user has premium tier
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const isPremium = (req, res, next) => {
  if (!req.user || req.user.tier === 'free') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Premium subscription required.'
    });
  }
  next();
};

export {
  validateToken,
  hasFeature,
  isPremium
};
