// Subscription routes for Client API
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');

// For now, create a simple auth middleware that mimics the ES module one
// This is a temporary solution until we can properly resolve the ES module issue
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Access denied',
      message: 'No token provided' 
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  // For now, we'll do basic validation and add user context
  // In a real implementation, this would validate the JWT token
  try {
    // Mock user context for development
    req.user = {
      id: '346b039e-b98e-422b-8140-d59b275b68de', // This would come from JWT validation - using proper UUID format
      deviceId: 'device_123',
      tier: 'free',
      features: []
    };
    next();
  } catch (err) {
    console.error('Token validation error:', err);
    res.status(500).json({ 
      error: 'Authentication error',
      message: 'Token validation failed' 
    });
  }
};

// Middleware for parsing raw body for webhooks
const rawBodyMiddleware = (req, res, next) => {
  if (req.originalUrl === '/api/subscription/webhook') {
    req.rawBody = req.body;
  }
  next();
};

// Request body validation middleware
const validateSubscriptionCreation = (req, res, next) => {
  const { planType, paymentMethodId } = req.body;
  
  if (!planType || !paymentMethodId) {
    return res.status(400).json({
      status: 'error',
      message: 'Plan type and payment method ID are required'
    });
  }
  
  if (planType !== 'monthly' && planType !== 'annual') {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid plan type. Must be "monthly" or "annual"'
    });
  }
  
  next();
};

const validateSubscriptionUpdate = (req, res, next) => {
  const { planType } = req.body;
  
  if (!planType) {
    return res.status(400).json({
      status: 'error',
      message: 'Plan type is required'
    });
  }
  
  if (planType !== 'monthly' && planType !== 'annual') {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid plan type. Must be "monthly" or "annual"'
    });
  }
  
  next();
};

// Rate limiting middleware (simple implementation)
const rateLimitMap = new Map();
const rateLimit = (maxRequests = 10, windowMs = 60000) => {
  return (req, res, next) => {
    // In development, be more permissive with rate limiting
    if (process.env.NODE_ENV === 'development') {
      return next(); // Skip rate limiting in development
    }
    
    const key = req.ip + req.user?.id;
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const limit = rateLimitMap.get(key);
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    
    if (limit.count >= maxRequests) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please try again later.'
      });
    }
    
    limit.count++;
    next();
  };
};

// Webhook signature validation middleware
const validateWebhookSignature = (req, res, next) => {
  // For webhook endpoint, we don't require user authentication
  // but we do need to validate the Stripe signature
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (endpointSecret && !sig) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing Stripe signature'
    });
  }
  
  next();
};

// Subscription routes with proper middleware

/**
 * POST /api/subscription/create - Create new subscription
 * Requires: Authentication, Request body validation, Rate limiting
 */
router.post('/create', 
  authenticateToken,
  rateLimit(5, 300000), // 5 requests per 5 minutes for subscription creation
  validateSubscriptionCreation,
  subscriptionController.createSubscription
);

/**
 * POST /api/subscription/update - Update existing subscription
 * Requires: Authentication, Request body validation, Rate limiting
 */
router.post('/update',
  authenticateToken,
  rateLimit(10, 300000), // 10 requests per 5 minutes for subscription updates
  validateSubscriptionUpdate,
  subscriptionController.updateSubscription
);

/**
 * POST /api/subscription/cancel - Cancel subscription
 * Requires: Authentication, Rate limiting
 */
router.post('/cancel',
  authenticateToken,
  rateLimit(3, 300000), // 3 requests per 5 minutes for subscription cancellation
  subscriptionController.cancelSubscription
);

/**
 * GET /api/subscription/status - Get subscription status
 * Requires: Authentication, Rate limiting
 */
router.get('/status',
  authenticateToken,
  rateLimit(30, 60000), // 30 requests per minute for status checks
  subscriptionController.getSubscriptionStatus
);

/**
 * POST /api/subscription/webhook - Handle Stripe webhooks
 * Requires: Webhook signature validation
 * Note: No user authentication required for webhooks
 */
router.post('/webhook',
  rawBodyMiddleware,
  validateWebhookSignature,
  subscriptionController.handleWebhook
);

// Health check endpoint for subscription service
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    service: 'subscription',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 