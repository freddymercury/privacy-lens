const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';

// Mock the shared modules and database client
jest.mock('../../../shared/db/client.js', () => ({
  supabaseServiceRole: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      upsert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }
}));

jest.mock('../../../shared/assessment/domain.js', () => ({
  normalizeUrl: jest.fn((url) => url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
}));

jest.mock('../../../shared/assessment/llm.js', () => ({
  computeTextHash: jest.fn((text) => `hash_${text.length}_${text.slice(0, 10)}`),
  createAssessmentPrompt: jest.fn()
}));

jest.mock('../../../shared/assessment/core.js', () => ({
  createAssessment: jest.fn(),
  isValidAssessment: jest.fn()
}));

const { supabaseServiceRole } = require('../../../shared/db/client.js');
const { normalizeUrl } = require('../../../shared/assessment/domain.js');
const { computeTextHash } = require('../../../shared/assessment/llm.js');
const { createAssessment, isValidAssessment } = require('../../../shared/assessment/core.js');

describe('Assessment Load Tests', () => {
  let authTokens;
  let testUrls;

  beforeAll(() => {
    // Create auth tokens for testing
    authTokens = Array(100).fill().map((_, i) => 
      jwt.sign({ id: `user${i}`, email: `test${i}@example.com` }, process.env.JWT_SECRET)
    );

    // Create test URLs
    testUrls = Array(50).fill().map((_, i) => `https://example${i}.com`);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Get Assessment Load Test', () => {
    test('should handle 60 concurrent assessment retrieval requests', async () => {
      // Mock database responses for existing assessments
      const mockAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com/privacy',
        privacy_assessment: {
          riskLevel: 'High',
          categories: {
            'Data Collection': { risk: 'High', explanation: 'Collects extensive personal data' },
            'Data Sharing': { risk: 'Medium', explanation: 'Shares with third parties' }
          },
          summary: 'High risk privacy policy with extensive data collection'
        },
        last_updated: '2023-01-01T00:00:00.000Z'
      };

      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null })
          })
        })
      });

      isValidAssessment.mockReturnValue(true);

      const startTime = Date.now();
      
      // Create 60 concurrent assessment requests
      const promises = Array(60).fill().map((_, i) => 
        request(app)
          .get('/api/assessment')
          .query({ url: testUrls[i % testUrls.length] })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.assessment).toBeDefined();
        expect(response.body.assessment.riskLevel).toBeDefined();
      });

      // Performance assertions
      expect(duration).toBeLessThan(4000); // Should complete within 4 seconds
      expect(responses.length).toBe(60);

      console.log(`60 concurrent assessment retrieval requests completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 60}ms per request`);
    });

    test('should handle 80 concurrent requests for non-existent assessments', async () => {
      // Mock database responses for non-existent assessments
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      const startTime = Date.now();
      
      // Create 80 concurrent requests for non-existent assessments
      const promises = Array(80).fill().map((_, i) => 
        request(app)
          .get('/api/assessment')
          .query({ url: `https://nonexistent${i}.com` })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests handled gracefully
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.assessment).toBeNull();
      });

      console.log(`80 concurrent non-existent assessment requests handled in ${duration}ms`);
      console.log(`Average response time: ${duration / 80}ms per request`);
    });
  });

  describe('Trigger Assessment Load Test', () => {
    test('should handle 30 concurrent assessment trigger requests', async () => {
      const mockAssessmentObject = {
        url: 'example.com',
        user_agreement_url: 'example.com',
        user_agreement_hash: 'hash_50_test',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: {
            'Data Collection & Use': { risk: 'Medium', explanation: 'Assessment based on policy text analysis' }
          },
          summary: 'Medium risk privacy policy'
        },
        last_updated: '2023-01-01T00:00:00Z',
        manual_entry: true
      };

      const mockSavedAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com',
        privacy_assessment: mockAssessmentObject.privacy_assessment,
        last_updated: '2023-01-01T00:00:00Z'
      };

      // Mock successful assessment processing
      createAssessment.mockReturnValue(mockAssessmentObject);

      // Mock database operations
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSavedAssessment, error: null })
          })
        })
      });

      const startTime = Date.now();
      
      // Create 30 concurrent trigger assessment requests
      const promises = Array(30).fill().map((_, i) => 
        request(app)
          .post(`/api/trigger-assessment/${encodeURIComponent(testUrls[i % testUrls.length])}`)
          .send({ manualText: 'Test privacy policy text for assessment' })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status === 200);
      const errorResponses = responses.filter(r => r.status >= 400);

      expect(successfulResponses.length).toBeGreaterThan(25); // At least 80% success
      
      successfulResponses.forEach(response => {
        expect(response.body.status).toBe('success');
        expect(response.body.assessment).toBeDefined();
      });

      console.log(`30 concurrent assessment triggers: ${successfulResponses.length} successful, ${errorResponses.length} errors`);
      console.log(`Completed in ${duration}ms`);
    });

    test('should handle assessment triggers with rate limiting', async () => {
      // Mock rate limiting scenario
      let requestCount = 0;
      createAssessment.mockImplementation(() => {
        requestCount++;
        if (requestCount > 20) {
          throw new Error('Rate limit exceeded');
        }
        return {
          url: 'example.com',
          user_agreement_url: 'example.com',
          user_agreement_hash: 'hash_50_test',
          privacy_assessment: {
            riskLevel: 'Low',
            categories: { 'Data Collection & Use': { risk: 'Low' } },
            summary: 'Assessment completed'
          },
          last_updated: '2023-01-01T00:00:00Z',
          manual_entry: true
        };
      });

      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: { url: 'example.com', privacy_assessment: { riskLevel: 'Low' } }, 
              error: null 
            })
          })
        })
      });

      const startTime = Date.now();
      
      // Create 40 concurrent requests to test rate limiting
      const promises = Array(40).fill().map((_, i) => 
        request(app)
          .post(`/api/trigger-assessment/${encodeURIComponent(testUrls[i % testUrls.length])}`)
          .send({ manualText: 'Test privacy policy text for assessment' })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const successfulResponses = responses.filter(r => r.status === 200);
      const errorResponses = responses.filter(r => r.status >= 400);

      expect(successfulResponses.length).toBeGreaterThan(15); // Some should succeed
      expect(errorResponses.length).toBeGreaterThan(10); // Some should fail

      console.log(`40 concurrent triggers with rate limiting: ${successfulResponses.length} successful, ${errorResponses.length} errors`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Report Unassessed Load Test', () => {
    test('should handle 50 concurrent unassessed URL reports', async () => {
      // Mock check for existing assessment (not found)
      supabaseServiceRole.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      // Mock successful database insertion
      supabaseServiceRole.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ error: null })
      });

      const startTime = Date.now();
      
      // Create 50 concurrent report unassessed requests
      const promises = Array(50).fill().map((_, i) => 
        request(app)
          .post('/api/report-unassessed')
          .send({ url: `https://unassessed${i}.com` })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.message).toContain('URL added to unassessed queue');
      });

      console.log(`50 concurrent unassessed URL reports completed in ${duration}ms`);
      console.log(`Average response time: ${duration / 50}ms per request`);
    });

    test('should handle duplicate URL reports gracefully', async () => {
      // Mock database responses for duplicate handling
      let insertCount = 0;
      supabaseServiceRole.from.mockImplementation((table) => {
        if (table === 'assessments') {
          // Check for existing assessment
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
              })
            })
          };
        } else {
          // Insert into unassessed_urls
          insertCount++;
          if (insertCount % 3 === 0) {
            // Simulate duplicate key error occasionally
            return {
              upsert: jest.fn().mockResolvedValue({ error: { code: '23505' } })
            };
          }
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
      });

      const startTime = Date.now();
      
      // Create 30 concurrent requests with some duplicates
      const promises = Array(30).fill().map((_, i) => 
        request(app)
          .post('/api/report-unassessed')
          .send({ url: `https://duplicate${i % 10}.com` }) // Only 10 unique URLs
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Most should succeed
      const successfulResponses = responses.filter(r => r.status === 200);

      expect(successfulResponses.length).toBeGreaterThan(20);

      console.log(`30 concurrent reports with duplicates: ${successfulResponses.length} successful, ${30 - successfulResponses.length} duplicates`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Mixed Assessment Load Test', () => {
    test('should handle mixed assessment operations under load', async () => {
      // Set up mocks for different operations
      const mockAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com/privacy',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: { 'Data Collection': { risk: 'Medium' } },
          summary: 'Mixed assessment test'
        },
        last_updated: '2023-01-01T00:00:00Z'
      };

      supabaseServiceRole.from.mockImplementation((table) => {
        if (table === 'assessments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null })
              })
            }),
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null })
              })
            })
          };
        } else {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
      });

      isValidAssessment.mockReturnValue(true);
      createAssessment.mockReturnValue({
        url: 'example.com',
        user_agreement_url: 'example.com',
        user_agreement_hash: 'hash_50_test',
        privacy_assessment: mockAssessment.privacy_assessment,
        last_updated: '2023-01-01T00:00:00Z',
        manual_entry: true
      });

      const startTime = Date.now();
      
      // Create mixed requests: 20 retrievals, 10 triggers, 15 reports
      const retrievalPromises = Array(20).fill().map((_, i) => 
        request(app)
          .get('/api/assessment')
          .query({ url: testUrls[i] })
      );

      const triggerPromises = Array(10).fill().map((_, i) => 
        request(app)
          .post(`/api/trigger-assessment/${encodeURIComponent(testUrls[i + 20])}`)
          .send({ manualText: 'Test privacy policy text' })
      );

      const reportPromises = Array(15).fill().map((_, i) => 
        request(app)
          .post('/api/report-unassessed')
          .send({ url: `https://mixed${i}.com` })
      );

      const allPromises = [...retrievalPromises, ...triggerPromises, ...reportPromises];
      const responses = await Promise.all(allPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify responses
      const successfulResponses = responses.filter(r => r.status < 400);
      expect(successfulResponses.length).toBeGreaterThan(40); // At least 90% success

      console.log(`Mixed assessment load test (45 requests): ${successfulResponses.length} successful`);
      console.log(`Completed in ${duration}ms`);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should maintain response times under load', async () => {
      const mockAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com/privacy',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: { 'Data Collection': { risk: 'Medium' } },
          summary: 'Performance test'
        },
        last_updated: '2023-01-01T00:00:00Z'
      };

      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null })
          })
        })
      });

      isValidAssessment.mockReturnValue(true);

      const responseTimes = [];
      
      // Sequential requests to measure individual response times
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/assessment')
          .query({ url: 'https://example.com' });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);
        
        expect(response.status).toBe(200);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      // Performance assertions
      expect(averageResponseTime).toBeLessThan(400); // Average under 400ms
      expect(maxResponseTime).toBeLessThan(1000); // Max under 1 second

      console.log(`Assessment response time stats:`);
      console.log(`  Average: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`  Min: ${minResponseTime}ms`);
      console.log(`  Max: ${maxResponseTime}ms`);
    });

    test('should maintain performance for assessment triggers', async () => {
      const mockAssessmentObject = {
        url: 'example.com',
        user_agreement_url: 'example.com',
        user_agreement_hash: 'hash_50_test',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: { 'Data Collection & Use': { risk: 'Medium' } },
          summary: 'Performance trigger test'
        },
        last_updated: '2023-01-01T00:00:00Z',
        manual_entry: true
      };

      createAssessment.mockReturnValue(mockAssessmentObject);
      
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: {
                url: 'example.com',
                privacy_assessment: mockAssessmentObject.privacy_assessment,
                last_updated: '2023-01-01T00:00:00Z'
              }, 
              error: null 
            })
          })
        })
      });

      const responseTimes = [];
      
      // Sequential trigger requests to measure response times
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post(`/api/trigger-assessment/${encodeURIComponent(`https://perf${i}.com`)}`)
          .send({ manualText: 'Test privacy policy text for performance testing' });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        responseTimes.push(responseTime);
        
        expect(response.status).toBe(200);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      // Performance assertions for more intensive operations
      expect(averageResponseTime).toBeLessThan(2000); // Average under 2 seconds
      expect(maxResponseTime).toBeLessThan(5000); // Max under 5 seconds

      console.log(`Assessment trigger response time stats:`);
      console.log(`  Average: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxResponseTime}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during high assessment load', async () => {
      const initialMemory = process.memoryUsage();
      
      const mockAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com/privacy',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: { 'Data Collection': { risk: 'Medium' } },
          summary: 'Memory test'
        },
        last_updated: '2023-01-01T00:00:00Z'
      };

      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null })
          })
        })
      });

      isValidAssessment.mockReturnValue(true);

      // Perform many requests to test for memory leaks
      for (let batch = 0; batch < 5; batch++) {
        const promises = Array(20).fill().map((_, i) => 
          request(app)
            .get('/api/assessment')
            .query({ url: `https://memory${i}.com` })
        );
        
        await Promise.all(promises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 40MB)
      expect(memoryIncrease).toBeLessThan(40 * 1024 * 1024);
      
      console.log(`Assessment memory usage:`);
      console.log(`  Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Error Handling Under Load', () => {
    test('should handle database errors gracefully under load', async () => {
      // Mock database errors
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: new Error('Database connection failed') 
            })
          })
        })
      });

      const startTime = Date.now();
      
      // Create 30 concurrent requests that will fail
      const promises = Array(30).fill().map((_, i) => 
        request(app)
          .get('/api/assessment')
          .query({ url: testUrls[i % testUrls.length] })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should fail gracefully with 500 status
      responses.forEach(response => {
        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
        expect(response.body.message).toBeDefined();
      });

      console.log(`30 concurrent database error requests handled gracefully in ${duration}ms`);
    });

    test('should handle assessment creation errors under load', async () => {
      // Mock assessment creation errors
      createAssessment.mockImplementation(() => {
        throw new Error('Assessment service unavailable');
      });

      const startTime = Date.now();
      
      // Create 20 concurrent trigger requests that will fail at assessment creation step
      const promises = Array(20).fill().map((_, i) => 
        request(app)
          .post(`/api/trigger-assessment/${encodeURIComponent(testUrls[i % testUrls.length])}`)
          .send({ manualText: 'Test privacy policy text' })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should fail gracefully
      responses.forEach(response => {
        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
      });

      console.log(`20 concurrent assessment creation error requests handled gracefully in ${duration}ms`);
    });
  });
}); 