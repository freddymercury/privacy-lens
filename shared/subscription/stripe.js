// Stripe-specific pure functions for subscription processing
// Following pure function principles: deterministic, no side effects, immutable

/**
 * Get price ID based on plan type and environment variables
 * @param {string} planType - Plan type (monthly/annual)
 * @param {Object} priceConfig - Price configuration object with monthly and annual price IDs
 * @returns {string} - Stripe price ID
 */
const getPriceIdForPlan = (planType, priceConfig) => {
  return planType === 'annual' ? priceConfig.annual : priceConfig.monthly;
};

/**
 * Validate Stripe webhook event structure
 * @param {Object} event - Stripe webhook event
 * @returns {boolean} - True if event has required structure
 */
const isValidWebhookEvent = (event) => {
  if (!event) {
    return false;
  }
  
  if (typeof event.type !== 'string') {
    return false;
  }
  
  if (!event.data) {
    return false;
  }
  
  if (!event.data.object || typeof event.data.object !== 'object') {
    return false;
  }
  
  return true;
};

/**
 * Extract subscription ID from Stripe webhook event
 * @param {Object} event - Stripe webhook event
 * @returns {string|null} - Subscription ID or null if not found
 */
const extractSubscriptionIdFromEvent = (event) => {
  if (!isValidWebhookEvent(event)) {
    return null;
  }
  
  const { type, data } = event;
  
  // For subscription events, the subscription ID is in data.object.id
  if (type.startsWith('customer.subscription.')) {
    return data.object.id || null;
  }
  
  // For invoice events, the subscription ID is in data.object.subscription
  if (type.startsWith('invoice.')) {
    return data.object.subscription || null;
  }
  
  return null;
};

/**
 * Normalize Stripe subscription data for database storage
 * @param {Object} stripeSubscription - Raw Stripe subscription object
 * @returns {Object} - Normalized subscription data
 */
const normalizeStripeSubscriptionData = (stripeSubscription) => {
  return {
    id: stripeSubscription.id,
    status: stripeSubscription.status,
    current_period_start: stripeSubscription.current_period_start,
    current_period_end: stripeSubscription.current_period_end,
    customer: stripeSubscription.customer,
    items: stripeSubscription.items?.data || []
  };
};

/**
 * Extract first subscription item ID from Stripe subscription
 * @param {Object} stripeSubscription - Stripe subscription object
 * @returns {string|null} - Subscription item ID or null if not found
 */
const extractFirstSubscriptionItemId = (stripeSubscription) => {
  const items = stripeSubscription?.items?.data;
  return (items && items.length > 0) ? items[0].id : null;
};

/**
 * Create payment method attachment data for Stripe
 * @param {string} stripeCustomerId - Stripe customer ID
 * @returns {Object} - Payment method attachment data
 */
const createPaymentMethodAttachmentData = (stripeCustomerId) => {
  return {
    customer: stripeCustomerId
  };
};

/**
 * Create customer update data for default payment method
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Object} - Customer update data
 */
const createCustomerUpdateData = (paymentMethodId) => {
  return {
    invoice_settings: {
      default_payment_method: paymentMethodId
    }
  };
};

/**
 * Validate webhook event type for subscription processing
 * @param {string} eventType - Stripe webhook event type
 * @returns {boolean} - True if event type should be processed
 */
const shouldProcessWebhookEvent = (eventType) => {
  const supportedEvents = [
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed'
  ];
  
  return supportedEvents.includes(eventType);
};

/**
 * Extract invoice data from Stripe webhook event
 * @param {Object} event - Stripe webhook event
 * @returns {Object|null} - Invoice data or null if not an invoice event
 */
const extractInvoiceDataFromEvent = (event) => {
  if (!isValidWebhookEvent(event) || !event.type.startsWith('invoice.')) {
    return null;
  }
  
  const invoice = event.data.object;
  
  return {
    id: invoice.id,
    subscription: invoice.subscription,
    amount_paid: invoice.amount_paid,
    attempt_count: invoice.attempt_count,
    status: invoice.status
  };
};

/**
 * Create audit log details for webhook events
 * @param {string} eventType - Stripe webhook event type
 * @param {Object} eventData - Event-specific data
 * @returns {Object} - Audit log details
 */
const createWebhookAuditLogDetails = (eventType, eventData) => {
  const baseDetails = {
    webhook_event_type: eventType,
    processed_at: new Date().toISOString()
  };
  
  switch (eventType) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return {
        ...baseDetails,
        subscription_id: eventData.subscription_id,
        status: eventData.status
      };
      
    case 'invoice.payment_succeeded':
      return {
        ...baseDetails,
        subscription_id: eventData.subscription_id,
        amount: eventData.amount_paid,
        invoice_id: eventData.invoice_id
      };
      
    case 'invoice.payment_failed':
      return {
        ...baseDetails,
        subscription_id: eventData.subscription_id,
        invoice_id: eventData.invoice_id,
        attempt_count: eventData.attempt_count
      };
      
    default:
      return baseDetails;
  }
};

/**
 * Determine audit log action from webhook event type
 * @param {string} eventType - Stripe webhook event type
 * @returns {string} - Audit log action name
 */
const getAuditLogActionFromEventType = (eventType) => {
  const actionMap = {
    'customer.subscription.updated': 'subscription_updated_webhook',
    'customer.subscription.deleted': 'subscription_cancelled_webhook',
    'invoice.payment_succeeded': 'payment_succeeded',
    'invoice.payment_failed': 'payment_failed'
  };
  
  return actionMap[eventType] || 'webhook_processed';
};

/**
 * Validate Stripe customer data
 * @param {Object} customerData - Customer data to validate
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
const validateStripeCustomerData = (customerData) => {
  const errors = [];
  
  if (!customerData.email) {
    errors.push('Customer email is required');
  }
  
  if (!customerData.name) {
    errors.push('Customer name is required');
  }
  
  if (!customerData.metadata || !customerData.metadata.userId) {
    errors.push('Customer metadata with userId is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  getPriceIdForPlan,
  isValidWebhookEvent,
  extractSubscriptionIdFromEvent,
  normalizeStripeSubscriptionData,
  extractFirstSubscriptionItemId,
  createPaymentMethodAttachmentData,
  createCustomerUpdateData,
  shouldProcessWebhookEvent,
  extractInvoiceDataFromEvent,
  createWebhookAuditLogDetails,
  getAuditLogActionFromEventType,
  validateStripeCustomerData
}; 