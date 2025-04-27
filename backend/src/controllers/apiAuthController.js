// API Authentication Controller for PrivacyLens

const bcrypt = require('bcrypt');
const db = require('../utils/db');
const authService = require('../services/authService');

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const register = async (req, res) => {
  try {
    const { email, password, name, deviceId } = req.body;

    if (!email || !password || !deviceId) {
      return res.status(400).json({
        status: 'error',
        message: 'Email, password, and deviceId are required'
      });
    }

    // Check if email already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already registered'
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user in database
    const user = await db.createUser({
      email,
      username: email.split('@')[0], // Set username to the part before @ in email
      password_hash: passwordHash,
      name: name || email.split('@')[0],
      role: 'user',
      created_at: new Date().toISOString()
    });

    // Generate JWT token
    const token = await authService.generateToken(user, deviceId, 'free');

    // Create audit log entry
    await db.createAuditLog({
      action: 'user_registered',
      user_id: user.id,
      details: {
        email,
        device_id: deviceId
      }
    });

    return res.status(201).json({
      status: 'success',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to register user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Login user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const login = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    if (!email || !password || !deviceId) {
      return res.status(400).json({
        status: 'error',
        message: 'Email, password, and deviceId are required'
      });
    }

    // Get user from database
    const user = await db.getUserByEmail(email);

    if (!user) {
      // Create audit log entry for failed login
      await db.createAuditLog({
        action: 'login_failed',
        details: {
          email,
          reason: 'User not found',
          device_id: deviceId
        }
      });

      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Create audit log entry for failed login
      await db.createAuditLog({
        action: 'login_failed',
        details: {
          email,
          reason: 'Invalid password',
          device_id: deviceId
        }
      });

      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Determine the user's current tier *before* generating the final token.
    // We need a temporary token to potentially query RLS-protected subscription data.
    // Note: This assumes db.getUserSubscription requires an RLS token.
    let tier = 'free'; // Default tier
    try {
      // Generate a temporary token (doesn't matter if it's 'free' tier for this check)
      const tempTokenForCheck = await authService.generateToken(user, deviceId, 'free');
      // Fetch subscription using the temporary token
      const subscription = await db.getUserSubscription(user.id, tempTokenForCheck);
      if (subscription) {
        tier = subscription.plan_type; // Get the actual tier
      }
      // Note: We don't necessarily need to revoke tempTokenForCheck if it wasn't stored
      // or if generateToken handles replacing tokens for the same device.
      // Let's assume generateToken handles cleanup/replacement.
    } catch (subError) {
      console.error(`[Login] Error fetching subscription status during login for user ${user.id}:`, subError);
      // Proceed with 'free' tier if subscription check fails
    }

    // Generate the final token with the determined tier
    const finalToken = await authService.generateToken(user, deviceId, tier);

    // Create audit log entry for successful login
    await db.createAuditLog({
      action: 'login_success',
      user_id: user.id,
      details: {
        email,
        device_id: deviceId
      }
    });

    return res.status(200).json({
      status: 'success',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token: finalToken // Return only user info and token
      // Do NOT return subscription status here; plugin should fetch it separately.
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Validate token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const validate = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Token is required'
      });
    }

    const decoded = await authService.validateToken(token);

    if (!decoded) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }

    return res.status(200).json({
      status: 'success',
      valid: true,
      payload: {
        userId: decoded.sub,
        tier: decoded.tier,
        features: decoded.features,
        deviceId: decoded.device_id
      }
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to validate token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Refresh token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refresh = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Token is required'
      });
    }

    const newToken = await authService.refreshToken(token);

    if (!newToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token or refresh failed'
      });
    }

    return res.status(200).json({
      status: 'success',
      token: newToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to refresh token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Revoke token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const revoke = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Token is required'
      });
    }

    const success = await authService.revokeToken(token);

    if (!success) {
      return res.status(400).json({
        status: 'error',
        message: 'Token revocation failed'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Token revoked successfully'
    });
  } catch (error) {
    console.error('Token revocation error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to revoke token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  login,
  validate,
  refresh,
  revoke
};
