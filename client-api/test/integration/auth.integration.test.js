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

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration Flow', () => {
    it('should complete full registration flow successfully', async () => {
      // Setup mocks for successful registration
      db.queries.getUserByEmail.mockResolvedValue(null);
      auth.password.hashPasswordForRegistration.mockResolvedValue('hashed_password_123');
      db.queries.createUser.mockResolvedValue({
        id: 1,
        email: 'newuser@example.com',
        name: 'New User',
        username: 'newuser',
        role: 'user'
      });
      auth.service.generateToken.mockResolvedValue('jwt_token_abc123');
      db.queries.createAuditLog.mockResolvedValue({});

      const registrationData = {
        email: 'newuser@example.com',
        password: 'securePassword123',
        name: 'New User',
        deviceId: 'device_abc123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(registrationData)
        .expect(201);

      // Verify response structure
      expect(response.body).toEqual({
        status: 'success',
        user: {
          id: 1,
          email: 'newuser@example.com',
          name: 'New User'
        },
        token: 'jwt_token_abc123'
      });

      // Verify all functions were called with correct parameters
      expect(db.queries.getUserByEmail).toHaveBeenCalledWith('newuser@example.com');
      expect(auth.password.hashPasswordForRegistration).toHaveBeenCalledWith('securePassword123');
      expect(db.queries.createUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        username: 'newuser',
        password_hash: 'hashed_password_123',
        name: 'New User',
        role: 'user',
        created_at: expect.any(String)
      });
      expect(auth.service.generateToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, email: 'newuser@example.com' }),
        'device_abc123',
        'free',
        expect.any(String)
      );
    });

    it('should prevent duplicate email registration', async () => {
      // Setup mocks for existing user
      db.queries.getUserByEmail.mockResolvedValue({
        id: 1,
        email: 'existing@example.com'
      });

      const registrationData = {
        email: 'existing@example.com',
        password: 'password123',
        deviceId: 'device123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(registrationData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'error',
        message: 'Email already registered'
      });

      // Verify no user creation was attempted
      expect(db.queries.createUser).not.toHaveBeenCalled();
      expect(auth.service.generateToken).not.toHaveBeenCalled();
    });
  });

  describe('User Login Flow', () => {
    it('should complete full login flow with subscription check', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
        password_hash: 'hashed_password'
      };

      // Setup mocks for successful login
      db.queries.getUserByEmail.mockResolvedValue(mockUser);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.generateToken
        .mockResolvedValueOnce('temp_token_for_subscription_check')
        .mockResolvedValueOnce('final_jwt_token');
      db.queries.getUserSubscription.mockResolvedValue({ plan_type: 'premium' });
      db.queries.createAuditLog.mockResolvedValue({});

      const loginData = {
        email: 'user@example.com',
        password: 'correctPassword',
        deviceId: 'device123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Verify response structure
      expect(response.body).toEqual({
        status: 'success',
        user: {
          id: 1,
          email: 'user@example.com',
          name: 'Test User'
        },
        token: 'final_jwt_token'
      });

      // Verify subscription check was performed
      expect(db.queries.getUserSubscription).toHaveBeenCalledWith(1, 'temp_token_for_subscription_check');
      
      // Verify final token was generated with premium tier
      expect(auth.service.generateToken).toHaveBeenLastCalledWith(
        mockUser,
        'device123',
        'premium',
        expect.any(String)
      );
    });

    it('should handle login with failed subscription check gracefully', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
        password_hash: 'hashed_password'
      };

      // Setup mocks with subscription check failure
      db.queries.getUserByEmail.mockResolvedValue(mockUser);
      auth.password.comparePassword.mockResolvedValue(true);
      auth.service.generateToken
        .mockResolvedValueOnce('temp_token')
        .mockResolvedValueOnce('final_token_free_tier');
      db.queries.getUserSubscription.mockRejectedValue(new Error('Subscription service unavailable'));
      db.queries.createAuditLog.mockResolvedValue({});

      const loginData = {
        email: 'user@example.com',
        password: 'correctPassword',
        deviceId: 'device123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Should still succeed with free tier
      expect(response.body.status).toBe('success');
      expect(response.body.token).toBe('final_token_free_tier');

      // Verify final token was generated with free tier as fallback
      expect(auth.service.generateToken).toHaveBeenLastCalledWith(
        mockUser,
        'device123',
        'free',
        expect.any(String)
      );
    });
  });

  describe('Token Validation Flow', () => {
    it('should validate token and return payload', async () => {
      const mockDecoded = {
        sub: 1,
        tier: 'premium',
        features: ['advanced_analysis', 'bulk_assessment'],
        device_id: 'device123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      auth.service.validateToken.mockResolvedValue(mockDecoded);

      const response = await request(app)
        .post('/api/auth/validate')
        .send({ token: 'valid_jwt_token' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        valid: true,
        payload: {
          userId: 1,
          tier: 'premium',
          features: ['advanced_analysis', 'bulk_assessment'],
          deviceId: 'device123'
        }
      });
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh token successfully', async () => {
      auth.service.refreshToken.mockResolvedValue('new_refreshed_token');

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token: 'old_token' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        token: 'new_refreshed_token'
      });

      expect(auth.service.refreshToken).toHaveBeenCalledWith('old_token', expect.any(String));
    });
  });

  describe('Token Revocation Flow', () => {
    it('should revoke token successfully', async () => {
      auth.service.revokeToken.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/revoke')
        .send({ token: 'token_to_revoke' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        message: 'Token revoked successfully'
      });

      expect(auth.service.revokeToken).toHaveBeenCalledWith('token_to_revoke');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      db.queries.getUserByEmail.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'password',
          deviceId: 'device123'
        })
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to login');
    });

    it('should handle authentication service errors gracefully', async () => {
      auth.service.validateToken.mockRejectedValue(new Error('JWT service unavailable'));

      const response = await request(app)
        .post('/api/auth/validate')
        .send({ token: 'some_token' })
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to validate token');
    });
  });

  describe('Health Check', () => {
    it('should respond to health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        service: 'client-api',
        timestamp: expect.any(String)
      });
    });
  });
}); 