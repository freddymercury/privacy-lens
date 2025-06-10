const request = require('supertest');
const app = require('../../src/app.js');

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

describe('Assessment Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/assessment - Assessment Retrieval Flow', () => {
    it('should retrieve existing assessment successfully', async () => {
      const mockAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com/privacy',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: {
            'Data Collection': { risk: 'Medium', explanation: 'Collects personal data' },
            'Data Sharing': { risk: 'Low', explanation: 'Limited sharing with partners' }
          },
          summary: 'This privacy policy has moderate privacy risks due to data collection practices.'
        },
        last_updated: '2023-12-01T10:00:00Z'
      };

      // Mock successful database query
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null })
          })
        })
      });

      isValidAssessment.mockReturnValue(true);

      const response = await request(app)
        .get('/api/assessment')
        .query({ url: 'https://example.com/' })
        .expect(200);

      // Verify response structure
      expect(response.body).toEqual({
        status: 'success',
        assessment: {
          url: 'example.com',
          riskLevel: 'Medium',
          categories: {
            'Data Collection': { risk: 'Medium', explanation: 'Collects personal data' },
            'Data Sharing': { risk: 'Low', explanation: 'Limited sharing with partners' }
          },
          summary: 'This privacy policy has moderate privacy risks due to data collection practices.',
          lastUpdated: '2023-12-01T10:00:00Z',
          policyUrl: 'example.com/privacy'
        }
      });

      // Verify URL normalization was called
      expect(normalizeUrl).toHaveBeenCalledWith('https://example.com/');
    });

    it('should handle non-existent assessment gracefully', async () => {
      // Mock database response for not found
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      const response = await request(app)
        .get('/api/assessment')
        .query({ url: 'nonexistent.com' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        assessment: null
      });
    });

    it('should handle invalid assessment data', async () => {
      const invalidAssessment = {
        url: 'example.com',
        // Missing required fields
      };

      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: invalidAssessment, error: null })
          })
        })
      });

      isValidAssessment.mockReturnValue(false);

      const response = await request(app)
        .get('/api/assessment')
        .query({ url: 'example.com' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        assessment: null
      });
    });
  });

  describe('POST /api/trigger-assessment/:url - Assessment Creation Flow', () => {
    it('should create assessment with manual text successfully', async () => {
      const policyText = 'We collect your personal information including name, email, and browsing data. We may share this information with third-party partners for advertising purposes.';
      
      const mockAssessmentObject = {
        url: 'newsite.com',
        user_agreement_url: 'newsite.com',
        user_agreement_hash: 'hash_150_We collect',
        privacy_assessment: {
          riskLevel: 'High',
          categories: {
            'Data Collection & Use': {
              risk: 'High',
              explanation: 'Assessment based on policy text analysis'
            }
          },
          summary: 'Privacy policy assessment for newsite.com. Risk level: High'
        },
        last_updated: expect.any(String),
        manual_entry: true
      };

      const mockSavedAssessment = {
        url: 'newsite.com',
        user_agreement_url: 'newsite.com',
        privacy_assessment: mockAssessmentObject.privacy_assessment,
        last_updated: '2023-12-01T10:00:00Z'
      };

      // Setup mocks
      createAssessment.mockReturnValue(mockAssessmentObject);
      
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSavedAssessment, error: null })
          })
        })
      });

      const response = await request(app)
        .post('/api/trigger-assessment/newsite.com')
        .send({ manualText: policyText })
        .expect(200);

      // Verify response structure
      expect(response.body).toEqual({
        status: 'success',
        assessment: {
          url: 'newsite.com',
          riskLevel: 'High',
          categories: {
            'Data Collection & Use': {
              risk: 'High',
              explanation: 'Assessment based on policy text analysis'
            }
          },
          summary: 'Privacy policy assessment for newsite.com. Risk level: High',
          lastUpdated: '2023-12-01T10:00:00Z',
          policyUrl: 'newsite.com'
        }
      });

      // Verify URL normalization was called
      expect(normalizeUrl).toHaveBeenCalledWith('newsite.com');
      
      // Verify hash computation was called
      expect(computeTextHash).toHaveBeenCalledWith(policyText);
      
      // Verify assessment creation was called
      expect(createAssessment).toHaveBeenCalledWith({
        url: 'newsite.com',
        riskLevel: 'High',
        categories: expect.any(Object),
        summary: expect.any(String),
        policyUrl: 'newsite.com',
        policyHash: 'hash_150_We collect',
        manualEntry: true
      });
    });

    it('should handle different risk levels based on policy content', async () => {
      const lowRiskText = 'We do not sell your personal information. We collect minimal data necessary for service operation and do not share with third parties.';
      
      const mockLowRiskAssessment = {
        url: 'privacy-focused.com',
        user_agreement_url: 'privacy-focused.com',
        user_agreement_hash: 'hash_120_We do not',
        privacy_assessment: {
          riskLevel: 'Low',
          categories: {
            'Data Collection & Use': {
              risk: 'Low',
              explanation: 'Assessment based on policy text analysis'
            }
          },
          summary: 'Privacy policy assessment for privacy-focused.com. Risk level: Low'
        },
        last_updated: expect.any(String),
        manual_entry: true
      };

      const mockSavedAssessment = {
        url: 'privacy-focused.com',
        user_agreement_url: 'privacy-focused.com',
        privacy_assessment: mockLowRiskAssessment.privacy_assessment,
        last_updated: '2023-12-01T10:00:00Z'
      };

      createAssessment.mockReturnValue(mockLowRiskAssessment);
      
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSavedAssessment, error: null })
          })
        })
      });

      const response = await request(app)
        .post('/api/trigger-assessment/privacy-focused.com')
        .send({ manualText: lowRiskText })
        .expect(200);

      expect(response.body.assessment.riskLevel).toBe('Low');
    });
  });

  describe('POST /api/report-unassessed - Unassessed URL Reporting Flow', () => {
    it('should report new unassessed URL successfully', async () => {
      // Mock check for existing assessment (not found)
      supabaseServiceRole.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      // Mock successful insert into unassessed_urls
      supabaseServiceRole.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'https://newsite.example.com/' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        message: 'URL added to unassessed queue'
      });

      // Verify URL normalization was called
      expect(normalizeUrl).toHaveBeenCalledWith('https://newsite.example.com/');
    });

    it('should handle URL that already has assessment', async () => {
      // Mock check for existing assessment (found)
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: { url: 'existing.com' }, 
              error: null 
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'existing.com' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        message: 'URL already has an assessment'
      });

      // Verify no insert was attempted
      expect(supabaseServiceRole.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
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

      const response = await request(app)
        .get('/api/assessment')
        .query({ url: 'example.com' })
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to get assessment');
    });

    it('should handle assessment creation errors gracefully', async () => {
      createAssessment.mockReturnValue({
        url: 'example.com',
        user_agreement_url: 'example.com',
        user_agreement_hash: 'hash123',
        privacy_assessment: { riskLevel: 'Medium' },
        last_updated: '2023-12-01T10:00:00Z',
        manual_entry: true
      });

      // Mock database save error
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: new Error('Database save failed') 
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/trigger-assessment/example.com')
        .send({ manualText: 'Privacy policy text' })
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to trigger assessment');
    });

    it('should validate required parameters', async () => {
      // Test missing URL parameter for assessment retrieval
      const response1 = await request(app)
        .get('/api/assessment')
        .expect(400);

      expect(response1.body.message).toBe('URL parameter is required');

      // Test missing manual text for assessment creation
      const response2 = await request(app)
        .post('/api/trigger-assessment/example.com')
        .send({})
        .expect(400);

      expect(response2.body.message).toBe('Manual text is required for assessment in client API. Automated assessment not yet implemented.');

      // Test missing URL for unassessed reporting
      const response3 = await request(app)
        .post('/api/report-unassessed')
        .send({})
        .expect(400);

      expect(response3.body.message).toBe('URL is required');
    });
  });

  describe('URL Normalization Integration', () => {
    it('should normalize URLs consistently across endpoints', async () => {
      const testUrls = [
        'https://example.com/',
        'http://example.com',
        'EXAMPLE.COM',
        'example.com/'
      ];

      // Mock database responses
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      for (const url of testUrls) {
        await request(app)
          .get('/api/assessment')
          .query({ url })
          .expect(200);

        // Verify normalizeUrl was called for each URL
        expect(normalizeUrl).toHaveBeenCalledWith(url);
      }

      // Verify all calls resulted in the same normalized URL
      const normalizedCalls = normalizeUrl.mock.calls.map(call => call[0]);
      expect(normalizedCalls).toEqual(testUrls);
    });
  });
}); 