const request = require('supertest');
const app = require('../../src/app');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test_anon_key';
process.env.SUPABASE_SERVICE_KEY = 'test_service_key';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';

// Mock the database
jest.mock('../../src/database', () => ({
  query: jest.fn()
}));

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn(),
      retrieve: jest.fn()
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
  }));
});

// Get the mocked Stripe instance
const Stripe = require('stripe');
const mockStripe = new Stripe();

const db = require('../../src/database');
const jwt = require('jsonwebtoken');

describe('Subscription Integration Tests', () => {
  let authToken;
  let testUser;

  beforeEach(() => {
    // Create test user and auth token
    testUser = {
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User'
    };

    authToken = jwt.sign(testUser, process.env.JWT_SECRET);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Complete Subscription Creation Flow', () => {
    test('should create subscription for new user', async () => {
      // Mock database responses
      db.query
        .mockResolvedValueOnce({ rows: [] }) // No existing subscription
        .mockResolvedValueOnce({ rows: [] }) // No existing Stripe customer
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert customer
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert subscription
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert audit log

      // Mock Stripe responses
      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_123',
        email: testUser.email
      });

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

      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeDefined();
      expect(response.body.clientSecret).toBe('pi_secret_123');

      // Verify Stripe customer creation
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: testUser.email,
        name: testUser.name,
        metadata: { userId: testUser.id }
      });

      // Verify Stripe subscription creation
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        items: [{ price: 'price_monthly' }],
        expand: ['latest_invoice.payment_intent']
      });
    });

    test('should create subscription for existing customer', async () => {
      // Mock database responses
      db.query
        .mockResolvedValueOnce({ rows: [] }) // No existing subscription
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] }) // Existing customer
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert subscription
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert audit log

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

      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          planType: 'annual',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Should not create new customer
      expect(mockStripe.customers.create).not.toHaveBeenCalled();

      // Should use existing customer
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_existing',
        items: [{ price: 'price_annual' }],
        expand: ['latest_invoice.payment_intent']
      });
    });
  });

  describe('Subscription Update Flow', () => {
    test('should update subscription plan successfully', async () => {
      // Mock existing subscription
      db.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1,
            stripe_subscription_id: 'sub_123',
            status: 'active',
            plan_type: 'monthly'
          }] 
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Update subscription
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert audit log

      // Mock Stripe responses
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

      const response = await request(app)
        .post('/api/subscription/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          planType: 'annual'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeDefined();

      // Verify Stripe subscription update
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
        items: [{
          id: 'si_123',
          price: 'price_annual'
        }],
        proration_behavior: 'create_prorations'
      });
    });
  });

  describe('Subscription Cancellation Flow', () => {
    test('should cancel subscription successfully', async () => {
      // Mock existing subscription
      db.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1,
            stripe_subscription_id: 'sub_123',
            status: 'active'
          }] 
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Update subscription
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert audit log

      mockStripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled',
        canceled_at: 1640995200
      });

      const response = await request(app)
        .post('/api/subscription/cancel')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeDefined();

      // Verify Stripe subscription cancellation
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
    });
  });

  describe('Subscription Status Flow', () => {
    test('should return active subscription status', async () => {
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 1,
          plan_type: 'monthly',
          status: 'active',
          current_period_end: '2022-02-01T00:00:00.000Z'
        }] 
      });

      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(true);
      expect(response.body.tier).toBe('monthly');
      expect(response.body.currentPeriodEnd).toBe('2022-02-01T00:00:00.000Z');
    });

    test('should return free tier for no subscription', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(false);
      expect(response.body.tier).toBe('free');
    });
  });

  describe('Webhook Processing Flow', () => {
    test('should process subscription updated webhook', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            status: 'active',
            current_period_start: 1640995200,
            current_period_end: 1643673600
          }
        }
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      // Mock finding subscription by Stripe ID
      db.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1,
            user_id: 'user123'
          }] 
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Update subscription
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert audit log

      const response = await request(app)
        .post('/api/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);

      // Verify webhook event construction
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalled();
    });

    test('should handle subscription deleted webhook', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            status: 'canceled'
          }
        }
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      db.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1,
            user_id: 'user123'
          }] 
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Update subscription
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert audit log

      const response = await request(app)
        .post('/api/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle database connection errors', async () => {
      db.query.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Database connection failed');
    });

    test('should handle Stripe API errors', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // No existing subscription
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_123' }] }); // Existing customer

      mockStripe.subscriptions.create.mockRejectedValue(
        new Error('Your card was declined')
      );

      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_declined'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Your card was declined');
    });

    test('should handle invalid webhook signatures', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(app)
        .post('/api/subscription/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send({ test: 'data' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid signature');
    });
  });

  describe('Authentication and Authorization', () => {
    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/subscription/status');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    test('should reject requests with invalid tokens', async () => {
      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should allow webhook requests without authentication', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'ping'
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const response = await request(app)
        .post('/api/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/subscription/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('subscription');
      expect(response.body.timestamp).toBeDefined();
    });
  });
}); 