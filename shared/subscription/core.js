// Core subscription logic with pure functions
// Following pure function principles: deterministic, no side effects, immutable

/**
 * Validate plan type
 * @param {string} planType - Plan type to validate
 * @returns {boolean} - True if valid plan type
 */
const isValidPlanType = (planType) => {
  return planType === 'monthly' || planType === 'annual';
};

/**
 * Validate subscription status for active states
 * @param {string} status - Subscription status
 * @returns {boolean} - True if status indicates active subscription
 */
const isActiveSubscriptionStatus = (status) => {
  return ['active', 'trialing'].includes(status);
};

/**
 * Calculate subscription data for database storage
 * @param {Object} stripeSubscription - Stripe subscription object
 * @param {string} userId - User ID
 * @param {string} planType - Plan type
 * @returns {Object} - Subscription data object for database
 */
const createSubscriptionData = (stripeSubscription, userId, planType) => {
  const now = new Date().toISOString();
  
  return {
    user_id: userId,
    stripe_subscription_id: stripeSubscription.id,
    plan_type: planType,
    status: stripeSubscription.status,
    current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
    created_at: now,
    updated_at: now
  };
};

/**
 * Create subscription update data
 * @param {string} planType - New plan type
 * @returns {Object} - Update data object
 */
const createSubscriptionUpdateData = (planType) => {
  return {
    plan_type: planType,
    updated_at: new Date().toISOString()
  };
};

/**
 * Create subscription cancellation data
 * @returns {Object} - Cancellation data object
 */
const createSubscriptionCancellationData = () => {
  return {
    status: 'canceled',
    updated_at: new Date().toISOString()
  };
};

/**
 * Create audit log data for subscription actions
 * @param {string} action - Action type
 * @param {string} userId - User ID
 * @param {Object} details - Additional details
 * @returns {Object} - Audit log data
 */
const createAuditLogData = (action, userId, details) => {
  return {
    action,
    user_id: userId,
    details
  };
};

/**
 * Extract client secret from Stripe subscription
 * @param {Object} stripeSubscription - Stripe subscription object
 * @returns {string|null} - Client secret or null if not available
 */
const extractClientSecret = (stripeSubscription) => {
  return stripeSubscription?.latest_invoice?.payment_intent?.client_secret || null;
};

/**
 * Create Stripe customer data
 * @param {Object} user - User object
 * @param {string} userId - User ID
 * @returns {Object} - Stripe customer creation data
 */
const createStripeCustomerData = (user, userId) => {
  return {
    email: user.email,
    name: user.name,
    metadata: {
      userId
    }
  };
};

/**
 * Create Stripe subscription creation data
 * @param {string} stripeCustomerId - Stripe customer ID
 * @param {string} priceId - Stripe price ID
 * @returns {Object} - Stripe subscription creation data
 */
const createStripeSubscriptionData = (stripeCustomerId, priceId) => {
  return {
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    expand: ['latest_invoice.payment_intent']
  };
};

/**
 * Create Stripe subscription update data
 * @param {string} subscriptionItemId - Stripe subscription item ID
 * @param {string} priceId - New price ID
 * @returns {Object} - Stripe subscription update data
 */
const createStripeSubscriptionUpdateData = (subscriptionItemId, priceId) => {
  return {
    items: [{
      id: subscriptionItemId,
      price: priceId
    }],
    proration_behavior: 'create_prorations'
  };
};

/**
 * Transform Stripe subscription data for database update
 * @param {Object} stripeSubscription - Stripe subscription object
 * @returns {Object} - Database update data
 */
const transformStripeSubscriptionForUpdate = (stripeSubscription) => {
  return {
    status: stripeSubscription.status,
    current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };
};

/**
 * Check if user has existing active subscription
 * @param {Object|null} subscription - Existing subscription or null
 * @returns {boolean} - True if user has active subscription
 */
const hasActiveSubscription = (subscription) => {
  if (!subscription) {
    return false;
  }
  return isActiveSubscriptionStatus(subscription.status);
};

/**
 * Validate required subscription creation parameters
 * @param {string} userId - User ID
 * @param {string} planType - Plan type
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
const validateSubscriptionCreationParams = (userId, planType, paymentMethodId) => {
  const errors = [];
  
  if (!userId) {
    errors.push('User ID is required');
  }
  
  if (!planType) {
    errors.push('Plan type is required');
  } else if (!isValidPlanType(planType)) {
    errors.push('Invalid plan type. Must be "monthly" or "annual"');
  }
  
  if (!paymentMethodId) {
    errors.push('Payment method ID is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate required subscription update parameters
 * @param {string} userId - User ID
 * @param {string} planType - New plan type
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
const validateSubscriptionUpdateParams = (userId, planType) => {
  const errors = [];
  
  if (!userId) {
    errors.push('User ID is required');
  }
  
  if (!planType) {
    errors.push('Plan type is required');
  } else if (!isValidPlanType(planType)) {
    errors.push('Invalid plan type. Must be "monthly" or "annual"');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  isValidPlanType,
  isActiveSubscriptionStatus,
  createSubscriptionData,
  createSubscriptionUpdateData,
  createSubscriptionCancellationData,
  createAuditLogData,
  extractClientSecret,
  createStripeCustomerData,
  createStripeSubscriptionData,
  createStripeSubscriptionUpdateData,
  transformStripeSubscriptionForUpdate,
  hasActiveSubscription,
  validateSubscriptionCreationParams,
  validateSubscriptionUpdateParams
}; 