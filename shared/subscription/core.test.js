// Tests for subscription core pure functions
const {
  isValidPlanType,
  isActiveSubscriptionStatus,
  createSubscriptionData,
  validateSubscriptionCreationParams,
  validateSubscriptionUpdateParams,
  hasActiveSubscription,
  createStripeCustomerData,
  createStripeSubscriptionData,
  createStripeSubscriptionUpdateData,
  extractClientSecret,
  createAuditLogData,
  createSubscriptionUpdateData,
  createSubscriptionCancellationData,
  transformStripeSubscriptionForUpdate
} = require('./core');

describe('Subscription Core Pure Functions', () => {
  
  describe('isValidPlanType', () => {
    test('should return true for valid plan types', () => {
      expect(isValidPlanType('monthly')).toBe(true);
      expect(isValidPlanType('annual')).toBe(true);
    });

    test('should return false for invalid plan types', () => {
      expect(isValidPlanType('weekly')).toBe(false);
      expect(isValidPlanType('daily')).toBe(false);
      expect(isValidPlanType('')).toBe(false);
      expect(isValidPlanType(null)).toBe(false);
      expect(isValidPlanType(undefined)).toBe(false);
    });
  });

  describe('isActiveSubscriptionStatus', () => {
    test('should return true for active subscription statuses', () => {
      expect(isActiveSubscriptionStatus('active')).toBe(true);
      expect(isActiveSubscriptionStatus('trialing')).toBe(true);
    });

    test('should return false for inactive subscription statuses', () => {
      expect(isActiveSubscriptionStatus('canceled')).toBe(false);
      expect(isActiveSubscriptionStatus('incomplete')).toBe(false);
      expect(isActiveSubscriptionStatus('incomplete_expired')).toBe(false);
      expect(isActiveSubscriptionStatus('past_due')).toBe(false);
      expect(isActiveSubscriptionStatus('unpaid')).toBe(false);
      expect(isActiveSubscriptionStatus('')).toBe(false);
      expect(isActiveSubscriptionStatus(null)).toBe(false);
      expect(isActiveSubscriptionStatus(undefined)).toBe(false);
    });
  });

  describe('hasActiveSubscription', () => {
    test('should return true for active subscription', () => {
      const activeSubscription = { status: 'active' };
      expect(hasActiveSubscription(activeSubscription)).toBe(true);
    });

    test('should return true for trialing subscription', () => {
      const trialingSubscription = { status: 'trialing' };
      expect(hasActiveSubscription(trialingSubscription)).toBe(true);
    });

    test('should return false for inactive subscription', () => {
      const canceledSubscription = { status: 'canceled' };
      expect(hasActiveSubscription(canceledSubscription)).toBe(false);
    });

    test('should return false for null or undefined subscriptions', () => {
      expect(hasActiveSubscription(null)).toBe(false);
      expect(hasActiveSubscription(undefined)).toBe(false);
    });
  });

  describe('createSubscriptionData', () => {
    test('should transform Stripe subscription to database format', () => {
      const stripeSubscription = {
        id: 'sub_stripe123',
        status: 'active',
        current_period_start: 1640995200, // 2022-01-01
        current_period_end: 1643673600    // 2022-02-01
      };
      const userId = 'user123';
      const planType = 'monthly';

      const result = createSubscriptionData(stripeSubscription, userId, planType);

      expect(result.user_id).toBe(userId);
      expect(result.stripe_subscription_id).toBe(stripeSubscription.id);
      expect(result.plan_type).toBe(planType);
      expect(result.status).toBe(stripeSubscription.status);
      expect(result.current_period_start).toBe('2022-01-01T00:00:00.000Z');
      expect(result.current_period_end).toBe('2022-02-01T00:00:00.000Z');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    test('should handle missing optional fields gracefully', () => {
      const stripeSubscription = {
        id: 'sub_stripe123',
        status: 'active'
        // Missing period dates
      };
      const userId = 'user123';
      const planType = 'monthly';

      // This should throw an error due to invalid dates
      expect(() => {
        createSubscriptionData(stripeSubscription, userId, planType);
      }).toThrow();
    });
  });

  describe('createStripeCustomerData', () => {
    test('should create Stripe customer data from user', () => {
      const user = {
        email: 'test@example.com',
        name: 'Test User'
      };
      const userId = 'user123';

      const result = createStripeCustomerData(user, userId);

      expect(result).toEqual({
        email: user.email,
        name: user.name,
        metadata: {
          userId: userId
        }
      });
    });

    test('should handle missing name', () => {
      const user = {
        email: 'test@example.com'
      };
      const userId = 'user123';

      const result = createStripeCustomerData(user, userId);

      expect(result.email).toBe(user.email);
      expect(result.name).toBeUndefined();
      expect(result.metadata.userId).toBe(userId);
    });
  });

  describe('createStripeSubscriptionData', () => {
    test('should create Stripe subscription data', () => {
      const customerId = 'cus_123';
      const priceId = 'price_123';

      const result = createStripeSubscriptionData(customerId, priceId);

      expect(result).toEqual({
        customer: customerId,
        items: [{ price: priceId }],
        expand: ['latest_invoice.payment_intent']
      });
    });
  });

  describe('createStripeSubscriptionUpdateData', () => {
    test('should create Stripe subscription update data', () => {
      const subscriptionItemId = 'si_123';
      const priceId = 'price_456';

      const result = createStripeSubscriptionUpdateData(subscriptionItemId, priceId);

      expect(result).toEqual({
        items: [{
          id: subscriptionItemId,
          price: priceId
        }],
        proration_behavior: 'create_prorations'
      });
    });
  });

  describe('extractClientSecret', () => {
    test('should extract client secret from Stripe subscription', () => {
      const stripeSubscription = {
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_123'
          }
        }
      };

      const result = extractClientSecret(stripeSubscription);
      expect(result).toBe('pi_secret_123');
    });

    test('should return null for missing client secret', () => {
      const stripeSubscription = {
        latest_invoice: {
          payment_intent: {}
        }
      };

      const result = extractClientSecret(stripeSubscription);
      expect(result).toBeNull();
    });

    test('should return null for missing payment intent', () => {
      const stripeSubscription = {
        latest_invoice: {}
      };

      const result = extractClientSecret(stripeSubscription);
      expect(result).toBeNull();
    });

    test('should return null for missing latest invoice', () => {
      const stripeSubscription = {};

      const result = extractClientSecret(stripeSubscription);
      expect(result).toBeNull();
    });
  });

  describe('createAuditLogData', () => {
    test('should create audit log data', () => {
      const action = 'subscription_created';
      const userId = 'user123';
      const details = { plan_type: 'monthly' };

      const result = createAuditLogData(action, userId, details);

      expect(result.action).toBe(action);
      expect(result.user_id).toBe(userId);
      expect(result.details).toEqual(details);
    });

    test('should handle missing details', () => {
      const action = 'subscription_created';
      const userId = 'user123';

      const result = createAuditLogData(action, userId);

      expect(result.action).toBe(action);
      expect(result.user_id).toBe(userId);
      expect(result.details).toBeUndefined();
    });
  });

  describe('createSubscriptionUpdateData', () => {
    test('should create subscription update data', () => {
      const planType = 'annual';

      const result = createSubscriptionUpdateData(planType);

      expect(result.plan_type).toBe(planType);
      expect(result.updated_at).toBeDefined();
      expect(new Date(result.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe('createSubscriptionCancellationData', () => {
    test('should create subscription cancellation data', () => {
      const result = createSubscriptionCancellationData();

      expect(result.status).toBe('canceled');
      expect(result.updated_at).toBeDefined();
      expect(new Date(result.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe('transformStripeSubscriptionForUpdate', () => {
    test('should transform Stripe subscription for database update', () => {
      const stripeSubscription = {
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600
      };

      const result = transformStripeSubscriptionForUpdate(stripeSubscription);

      expect(result.status).toBe('active');
      expect(result.current_period_start).toBe('2022-01-01T00:00:00.000Z');
      expect(result.current_period_end).toBe('2022-02-01T00:00:00.000Z');
      expect(result.updated_at).toBeDefined();
    });
  });

  describe('validateSubscriptionCreationParams', () => {
    test('should validate valid subscription creation parameters', () => {
      const result = validateSubscriptionCreationParams('user123', 'monthly', 'pm_123');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return errors for missing parameters', () => {
      const result = validateSubscriptionCreationParams('', '', '');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('User ID is required');
      expect(result.errors).toContain('Plan type is required');
      expect(result.errors).toContain('Payment method ID is required');
    });

    test('should return error for invalid plan type', () => {
      const result = validateSubscriptionCreationParams('user123', 'weekly', 'pm_123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid plan type. Must be "monthly" or "annual"');
    });
  });

  describe('validateSubscriptionUpdateParams', () => {
    test('should validate valid subscription update parameters', () => {
      const result = validateSubscriptionUpdateParams('user123', 'annual');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return errors for missing parameters', () => {
      const result = validateSubscriptionUpdateParams('', '');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('User ID is required');
      expect(result.errors).toContain('Plan type is required');
    });

    test('should return error for invalid plan type', () => {
      const result = validateSubscriptionUpdateParams('user123', 'weekly');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid plan type. Must be "monthly" or "annual"');
    });
  });

  // Test immutability - ensure pure functions don't modify inputs
  describe('Input Immutability', () => {
    test('createSubscriptionData should not modify input objects', () => {
      const originalSubscription = {
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600
      };
      const subscriptionCopy = { ...originalSubscription };

      createSubscriptionData(originalSubscription, 'user123', 'monthly');

      expect(originalSubscription).toEqual(subscriptionCopy);
    });

    test('createStripeCustomerData should not modify input user', () => {
      const originalUser = {
        email: 'test@example.com',
        name: 'Test User'
      };
      const userCopy = { ...originalUser };

      createStripeCustomerData(originalUser, 'user123');

      expect(originalUser).toEqual(userCopy);
    });
  });

  // Test deterministic behavior
  describe('Deterministic Behavior', () => {
    test('isValidPlanType should always return same result for same inputs', () => {
      const result1 = isValidPlanType('monthly');
      const result2 = isValidPlanType('monthly');
      const result3 = isValidPlanType('monthly');

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(true);
    });

    test('hasActiveSubscription should always return same result for same input', () => {
      const subscription = { status: 'active' };

      const result1 = hasActiveSubscription(subscription);
      const result2 = hasActiveSubscription(subscription);

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });
  });

  // Test edge cases and boundary conditions
  describe('Edge Cases', () => {
    test('createStripeCustomerData should handle empty user object', () => {
      const user = {};
      const userId = 'user123';

      const result = createStripeCustomerData(user, userId);

      expect(result.metadata.userId).toBe(userId);
      expect(result.email).toBeUndefined();
      expect(result.name).toBeUndefined();
    });

    test('validateSubscriptionCreationParams should handle null values', () => {
      const result = validateSubscriptionCreationParams(null, null, null);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
}); 