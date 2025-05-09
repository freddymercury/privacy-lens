// Subscription Controller for PrivacyLens

import * as subscriptionService from '../services/subscriptionService.js';
import Stripe from 'stripe';

/**
 * Create subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createSubscription = async (req, res) => {
  try {
    const { planType, paymentMethodId } = req.body;
    const userId = req.user.id;

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

    // Extract token from header
    const token = req.headers.authorization; // Assumes 'Bearer <token>' format or just '<token>'
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    // Extract only the token part, assuming "Bearer <token>" format
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    const result = await subscriptionService.createSubscription(userId, planType, paymentMethodId, jwtToken);

    return res.status(201).json({
      status: 'success',
      subscription: result.subscription,
      clientSecret: result.clientSecret
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateSubscription = async (req, res) => {
  try {
    const { planType } = req.body;
    const userId = req.user.id;

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

    // Extract token from header
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    // Extract only the token part, assuming "Bearer <token>" format
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    const subscription = await subscriptionService.updateSubscription(userId, planType, jwtToken);

    return res.status(200).json({
      status: 'success',
      subscription
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Cancel subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Extract token from header
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    // Extract only the token part, assuming "Bearer <token>" format
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    const subscription = await subscriptionService.cancelSubscription(userId, jwtToken);

    return res.status(200).json({
      status: 'success',
      subscription
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to cancel subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get subscription status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Extract token from header
    const token = req.headers.authorization;
    if (!token) {
      // If checking status and no token, maybe return 'free' tier status? Or require auth.
      // Let's require auth for consistency.
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    // Extract only the token part, assuming "Bearer <token>" format
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    const status = await subscriptionService.getSubscriptionStatus(userId, jwtToken);

    return res.status(200).json({
      status: 'success',
      subscription: status
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get subscription status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Handle Stripe webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handleWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    // Verify webhook signature
    if (endpointSecret) {
      try {
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({
          status: 'error',
          message: `Webhook signature verification failed: ${err.message}`
        });
      }
    } else {
      // For development without signature verification
      event = req.body;
    }
    
    // Handle the event
    await subscriptionService.handleWebhookEvent(event);
    
    return res.status(200).json({
      status: 'success',
      received: true
    });
  } catch (error) {
    console.error('Webhook handling error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to handle webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  handleWebhook
};
