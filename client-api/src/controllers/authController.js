const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import shared modules (using require since shared is CommonJS)
const { db, auth } = require('@privacy-lens/shared');

const JWT_SECRET = process.env.JWT_SECRET || 'privacy-lens-jwt-secret';

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
    const existingUser = await db.queries.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already registered'
      });
    }

    // Hash password
    const passwordHash = await auth.password.hashPasswordForRegistration(password);

    // Create user in database
    const user = await db.queries.createUser({
      email,
      username: email.split('@')[0], // Set username to the part before @ in email
      password_hash: passwordHash,
      name: name || email.split('@')[0],
      role: 'user',
      created_at: new Date().toISOString()
    });

    // Generate JWT token
    const token = await auth.service.generateToken(user, deviceId, 'free', JWT_SECRET);

    // Create audit log entry (gracefully handle errors)
    try {
      await db.queries.createAuditLog({
        action: 'user_registered',
        user_id: user.id,
        details: {
          email,
          device_id: deviceId
        }
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

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
    const user = await db.queries.getUserByEmail(email);

    if (!user) {
      // Create audit log entry for failed login (gracefully handle errors)
      try {
        await db.queries.createAuditLog({
          action: 'login_failed',
          details: {
            email,
            reason: 'User not found',
            device_id: deviceId
          }
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Check password
    const passwordMatch = await auth.password.comparePassword(password, user.password_hash);

    if (!passwordMatch) {
      // Create audit log entry for failed login (gracefully handle errors)
      try {
        await db.queries.createAuditLog({
          action: 'login_failed',
          details: {
            email,
            reason: 'Invalid password',
            device_id: deviceId
          }
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Determine the user's current tier
    let tier = 'free';
    try {
      // Generate a temporary token to check subscription
      const tempToken = await auth.service.generateToken(user, deviceId, 'free', JWT_SECRET);
      const subscription = await db.queries.getUserSubscription(user.id, tempToken);
      if (subscription) {
        tier = subscription.plan_type;
      }
    } catch (subError) {
      console.error(`[Login] Error fetching subscription status during login for user ${user.id}:`, subError);
      // Proceed with 'free' tier if subscription check fails
    }

    // Generate the final token with the determined tier
    const token = await auth.service.generateToken(user, deviceId, tier, JWT_SECRET);

    // Create audit log entry for successful login (gracefully handle errors)
    try {
      await db.queries.createAuditLog({
        action: 'login_success',
        user_id: user.id,
        details: {
          email,
          device_id: deviceId
        }
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return res.status(200).json({
      status: 'success',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
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

    const decoded = await auth.service.validateToken(token, JWT_SECRET);

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

    const newToken = await auth.service.refreshToken(token, JWT_SECRET);

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
 * Revoke token (logout)
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

    const success = await auth.service.revokeToken(token);

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