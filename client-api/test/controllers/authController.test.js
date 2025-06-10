const request = require('supertest');
const app = require('../../src/app.js');

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

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      deviceId: 'device123'
    };

    it('should register a new user successfully', async () => {
      // Mock database responses
      db.queries.getUserByEmail.mockResolvedValue(null);
      auth.password.hashPasswordForRegistration.mockResolvedValue('hashedPassword');
      db.queries.createUser.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User'
      });
      auth.service.generateToken.mockResolvedValue('jwt-token');
      db.queries.createAuditLog.mockResolvedValue({});

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.user).toEqual({
        id: 1,
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(response.body.token).toBe('jwt-token');
    });

    it('should return 400 if email already exists', async () => {
      db.queries.getUserByEmail.mockResolvedValue({ id: 1, email: 'test@example.com' });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Email already registered');
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' }); // Missing password and deviceId

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Email, password, and deviceId are required');
    });

    it('should handle database errors gracefully', async () => {
      db.queries.getUserByEmail.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to register user');
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'password123',
      deviceId: 'device123'
    };

    it('should login user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashedPassword'
      };

      db.queries.getUserByEmail.mockResolvedValue(mockUser);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.generateToken.mockResolvedValue('temp-token').mockResolvedValueOnce('temp-token').mockResolvedValueOnce('final-token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'premium' });
      db.queries.createAuditLog.mockResolvedValue({});

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.user).toEqual({
        id: 1,
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(response.body.token).toBe('final-token');
    });

    it('should return 401 for non-existent user', async () => {
      db.queries.getUserByEmail.mockResolvedValue(null);
      db.queries.createAuditLog.mockResolvedValue({});

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should return 401 for invalid password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password_hash: 'hashedPassword'
      };

      db.queries.getUserByEmail.mockResolvedValue(mockUser);
      auth.password.comparePassword.mockResolvedValue(false);
      db.queries.createAuditLog.mockResolvedValue({});

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' }); // Missing password and deviceId

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Email, password, and deviceId are required');
    });
  });

  describe('POST /api/auth/validate', () => {
    it('should validate token successfully', async () => {
      const mockDecoded = {
        sub: 1,
        tier: 'premium',
        features: ['feature1'],
        device_id: 'device123'
      };

      auth.service.validateToken.mockResolvedValue(mockDecoded);

      const response = await request(app)
        .post('/api/auth/validate')
        .send({ token: 'valid-token' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.valid).toBe(true);
      expect(response.body.payload).toEqual({
        userId: 1,
        tier: 'premium',
        features: ['feature1'],
        deviceId: 'device123'
      });
    });

    it('should return 401 for invalid token', async () => {
      auth.service.validateToken.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/validate')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid or expired token');
    });

    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/api/auth/validate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Token is required');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      auth.service.refreshToken.mockResolvedValue('new-token');

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token: 'old-token' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.token).toBe('new-token');
    });

    it('should return 401 for invalid token', async () => {
      auth.service.refreshToken.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid token or refresh failed');
    });

    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Token is required');
    });
  });

  describe('POST /api/auth/revoke', () => {
    it('should revoke token successfully', async () => {
      auth.service.revokeToken.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/revoke')
        .send({ token: 'valid-token' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Token revoked successfully');
    });

    it('should return 400 for failed revocation', async () => {
      auth.service.revokeToken.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/revoke')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Token revocation failed');
    });

    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/api/auth/revoke')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Token is required');
    });
  });
}); 