// Tests for subscription controller
const request = require('supertest');
const express = require('express');
const subscriptionController = require('./subscriptionController');

// Mock dependencies
jest.mock('@privacy-lens/shared', () => ({
  subscription: {
    core: {
      validateSubscriptionCreationParams: jest.fn(),
      validateSubscriptionUpdateParams: jest.fn(),
      hasActiveSubscription: jest.fn(),
      createStripeCustomerData: jest.fn(),
      createPaymentMethodAttachmentData: jest.fn(),
      createCustomerUpdateData: jest.fn(),
      createStripeSubscriptionData: jest.fn(),
      createSubscriptionData: jest.fn(),
      createAuditLogData: jest.fn(),
      extractClientSecret: jest.fn(),
      extractFirstSubscriptionItemId: jest.fn(),
      createStripeSubscriptionUpdateData: jest.fn(),
      getPriceIdForPlan: jest.fn()
    },
    stripe: {
      getPriceIdForPlan: jest.fn(),
      isValidWebhookEvent: jest.fn(),
      shouldProcessWebhookEvent: jest.fn(),
      extractWebhookEventData: jest.fn(),
      normalizeStripeSubscriptionData: jest.fn(),
      createWebhookResponseData: jest.fn()
    }
  }
}));

jest.mock('../database', () => ({
  getUserSubscription: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
  getSubscriptionByStripeId: jest.fn(),
  createSubscription: jest.fn(),
  createAuditLog: jest.fn(),
  updateSubscription: jest.fn()
}));

// Mock Stripe
const mockStripe = {
  customers: {
    create: jest.fn(),
    update: jest.fn()
  },
  paymentMethods: {
    attach: jest.fn()
  },
  subscriptions: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});

const { subscription: subscriptionShared } = require('@privacy-lens/shared');
const db = require('../database');

// Create Express app for testing
const app = express();
app.use(express.json());

// Mock authentication middleware
const mockAuth = (req, res, next) => {
  req.user = {
    id: 'user_123',
    email: 'test@example.com'
  };
  req.headers.authorization = 'Bearer mock_token';
  next();
};

// Set up routes
app.post('/subscription/create', mockAuth, subscriptionController.createSubscription);
app.post('/subscription/update', mockAuth, subscriptionController.updateSubscription);
app.post('/subscription/cancel', mockAuth, subscriptionController.cancelSubscription);
app.get('/subscription/status', mockAuth, subscriptionController.getSubscriptionStatus);
app.post('/subscription/webhook', subscriptionController.handleWebhook);

