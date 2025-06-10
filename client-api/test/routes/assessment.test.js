const request = require('supertest');
const express = require('express');
const assessmentRoutes = require('../../src/routes/assessment.js');

// Mock the assessment controller
jest.mock('../../src/controllers/assessmentController.js', () => ({
  getAssessment: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'getAssessment called' })),
  triggerAssessment: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'triggerAssessment called' })),
  reportUnassessed: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'reportUnassessed called' }))
}));

const assessmentController = require('../../src/controllers/assessmentController.js');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/assessment', assessmentRoutes);

// Add the direct routes that are in app.js
app.post('/api/trigger-assessment/:url', assessmentController.triggerAssessment);
app.post('/api/report-unassessed', assessmentController.reportUnassessed);

describe('Assessment Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/assessment', () => {
    it('should route to getAssessment controller', async () => {
      const response = await request(app)
        .get('/api/assessment')
        .query({ url: 'example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('getAssessment called');
      expect(assessmentController.getAssessment).toHaveBeenCalledTimes(1);
    });

    it('should handle query parameters', async () => {
      await request(app)
        .get('/api/assessment')
        .query({ url: 'example.com' });

      const req = assessmentController.getAssessment.mock.calls[0][0];
      expect(req.query.url).toBe('example.com');
    });

    it('should return 404 for POST requests to assessment endpoint', async () => {
      const response = await request(app)
        .post('/api/assessment');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/trigger-assessment/:url', () => {
    it('should route to triggerAssessment controller', async () => {
      const response = await request(app)
        .post('/api/trigger-assessment/example.com')
        .send({ manualText: 'Privacy policy text' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('triggerAssessment called');
      expect(assessmentController.triggerAssessment).toHaveBeenCalledTimes(1);
    });

    it('should handle URL parameters', async () => {
      await request(app)
        .post('/api/trigger-assessment/example.com')
        .send({ manualText: 'Privacy policy text' });

      const req = assessmentController.triggerAssessment.mock.calls[0][0];
      expect(req.params.url).toBe('example.com');
    });

    it('should handle JSON body parsing', async () => {
      await request(app)
        .post('/api/trigger-assessment/example.com')
        .send({ manualText: 'Privacy policy text' });

      const req = assessmentController.triggerAssessment.mock.calls[0][0];
      expect(req.body).toEqual({ manualText: 'Privacy policy text' });
    });

    it('should return 404 for missing URL parameter', async () => {
      const response = await request(app)
        .post('/api/trigger-assessment/')
        .send({ manualText: 'Privacy policy text' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/report-unassessed', () => {
    it('should route to reportUnassessed controller', async () => {
      const response = await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'newsite.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('reportUnassessed called');
      expect(assessmentController.reportUnassessed).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON body parsing', async () => {
      await request(app)
        .post('/api/report-unassessed')
        .send({ url: 'newsite.com' });

      const req = assessmentController.reportUnassessed.mock.calls[0][0];
      expect(req.body).toEqual({ url: 'newsite.com' });
    });

    it('should return 404 for GET requests to report-unassessed endpoint', async () => {
      const response = await request(app)
        .get('/api/report-unassessed');

      expect(response.status).toBe(404);
    });
  });

  describe('Invalid routes', () => {
    it('should return 404 for non-existent assessment endpoints', async () => {
      const response = await request(app)
        .get('/api/assessment/nonexistent');

      expect(response.status).toBe(404);
    });
  });
}); 