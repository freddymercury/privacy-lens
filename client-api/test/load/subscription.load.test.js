const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';

// Mock the shared modules
jest.mock('@privacy-lens/shared', () => ({
  db: {
    queries: {
      getUserSubscription: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn()
    }
  },
  subscription: {
    core: {
      validatePlanType: jest.fn(),
      calculateSubscriptionStatus: jest.fn(),
      transformSubscriptionData: jest.fn()
    },
    stripe: {
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      constructWebhookEvent: jest.fn()
    }
  },
  auth: {
    service: {
      validateToken: jest.fn()
    }
  }
}));

const { db, subscription, auth } = require('@privacy-lens/shared');

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
    
    // Set up default auth validation
    auth.service.validateToken.mockResolvedValue({
      sub: 1,
      tier: 'free',
      features: [],
      device_id: 'device123'
    });
  });

  describe('Subscription Status Load Test', () => {
    test('should handle 50 concurrent status requests', async () => {
      // Mock subscription data for all users
      db.queries.getUserSubscription.mockResolvedValue({
        id: 1,
        plan_type: 'monthly',
        status: 'active',
        current_period_end: '2022-02-01T00:00:00.000Z',
        stripe_subscription_id: 'sub_123'
      });

      subscription.core.calculateSubscriptionStatus.mockReturnValue({
        active: true,
        planType: 'monthly',
        status: 'active',
        currentPeriodEnd: '2022-02-01T00:00:00.000Z'
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
        expect(response.body.status).toBe('success');
        expect(response.body.subscription).toBeDefined();
        expect(response.body.subscription.active).toBe(true);
      });

      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(responses.length).toBe(50);

      console.log(`50 concurrent status requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 50}ms per request`);
    });

    test('should handle 100 concurrent status requests for free tier users', async () => {
      // Mock no subscription (free tier)
      db.queries.getUserSubscription.mockResolvedValue(null);

      subscription.core.calculateSubscriptionStatus.mockReturnValue({
        active: false,
        planType: 'free',
        status: 'inactive',
        currentPeriodEnd: null
      });

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

      // All requests should succeed
      const successfulResponses = responses.filter(r => r.status === 200);

      expect(successfulResponses.length).toBe(100);
      
      successfulResponses.forEach(response => {
        expect(response.body.status).toBe('success');
        expect(response.body.subscription.active).toBe(false);
        expect(response.body.subscription.planType).toBe('free');
      });

      console.log(`100 concurrent free tier status requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 100}ms per request`);
    });
  });

  describe('Subscription Creation Load Test', () => {
    test('should handle 20 concurrent subscription creations', async () => {
      // Mock successful subscription creation
      subscription.core.validatePlanType.mockReturnValue(true);
      
      subscription.stripe.createCustomer.mockResolvedValue({
        id: 'cus_123',
        email: 'test@example.com'
      });

      subscription.stripe.createSubscription.mockResolvedValue({
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

      db.queries.createSubscription.mockResolvedValue({
        id: 1,
        user_id: 1,
        plan_type: 'monthly',
        status: 'active',
        stripe_subscription_id: 'sub_123'
      });

      subscription.core.transformSubscriptionData.mockReturnValue({
        id: 'sub_123',
        planType: 'monthly',
        status: 'active',
        currentPeriodEnd: '2022-02-01T00:00:00.000Z'
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
        expect(response.body.status).toBe('success');
        expect(response.body.subscription).toBeDefined();
        expect(response.body.subscription.planType).toBe('monthly');
      });

      console.log(`20 concurrent subscription creations: ${successfulResponses.length} successful, ${errorResponses.length} errors`);
      console.log(`Completed in ${duration}ms`);
    });

    test('should handle subscription creation with payment failures', async () => {
      // Mock payment failures for some requests
      let requestCount = 0;
      subscription.stripe.createSubscription.mockImplementation(() => {
        requestCount++;
        if (requestCount % 3 === 0) {
          throw new Error('Payment failed');
        }
        return Promise.resolve({
          id: 'sub_123',
          status: 'active',
          current_period_start: 1640995200,
          current_period_end: 1643673600
        });
      });

      subscription.core.validatePlanType.mockReturnValue(true);
      subscription.stripe.createCustomer.mockResolvedValue({ id: 'cus_123' });
      db.queries.createSubscription.mockResolvedValue({ id: 1 });

      const startTime = Date.now();
      
      // Create 15 concurrent requests
      const promises = Array(15).fill().map((_, i) => 
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

      const successfulResponses = responses.filter(r => r.status === 200);
      const failedResponses = responses.filter(r => r.status >= 400);

      expect(successfulResponses.length).toBeGreaterThan(8); // Some should succeed
      expect(failedResponses.length).toBeGreaterThan(3); // Some should fail

      console.log(`15 concurrent creations with failures: ${successfulResponses.length} successful, ${failedResponses.length} failed`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Subscription Update Load Test', () => {
    test('should handle 25 concurrent subscription updates', async () => {
      // Mock existing subscription
      db.queries.getUserSubscription.mockResolvedValue({
        id: 1,
        plan_type: 'monthly',
        status: 'active',
        stripe_subscription_id: 'sub_123'
      });

      subscription.core.validatePlanType.mockReturnValue(true);
      
      subscription.stripe.updateSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600
      });

      db.queries.updateSubscription.mockResolvedValue({
        id: 1,
        plan_type: 'annual',
        status: 'active'
      });

      subscription.core.transformSubscriptionData.mockReturnValue({
        id: 'sub_123',
        planType: 'annual',
        status: 'active'
      });

      const startTime = Date.now();
      
      // Create 25 concurrent update requests
      const promises = Array(25).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/update')
          .set('Authorization', `Bearer ${authTokens[i]}`)
          .send({ planType: 'annual' })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status === 200);

      expect(successfulResponses.length).toBeGreaterThan(20); // At least 80% success
      
      successfulResponses.forEach(response => {
        expect(response.body.status).toBe('success');
        expect(response.body.subscription).toBeDefined();
      });

      console.log(`25 concurrent subscription updates completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 25}ms per request`);
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

      subscription.stripe.constructWebhookEvent.mockReturnValue(mockEvent);
      
      // Mock finding subscription
      db.queries.getUserSubscription.mockResolvedValue({ 
        id: 1, 
        user_id: 'user123',
        stripe_subscription_id: 'sub_123'
      });

      db.queries.updateSubscription.mockResolvedValue({
        id: 1,
        status: 'active'
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

      // Verify all webhooks were processed
      const successfulResponses = responses.filter(r => r.status === 200);

      expect(successfulResponses.length).toBeGreaterThan(25); // At least 80% success
      
      successfulResponses.forEach(response => {
        expect(response.body.status).toBe('success');
      });

      console.log(`30 concurrent webhook requests processed in ${duration}ms`);
      console.log(`Average response time: ${duration / 30}ms per request`);
    });

    test('should handle invalid webhook signatures gracefully', async () => {
      // Mock webhook signature validation failure
      subscription.stripe.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const startTime = Date.now();
      
      // Create 20 concurrent requests with invalid signatures
      const promises = Array(20).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/webhook')
          .set('stripe-signature', `invalid_signature_${i}`)
          .send(JSON.stringify({ id: `evt_${i}`, type: 'test' }))
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should fail gracefully
      responses.forEach(response => {
        expect(response.status).toBe(400);
        expect(response.body.status).toBe('error');
      });

      console.log(`20 concurrent invalid webhook requests handled in ${duration}ms`);
    });
  });

  describe('Mixed Subscription Operations Load Test', () => {
    test('should handle mixed subscription operations under load', async () => {
      // Set up mocks for different operations
      db.queries.getUserSubscription.mockResolvedValue({
        id: 1,
        plan_type: 'monthly',
        status: 'active',
        stripe_subscription_id: 'sub_123'
      });

      subscription.core.calculateSubscriptionStatus.mockReturnValue({
        active: true,
        planType: 'monthly',
        status: 'active'
      });

      subscription.core.validatePlanType.mockReturnValue(true);
      subscription.stripe.createCustomer.mockResolvedValue({ id: 'cus_123' });
      subscription.stripe.createSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });
      subscription.stripe.updateSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });

      db.queries.createSubscription.mockResolvedValue({ id: 1 });
      db.queries.updateSubscription.mockResolvedValue({ id: 1 });

      const startTime = Date.now();
      
      // Create mixed requests: 15 status, 10 creates, 10 updates
      const statusPromises = Array(15).fill().map((_, i) => 
        request(app)
          .get('/api/subscription/status')
          .set('Authorization', `Bearer ${authTokens[i]}`)
      );

      const createPromises = Array(10).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/create')
          .set('Authorization', `Bearer ${authTokens[i + 15]}`)
          .send({
            planType: 'monthly',
            paymentMethodId: `pm_test_${i}`
          })
      );

      const updatePromises = Array(10).fill().map((_, i) => 
        request(app)
          .post('/api/subscription/update')
          .set('Authorization', `Bearer ${authTokens[i + 25]}`)
          .send({ planType: 'annual' })
      );

      const allPromises = [...statusPromises, ...createPromises, ...updatePromises];
      const responses = await Promise.all(allPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status < 400);
      expect(successfulResponses.length).toBeGreaterThan(30); // At least 85% success

      console.log(`Mixed subscription load test (35 requests): ${successfulResponses.length} successful`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should maintain response times under load', async () => {
      db.queries.getUserSubscription.mockResolvedValue({
        id: 1,
        plan_type: 'monthly',
        status: 'active'
      });

      subscription.core.calculateSubscriptionStatus.mockReturnValue({
        active: true,
        planType: 'monthly',
        status: 'active'
      });

      const responseTimes = [];
      
      // Sequential requests to measure individual response times
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/subscription/status')
          .set('Authorization', `Bearer ${authTokens[0]}`);
        
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

      console.log(`Subscription response time stats:`);
      console.log(`  Average: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`  Min: ${minResponseTime}ms`);
      console.log(`  Max: ${maxResponseTime}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during high subscription load', async () => {
      const initialMemory = process.memoryUsage();
      
      db.queries.getUserSubscription.mockResolvedValue({
        id: 1,
        plan_type: 'monthly',
        status: 'active'
      });

      subscription.core.calculateSubscriptionStatus.mockReturnValue({
        active: true,
        planType: 'monthly',
        status: 'active'
      });

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
      
      // Memory increase should be reasonable (less than 25MB)
      expect(memoryIncrease).toBeLessThan(25 * 1024 * 1024);
      
      console.log(`Subscription memory usage:`);
      console.log(`  Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });
}); 