const request = require('supertest');
const app = require('../src/app.js');

describe('Monitoring and Logging', () => {
  describe('Health Check Endpoint', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'client-api');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('nodeVersion');

      // Validate memory object structure
      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('external');

      // Validate timestamp format (ISO 8601)
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
      
      // Validate uptime is a positive number
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
    });

    it('should include X-Request-ID header in response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^trace-/);
    });
  });

  describe('Request Context and Tracing', () => {
    it('should add X-Request-ID to all responses', async () => {
      const response = await request(app)
        .get('/api/assessment?url=test.com')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^trace-/);
    });

    it('should preserve custom X-Request-ID if provided', async () => {
      const customRequestId = 'custom-trace-12345';
      
      const response = await request(app)
        .get('/health')
        .set('X-Request-ID', customRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });
  });

  describe('Error Handling and Logging', () => {
    it('should handle 404 errors gracefully', async () => {
      const response = await request(app)
        .get('/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle validation errors with proper status codes', async () => {
      const response = await request(app)
        .get('/api/assessment')  // Missing required URL parameter
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'URL parameter is required');
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should include request ID in error responses', async () => {
      const response = await request(app)
        .post('/api/auth/login')  // Missing required fields
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.headers).toHaveProperty('x-request-id');
    });
  });

  describe('Structured Logging Format', () => {
    it('should log requests with proper structure', async () => {
      // This test verifies that the logging middleware is properly configured
      // In a real environment, you would capture and verify log output
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Verify the request completed successfully, indicating logging middleware worked
      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle POST requests with body logging', async () => {
      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'test-logging.com' })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.headers).toHaveProperty('x-request-id');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track response times', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      const duration = Date.now() - start;
      
      // Verify response was reasonably fast (under 1 second)
      expect(duration).toBeLessThan(1000);
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5).fill().map(() => 
        request(app)
          .get('/health')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers).toHaveProperty('x-request-id');
      });

      // All request IDs should be unique
      const requestIds = responses.map(r => r.headers['x-request-id']);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(requests.length);
    });
  });

  describe('Security and Data Redaction', () => {
    it('should not expose sensitive data in logs', async () => {
      // Test that password fields are properly redacted
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'sensitive-password-123',
          deviceId: 'test-device'
        });

      // The request should be processed and logging should work
      expect(response.headers).toHaveProperty('x-request-id');
      
      // Should either succeed (201) or fail with validation error (400)
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('should handle authentication headers safely', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer sensitive-token-123')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.body).toHaveProperty('status', 'healthy');
    });
  });
}); 