const request = require('supertest');
const express = require('express');
const subscriptionController = require('../../src/controllers/subscriptionController');

// Mock the shared subscription modules
jest.mock('@privacy-lens/shared/subscription/index.cjs', () => ({
  validateSubscriptionCreationParams: jest.fn(),
  validateSubscriptionUpdateParams: jest.fn(),
  createSubscriptionData: jest.fn(),
  createSubscriptionUpdateData: jest.fn(),
  createSubscriptionCancellationData: jest.fn(),
  createAuditLogData: jest.fn(),
  isValidWebhookEvent: jest.fn(),
  shouldProcessWebhookEvent: jest.fn(),
  normalizeStripeSubscriptionData: jest.fn(),
  createWebhookAuditLogDetails: jest.fn(),
  hasActiveSubscription: jest.fn(),
  createStripeCustomerData: jest.fn(),
  createStripeSubscriptionData: jest.fn(),
  createPaymentMethodAttachmentData: jest.fn(),
  createCustomerUpdateData: jest.fn(),
  getPriceIdForPlan: jest.fn(),
  extractClientSecret: jest.fn(),
  extractFirstSubscriptionItemId: jest.fn(),
  createStripeSubscriptionUpdateData: jest.fn(),
  isActiveSubscriptionStatus: jest.fn()
}));

// Mock the shared database
jest.mock('@privacy-lens/shared', () => ({
  db: {
    queries: {
      getUserSubscription: jest.fn(),
      getUserById: jest.fn(),
      updateUser: jest.fn(),
      getSubscriptionByStripeId: jest.fn(),
      createSubscription: jest.fn(),
      createAuditLog: jest.fn(),
      updateSubscription: jest.fn()
    }
  }
}));

// Mock Stripe
const mockStripe = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn()
  },
  paymentMethods: {
    attach: jest.fn()
  },
  subscriptions: {
    create: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    retrieve: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});

const subscriptionCore = require('@privacy-lens/shared/subscription/index.cjs');
const { db } = require('@privacy-lens/shared');

