const request = require('supertest');
const express = require('express');
const authRoutes = require('../../src/routes/auth.js');

// Mock the auth controller
jest.mock('../../src/controllers/authController.js', () => ({
  register: jest.fn((req, res) => res.status(201).json({ status: 'success', message: 'register called' })),
  login: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'login called' })),
  validate: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'validate called' })),
  refresh: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'refresh called' })),
  revoke: jest.fn((req, res) => res.status(200).json({ status: 'success', message: 'revoke called' }))
}));

const authController = require('../../src/controllers/authController.js');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should route to register controller', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123', deviceId: 'device123' });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('register called');
      expect(authController.register).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON body parsing', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123', deviceId: 'device123' });

      const req = authController.register.mock.calls[0][0];
      expect(req.body).toEqual({
        email: 'test@example.com',
        password: 'password123',
        deviceId: 'device123'
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should route to login controller', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123', deviceId: 'device123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('login called');
      expect(authController.login).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/auth/validate', () => {
    it('should route to validate controller', async () => {
      const response = await request(app)
        .post('/api/auth/validate')
        .send({ token: 'test-token' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('validate called');
      expect(authController.validate).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should route to refresh controller', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token: 'test-token' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('refresh called');
      expect(authController.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/auth/revoke', () => {
    it('should route to revoke controller', async () => {
      const response = await request(app)
        .post('/api/auth/revoke')
        .send({ token: 'test-token' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('revoke called');
      expect(authController.revoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invalid routes', () => {
    it('should return 404 for GET requests to auth endpoints', async () => {
      const response = await request(app)
        .get('/api/auth/login');

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent auth endpoints', async () => {
      const response = await request(app)
        .post('/api/auth/nonexistent');

      expect(response.status).toBe(404);
    });
  });
}); 