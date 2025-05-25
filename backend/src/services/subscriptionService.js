// Subscription Service for PrivacyLens
import Stripe from 'stripe';
import * as db from '../utils/db.cjs';
import { subscription as subscriptionCore } from '../../../shared/index.js';

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
 * Create a subscription for a user
 * @param {string} userId - User ID
 * @param {string} planType - Subscription plan type (monthly/annual)
 * @param {string} paymentMethodId - Stripe payment method ID
 * @param {string} userAuthToken - The user's JWT for RLS-scoped operations.
 * @returns {Promise<Object>} - Subscription data
 */
const createSubscription = async (userId, planType, paymentMethodId, userAuthToken) => {
  try {
    // Validate parameters using pure function
    const validation = subscriptionCore.validateSubscriptionCreationParams(userId, planType, paymentMethodId);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // Check authentication token
    if (!userAuthToken) throw new Error("Authentication token required to check existing subscription in createSubscription");
    
    // Check if user already has an active subscription (requires RLS token)
    const existingSubscription = await db.getUserSubscription(userId, userAuthToken);
    if (subscriptionCore.hasActiveSubscription(existingSubscription)) {
      throw new Error(`User already has an active or trialing subscription (Status: ${existingSubscription.status}).`);
    }

    // Get user (uses service role)
    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripe_customer_id;
    if (!stripeCustomerId) {
      const customerData = subscriptionCore.createStripeCustomerData(user, userId);
      const customer = await stripe.customers.create(customerData);
      stripeCustomerId = customer.id;
      
      // Update user with Stripe customer ID (requires RLS token)
      if (!userAuthToken) throw new Error("Authentication token required to update user in createSubscription");
      await db.updateUser(userId, { stripe_customer_id: stripeCustomerId }, userAuthToken);
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

    // --- Check if this Stripe Subscription ID already exists in our DB ---
    console.log(`[SubscriptionService] Checking if Stripe subscription ID ${subscription.id} already exists in DB...`);
    const existingDbSub = await db.getSubscriptionByStripeId(subscription.id);
    if (existingDbSub) {
      const specificErrorMsg = `[PRE-INSERT CHECK FAILED] Stripe subscription ID ${subscription.id} already exists in the database (DB ID: ${existingDbSub.id}). Cannot create duplicate.`;
      console.error(specificErrorMsg);
      throw new Error(specificErrorMsg);
    } else {
       console.log(`[SubscriptionService] Stripe subscription ID ${subscription.id} does not exist in DB. Proceeding with creation.`);
    }
    // --- End Check ---

    // Store subscription in database using pure function for data transformation
    const dbSubscriptionData = subscriptionCore.createSubscriptionData(subscription, userId, planType);
    const dbSubscription = await db.createSubscription(dbSubscriptionData);

    // Create audit log entry using pure function for data
    const auditLogData = subscriptionCore.createAuditLogData('subscription_created', userId, {
      plan_type: planType,
      subscription_id: subscription.id
    });
    await db.createAuditLog(auditLogData);

    // Extract client secret using pure function
    const clientSecret = subscriptionCore.extractClientSecret(subscription);

    return {
      subscription: dbSubscription,
      clientSecret
    };
  } catch (error) {
    console.error('Subscription creation error:', error);
    throw error;
  }
};

/**
 * Update a subscription
 * @param {string} userId - User ID
 * @param {string} planType - New plan type (monthly/annual)
 * @param {string} userAuthToken - The user's JWT for RLS-scoped operations.
 * @returns {Promise<Object>} - Updated subscription data
 */
const updateSubscription = async (userId, planType, userAuthToken) => {
  try {
    // Validate parameters using pure function
    const validation = subscriptionCore.validateSubscriptionUpdateParams(userId, planType);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // Get user subscription (requires RLS token)
    if (!userAuthToken) throw new Error("Authentication token required to get user subscription in updateSubscription");
    const subscription = await db.getUserSubscription(userId, userAuthToken);
    if (!subscription) {
      throw new Error('Subscription not found');
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
      throw new Error('No subscription items found');
    }

    // Create update data using pure function
    const updateData = subscriptionCore.createStripeSubscriptionUpdateData(subscriptionItemId, priceId);
    await stripe.subscriptions.update(subscription.stripe_subscription_id, updateData);

    // Update subscription in database using pure function for data
    const dbUpdateData = subscriptionCore.createSubscriptionUpdateData(planType);
    const updatedSubscription = await db.updateSubscription(subscription.id, dbUpdateData);

    // Create audit log entry using pure function for data
    const auditLogData = subscriptionCore.createAuditLogData('subscription_updated', userId, {
      plan_type: planType,
      subscription_id: subscription.stripe_subscription_id
    });
    await db.createAuditLog(auditLogData);

    return updatedSubscription;
  } catch (error) {
    console.error('Subscription update error:', error);
    throw error;
  }
};

/**
 * Cancel a subscription
 * @param {string} userId - User ID
 * @param {string} userAuthToken - The user's JWT for RLS-scoped operations.
 * @returns {Promise<Object>} - Cancelled subscription data
 */
const cancelSubscription = async (userId, userAuthToken) => {
  try {
    // Get user subscription (requires RLS token)
    if (!userAuthToken) throw new Error("Authentication token required to get user subscription in cancelSubscription");
    const subscription = await db.getUserSubscription(userId, userAuthToken);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Cancel Stripe subscription
    await stripe.subscriptions.cancel(subscription.stripe_subscription_id);

    // Update subscription in database using pure function for data
    const cancellationData = subscriptionCore.createSubscriptionCancellationData();
    const cancelledSubscription = await db.updateSubscription(subscription.id, cancellationData);

    // Create audit log entry using pure function for data
    const auditLogData = subscriptionCore.createAuditLogData('subscription_cancelled', userId, {
      subscription_id: subscription.stripe_subscription_id
    });
    await db.createAuditLog(auditLogData);

    return cancelledSubscription;
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    throw error;
  }
};

/**
 * Get subscription status for a user
 * @param {string} userId - User ID
 * @param {string} userAuthToken - The user's JWT for RLS-scoped operations.
 * @returns {Promise<Object>} - Subscription status
 */
const getSubscriptionStatus = async (userId, userAuthToken) => {
  try {
    // Get user subscription (requires RLS token)
    if (!userAuthToken) throw new Error("Authentication token required for getSubscriptionStatus");
    const subscription = await db.getUserSubscription(userId, userAuthToken);
    
    if (!subscription) {
      return {
        active: false,
        tier: 'free'
      };
    }
    
    // Use pure function to check if subscription is active
    const isActive = subscriptionCore.isActiveSubscriptionStatus(subscription.status);
    
    return {
      active: isActive,
      tier: subscription.plan_type,
      currentPeriodEnd: subscription.current_period_end
    };
  } catch (error) {
    console.error('Get subscription status error:', error);
    throw error;
  }
};

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe event
 * @returns {Promise<void>}
 */
const handleWebhookEvent = async (event) => {
  try {
    // Validate event structure using pure function
    if (!subscriptionCore.isValidWebhookEvent(event)) {
      throw new Error('Invalid webhook event structure');
    }

    // Check if we should process this event type using pure function
    if (!subscriptionCore.shouldProcessWebhookEvent(event.type)) {
      console.log(`Ignoring unsupported webhook event type: ${event.type}`);
      return;
    }

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
  } catch (error) {
    console.error('Webhook handling error:', error);
    throw error;
  }
};

/**
 * Handle subscription updated event
 * @param {Object} subscription - Stripe subscription
 * @returns {Promise<void>}
 */
const handleSubscriptionUpdated = async (subscription) => {
  try {
    // Get user subscription from database
    const dbSubscription = await db.getSubscriptionByStripeId(subscription.id);
    if (!dbSubscription) {
      console.error('Subscription not found:', subscription.id);
      return;
    }

    // Transform Stripe subscription data using pure function
    const updateData = subscriptionCore.transformStripeSubscriptionForUpdate(subscription);
    await db.updateSubscription(dbSubscription.id, updateData);

    // Create audit log entry using pure functions
    const action = subscriptionCore.getAuditLogActionFromEventType('customer.subscription.updated');
    const details = subscriptionCore.createWebhookAuditLogDetails('customer.subscription.updated', {
      subscription_id: subscription.id,
      status: subscription.status
    });
    const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
    await db.createAuditLog(auditLogData);
  } catch (error) {
    console.error('Subscription update webhook error:', error);
    throw error;
  }
};

/**
 * Handle subscription deleted event
 * @param {Object} subscription - Stripe subscription
 * @returns {Promise<void>}
 */
const handleSubscriptionDeleted = async (subscription) => {
  try {
    // Get user subscription from database
    const dbSubscription = await db.getSubscriptionByStripeId(subscription.id);
    if (!dbSubscription) {
      console.error('Subscription not found:', subscription.id);
      return;
    }

    // Update subscription in database using pure function for data
    const cancellationData = subscriptionCore.createSubscriptionCancellationData();
    await db.updateSubscription(dbSubscription.id, cancellationData);

    // Create audit log entry using pure functions
    const action = subscriptionCore.getAuditLogActionFromEventType('customer.subscription.deleted');
    const details = subscriptionCore.createWebhookAuditLogDetails('customer.subscription.deleted', {
      subscription_id: subscription.id
    });
    const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
    await db.createAuditLog(auditLogData);
  } catch (error) {
    console.error('Subscription deletion webhook error:', error);
    throw error;
  }
};

/**
 * Handle invoice payment succeeded event
 * @param {Object} invoice - Stripe invoice
 * @returns {Promise<void>}
 */
const handleInvoicePaymentSucceeded = async (invoice) => {
  try {
    if (!invoice.subscription) {
      return; // Not subscription related
    }

    // Get user subscription from database
    const dbSubscription = await db.getSubscriptionByStripeId(invoice.subscription);
    if (!dbSubscription) {
      console.error('Subscription not found:', invoice.subscription);
      return;
    }

    // Extract invoice data using pure function
    const invoiceData = subscriptionCore.extractInvoiceDataFromEvent({
      type: 'invoice.payment_succeeded',
      data: { object: invoice }
    });

    // Create audit log entry using pure functions
    const action = subscriptionCore.getAuditLogActionFromEventType('invoice.payment_succeeded');
    const details = subscriptionCore.createWebhookAuditLogDetails('invoice.payment_succeeded', {
      subscription_id: invoice.subscription,
      amount_paid: invoice.amount_paid,
      invoice_id: invoice.id
    });
    const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
    await db.createAuditLog(auditLogData);
  } catch (error) {
    console.error('Invoice payment succeeded webhook error:', error);
    throw error;
  }
};

/**
 * Handle invoice payment failed event
 * @param {Object} invoice - Stripe invoice
 * @returns {Promise<void>}
 */
const handleInvoicePaymentFailed = async (invoice) => {
  try {
    if (!invoice.subscription) {
      return; // Not subscription related
    }

    // Get user subscription from database
    const dbSubscription = await db.getSubscriptionByStripeId(invoice.subscription);
    if (!dbSubscription) {
      console.error('Subscription not found:', invoice.subscription);
      return;
    }

    // Extract invoice data using pure function
    const invoiceData = subscriptionCore.extractInvoiceDataFromEvent({
      type: 'invoice.payment_failed',
      data: { object: invoice }
    });

    // Create audit log entry using pure functions
    const action = subscriptionCore.getAuditLogActionFromEventType('invoice.payment_failed');
    const details = subscriptionCore.createWebhookAuditLogDetails('invoice.payment_failed', {
      subscription_id: invoice.subscription,
      invoice_id: invoice.id,
      attempt_count: invoice.attempt_count
    });
    const auditLogData = subscriptionCore.createAuditLogData(action, dbSubscription.user_id, details);
    await db.createAuditLog(auditLogData);
  } catch (error) {
    console.error('Invoice payment failed webhook error:', error);
    throw error;
  }
};

export {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  handleWebhookEvent
};
