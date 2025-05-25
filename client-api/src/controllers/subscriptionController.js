// Subscription Controller for Client API
// Uses shared pure functions and handles side effects through wrapper functions

const subscriptionCore = require('@privacy-lens/shared/subscription/index.cjs');
const { db } = require('@privacy-lens/shared');
const Stripe = require('stripe');

let stripe;

// Initialize Stripe with API key if available
if (process.env.STRIPE_SECRET_KEY) {
  stripe = Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  // Allow missing API key in development/test environment
  const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  
  if (isTestEnvironment) {
    console.warn('Stripe API key missing. Using mock Stripe client for development/testing.');
    // Create a mock Stripe client for development/testing
    stripe = {
      customers: {
        create: () => Promise.resolve({ id: 'cus_mock' }),
        update: () => Promise.resolve({})
      },
      paymentMethods: {
        attach: () => Promise.resolve({})
      },
      subscriptions: {
        create: () => Promise.resolve({ 
          id: 'sub_mock',
          status: 'active',
          current_period_start: Date.now() / 1000,
          current_period_end: (Date.now() / 1000) + (30 * 24 * 60 * 60),
          latest_invoice: { payment_intent: { client_secret: 'pi_mock_secret' } }
        }),
        retrieve: () => Promise.resolve({ 
          items: { data: [{ id: 'si_mock' }] } 
        }),
        update: () => Promise.resolve({}),
        cancel: () => Promise.resolve({})
      },
      webhooks: {
        constructEvent: (payload, sig, secret) => {
          // Mock webhook event construction
          return JSON.parse(payload);
        }
      }
    };
  } else {
    throw new Error('Stripe API key (STRIPE_SECRET_KEY) is required in production environment');
  }
}

// Price configuration for pure functions
const getPriceConfig = () => ({
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  annual: process.env.STRIPE_ANNUAL_PRICE_ID
});

