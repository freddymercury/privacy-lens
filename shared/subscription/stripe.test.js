// Tests for subscription Stripe pure functions
const {
  getPriceIdForPlan,
  isValidWebhookEvent,
  shouldProcessWebhookEvent,
  extractSubscriptionIdFromEvent,
  normalizeStripeSubscriptionData,
  extractFirstSubscriptionItemId,
  createPaymentMethodAttachmentData,
  createCustomerUpdateData,
  extractInvoiceDataFromEvent,
  createWebhookAuditLogDetails,
  getAuditLogActionFromEventType
} = require('./stripe');

describe('Subscription Stripe Pure Functions', () => {
  
  describe('getPriceIdForPlan', () => {
    const mockPriceConfig = {
      monthly: 'price_monthly_123',
      annual: 'price_annual_456'
    };

    test('should return correct price ID for monthly plan', () => {
      const result = getPriceIdForPlan('monthly', mockPriceConfig);
      expect(result).toBe('price_monthly_123');
    });

    test('should return correct price ID for annual plan', () => {
      const result = getPriceIdForPlan('annual', mockPriceConfig);
      expect(result).toBe('price_annual_456');
    });

    test('should return monthly price for invalid plan type', () => {
      const result = getPriceIdForPlan('weekly', mockPriceConfig);
      expect(result).toBe('price_monthly_123');
    });

    test('should return monthly price for missing plan type', () => {
      const result = getPriceIdForPlan('', mockPriceConfig);
      expect(result).toBe('price_monthly_123');
    });

    test('should return monthly price for null plan type', () => {
      const result = getPriceIdForPlan(null, mockPriceConfig);
      expect(result).toBe('price_monthly_123');
    });

    test('should return monthly price for undefined plan type', () => {
      const result = getPriceIdForPlan(undefined, mockPriceConfig);
      expect(result).toBe('price_monthly_123');
    });

    test('should handle missing price config', () => {
      expect(() => {
        getPriceIdForPlan('monthly', null);
      }).toThrow();
    });

    test('should handle empty price config', () => {
      const result = getPriceIdForPlan('monthly', {});
      expect(result).toBeUndefined();
    });
  });

  describe('isValidWebhookEvent', () => {
    test('should return true for valid webhook event structure', () => {
      const validEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123',
            status: 'active'
          }
        }
      };

      const result = isValidWebhookEvent(validEvent);
      expect(result).toBe(true);
    });

    test('should return true for missing id (id not required)', () => {
      const eventWithoutId = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123'
          }
        }
      };

      const result = isValidWebhookEvent(eventWithoutId);
      expect(result).toBe(true);
    });

    test('should return false for missing type', () => {
      const invalidEvent = {
        id: 'evt_123',
        data: {
          object: {
            id: 'sub_123'
          }
        }
      };

      const result = isValidWebhookEvent(invalidEvent);
      expect(result).toBe(false);
    });

    test('should return false for missing data', () => {
      const invalidEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created'
      };

      const result = isValidWebhookEvent(invalidEvent);
      expect(result).toBe(false);
    });

    test('should return false for missing data.object', () => {
      const invalidEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: {}
      };

      const result = isValidWebhookEvent(invalidEvent);
      expect(result).toBe(false);
    });

    test('should return false for null event', () => {
      const result = isValidWebhookEvent(null);
      expect(result).toBe(false);
    });

    test('should return false for undefined event', () => {
      const result = isValidWebhookEvent(undefined);
      expect(result).toBe(false);
    });
  });

  describe('shouldProcessWebhookEvent', () => {
    test('should return false for subscription created events (not in supported list)', () => {
      const result = shouldProcessWebhookEvent('customer.subscription.created');
      expect(result).toBe(false);
    });

    test('should return true for subscription updated events', () => {
      const result = shouldProcessWebhookEvent('customer.subscription.updated');
      expect(result).toBe(true);
    });

    test('should return true for subscription deleted events', () => {
      const result = shouldProcessWebhookEvent('customer.subscription.deleted');
      expect(result).toBe(true);
    });

    test('should return true for invoice payment succeeded events', () => {
      const result = shouldProcessWebhookEvent('invoice.payment_succeeded');
      expect(result).toBe(true);
    });

    test('should return true for invoice payment failed events', () => {
      const result = shouldProcessWebhookEvent('invoice.payment_failed');
      expect(result).toBe(true);
    });

    test('should return false for unrelated events', () => {
      const result = shouldProcessWebhookEvent('customer.created');
      expect(result).toBe(false);
    });

    test('should return false for empty event type', () => {
      const result = shouldProcessWebhookEvent('');
      expect(result).toBe(false);
    });

    test('should return false for null event type', () => {
      const result = shouldProcessWebhookEvent(null);
      expect(result).toBe(false);
    });

    test('should return false for undefined event type', () => {
      const result = shouldProcessWebhookEvent(undefined);
      expect(result).toBe(false);
    });
  });

  describe('extractSubscriptionIdFromEvent', () => {
    test('should extract subscription ID from subscription event', () => {
      const webhookEvent = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            status: 'active'
          }
        }
      };

      const result = extractSubscriptionIdFromEvent(webhookEvent);
      expect(result).toBe('sub_123');
    });

    test('should extract subscription ID from invoice event', () => {
      const webhookEvent = {
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_123',
            subscription: 'sub_123'
          }
        }
      };

      const result = extractSubscriptionIdFromEvent(webhookEvent);
      expect(result).toBe('sub_123');
    });

    test('should return null for invalid webhook event', () => {
      const invalidEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created'
        // missing data
      };

      const result = extractSubscriptionIdFromEvent(invalidEvent);
      expect(result).toBeNull();
    });

    test('should return null for null event', () => {
      const result = extractSubscriptionIdFromEvent(null);
      expect(result).toBeNull();
    });
  });

  describe('normalizeStripeSubscriptionData', () => {
    test('should normalize Stripe subscription data', () => {
      const stripeSubscription = {
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123',
        current_period_start: 1640995200,
        current_period_end: 1643673600,
        items: {
          data: [
            {
              price: {
                id: 'price_monthly_123',
                recurring: {
                  interval: 'month'
                }
              }
            }
          ]
        }
      };

      const result = normalizeStripeSubscriptionData(stripeSubscription);

      expect(result).toEqual({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600,
        customer: 'cus_123',
        items: stripeSubscription.items.data
      });
    });

    test('should handle missing items', () => {
      const stripeSubscription = {
        id: 'sub_123',
        status: 'active'
      };

      const result = normalizeStripeSubscriptionData(stripeSubscription);

      expect(result.id).toBe('sub_123');
      expect(result.status).toBe('active');
      expect(result.items).toEqual([]);
    });

    test('should handle null subscription', () => {
      expect(() => {
        normalizeStripeSubscriptionData(null);
      }).toThrow();
    });

    test('should handle undefined subscription', () => {
      expect(() => {
        normalizeStripeSubscriptionData(undefined);
      }).toThrow();
    });
  });

  describe('extractFirstSubscriptionItemId', () => {
    test('should extract first subscription item ID', () => {
      const stripeSubscription = {
        items: {
          data: [
            { id: 'si_123' },
            { id: 'si_456' }
          ]
        }
      };

      const result = extractFirstSubscriptionItemId(stripeSubscription);
      expect(result).toBe('si_123');
    });

    test('should return null for empty items', () => {
      const stripeSubscription = {
        items: {
          data: []
        }
      };

      const result = extractFirstSubscriptionItemId(stripeSubscription);
      expect(result).toBeNull();
    });

    test('should return null for missing items', () => {
      const stripeSubscription = {};

      const result = extractFirstSubscriptionItemId(stripeSubscription);
      expect(result).toBeNull();
    });
  });

  describe('createPaymentMethodAttachmentData', () => {
    test('should create payment method attachment data', () => {
      const customerId = 'cus_123';
      const result = createPaymentMethodAttachmentData(customerId);

      expect(result).toEqual({
        customer: customerId
      });
    });
  });

  describe('createCustomerUpdateData', () => {
    test('should create customer update data with default payment method', () => {
      const paymentMethodId = 'pm_123';
      const result = createCustomerUpdateData(paymentMethodId);

      expect(result).toEqual({
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    });
  });

  describe('extractInvoiceDataFromEvent', () => {
    test('should extract invoice data from invoice event', () => {
      const webhookEvent = {
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_123',
            subscription: 'sub_123',
            amount_paid: 2000,
            attempt_count: 1,
            status: 'paid'
          }
        }
      };

      const result = extractInvoiceDataFromEvent(webhookEvent);

      expect(result).toEqual({
        id: 'in_123',
        subscription: 'sub_123',
        amount_paid: 2000,
        attempt_count: 1,
        status: 'paid'
      });
    });

    test('should return null for non-invoice event', () => {
      const webhookEvent = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123'
          }
        }
      };

      const result = extractInvoiceDataFromEvent(webhookEvent);
      expect(result).toBeNull();
    });

    test('should return null for invalid event', () => {
      const result = extractInvoiceDataFromEvent(null);
      expect(result).toBeNull();
    });
  });

  describe('createWebhookAuditLogDetails', () => {
    test('should create audit log details for subscription updated event', () => {
      const eventType = 'customer.subscription.updated';
      const eventData = {
        subscription_id: 'sub_123',
        status: 'active'
      };

      const result = createWebhookAuditLogDetails(eventType, eventData);

      expect(result.webhook_event_type).toBe(eventType);
      expect(result.subscription_id).toBe('sub_123');
      expect(result.status).toBe('active');
      expect(result.processed_at).toBeDefined();
    });

    test('should create audit log details for payment succeeded event', () => {
      const eventType = 'invoice.payment_succeeded';
      const eventData = {
        subscription_id: 'sub_123',
        amount_paid: 2000,
        invoice_id: 'in_123'
      };

      const result = createWebhookAuditLogDetails(eventType, eventData);

      expect(result.webhook_event_type).toBe(eventType);
      expect(result.subscription_id).toBe('sub_123');
      expect(result.amount).toBe(2000);
      expect(result.invoice_id).toBe('in_123');
    });

    test('should create base details for unknown event type', () => {
      const eventType = 'unknown.event';
      const eventData = {};

      const result = createWebhookAuditLogDetails(eventType, eventData);

      expect(result.webhook_event_type).toBe(eventType);
      expect(result.processed_at).toBeDefined();
      expect(result.subscription_id).toBeUndefined();
    });
  });

  describe('getAuditLogActionFromEventType', () => {
    test('should return correct action for subscription updated', () => {
      const result = getAuditLogActionFromEventType('customer.subscription.updated');
      expect(result).toBe('subscription_updated_webhook');
    });

    test('should return correct action for subscription deleted', () => {
      const result = getAuditLogActionFromEventType('customer.subscription.deleted');
      expect(result).toBe('subscription_cancelled_webhook');
    });

    test('should return correct action for payment succeeded', () => {
      const result = getAuditLogActionFromEventType('invoice.payment_succeeded');
      expect(result).toBe('payment_succeeded');
    });

    test('should return correct action for payment failed', () => {
      const result = getAuditLogActionFromEventType('invoice.payment_failed');
      expect(result).toBe('payment_failed');
    });

    test('should return default action for unknown event type', () => {
      const result = getAuditLogActionFromEventType('unknown.event');
      expect(result).toBe('webhook_processed');
    });
  });

  // Test immutability - ensure pure functions don't modify inputs
  describe('Input Immutability', () => {
    test('normalizeStripeSubscriptionData should not modify input', () => {
      const originalSubscription = {
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640995200
      };
      const subscriptionCopy = { ...originalSubscription };

      normalizeStripeSubscriptionData(originalSubscription);

      expect(originalSubscription).toEqual(subscriptionCopy);
    });

    test('extractSubscriptionIdFromEvent should not modify input event', () => {
      const originalEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123',
            status: 'active'
          }
        }
      };
      const eventCopy = JSON.parse(JSON.stringify(originalEvent));

      extractSubscriptionIdFromEvent(originalEvent);

      expect(originalEvent).toEqual(eventCopy);
    });
  });

  // Test deterministic behavior
  describe('Deterministic Behavior', () => {
    test('getPriceIdForPlan should always return same result for same inputs', () => {
      const priceConfig = {
        monthly: 'price_monthly_123',
        annual: 'price_annual_456'
      };

      const result1 = getPriceIdForPlan('monthly', priceConfig);
      const result2 = getPriceIdForPlan('monthly', priceConfig);
      const result3 = getPriceIdForPlan('monthly', priceConfig);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe('price_monthly_123');
    });

    test('shouldProcessWebhookEvent should always return same result for same input', () => {
      const eventType = 'customer.subscription.updated';

      const result1 = shouldProcessWebhookEvent(eventType);
      const result2 = shouldProcessWebhookEvent(eventType);
      const result3 = shouldProcessWebhookEvent(eventType);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(true);
    });

    test('isValidWebhookEvent should always return same result for same input', () => {
      const event = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123'
          }
        }
      };

      const result1 = isValidWebhookEvent(event);
      const result2 = isValidWebhookEvent(event);

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });
  });

  // Test edge cases and boundary conditions
  describe('Edge Cases', () => {
    test('getPriceIdForPlan should handle price config with null values', () => {
      const priceConfig = {
        monthly: null,
        annual: 'price_annual_456'
      };

      const result = getPriceIdForPlan('monthly', priceConfig);
      expect(result).toBeNull();
    });

    test('normalizeStripeSubscriptionData should handle complex nested structures', () => {
      const complexSubscription = {
        id: 'sub_123',
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_123',
                recurring: {
                  interval: 'month',
                  interval_count: 1
                },
                metadata: {
                  plan_type: 'premium'
                }
              }
            }
          ]
        },
        metadata: {
          custom_field: 'value'
        }
      };

      const result = normalizeStripeSubscriptionData(complexSubscription);

      expect(result.id).toBe('sub_123');
      expect(result.status).toBe('active');
      expect(result.items).toEqual(complexSubscription.items.data);
    });

    test('isValidWebhookEvent should handle deeply nested missing properties', () => {
      const eventWithMissingNestedData = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: {
          object: null
        }
      };

      const result = isValidWebhookEvent(eventWithMissingNestedData);
      expect(result).toBe(false);
    });
  });
}); 