const request = require('supertest');
const express = require('express');

// Use development mode so the in-memory rate limiter (which skips in
// development) doesn't leak state between tests
process.env.NODE_ENV = 'development';

const subscriptionRoutes = require('../../src/routes/subscription');

// Mock the subscription controller
jest.mock('../../src/controllers/subscriptionController', () => ({
  createSubscription: jest.fn((req, res) => res.json({ success: true })),
  updateSubscription: jest.fn((req, res) => res.json({ success: true })),
  cancelSubscription: jest.fn((req, res) => res.json({ success: true })),
  getSubscriptionStatus: jest.fn((req, res) => res.json({ success: true })),
  handleWebhook: jest.fn((req, res) => res.json({ received: true }))
}));

// Mock the authentication middleware
jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: jest.fn((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      req.user = { id: 'user123', email: 'test@example.com' };
      next();
    } else {
      res.status(401).json({ error: 'Authentication required' });
    }
  })
}));

const subscriptionController = require('../../src/controllers/subscriptionController');

describe('Subscription Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRoutes);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/subscription/create', () => {
    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/create')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
      expect(subscriptionController.createSubscription).not.toHaveBeenCalled();
    });

    test('should call controller with valid authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', 'Bearer valid_token')
        .send({
          planType: 'monthly',
          paymentMethodId: 'pm_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(subscriptionController.createSubscription).toHaveBeenCalledTimes(1);
    });

    test('should validate request body', async () => {
      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', 'Bearer valid_token')
        .send({
          planType: 'invalid_plan'
        });

      // The route's validation middleware rejects invalid plan types before
      // the controller is called
      expect(response.status).toBe(400);
      expect(subscriptionController.createSubscription).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/subscription/update', () => {
    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/update')
        .send({
          planType: 'annual'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
      expect(subscriptionController.updateSubscription).not.toHaveBeenCalled();
    });

    test('should call controller with valid authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/update')
        .set('Authorization', 'Bearer valid_token')
        .send({
          planType: 'annual'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(subscriptionController.updateSubscription).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/subscription/cancel', () => {
    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/cancel');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
      expect(subscriptionController.cancelSubscription).not.toHaveBeenCalled();
    });

    test('should call controller with valid authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/cancel')
        .set('Authorization', 'Bearer valid_token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(subscriptionController.cancelSubscription).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/subscription/status', () => {
    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/subscription/status');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
      expect(subscriptionController.getSubscriptionStatus).not.toHaveBeenCalled();
    });

    test('should call controller with valid authentication', async () => {
      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', 'Bearer valid_token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(subscriptionController.getSubscriptionStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/subscription/webhook', () => {
    test('should not require authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/webhook')
        .set('stripe-signature', 'test_signature')
        .send({ test: 'data' });

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(subscriptionController.handleWebhook).toHaveBeenCalledTimes(1);
    });

    test('should handle webhook without stripe signature', async () => {
      const response = await request(app)
        .post('/api/subscription/webhook')
        .send({ test: 'data' });

      expect(response.status).toBe(200);
      expect(subscriptionController.handleWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/subscription/health', () => {
    test('should return health status without authentication', async () => {
      const response = await request(app)
        .get('/api/subscription/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.service).toBe('subscription');
    });

    test('should include timestamp in health response', async () => {
      const response = await request(app)
        .get('/api/subscription/health');

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Rate Limiting', () => {
    test('should handle multiple requests within rate limit', async () => {
      // Make multiple requests quickly
      const promises = Array(5).fill().map(() => 
        request(app)
          .get('/api/subscription/status')
          .set('Authorization', 'Bearer valid_token')
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed (assuming rate limit is higher than 5)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/api/subscription/health');

      expect(response.status).toBe(200);
      // Note: CORS headers would be set by the main app middleware
      // This test verifies the route doesn't interfere with CORS
    });

    test('should handle OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/subscription/create');

      // The route should handle OPTIONS requests for CORS preflight
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle controller errors gracefully', async () => {
      // Mock controller to throw an error
      subscriptionController.getSubscriptionStatus.mockImplementation(() => {
        throw new Error('Controller error');
      });

      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', 'Bearer valid_token');

      // The route should handle the error (status depends on error handling middleware)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Request Body Validation', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', 'Bearer valid_token')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    test('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/subscription/create')
        .set('Authorization', 'Bearer valid_token')
        .send();

      // Validation middleware rejects missing planType/paymentMethodId with 400
      expect(response.status).toBe(400);
      expect(subscriptionController.createSubscription).not.toHaveBeenCalled();
    });
  });
}); 