/**
 * Create subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createSubscription = async (req, res) => {
  try {
    const { planType, paymentMethodId } = req.body;
    const userId = req.user.id;

    // Validate parameters using pure function
    const validation = subscriptionCore.validateSubscriptionCreationParams(userId, planType, paymentMethodId);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'error',
        message: validation.errors.join(', ')
      });
    }

    // Extract token from header for RLS operations
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    // Check if user already has an active subscription
    const existingSubscription = await db.queries.getUserSubscription(userId, jwtToken);
    if (subscriptionCore.hasActiveSubscription(existingSubscription)) {
      return res.status(400).json({
        status: 'error',
        message: `User already has an active subscription (Status: ${existingSubscription.status})`
      });
    }

    // Get user (uses service role)
    const user = await db.queries.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripe_customer_id;
    if (!stripeCustomerId) {
      const customerData = subscriptionCore.createStripeCustomerData(user, userId);
      const customer = await stripe.customers.create(customerData);
      stripeCustomerId = customer.id;
      
      // Update user with Stripe customer ID
      await db.queries.updateUser(userId, { stripe_customer_id: stripeCustomerId }, jwtToken);
    }

    // Attach payment method to customer using pure function for data
    const attachmentData = subscriptionCore.createPaymentMethodAttachmentData(stripeCustomerId);
    await stripe.paymentMethods.attach(paymentMethodId, attachmentData);

    // Set as default payment method using pure function for data
    const customerUpdateData = subscriptionCore.createCustomerUpdateData(paymentMethodId);
    await stripe.customers.update(stripeCustomerId, customerUpdateData);

    // Determine price ID using pure function
    const priceConfig = getPriceConfig();
    const priceId = subscriptionCore.getPriceIdForPlan(planType, priceConfig);

    // Create subscription using pure function for data
    const subscriptionData = subscriptionCore.createStripeSubscriptionData(stripeCustomerId, priceId);
    const subscription = await stripe.subscriptions.create(subscriptionData);

    // Check if this Stripe Subscription ID already exists in our DB
    const existingDbSub = await db.queries.getSubscriptionByStripeId(subscription.id);
    if (existingDbSub) {
      return res.status(409).json({
        status: 'error',
        message: `Subscription ID ${subscription.id} already exists in database`
      });
    }

    // Store subscription in database using pure function for data transformation
    const dbSubscriptionData = subscriptionCore.createSubscriptionData(subscription, userId, planType);
    const dbSubscription = await db.queries.createSubscription(dbSubscriptionData);

    // Create audit log entry using pure function for data
    const auditLogData = subscriptionCore.createAuditLogData('subscription_created', userId, {
      plan_type: planType,
      subscription_id: subscription.id
    });
    await db.queries.createAuditLog(auditLogData);

    // Extract client secret using pure function
    const clientSecret = subscriptionCore.extractClientSecret(subscription);

    return res.status(201).json({
      status: 'success',
      subscription: dbSubscription,
      clientSecret
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

    // Validate parameters using pure function
    const validation = subscriptionCore.validateSubscriptionUpdateParams(userId, planType);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'error',
        message: validation.errors.join(', ')
      });
    }

    // Extract token from header for RLS operations
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    // Get user subscription
    const subscription = await db.queries.getUserSubscription(userId, jwtToken);
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription not found'
      });
    }

    // Determine new price ID using pure function
    const priceConfig = getPriceConfig();
    const priceId = subscriptionCore.getPriceIdForPlan(planType, priceConfig);

    // Update Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    // Extract subscription item ID using pure function
    const subscriptionItemId = subscriptionCore.extractFirstSubscriptionItemId(stripeSubscription);
    if (!subscriptionItemId) {
      return res.status(400).json({
        status: 'error',
        message: 'No subscription items found'
      });
    }

    // Create update data using pure function
    const updateData = subscriptionCore.createStripeSubscriptionUpdateData(subscriptionItemId, priceId);
    await stripe.subscriptions.update(subscription.stripe_subscription_id, updateData);

    // Update subscription in database using pure function for data
    const dbUpdateData = subscriptionCore.createSubscriptionUpdateData(planType);
    const updatedSubscription = await db.queries.updateSubscription(subscription.id, dbUpdateData);

    // Create audit log entry using pure function for data
    const auditLogData = subscriptionCore.createAuditLogData('subscription_updated', userId, {
      plan_type: planType,
      subscription_id: subscription.stripe_subscription_id
    });
    await db.queries.createAuditLog(auditLogData);

    return res.status(200).json({
      status: 'success',
      subscription: updatedSubscription
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

    // Extract token from header for RLS operations
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    // Get user subscription
    const subscription = await db.queries.getUserSubscription(userId, jwtToken);
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription not found'
      });
    }

    // Cancel Stripe subscription
    await stripe.subscriptions.cancel(subscription.stripe_subscription_id);

    // Update subscription in database using pure function for data
    const cancellationData = subscriptionCore.createSubscriptionCancellationData();
    const cancelledSubscription = await db.queries.updateSubscription(subscription.id, cancellationData);

    // Create audit log entry using pure function for data
    const auditLogData = subscriptionCore.createAuditLogData('subscription_cancelled', userId, {
      subscription_id: subscription.stripe_subscription_id
    });
    await db.queries.createAuditLog(auditLogData);

    return res.status(200).json({
      status: 'success',
      subscription: cancelledSubscription
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

    // Extract token from header for RLS operations
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Authorization token missing' });
    }
    const jwtToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    // Get user subscription
    const subscription = await db.queries.getUserSubscription(userId, jwtToken);
    
    if (!subscription) {
      return res.status(200).json({
        status: 'success',
        active: false,
        tier: 'free'
      });
    }
    
    // Use pure function to check if subscription is active
    const isActive = subscriptionCore.isActiveSubscriptionStatus(subscription.status);
    
    return res.status(200).json({
      status: 'success',
      active: isActive,
      tier: subscription.plan_type,
      currentPeriodEnd: subscription.current_period_end
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
    
    // Validate event structure using pure function
    if (!subscriptionCore.isValidWebhookEvent(event)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid webhook event structure'
      });
    }

    // Check if we should process this event type using pure function
    if (!subscriptionCore.shouldProcessWebhookEvent(event.type)) {
      console.log(`Ignoring unsupported webhook event type: ${event.type}`);
      return res.status(200).json({
        status: 'success',
        message: 'Event type not processed'
      });
    }

    // Handle the event based on type
    await handleWebhookEvent(event);
    
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

/**
 * Handle webhook event processing
 * @param {Object} event - Stripe webhook event
 */