describe('Subscription Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /subscription/create', () => {
    test('should create subscription successfully', async () => {
      // Mock validation
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      // Mock no existing subscription
      db.getUserSubscription.mockResolvedValue(null);
      subscriptionShared.core.hasActiveSubscription.mockReturnValue(false);

      // Mock user data
      db.getUserById.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
        stripe_customer_id: null
      });

      // Mock Stripe customer creation
      subscriptionShared.core.createStripeCustomerData.mockReturnValue({
        email: 'test@example.com',
        name: 'Test User',
        metadata: { user_id: 'user_123' }
      });
      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_123'
      });

      // Mock payment method attachment
      subscriptionShared.core.createPaymentMethodAttachmentData.mockReturnValue({
        customer: 'cus_123'
      });
      mockStripe.paymentMethods.attach.mockResolvedValue({});

      // Mock customer update
      subscriptionShared.core.createCustomerUpdateData.mockReturnValue({
        invoice_settings: { default_payment_method: 'pm_123' }
      });
      mockStripe.customers.update.mockResolvedValue({});

      // Mock price configuration
      subscriptionShared.core.getPriceIdForPlan.mockReturnValue('price_monthly_123');

      // Mock subscription creation
      subscriptionShared.core.createStripeSubscriptionData.mockReturnValue({
        customer: 'cus_123',
        items: [{ price: 'price_monthly_123' }]
      });
      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_123'
          }
        }
      });

      // Mock database operations
      db.getSubscriptionByStripeId.mockResolvedValue(null);
      subscriptionShared.core.createSubscriptionData.mockReturnValue({
        user_id: 'user_123',
        stripe_subscription_id: 'sub_123',
        plan_type: 'monthly',
        status: 'active'
      });
      db.createSubscription.mockResolvedValue({
        id: 'db_sub_123',
        user_id: 'user_123',
        stripe_subscription_id: 'sub_123',
        plan_type: 'monthly',
        status: 'active'
      });

      // Mock audit log
      subscriptionShared.core.createAuditLogData.mockReturnValue({
        action: 'subscription_created',
        user_id: 'user_123',
        details: { plan_type: 'monthly' }
      });
      db.createAuditLog.mockResolvedValue({});

      // Mock client secret extraction
      subscriptionShared.core.extractClientSecret.mockReturnValue('pi_secret_123');

      const response = await request(app)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.subscription).toBeDefined();
      expect(response.body.clientSecret).toBe('pi_secret_123');
    });

    test('should return 400 for invalid parameters', async () => {
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: false,
        errors: ['Plan type is required']
      });

      const response = await request(app)
        .post('/subscription/create')
        .send({
          planType: '',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Plan type is required');
    });

    test('should return 400 for existing active subscription', async () => {
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue({
        id: 'existing_sub',
        status: 'active'
      });
      subscriptionShared.core.hasActiveSubscription.mockReturnValue(true);

      const response = await request(app)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('already has an active subscription');
    });

    test('should return 404 for user not found', async () => {
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue(null);
      subscriptionShared.core.hasActiveSubscription.mockReturnValue(false);
      db.getUserById.mockResolvedValue(null);

      const response = await request(app)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('User not found');
    });

    test('should handle Stripe errors', async () => {
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue(null);
      subscriptionShared.core.hasActiveSubscription.mockReturnValue(false);
      db.getUserById.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com'
      });

      mockStripe.customers.create.mockRejectedValue(new Error('Stripe error'));

      const response = await request(app)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /subscription/update', () => {
    test('should update subscription successfully', async () => {
      subscriptionShared.core.validateSubscriptionUpdateParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue({
        id: 'db_sub_123',
        stripe_subscription_id: 'sub_123',
        plan_type: 'monthly',
        status: 'active'
      });

      subscriptionShared.core.getPriceIdForPlan.mockReturnValue('price_annual_456');

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        items: {
          data: [{ id: 'si_123' }]
        }
      });

      subscriptionShared.core.extractFirstSubscriptionItemId.mockReturnValue('si_123');
      subscriptionShared.core.createStripeSubscriptionUpdateData.mockReturnValue({
        items: [{ id: 'si_123', price: 'price_annual_456' }]
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });

      db.updateSubscription.mockResolvedValue({
        id: 'db_sub_123',
        plan_type: 'annual',
        status: 'active'
      });

      const response = await request(app)
        .post('/subscription/update')
        .send({
          planType: 'annual'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.subscription).toBeDefined();
    });

    test('should return 400 for invalid parameters', async () => {
      subscriptionShared.core.validateSubscriptionUpdateParams.mockReturnValue({
        isValid: false,
        errors: ['Invalid plan type']
      });

      const response = await request(app)
        .post('/subscription/update')
        .send({
          planType: 'weekly'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Invalid plan type');
    });

    test('should return 404 for subscription not found', async () => {
      subscriptionShared.core.validateSubscriptionUpdateParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue(null);

      const response = await request(app)
        .post('/subscription/update')
        .send({
          planType: 'annual'
        });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Subscription not found');
    });
  });

  describe('POST /subscription/cancel', () => {
    test('should cancel subscription successfully', async () => {
      db.getUserSubscription.mockResolvedValue({
        id: 'db_sub_123',
        stripe_subscription_id: 'sub_123',
        status: 'active'
      });

      mockStripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled'
      });

      db.updateSubscription.mockResolvedValue({
        id: 'db_sub_123',
        status: 'canceled'
      });

      const response = await request(app)
        .post('/subscription/cancel');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.subscription).toBeDefined();
    });

    test('should return 404 for subscription not found', async () => {
      db.getUserSubscription.mockResolvedValue(null);

      const response = await request(app)
        .post('/subscription/cancel');

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Subscription not found');
    });
  });

  describe('GET /subscription/status', () => {
    test('should return subscription status for active subscription', async () => {
      db.getUserSubscription.mockResolvedValue({
        id: 'db_sub_123',
        plan_type: 'monthly',
        status: 'active',
        current_period_end: '2024-12-31T23:59:59.000Z'
      });

      const response = await request(app)
        .get('/subscription/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.active).toBe(true);
      expect(response.body.tier).toBe('monthly');
      expect(response.body.currentPeriodEnd).toBeDefined();
    });

    test('should return free tier for no subscription', async () => {
      db.getUserSubscription.mockResolvedValue(null);

      const response = await request(app)
        .get('/subscription/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.active).toBe(false);
      expect(response.body.tier).toBe('free');
    });

    test('should return free tier for inactive subscription', async () => {
      db.getUserSubscription.mockResolvedValue({
        id: 'db_sub_123',
        plan_type: 'monthly',
        status: 'canceled'
      });

      const response = await request(app)
        .get('/subscription/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.active).toBe(false);
      expect(response.body.tier).toBe('free');
    });
  });

  describe('POST /subscription/webhook', () => {
    test('should process valid webhook event', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            status: 'active'
          }
        }
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      subscriptionShared.stripe.isValidWebhookEvent.mockReturnValue(true);
      subscriptionShared.stripe.shouldProcessWebhookEvent.mockReturnValue(true);
      subscriptionShared.stripe.extractWebhookEventData.mockReturnValue({
        id: 'sub_123',
        status: 'active'
      });

      db.getSubscriptionByStripeId.mockResolvedValue({
        id: 'db_sub_123',
        user_id: 'user_123'
      });

      subscriptionShared.stripe.normalizeStripeSubscriptionData.mockReturnValue({
        status: 'active',
        plan_type: 'monthly'
      });

      db.updateSubscription.mockResolvedValue({});
      subscriptionShared.stripe.createWebhookResponseData.mockReturnValue({
        received: true,
        status: 'success'
      });

      const response = await request(app)
        .post('/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send({
          id: 'evt_123',
          type: 'customer.subscription.updated'
        });

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(response.body.status).toBe('success');
    });

    test('should return 400 for invalid webhook signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(app)
        .post('/subscription/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send({
          id: 'evt_123',
          type: 'customer.subscription.updated'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    test('should ignore unprocessable webhook events', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_123'
          }
        }
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      subscriptionShared.stripe.isValidWebhookEvent.mockReturnValue(true);
      subscriptionShared.stripe.shouldProcessWebhookEvent.mockReturnValue(false);

      const response = await request(app)
        .post('/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send({
          id: 'evt_123',
          type: 'customer.created'
        });

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
    });

    test('should handle missing authorization token', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.post('/subscription/create', subscriptionController.createSubscription);

      const response = await request(appWithoutAuth)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Authorization token missing');
    });
  });

  describe('Integration with Pure Functions', () => {
    test('should call pure functions with correct parameters', async () => {
      subscriptionShared.core.validateSubscriptionCreationParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue(null);
      subscriptionShared.core.hasActiveSubscription.mockReturnValue(false);
      db.getUserById.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com'
      });

      await request(app)
        .post('/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(subscriptionShared.core.validateSubscriptionCreationParams)
        .toHaveBeenCalledWith('user_123', 'monthly', 'pm_123');
      expect(subscriptionShared.core.hasActiveSubscription)
        .toHaveBeenCalledWith(null);
    });

    test('should use pure functions for data transformation', async () => {
      subscriptionShared.core.validateSubscriptionUpdateParams.mockReturnValue({
        isValid: true,
        errors: []
      });

      db.getUserSubscription.mockResolvedValue({
        id: 'db_sub_123',
        stripe_subscription_id: 'sub_123'
      });

      subscriptionShared.core.getPriceIdForPlan.mockReturnValue('price_annual_456');

      await request(app)
        .post('/subscription/update')
        .send({
          planType: 'annual'
        });

      expect(subscriptionShared.core.getPriceIdForPlan)
        .toHaveBeenCalledWith('annual', expect.any(Object));
    });
  });
}); 