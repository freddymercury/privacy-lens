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
  normalizeUrl: jest.fn((url) => url.toLowerCase())
}));

jest.mock('../../../shared/assessment/llm.js', () => ({
  computeTextHash: jest.fn((text) => 'mock-hash-' + text.length),
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

describe('Assessment Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/assessment', () => {
    it('should return assessment for existing URL', async () => {
      const mockAssessment = {
        url: 'example.com',
        user_agreement_url: 'example.com/privacy',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: { 'Data Collection': { risk: 'Medium' } },
          summary: 'Test assessment'
        },
        last_updated: '2023-01-01T00:00:00Z'
      };

      // Mock database response
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
        .query({ url: 'example.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.assessment).toEqual({
        url: 'example.com',
        riskLevel: 'Medium',
        categories: { 'Data Collection': { risk: 'Medium' } },
        summary: 'Test assessment',
        lastUpdated: '2023-01-01T00:00:00Z',
        policyUrl: 'example.com/privacy'
      });
    });

    it('should return null assessment for non-existent URL', async () => {
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
        .query({ url: 'nonexistent.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.assessment).toBeNull();
    });

    it('should return 400 if URL parameter is missing', async () => {
      const response = await request(app)
        .get('/api/assessment');

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('URL parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: new Error('Database error') })
          })
        })
      });

      const response = await request(app)
        .get('/api/assessment')
        .query({ url: 'example.com' });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to get assessment');
    });
  });

  describe('POST /api/trigger-assessment/:url', () => {
    const validAssessmentData = {
      manualText: 'This is a privacy policy text that mentions data collection and sharing.'
    };

    it('should trigger assessment successfully with manual text', async () => {
      const mockAssessmentObject = {
        url: 'example.com',
        user_agreement_url: 'example.com',
        user_agreement_hash: 'mock-hash-67',
        privacy_assessment: {
          riskLevel: 'Medium',
          categories: { 'Data Collection & Use': { risk: 'Medium' } },
          summary: 'Privacy policy assessment for example.com. Risk level: Medium'
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

      createAssessment.mockReturnValue(mockAssessmentObject);

      // Mock database upsert
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSavedAssessment, error: null })
          })
        })
      });

      const response = await request(app)
        .post('/api/trigger-assessment/example.com')
        .send(validAssessmentData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.assessment).toEqual({
        url: 'example.com',
        riskLevel: 'Medium',
        categories: { 'Data Collection & Use': { risk: 'Medium' } },
        summary: 'Privacy policy assessment for example.com. Risk level: Medium',
        lastUpdated: '2023-01-01T00:00:00Z',
        policyUrl: 'example.com'
      });
    });

    it('should return 400 if URL parameter is missing', async () => {
      const response = await request(app)
        .post('/api/trigger-assessment/')
        .send(validAssessmentData);

      expect(response.status).toBe(404); // Express returns 404 for missing route params
    });

    it('should return 400 if manual text is missing', async () => {
      const response = await request(app)
        .post('/api/trigger-assessment/example.com')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Manual text is required for assessment in client API. Automated assessment not yet implemented.');
    });

    it('should handle database save errors gracefully', async () => {
      createAssessment.mockReturnValue({
        url: 'example.com',
        user_agreement_url: 'example.com',
        user_agreement_hash: 'mock-hash-67',
        privacy_assessment: { riskLevel: 'Medium' },
        last_updated: '2023-01-01T00:00:00Z',
        manual_entry: true
      });

      // Mock database error
      supabaseServiceRole.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: new Error('Database error') })
          })
        })
      });

      const response = await request(app)
        .post('/api/trigger-assessment/example.com')
        .send(validAssessmentData);

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to trigger assessment');
    });
  });

  describe('POST /api/report-unassessed', () => {
    it('should report unassessed URL successfully', async () => {
      // Mock check for existing assessment (not found)
      supabaseServiceRole.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      // Mock insert into unassessed_urls
      supabaseServiceRole.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'newsite.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('URL added to unassessed queue');
    });

    it('should return success if URL already has assessment', async () => {
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
        .send({ url: 'existing.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('URL already has an assessment');
    });

    it('should return 400 if URL is missing', async () => {
      const response = await request(app)
        .post('/api/report-unassessed')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('URL is required');
    });

    it('should handle database check errors gracefully', async () => {
      // Mock database error during check
      supabaseServiceRole.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: new Error('Database error') 
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'test.com' });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to report unassessed URL');
    });

    it('should handle database insert errors gracefully', async () => {
      // Mock check for existing assessment (not found)
      supabaseServiceRole.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          })
        })
      });

      // Mock insert error
      supabaseServiceRole.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ error: new Error('Insert error') })
      });

      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'newsite.com' });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to report unassessed URL');
    });
  });
}); 