const handleWebhookEvent = async (event) => {
  switch (event.type) {
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object);
      break;
  }
};

/**
 * Handle subscription updated webhook event
 * @param {Object} subscription - Stripe subscription object
 */
const handleSubscriptionUpdated = async (subscription) => {
  // Get user subscription from database
  const dbSubscription = await db.queries.getSubscriptionByStripeId(subscription.id);
  if (!dbSubscription) {
    console.error('Subscription not found:', subscription.id);
    return;
  }

  // Transform Stripe subscription data using pure function
  const updateData = subscriptionCore.transformStripeSubscriptionForUpdate(subscription);
  await db.queries.updateSubscription(dbSubscription.id, updateData);

  // Create audit log entry using pure functions
  const action = subscriptionCore.getAuditLogActionFromEventType('customer.subscription.updated');
  const details = subscriptionCore.createWebhookAuditLogDetails('customer.subscription.updated', {
    subscription_id: subscription.id,
    status: subscription.status
  });
  const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
  await db.queries.createAuditLog(auditLogData);
};

/**
 * Handle subscription deleted webhook event
 * @param {Object} subscription - Stripe subscription object
 */
const handleSubscriptionDeleted = async (subscription) => {
  // Get user subscription from database
  const dbSubscription = await db.queries.getSubscriptionByStripeId(subscription.id);
  if (!dbSubscription) {
    console.error('Subscription not found:', subscription.id);
    return;
  }

  // Update subscription in database using pure function for data
  const cancellationData = subscriptionCore.createSubscriptionCancellationData();
  await db.queries.updateSubscription(dbSubscription.id, cancellationData);

  // Create audit log entry using pure functions
  const action = subscriptionCore.getAuditLogActionFromEventType('customer.subscription.deleted');
  const details = subscriptionCore.createWebhookAuditLogDetails('customer.subscription.deleted', {
    subscription_id: subscription.id
  });
  const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
  await db.queries.createAuditLog(auditLogData);
};

/**
 * Handle invoice payment succeeded webhook event
 * @param {Object} invoice - Stripe invoice object
 */
const handleInvoicePaymentSucceeded = async (invoice) => {
  if (!invoice.subscription) {
    return; // Not subscription related
  }

  // Get user subscription from database
  const dbSubscription = await db.queries.getSubscriptionByStripeId(invoice.subscription);
  if (!dbSubscription) {
    console.error('Subscription not found:', invoice.subscription);
    return;
  }

  // Create audit log entry using pure functions
  const action = subscriptionCore.getAuditLogActionFromEventType('invoice.payment_succeeded');
  const details = subscriptionCore.createWebhookAuditLogDetails('invoice.payment_succeeded', {
    subscription_id: invoice.subscription,
    amount_paid: invoice.amount_paid,
    invoice_id: invoice.id
  });
  const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
  await db.queries.createAuditLog(auditLogData);
};

/**
 * Handle invoice payment failed webhook event
 * @param {Object} invoice - Stripe invoice object
 */
const handleInvoicePaymentFailed = async (invoice) => {
  if (!invoice.subscription) {
    return; // Not subscription related
  }

  // Get user subscription from database
  const dbSubscription = await db.queries.getSubscriptionByStripeId(invoice.subscription);
  if (!dbSubscription) {
    console.error('Subscription not found:', invoice.subscription);
    return;
  }

  // Create audit log entry using pure functions
  const action = subscriptionCore.getAuditLogActionFromEventType('invoice.payment_failed');
  const details = subscriptionCore.createWebhookAuditLogDetails('invoice.payment_failed', {
    subscription_id: invoice.subscription,
    invoice_id: invoice.id,
    attempt_count: invoice.attempt_count
  });
  const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
  await db.queries.createAuditLog(auditLogData);
};

module.exports = {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  handleWebhook
}; 