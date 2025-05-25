const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';

// Mock the database
jest.mock('../../src/database', () => ({
  query: jest.fn()
}));

// Mock Stripe
const mockStripe = {
  customers: { create: jest.fn(), retrieve: jest.fn() },
  subscriptions: { create: jest.fn(), update: jest.fn(), cancel: jest.fn(), retrieve: jest.fn() },
  webhooks: { constructEvent: jest.fn() }
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});

const db = require('../../src/database');

describe('Subscription Load Tests', () => {
  let authTokens;

  beforeAll(() => {
    // Create multiple test users and auth tokens
    authTokens = Array(100).fill().map((_, i) => {
      const user = {
        id: `user${i}`,
        email: `test${i}@example.com`,
        name: `Test User ${i}`
      };
      return jwt.sign(user, process.env.JWT_SECRET);
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock responses
    db.query.mockResolvedValue({ rows: [] });
    mockStripe.subscriptions.create.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      current_period_start: 1640995200,
      current_period_end: 1643673600,
      latest_invoice: { payment_intent: { client_secret: 'pi_secret_123' } }
    });
  });

  describe('Subscription Status Load Test', () => {
    test('should handle 50 concurrent status requests', async () => {
      // Mock subscription data for all users
      db.query.mockResolvedValue({ 
        rows: [{ 
          id: 1,
          plan_type: 'monthly',
          status: 'active',
          current_period_end: '2022-02-01T00:00:00.000Z'
        }] 
      });

      const startTime = Date.now();
      
      // Create 50 concurrent requests
      const promises = Array(50).fill().map((_, i) => 
        request(app)
          .get('/api/subscription/status')
          .set('Authorization', `Bearer ${authTokens[i]}`)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.active).toBe(true);
      });

      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(responses.length).toBe(50);

      console.log(`50 concurrent status requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 50}ms per request`);
    });

    test('should handle 100 concurrent status requests with rate limiting', async () => {
      db.query.mockResolvedValue({ rows: [] }); // No subscription (free tier)

      const startTime = Date.now();
      
      // Create 100 concurrent requests
      const promises = Array(100).fill().map((_, i) => 
        request(app)
          .get('/api/subscription/status')
          .set('Authorization', `Bearer ${authTokens[i]}`)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Most requests should succeed, some might be rate limited
      const successfulResponses = responses.filter(r => r.status === 200);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(successfulResponses.length).toBeGreaterThan(80); // At least 80% success
      expect(successfulResponses.length + rateLimitedResponses.length).toBe(100);

      console.log(`100 concurrent requests: ${successfulResponses.length} successful, ${rateLimitedResponses.length} rate limited`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Subscription Creation Load Test', () => {
    test('should handle 20 concurrent subscription creations', async () => {
      // Mock database responses for subscription creation
      db.query
        .mockResolvedValueOnce({ rows: [] }) // No existing subscription
        .mockResolvedValue({ rows: [{ id: 1 }] }); // Insert operations

      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_123',
        email: 'test@example.com'
      });

      const startTime = Date.now();
      
      // Create 20 concurrent subscription creation requests
      const promises = Array(20).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/create')
          .set('Authorization', `Bearer ${authTokens[i]}`)
          .send({
            planType: 'monthly',
            paymentMethodId: `pm_test_${i}`
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status === 200);
      const errorResponses = responses.filter(r => r.status >= 400);

      expect(successfulResponses.length).toBeGreaterThan(15); // At least 75% success
      
      successfulResponses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.subscription).toBeDefined();
      });

      console.log(`20 concurrent subscription creations: ${successfulResponses.length} successful, ${errorResponses.length} errors`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Webhook Processing Load Test', () => {
    test('should handle 30 concurrent webhook requests', async () => {
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
      
      // Mock finding subscription
      db.query.mockResolvedValue({ 
        rows: [{ id: 1, user_id: 'user123' }] 
      });

      const startTime = Date.now();
      
      // Create 30 concurrent webhook requests
      const promises = Array(30).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/webhook')
          .set('stripe-signature', `test_signature_${i}`)
          .send(JSON.stringify({ ...mockEvent, id: `evt_${i}` }))
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all webhook requests were processed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
      });

      console.log(`30 concurrent webhook requests completed in ${duration}ms`);
      console.log(`Average webhook processing time: ${duration / 30}ms per request`);
    });
  });

  describe('Mixed Load Test', () => {
    test('should handle mixed subscription operations under load', async () => {
      // Set up mocks for different operations
      db.query.mockImplementation((query) => {
        if (query.includes('SELECT') && query.includes('subscriptions')) {
          return Promise.resolve({ 
            rows: [{ 
              id: 1,
              plan_type: 'monthly',
              status: 'active',
              current_period_end: '2022-02-01T00:00:00.000Z'
            }] 
          });
        }
        return Promise.resolve({ rows: [{ id: 1 }] });
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });

      mockStripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled'
      });

      const startTime = Date.now();
      
      // Create mixed requests: 20 status, 10 updates, 5 cancellations
      const statusPromises = Array(20).fill().map((_, i) => 
        request(app)
          .get('/api/subscription/status')
          .set('Authorization', `Bearer ${authTokens[i]}`)
      );

      const updatePromises = Array(10).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/update')
          .set('Authorization', `Bearer ${authTokens[i + 20]}`)
          .send({ planType: 'annual' })
      );

      const cancelPromises = Array(5).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/cancel')
          .set('Authorization', `Bearer ${authTokens[i + 30]}`)
      );

      const allPromises = [...statusPromises, ...updatePromises, ...cancelPromises];
      const responses = await Promise.all(allPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(30); // At least 85% success

      console.log(`Mixed load test (35 requests): ${successfulResponses.length} successful`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should maintain response times under load', async () => {
      db.query.mockResolvedValue({ 
        rows: [{ 
          id: 1,
          plan_type: 'monthly',
          status: 'active',
          current_period_end: '2022-02-01T00:00:00.000Z'
        }] 
      });

      const responseTimes = [];
      
      // Sequential requests to measure individual response times
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/subscription/status')
          .set('Authorization', `Bearer ${authTokens[i]}`);
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);
        
        expect(response.status).toBe(200);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      // Performance assertions
      expect(averageResponseTime).toBeLessThan(500); // Average under 500ms
      expect(maxResponseTime).toBeLessThan(1000); // Max under 1 second

      console.log(`Response time stats:`);
      console.log(`  Average: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`  Min: ${minResponseTime}ms`);
      console.log(`  Max: ${maxResponseTime}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during high load', async () => {
      const initialMemory = process.memoryUsage();
      
      db.query.mockResolvedValue({ rows: [] });

      // Perform many requests to test for memory leaks
      for (let batch = 0; batch < 5; batch++) {
        const promises = Array(20).fill().map((_, i) => 
          request(app)
            .get('/api/subscription/status')
            .set('Authorization', `Bearer ${authTokens[i]}`)
        );
        
        await Promise.all(promises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      console.log(`Memory usage:`);
      console.log(`  Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });
}); 