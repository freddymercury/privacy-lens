// Subscription Service for PrivacyLens
import Stripe from 'stripe';
import * as db from '../utils/db.cjs';

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
    // Check if user already has an active subscription (requires RLS token)
    // Note: getUserSubscription likely needs the userAuthToken for RLS
    if (!userAuthToken) throw new Error("Authentication token required to check existing subscription in createSubscription");
    const existingSubscription = await db.getUserSubscription(userId, userAuthToken);
    if (existingSubscription && ['active', 'trialing'].includes(existingSubscription.status)) {
      // User already has an active or trialing subscription, prevent creating a new one.
      // Consider returning a specific error or the existing subscription details.
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
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId
        }
      });
      stripeCustomerId = customer.id;
      
      // Update user with Stripe customer ID (requires RLS token)
      if (!userAuthToken) throw new Error("Authentication token required to update user in createSubscription");
      await db.updateUser(userId, { stripe_customer_id: stripeCustomerId }, userAuthToken);
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId
    });

    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    // Determine price ID based on plan type
    const priceId = planType === 'annual' 
      ? process.env.STRIPE_ANNUAL_PRICE_ID 
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent']
    });

    // --- Check if this Stripe Subscription ID already exists in our DB ---
    // This is crucial for handling the mock client returning the same ID repeatedly.
    console.log(`[SubscriptionService] Checking if Stripe subscription ID ${subscription.id} already exists in DB...`);
    const existingDbSub = await db.getSubscriptionByStripeId(subscription.id);
    if (existingDbSub) {
      // If the Stripe ID already exists in the DB (common with mock 'sub_mock'),
      // throw a specific error immediately to halt execution before the insert attempt.
      const specificErrorMsg = `[PRE-INSERT CHECK FAILED] Stripe subscription ID ${subscription.id} already exists in the database (DB ID: ${existingDbSub.id}). Cannot create duplicate.`;
      console.error(specificErrorMsg);
      throw new Error(specificErrorMsg);
    } else {
       console.log(`[SubscriptionService] Stripe subscription ID ${subscription.id} does not exist in DB. Proceeding with creation.`);
    }
    // --- End Check ---


    // Store subscription in database (only if it didn't exist)
    const subscriptionData = {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      plan_type: planType,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const dbSubscription = await db.createSubscription(subscriptionData);

    // Create audit log entry
    await db.createAuditLog({
      action: 'subscription_created',
      user_id: userId,
      details: {
        plan_type: planType,
        subscription_id: subscription.id
      }
    });

    return {
      subscription: dbSubscription,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret
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
    // Get user subscription (requires RLS token)
    if (!userAuthToken) throw new Error("Authentication token required to get user subscription in updateSubscription");
    const subscription = await db.getUserSubscription(userId, userAuthToken);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Determine new price ID
    const priceId = planType === 'annual' 
      ? process.env.STRIPE_ANNUAL_PRICE_ID 
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    // Update Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [{
        id: stripeSubscription.items.data[0].id,
        price: priceId
      }],
      proration_behavior: 'create_prorations'
    });

    // Update subscription in database
    const updatedSubscription = await db.updateSubscription(subscription.id, {
      plan_type: planType,
      updated_at: new Date().toISOString()
    });

    // Create audit log entry
    await db.createAuditLog({
      action: 'subscription_updated',
      user_id: userId,
      details: {
        plan_type: planType,
        subscription_id: subscription.stripe_subscription_id
      }
    });

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

    // Update subscription in database
    const cancelledSubscription = await db.updateSubscription(subscription.id, {
      status: 'canceled',
      updated_at: new Date().toISOString()
    });

    // Create audit log entry
    await db.createAuditLog({
      action: 'subscription_cancelled',
      user_id: userId,
      details: {
        subscription_id: subscription.stripe_subscription_id
      }
    });

    return cancelledSubscription;
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    throw error;
  }
};

/**
 * Get subscription status
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
    
    // Consider both 'active' and 'trialing' statuses as granting premium access
    return {
      active: ['active', 'trialing'].includes(subscription.status), 
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

    // Update subscription in database
    await db.updateSubscription(dbSubscription.id, {
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });

    // Create audit log entry
    await db.createAuditLog({
      action: 'subscription_updated_webhook',
      user_id: dbSubscription.user_id,
      details: {
        subscription_id: subscription.id,
        status: subscription.status
      }
    });
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

    // Update subscription in database
    await db.updateSubscription(dbSubscription.id, {
      status: 'canceled',
      updated_at: new Date().toISOString()
    });

    // Create audit log entry
    await db.createAuditLog({
      action: 'subscription_cancelled_webhook',
      user_id: dbSubscription.user_id,
      details: {
        subscription_id: subscription.id
      }
    });
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

    // Create audit log entry
    await db.createAuditLog({
      action: 'payment_succeeded',
      user_id: dbSubscription.user_id,
      details: {
        subscription_id: invoice.subscription,
        amount: invoice.amount_paid,
        invoice_id: invoice.id
      }
    });
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

    // Create audit log entry
    await db.createAuditLog({
      action: 'payment_failed',
      user_id: dbSubscription.user_id,
      details: {
        subscription_id: invoice.subscription,
        invoice_id: invoice.id,
        attempt_count: invoice.attempt_count
      }
    });
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
