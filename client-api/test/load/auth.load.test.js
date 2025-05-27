const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';

// Mock the shared modules
jest.mock('@privacy-lens/shared', () => ({
  db: {
    queries: {
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
      createAuditLog: jest.fn(),
      getUserSubscription: jest.fn()
    }
  },
  auth: {
    password: {
      hashPasswordForRegistration: jest.fn(),
      comparePassword: jest.fn()
    },
    service: {
      generateToken: jest.fn(),
      validateToken: jest.fn(),
      refreshToken: jest.fn(),
      revokeToken: jest.fn()
    }
  }
}));

const { db, auth } = require('@privacy-lens/shared');

describe('Authentication Load Tests', () => {
  let testUsers;
  let authTokens;

  beforeAll(() => {
    // Create test user data
    testUsers = Array(100).fill().map((_, i) => ({
      id: `user${i}`,
      email: `test${i}@example.com`,
      name: `Test User ${i}`,
      password_hash: 'hashed_password_123'
    }));

    // Create auth tokens for testing
    authTokens = testUsers.map(user => 
      jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET)
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Login Load Test', () => {
    test('should handle 50 concurrent login requests', async () => {
      // Mock successful login responses
      db.queries.getUserByEmail.mockResolvedValue(testUsers[0]);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.generateToken
        .mockResolvedValueOnce('temp_token_for_subscription_check')
        .mockResolvedValue('final_jwt_token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'premium' });
      db.queries.createAuditLog.mockResolvedValue({});

      const startTime = Date.now();
      
      // Create 50 concurrent login requests
      const promises = Array(50).fill().map((_, i) => 
        request(app)
          .post('/api/auth/login')
          .send({
            email: `test${i % 10}@example.com`, // Reuse 10 different emails
            password: 'password123',
            deviceId: 'device123'
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.token).toBeDefined();
        expect(response.body.user).toBeDefined();
      });

      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(responses.length).toBe(50);

      console.log(`50 concurrent login requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 50}ms per request`);
    });

    test('should handle 100 concurrent login requests with mixed success/failure', async () => {
      // Mock mixed responses - some succeed, some fail
      db.queries.getUserByEmail.mockImplementation((email) => {
        const userIndex = parseInt(email.match(/test(\d+)/)[1]);
        if (userIndex % 3 === 0) {
          return Promise.resolve(null); // User not found
        }
        return Promise.resolve(testUsers[userIndex % testUsers.length]);
      });

      auth.password.comparePassword.mockImplementation(() => {
        return Promise.resolve(Math.random() > 0.2); // 80% success rate
      });

      auth.service.generateToken
        .mockResolvedValueOnce('temp_token')
        .mockResolvedValue('final_token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'free' });
      db.queries.createAuditLog.mockResolvedValue({});

      const startTime = Date.now();
      
      // Create 100 concurrent login requests
      const promises = Array(100).fill().map((_, i) => 
        request(app)
          .post('/api/auth/login')
          .send({
            email: `test${i}@example.com`,
            password: 'password123',
            deviceId: 'device123'
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const successfulResponses = responses.filter(r => r.status === 200);
      const failedResponses = responses.filter(r => r.status >= 400);

      expect(successfulResponses.length).toBeGreaterThan(40); // At least 40% success
      expect(successfulResponses.length + failedResponses.length).toBe(100);

      console.log(`100 concurrent login requests: ${successfulResponses.length} successful, ${failedResponses.length} failed`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Token Validation Load Test', () => {
    test('should handle 75 concurrent token validation requests', async () => {
      // Mock successful token validation
      auth.service.validateToken.mockResolvedValue({
        sub: 1,
        tier: 'premium',
        features: ['advanced_analysis', 'bulk_assessment'],
        device_id: 'device123',
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const startTime = Date.now();
      
      // Create 75 concurrent validation requests
      const promises = Array(75).fill().map((_, i) => 
        request(app)
          .post('/api/auth/validate')
          .send({ token: authTokens[i % authTokens.length] })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.valid).toBe(true);
        expect(response.body.payload).toBeDefined();
      });

      // Performance assertions
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      expect(responses.length).toBe(75);

      console.log(`75 concurrent token validation requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 75}ms per request`);
    });

    test('should handle invalid tokens gracefully under load', async () => {
      // Mock token validation failures
      auth.service.validateToken.mockResolvedValue(null);

      const startTime = Date.now();
      
      // Create 50 concurrent requests with invalid tokens
      const promises = Array(50).fill().map((_, i) => 
        request(app)
          .post('/api/auth/validate')
          .send({ token: `invalid_token_${i}` })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should fail gracefully
      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.body.status).toBe('error');
        expect(response.body.message).toBe('Invalid or expired token');
      });

      console.log(`50 concurrent invalid token requests handled in ${duration}ms`);
    });
  });

  describe('Token Refresh Load Test', () => {
    test('should handle 40 concurrent token refresh requests', async () => {
      // Mock successful token refresh
      auth.service.refreshToken.mockResolvedValue('new_refreshed_token');

      const startTime = Date.now();
      
      // Create 40 concurrent refresh requests
      const promises = Array(40).fill().map((_, i) => 
        request(app)
          .post('/api/auth/refresh')
          .send({ token: `refresh_token_${i}` })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.token).toBeDefined();
      });

      console.log(`40 concurrent token refresh requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 40}ms per request`);
    });
  });

  describe('Registration Load Test', () => {
    test('should handle 30 concurrent registration requests', async () => {
      // Mock successful registration
      db.queries.getUserByEmail.mockResolvedValue(null); // No existing user
      auth.password.hashPasswordForRegistration.mockResolvedValue('hashed_password_123');
      db.queries.createUser.mockResolvedValue({ 
        id: 'new_user_123',
        email: 'newuser@example.com',
        name: 'New User'
      });
      auth.service.generateToken.mockResolvedValue('access_token_123');
      db.queries.createAuditLog.mockResolvedValue({});

      const startTime = Date.now();
      
      // Create 30 concurrent registration requests
      const promises = Array(30).fill().map((_, i) => 
        request(app)
          .post('/api/auth/register')
          .send({
            email: `newuser${i}@example.com`,
            password: 'password123',
            name: `New User ${i}`,
            deviceId: 'device123'
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.status).toBe('success');
        expect(response.body.user).toBeDefined();
        expect(response.body.token).toBeDefined();
      });

      console.log(`30 concurrent registration requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 30}ms per request`);
    });
  });

  describe('Logout Load Test', () => {
    test('should handle 60 concurrent logout requests', async () => {
      // Mock successful logout
      auth.service.revokeToken.mockResolvedValue(true);

      const startTime = Date.now();
      
      // Create 60 concurrent logout requests
      const promises = Array(60).fill().map((_, i) => 
        request(app)
          .post('/api/auth/revoke')
          .send({ token: authTokens[i % authTokens.length] })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.message).toBe('Token revoked successfully');
      });

      console.log(`60 concurrent logout requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 60}ms per request`);
    });
  });

  describe('Mixed Authentication Load Test', () => {
    test('should handle mixed authentication operations under load', async () => {
      // Set up mocks for different operations
      db.queries.getUserByEmail.mockResolvedValue(testUsers[0]);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.validateToken.mockResolvedValue({
        sub: 1,
        tier: 'premium',
        features: ['advanced_analysis'],
        device_id: 'device123'
      });
      auth.service.generateToken
        .mockResolvedValueOnce('temp_token')
        .mockResolvedValue('final_token');
      auth.service.refreshToken.mockResolvedValue('new_refreshed_token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'premium' });
      db.queries.createAuditLog.mockResolvedValue({});

      const startTime = Date.now();
      
      // Create mixed requests: 20 logins, 20 validations, 10 refreshes
      const loginPromises = Array(20).fill().map((_, i) => 
        request(app)
          .post('/api/auth/login')
          .send({
            email: `test${i}@example.com`,
            password: 'password123',
            deviceId: 'device123'
          })
      );

      const validatePromises = Array(20).fill().map((_, i) => 
        request(app)
          .post('/api/auth/validate')
          .send({ token: authTokens[i] })
      );

      const refreshPromises = Array(10).fill().map((_, i) => 
        request(app)
          .post('/api/auth/refresh')
          .send({ token: `refresh_token_${i}` })
      );

      const allPromises = [...loginPromises, ...validatePromises, ...refreshPromises];
      const responses = await Promise.all(allPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status < 400);
      expect(successfulResponses.length).toBeGreaterThan(45); // At least 90% success

      console.log(`Mixed auth load test (50 requests): ${successfulResponses.length} successful`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should maintain response times under load', async () => {
      db.queries.getUserByEmail.mockResolvedValue(testUsers[0]);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.generateToken
        .mockResolvedValueOnce('temp_token')
        .mockResolvedValue('final_token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'premium' });
      db.queries.createAuditLog.mockResolvedValue({});

      const responseTimes = [];
      
      // Sequential requests to measure individual response times
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123',
            deviceId: 'device123'
          });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);
        
        expect(response.status).toBe(200);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      // Performance assertions
      expect(averageResponseTime).toBeLessThan(300); // Average under 300ms
      expect(maxResponseTime).toBeLessThan(800); // Max under 800ms

      console.log(`Auth response time stats:`);
      console.log(`  Average: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`  Min: ${minResponseTime}ms`);
      console.log(`  Max: ${maxResponseTime}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during high auth load', async () => {
      const initialMemory = process.memoryUsage();
      
      db.queries.getUserByEmail.mockResolvedValue(testUsers[0]);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.generateToken
        .mockResolvedValueOnce('temp_token')
        .mockResolvedValue('final_token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'premium' });
      db.queries.createAuditLog.mockResolvedValue({});

      // Perform many requests to test for memory leaks
      for (let batch = 0; batch < 5; batch++) {
        const promises = Array(20).fill().map((_, i) => 
          request(app)
            .post('/api/auth/login')
            .send({
              email: `test${i}@example.com`,
              password: 'password123',
              deviceId: 'device123'
            })
        );
        
        await Promise.all(promises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 30MB)
      expect(memoryIncrease).toBeLessThan(30 * 1024 * 1024);
      
      console.log(`Auth memory usage:`);
      console.log(`  Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });
}); 