describe('Subscription Controller', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: 'user123', email: 'test@example.com' };
      next();
    });

    // Add routes
    app.post('/subscription/create', subscriptionController.createSubscription);
    app.post('/subscription/update', subscriptionController.updateSubscription);
    app.post('/subscription/cancel', subscriptionController.cancelSubscription);
    app.get('/subscription/status', subscriptionController.getSubscriptionStatus);
    app.post('/subscription/webhook', subscriptionController.handleWebhook);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('POST /subscription/create', () => {
    test('should create subscription successfully', async () => {
      // Mock validation
      subscriptionCore.validateSubscriptionCreationParams.mockReturnValue({ isValid: true });
      subscriptionCore.hasActiveSubscription.mockReturnValue(false);
      
      // Mock database queries
      db.queries.getUserSubscription.mockResolvedValue(null);
      db.queries.getUserById.mockResolvedValue({ 
        id: 'user123', 
        email: 'test@example.com',
        stripe_customer_id: 'cus_123' 
      });
      db.queries.getSubscriptionByStripeId.mockResolvedValue(null);
      db.queries.createSubscription.mockResolvedValue({ id: 1 });
      db.queries.createAuditLog.mockResolvedValue({ id: 1 });

      // Mock Stripe calls
      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_123'
          }
        }
      });

      // Mock pure functions
      subscriptionCore.createPaymentMethodAttachmentData.mockReturnValue({ customer: 'cus_123' });
      subscriptionCore.createCustomerUpdateData.mockReturnValue({ invoice_settings: { default_payment_method: 'pm_123' } });
      subscriptionCore.getPriceIdForPlan.mockReturnValue('price_123');
      subscriptionCore.createStripeSubscriptionData.mockReturnValue({
        customer: 'cus_123',
        items: [{ price: 'price_123' }]
      });
      subscriptionCore.createSubscriptionData.mockReturnValue({
        user_id: 'user123',
        stripe_subscription_id: 'sub_123',
        plan_type: 'monthly',
        status: 'active'
      });
      subscriptionCore.createAuditLogData.mockReturnValue({
        user_id: 'user123',
        action: 'subscription_created',
        details: { plan_type: 'monthly' }
      });
      subscriptionCore.extractClientSecret.mockReturnValue('pi_secret_123');

      const response = await request(app)
        .post('/subscription/create')
        .set('Authorization', 'Bearer mock_jwt_token')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.subscription).toBeDefined();
      expect(response.body.clientSecret).toBe('pi_secret_123');
    });

    test('should return 400 for invalid plan type', async () => {
      subscriptionCore.validateSubscriptionCreationParams.mockReturnValue({ 
        isValid: false, 
        errors: ['Invalid plan type'] 
      });

      const response = await request(app)
        .post('/subscription/create')
        .set('Authorization', 'Bearer mock_jwt_token')
        .send({
          planType: 'invalid',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid plan type');
    });

    test('should return 400 if user already has subscription', async () => {
      subscriptionCore.validateSubscriptionCreationParams.mockReturnValue({ isValid: true });
      subscriptionCore.hasActiveSubscription.mockReturnValue(true);
      
      // Mock existing subscription
      db.queries.getUserSubscription.mockResolvedValue({ 
        id: 1, 
        status: 'active' 
      });

      const response = await request(app)
        .post('/subscription/create')
        .set('Authorization', 'Bearer mock_jwt_token')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('User already has an active subscription');
    });

    test('should handle Stripe errors', async () => {
      subscriptionCore.validateSubscriptionCreationParams.mockReturnValue({ isValid: true });
      subscriptionCore.hasActiveSubscription.mockReturnValue(false);
      
      db.queries.getUserSubscription.mockResolvedValue(null);
      db.queries.getUserById.mockResolvedValue({ 
        id: 'user123', 
        stripe_customer_id: 'cus_123' 
      });
      db.queries.getSubscriptionByStripeId.mockResolvedValue(null);

      // Mock the pure functions that are called before the Stripe error
      subscriptionCore.createPaymentMethodAttachmentData.mockReturnValue({ customer: 'cus_123' });
      subscriptionCore.createCustomerUpdateData.mockReturnValue({ invoice_settings: { default_payment_method: 'pm_123' } });
      subscriptionCore.getPriceIdForPlan.mockReturnValue('price_123');
      subscriptionCore.createStripeSubscriptionData.mockReturnValue({
        customer: 'cus_123',
        items: [{ price: 'price_123' }]
      });

      // Mock Stripe methods to succeed until subscription creation
      mockStripe.paymentMethods.attach.mockResolvedValue({});
      mockStripe.customers.update.mockResolvedValue({});
      
      // This is where the error should occur
      mockStripe.subscriptions.create.mockRejectedValue(
        new Error('Payment method declined')
      );

      const response = await request(app)
        .post('/subscription/create')
        .set('Authorization', 'Bearer mock_jwt_token')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to create subscription');
    });
  });

  describe('POST /subscription/update', () => {
    test('should update subscription successfully', async () => {
      subscriptionCore.validateSubscriptionUpdateParams.mockReturnValue({ isValid: true });
      
      // Mock existing subscription
      db.queries.getUserSubscription.mockResolvedValue({ 
        id: 1, 
        stripe_subscription_id: 'sub_123',
        status: 'active' 
      });
      db.queries.updateSubscription.mockResolvedValue({ id: 1 });
      db.queries.createAuditLog.mockResolvedValue({ id: 1 });

      // Mock Stripe subscription retrieval and update
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        items: {
          data: [{ id: 'si_123' }]
        }
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600
      });

      subscriptionCore.getPriceIdForPlan.mockReturnValue('price_456');
      subscriptionCore.extractFirstSubscriptionItemId.mockReturnValue('si_123');
      subscriptionCore.createStripeSubscriptionUpdateData.mockReturnValue({
        items: [{ id: 'si_123', price: 'price_456' }]
      });
      subscriptionCore.createSubscriptionUpdateData.mockReturnValue({
        plan_type: 'annual',
        updated_at: new Date()
      });
      subscriptionCore.createAuditLogData.mockReturnValue({
        user_id: 'user123',
        action: 'subscription_updated',
        details: { plan_type: 'annual' }
      });

      const response = await request(app)
        .post('/subscription/update')
        .set('Authorization', 'Bearer mock_jwt_token')
        .send({
          planType: 'annual'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.subscription).toBeDefined();
    });

    test('should return 404 if no subscription found', async () => {
      subscriptionCore.validateSubscriptionUpdateParams.mockReturnValue({ isValid: true });
      
      db.queries.getUserSubscription.mockResolvedValue(null);

      const response = await request(app)
        .post('/subscription/update')
        .set('Authorization', 'Bearer mock_jwt_token')
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
      // Mock existing subscription
      db.queries.getUserSubscription.mockResolvedValue({ 
        id: 1, 
        stripe_subscription_id: 'sub_123',
        status: 'active' 
      });
      db.queries.updateSubscription.mockResolvedValue({ id: 1 });
      db.queries.createAuditLog.mockResolvedValue({ id: 1 });

      mockStripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled',
        canceled_at: 1640995200
      });

      subscriptionCore.createSubscriptionCancellationData.mockReturnValue({
        status: 'canceled',
        canceled_at: new Date(),
        updated_at: new Date()
      });
      subscriptionCore.createAuditLogData.mockReturnValue({
        user_id: 'user123',
        action: 'subscription_cancelled',
        details: { subscription_id: 'sub_123' }
      });

      const response = await request(app)
        .post('/subscription/cancel')
        .set('Authorization', 'Bearer mock_jwt_token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.subscription).toBeDefined();
    });

    test('should return 404 if no subscription found', async () => {
      db.queries.getUserSubscription.mockResolvedValue(null);

      const response = await request(app)
        .post('/subscription/cancel')
        .set('Authorization', 'Bearer mock_jwt_token');

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Subscription not found');
    });
  });

  describe('GET /subscription/status', () => {
    test('should return subscription status successfully', async () => {
      db.queries.getUserSubscription.mockResolvedValue({ 
        id: 1,
        plan_type: 'monthly',
        status: 'active',
        current_period_end: '2022-02-01T00:00:00.000Z'
      });
      subscriptionCore.isActiveSubscriptionStatus.mockReturnValue(true);

      const response = await request(app)
        .get('/subscription/status')
        .set('Authorization', 'Bearer mock_jwt_token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.active).toBe(true);
      expect(response.body.tier).toBe('monthly');
    });

    test('should return free tier for no subscription', async () => {
      db.queries.getUserSubscription.mockResolvedValue(null);

      const response = await request(app)
        .get('/subscription/status')
        .set('Authorization', 'Bearer mock_jwt_token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.active).toBe(false);
      expect(response.body.tier).toBe('free');
    });
  });

  describe('POST /subscription/webhook', () => {
    test('should process valid webhook successfully', async () => {
      subscriptionCore.isValidWebhookEvent.mockReturnValue(true);
      subscriptionCore.shouldProcessWebhookEvent.mockReturnValue(true);

      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            status: 'active'
          }
        }
      });

      const response = await request(app)
        .post('/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send({ test: 'data' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.received).toBe(true);
    });

    test('should return 400 for invalid signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        const error = new Error('Invalid signature');
        error.type = 'StripeSignatureVerificationError';
        throw error;
      });

      const response = await request(app)
        .post('/subscription/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send({ test: 'data' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Invalid signature');
    });

    test('should skip processing for irrelevant events', async () => {
      subscriptionCore.isValidWebhookEvent.mockReturnValue(true);
      subscriptionCore.shouldProcessWebhookEvent.mockReturnValue(false);

      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_123',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_123'
          }
        }
      });

      const response = await request(app)
        .post('/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send({ test: 'data' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Event type not processed');
    });
  });
}); 