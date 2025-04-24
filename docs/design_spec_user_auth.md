# PrivacyLens Chrome Plugin: Subscription Model Design Specification

## 1. System Overview

### 1.1 Purpose
A Chrome extension that assesses privacy policies and user agreements, with tiered access:
- Freemium: Basic functionality with plugin-only updates
- Premium: Enhanced features with server-side updates (monthly/annual subscription)

### 1.2 Core Components
1. Chrome Plugin (Client-side)
2. Backend Services
3. Database
4. Authentication System
5. Subscription Management
6. Update Distribution System

## 2. User Journey & Use Cases

### 2.1 Free User Journey
1. Installs plugin from Chrome Web Store
2. Creates account (optional)
3. Accesses basic privacy assessment features
4. Receives plugin updates only when new version is released
5. Sees upgrade options with premium features

### 2.2 Premium User Journey
1. Upgrades through in-plugin purchase flow
2. Chooses monthly or annual subscription
3. Gains immediate access to premium features
4. Receives regular server-side data updates
5. Manages subscription through account dashboard

### 2.3 Key Use Cases
1. **UC-1**: User installs and onboards with plugin
2. **UC-2**: Free user analyzes a privacy policy
3. **UC-3**: User upgrades to premium (monthly)
4. **UC-4**: User upgrades to premium (annual)
5. **UC-5**: Premium user receives data updates
6. **UC-6**: User changes from annual to monthly subscription
7. **UC-7**: User cancels subscription (returns to free)
8. **UC-8**: Admin updates privacy database (server-side)

## 3. Architecture Design

### 3.1 Component Architecture
```
┌─────────────────┐       ┌───────────────────────┐
│ Chrome Plugin   │◄──────►│ Authentication Service│
└────────┬────────┘       └───────────────────────┘
         │                            ▲
         ▼                            │
┌─────────────────┐       ┌───────────┴───────────┐
│ Plugin UI       │       │ Subscription Service  │
└────────┬────────┘       └───────────┬───────────┘
         │                            │
         ▼                            ▼
┌─────────────────┐       ┌───────────────────────┐
│ Local Database  │◄──────►│ Server Database      │
└─────────────────┘       └───────────────────────┘
                                      ▲
                                      │
                          ┌───────────┴───────────┐
                          │ Admin Dashboard       │
                          └───────────────────────┘
```

### 3.2 Data Flow
1. Authentication tokens flow from Auth Service to Plugin
2. Subscription status flows from Subscription Service to Plugin
3. Privacy data updates flow from Server DB to Local DB (premium only)
4. User interactions flow from Plugin UI to backend services

## 4. Technical Design

### 4.1 Backend Services

#### 4.1.1 Authentication Service
- **Framework**: Express.js
- **Database**: Supabase
- **Endpoints**:
  - `/api/auth/register`
  - `/api/auth/login`
  - `/api/auth/refresh`
  - `/api/auth/validate`
  - `/api/auth/revoke`

#### 4.1.2 Subscription Service
- **Framework**: Express.js
- **Database**: Supabase
- **Payment Processing**: Stripe
- **Endpoints**:
  - `/api/subscription/create`
  - `/api/subscription/update`
  - `/api/subscription/cancel`
  - `/api/subscription/status`
  - `/api/subscription/webhook` (Stripe events)

#### 4.1.3 Update Service
- **Framework**: Express.js
- **Database**: Supabase
- **Endpoints**:
  - `/api/updates/check`
  - `/api/updates/download`
  - `/api/updates/changelog`

#### 4.1.4 Admin Dashboard
- **Framework**: Express.js with EJS templates
- **Features**:
  - Privacy database management
  - User management
  - Subscription analytics
  - Update deployment

### 4.2 Chrome Plugin

#### 4.2.1 Core Components
- `background.js`: Main service worker
- `popup.js`: User interface controller
- `content.js`: Page content analyzer
- `storage.js`: Local database management
- `auth.js`: Authentication handler
- `subscription.js`: Subscription manager
- `updater.js`: Update checker and installer

#### 4.2.2 Local Database Structure
- Privacy policy templates
- Common clause analysis
- User preferences
- Authentication tokens
- Feature access flags

### 4.3 Token Authentication System

#### 4.3.1 JWT Structure
```javascript
{
  "iss": "privacy-lens",
  "sub": "user_id",
  "iat": timestamp,
  "exp": timestamp + validity_period,
  "device_id": "unique_device_identifier",
  "tier": "free|monthly|annual",
  "features": ["basic", "advanced", "premium"],
  "version": "token_version"
}
```

#### 4.3.2 Token Management
- **Free Users**: 30-day token validity
- **Premium Users**: 7-day token validity
- **Max Active Tokens**: 5 per user
- **Token Refresh**: Silent background refresh when 80% of validity elapsed
- **Plan Change Handling**: 
  - Token metadata update on next refresh
  - No immediate invalidation on plan changes
  - Graceful degradation for downgraded users

## 5. UI/UX Design

### 5.1 Chrome Plugin UI

#### 5.1.1 Main Interface
- Simple toggle for activation
- Status indicator (free/premium)
- Analysis results view
- Settings menu
- Account/subscription section

#### 5.1.2 Subscription UI Flow
- "Upgrade" button (for free users)
- Plan selection (monthly/annual)
- Payment processing
- Confirmation screen
- Success/failure notification

#### 5.1.3 Update Notification UI
- Badge indicator for available updates
- Update history view
- Feature highlights for premium updates

### 5.2 Feature Differentiation

#### 5.2.1 Free Features
- Basic privacy policy scanning
- Simple risk assessment
- Limited history

#### 5.2.2 Premium Features
- Advanced risk analysis
- Real-time database updates
- Historical comparison
- Export functionality
- Custom alerts

## 6. Implementation Plan

### 6.1 Backend Modifications

#### 6.1.1 package.json Additions
```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.0",
    "stripe": "^12.0.0",
    "redis": "^4.6.4",
    "node-schedule": "^2.1.1"
  }
}
```

#### 6.1.2 New Backend Services
1. Token management service
2. Subscription handling service  
3. Data update distribution service

### 6.2 Chrome Plugin Modifications

#### 6.2.1 package.json Additions
```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.0",
    "localforage": "^1.10.0",
    "axios": "^1.3.4"
  }
}
```

#### 6.2.2 Manifest.json Permissions
```json
{
  "permissions": [
    "storage",
    "identity",
    "alarms",
    "tabs"
  ],
  "host_permissions": [
    "https://api.privacy-lens.example.com/*"
  ]
}
```

## 7. Testing Strategy

### 7.1 Testing Environment Setup

#### 7.1.1 Backend Testing Environment
```javascript
// backend/test/setup.js
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const stripe = require('stripe');

// Mock Supabase client
jest.mock('../src/utils/supabaseClient', () => {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(() => {
      return { data: mockData, error: null };
    })
  };
});

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    return {
      customers: {
        create: jest.fn().mockResolvedValue({ id: 'cus_mock123' }),
        update: jest.fn().mockResolvedValue({ id: 'cus_mock123' })
      },
      paymentMethods: {
        attach: jest.fn().mockResolvedValue({ id: 'pm_mock123' })
      },
      subscriptions: {
        create: jest.fn().mockResolvedValue({
          id: 'sub_mock123',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          latest_invoice: {
            payment_intent: {
              client_secret: 'pi_mock_secret'
            }
          }
        }),
        update: jest.fn().mockResolvedValue({ id: 'sub_mock123' }),
        cancel: jest.fn().mockResolvedValue({ id: 'sub_mock123', status: 'canceled' }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'sub_mock123',
          items: {
            data: [{ id: 'si_mock123' }]
          }
        })
      }
    };
  });
});

// Mock Redis client
jest.mock('redis', () => {
  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0)
  };
  
  return {
    createClient: jest.fn().mockReturnValue(mockRedisClient)
  };
});

// Global test setup
global.setupTestDatabase = async () => {
  // Create test tables and seed data
  // This would typically use a test database or transaction
};

// Global test teardown
global.teardownTestDatabase = async () => {
  // Clean up test data
};
```

#### 7.1.2 Chrome Plugin Testing Environment
```javascript
// chrome-plugin/test/setup.js
// Mock Chrome API
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  identity: {
    getProfileUserInfo: jest.fn()
  },
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  }
};

// Mock IndexedDB for plugin storage
const mockIndexedDB = {
  open: jest.fn().mockImplementation(() => {
    return {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            put: jest.fn().mockReturnValue({
              onsuccess: null,
              onerror: null
            }),
            get: jest.fn().mockReturnValue({
              onsuccess: null,
              onerror: null
            }),
            delete: jest.fn().mockReturnValue({
              onsuccess: null,
              onerror: null
            })
          })
        })
      }
    };
  })
};

global.indexedDB = mockIndexedDB;

// Mock fetch for API calls
global.fetch = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
  });
});
```

### 7.2 Unit Tests

#### 7.2.1 Authentication Tests
```javascript
// backend/test/services/authService.test.js
const authService = require('../../src/services/authService');
const db = require('../../src/utils/db');
const jwt = require('jsonwebtoken');

describe('Authentication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create valid JWT token with correct structure', async () => {
    // Arrange
    const user = { id: 'user123', email: 'test@example.com' };
    const deviceId = 'device123';
    const tier = 'free';
    
    jest.spyOn(db, 'getUserActiveTokens').mockResolvedValue([]);
    jest.spyOn(db, 'storeToken').mockResolvedValue({ id: 'token123' });
    
    // Act
    const token = await authService.generateToken(user, deviceId, tier);
    
    // Assert
    expect(token).toBeDefined();
    
    // Verify token structure
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'privacy-lens-jwt-secret');
    expect(decoded).toMatchObject({
      iss: 'privacy-lens',
      sub: 'user123',
      device_id: 'device123',
      tier: 'free',
      features: expect.arrayContaining(['basic']),
      version: expect.any(String)
    });
    
    // Verify token was stored in database
    expect(db.storeToken).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user123',
      device_id: 'device123',
      token_hash: expect.any(String)
    }));
  });
  
  test('should enforce maximum token limit per user', async () => {
    // Arrange
    const user = { id: 'user123', email: 'test@example.com' };
    const deviceId = 'device123';
    const tier = 'free';
    
    // Mock 5 existing tokens (max limit)
    const existingTokens = Array(5).fill(0).map((_, i) => ({
      id: `token${i}`,
      user_id: 'user123',
      created_at: new Date(Date.now() - i * 86400000).toISOString() // Each a day older
    }));
    
    jest.spyOn(db, 'getUserActiveTokens').mockResolvedValue(existingTokens);
    jest.spyOn(db, 'revokeToken').mockResolvedValue({ id: 'token4', revoked: true });
    jest.spyOn(db, 'storeToken').mockResolvedValue({ id: 'newToken' });
    
    // Act
    const token = await authService.generateToken(user, deviceId, tier);
    
    // Assert
    expect(token).toBeDefined();
    
    // Verify oldest token was revoked
    expect(db.revokeToken).toHaveBeenCalledWith('token4');
    
    // Verify new token was stored
    expect(db.storeToken).toHaveBeenCalled();
  });
  
  test('should validate token correctly', async () => {
    // Arrange
    const user = { id: 'user123', email: 'test@example.com' };
    const deviceId = 'device123';
    const tier = 'free';
    
    jest.spyOn(db, 'getUserActiveTokens').mockResolvedValue([]);
    jest.spyOn(db, 'storeToken').mockResolvedValue({ id: 'token123' });
    jest.spyOn(db, 'getTokenByHash').mockResolvedValue({ 
      id: 'token123', 
      user_id: 'user123',
      revoked: false 
    });
    jest.spyOn(db, 'updateTokenLastUsed').mockResolvedValue({ id: 'token123' });
    
    // Act
    const token = await authService.generateToken(user, deviceId, tier);
    const validationResult = await authService.validateToken(token);
    
    // Assert
    expect(validationResult).toBeDefined();
    expect(validationResult.sub).toBe('user123');
    expect(validationResult.device_id).toBe('device123');
    
    // Verify token usage was updated
    expect(db.updateTokenLastUsed).toHaveBeenCalledWith('token123');
  });
  
  test('should reject revoked tokens', async () => {
    // Arrange
    const user = { id: 'user123', email: 'test@example.com' };
    const deviceId = 'device123';
    const tier = 'free';
    
    jest.spyOn(db, 'getUserActiveTokens').mockResolvedValue([]);
    jest.spyOn(db, 'storeToken').mockResolvedValue({ id: 'token123' });
    jest.spyOn(db, 'getTokenByHash').mockResolvedValue({ 
      id: 'token123', 
      user_id: 'user123',
      revoked: true // Token is revoked
    });
    
    // Act
    const token = await authService.generateToken(user, deviceId, tier);
    const validationResult = await authService.validateToken(token);
    
    // Assert
    expect(validationResult).toBeNull();
  });
  
  test('should refresh token and update subscription tier', async () => {
    // Arrange
    const user = { id: 'user123', email: 'test@example.com' };
    const deviceId = 'device123';
    const initialTier = 'free';
    const newTier = 'monthly';
    
    jest.spyOn(db, 'getUserActiveTokens').mockResolvedValue([]);
    jest.spyOn(db, 'storeToken').mockResolvedValue({ id: 'token123' });
    jest.spyOn(db, 'getTokenByHash').mockResolvedValue({ 
      id: 'token123', 
      user_id: 'user123',
      revoked: false 
    });
    jest.spyOn(db, 'getUserById').mockResolvedValue(user);
    jest.spyOn(db, 'getUserSubscription').mockResolvedValue({ 
      plan_type: newTier 
    });
    jest.spyOn(db, 'revokeToken').mockResolvedValue({ id: 'token123', revoked: true });
    
    // Act
    const initialToken = await authService.generateToken(user, deviceId, initialTier);
    const refreshedToken = await authService.refreshToken(initialToken);
    
    // Assert
    expect(refreshedToken).toBeDefined();
    expect(refreshedToken).not.toBe(initialToken);
    
    // Verify old token was revoked
    expect(db.revokeToken).toHaveBeenCalledWith('token123');
    
    // Verify new token has updated tier
    const decoded = jwt.verify(refreshedToken, process.env.JWT_SECRET || 'privacy-lens-jwt-secret');
    expect(decoded.tier).toBe(newTier);
    expect(decoded.features).toContain('advanced');
    expect(decoded.features).toContain('premium');
  });
  
  test('should revoke token successfully', async () => {
    // Arrange
    const user = { id: 'user123', email: 'test@example.com' };
    const deviceId = 'device123';
    const tier = 'free';
    
    jest.spyOn(db, 'getUserActiveTokens').mockResolvedValue([]);
    jest.spyOn(db, 'storeToken').mockResolvedValue({ id: 'token123' });
    jest.spyOn(db, 'getTokenByHash').mockResolvedValue({ 
      id: 'token123', 
      user_id: 'user123',
      revoked: false 
    });
    jest.spyOn(db, 'revokeToken').mockResolvedValue({ id: 'token123', revoked: true });
    
    // Act
    const token = await authService.generateToken(user, deviceId, tier);
    const revocationResult = await authService.revokeToken(token);
    
    // Assert
    expect(revocationResult).toBe(true);
    expect(db.revokeToken).toHaveBeenCalledWith('token123');
  });
});
```

#### 7.2.2 Subscription Service Tests
```javascript
// backend/test/services/subscriptionService.test.js
const subscriptionService = require('../../src/services/subscriptionService');
const db = require('../../src/utils/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create monthly subscription correctly', async () => {
    // Arrange
    const userId = 'user123';
    const planType = 'monthly';
    const paymentMethodId = 'pm_123';
    
    jest.spyOn(db, 'getUserById').mockResolvedValue({ 
      id: userId, 
      email: 'test@example.com',
      name: 'Test User'
    });
    jest.spyOn(db, 'updateUser').mockResolvedValue({ id: userId });
    jest.spyOn(db, 'createSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: 'sub_mock123',
      plan_type: planType,
      status: 'active'
    });
    jest.spyOn(db, 'createAuditLog').mockResolvedValue({ id: 'log123' });
    
    // Act
    const result = await subscriptionService.createSubscription(userId, planType, paymentMethodId);
    
    // Assert
    expect(result).toMatchObject({
      subscription: expect.objectContaining({
        user_id: userId,
        plan_type: planType,
        status: 'active'
      }),
      clientSecret: 'pi_mock_secret'
    });
    
    // Verify Stripe API calls
    expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'test@example.com',
      name: 'Test User'
    }));
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith(paymentMethodId, expect.any(Object));
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({
          price: process.env.STRIPE_MONTHLY_PRICE_ID
        })
      ])
    }));
    
    // Verify database operations
    expect(db.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      plan_type: planType
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'subscription_created',
      user_id: userId
    }));
  });
  
  test('should create annual subscription correctly', async () => {
    // Arrange
    const userId = 'user123';
    const planType = 'annual';
    const paymentMethodId = 'pm_123';
    
    jest.spyOn(db, 'getUserById').mockResolvedValue({ 
      id: userId, 
      email: 'test@example.com',
      name: 'Test User'
    });
    jest.spyOn(db, 'updateUser').mockResolvedValue({ id: userId });
    jest.spyOn(db, 'createSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: 'sub_mock123',
      plan_type: planType,
      status: 'active'
    });
    jest.spyOn(db, 'createAuditLog').mockResolvedValue({ id: 'log123' });
    
    // Act
    const result = await subscriptionService.createSubscription(userId, planType, paymentMethodId);
    
    // Assert
    expect(result.subscription.plan_type).toBe(planType);
    
    // Verify Stripe API calls used annual price
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({
          price: process.env.STRIPE_ANNUAL_PRICE_ID
        })
      ])
    }));
  });
  
  test('should update subscription from monthly to annual', async () => {
    // Arrange
    const userId = 'user123';
    const newPlanType = 'annual';
    
    jest.spyOn(db, 'getUserSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: 'sub_mock123',
      plan_type: 'monthly',
      status: 'active'
    });
    jest.spyOn(db, 'updateSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: 'sub_mock123',
      plan_type: newPlanType,
      status: 'active'
    });
    jest.spyOn(db, 'createAuditLog').mockResolvedValue({ id: 'log123' });
    
    // Act
    const result = await subscriptionService.updateSubscription(userId, newPlanType);
    
    // Assert
    expect(result.plan_type).toBe(newPlanType);
    
    // Verify Stripe API calls
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_mock123');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_mock123', expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'si_mock123',
          price: process.env.STRIPE_ANNUAL_PRICE_ID
        })
      ]),
      proration_behavior: 'create_prorations'
    }));
    
    // Verify database operations
    expect(db.updateSubscription).toHaveBeenCalledWith('sub_db_123', expect.objectContaining({
      plan_type: newPlanType
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'subscription_updated',
      user_id: userId
    }));
  });
  
  test('should cancel subscription correctly', async () => {
    // Arrange
    const userId = 'user123';
    
    jest.spyOn(db, 'getUserSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: 'sub_mock123',
      plan_type: 'monthly',
      status: 'active'
    });
    jest.spyOn(db, 'updateSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: 'sub_mock123',
      plan_type: 'monthly',
      status: 'canceled'
    });
    jest.spyOn(db, 'createAuditLog').mockResolvedValue({ id: 'log123' });
    
    // Act
    const result = await subscriptionService.cancelSubscription(userId);
    
    // Assert
    expect(result.status).toBe('canceled');
    
    // Verify Stripe API calls
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_mock123');
    
    // Verify database operations
    expect(db.updateSubscription).toHaveBeenCalledWith('sub_db_123', expect.objectContaining({
      status: 'canceled'
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'subscription_cancelled',
      user_id: userId
    }));
  });
  
  test('should handle Stripe webhook events correctly', async () => {
    // Arrange
    const subscriptionId = 'sub_mock123';
    const userId = 'user123';
    
    jest.spyOn(db, 'getSubscriptionByStripeId').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      plan_type: 'monthly',
      status: 'active'
    });
    jest.spyOn(db, 'updateSubscription').mockResolvedValue({
      id: 'sub_db_123',
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      plan_type: 'monthly',
      status: 'canceled'
    });
    jest.spyOn(db, 'createAuditLog').mockResolvedValue({ id: 'log123' });
    
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscriptionId,
          status: 'canceled',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        }
      }
    };
    
    // Act
    await subscriptionService.handleWebhookEvent(event);
    
    // Assert
    expect(db.updateSubscription).toHaveBeenCalledWith('sub_db_123', expect.objectContaining({
      status: 'canceled'
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'subscription_cancelled_webhook',
      user_id: userId
    }));
  });
});
```

#### 7.2.3 Update Service Tests
```javascript
// backend/test/services/updateService.test.js
const updateService = require('../../src/services/updateService');
const db = require('../../src/utils/db');

describe('Update Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should detect available updates for free users', async () => {
    // Arrange
    const userId = 'user123';
    const deviceId = 'device123';
    const currentVersion = '1.0.0';
    
    jest.spyOn(db, 'getUserById').mockResolvedValue({ id: userId });
    jest.spyOn(db, 'getUserSubscription').mockResolvedValue(null); // No subscription = free
    jest.spyOn(db, 'getLatestPluginUpdate').mockResolvedValue({
      version: '1.1.0',
      update_type: 'plugin',
      release_date: new Date().toISOString(),
      download_url: 'https://example.com/updates/1.1.0',
      changelog: 'Bug fixes and improvements'
    });
    
    // Act
    const result = await updateService.checkForUpdates(userId, deviceId, currentVersion);
    
    // Assert
    expect(result).toMatchObject({
      hasUpdate: true,
      version: '1.1.0',
      updateType: 'plugin',
      downloadUrl: 'https://example.com/updates/1.1.0'
    });
    
    // Verify only plugin updates were checked for free users
    expect(db.getLatestPluginUpdate).toHaveBeenCalled();
    expect(db.getLatestServerUpdate).not.toHaveBeenCalled();
  });
  
  test('should detect available updates for premium users', async () => {
    // Arrange
    const userId = 'user123';
    const deviceId = 'device123';
    const currentVersion = '1.0.0';
    
    jest.spyOn(db, 'getUserById').mockResolvedValue({ id: userId });
    jest.spyOn(db, 'getUserSubscription').mockResolvedValue({
      plan_type: 'monthly',
      status: 'active'
    });
    jest.spyOn(db, 'getLatestPluginUpdate').mockResolvedValue({
      version: '1.0.0', // No plugin update
      update_type: 'plugin',
      release_date: new Date().toISOString(),
      download_url: 'https://example.com/updates/1.0.0',
      changelog: 'Initial release'
    });
    jest.spyOn(db, 'getLatestServerUpdate').mockResolvedValue({
      version: '1.0.5',
      update_type: 'server',
      release_date: new Date().toISOString(),
      download_url: 'https://example.com/updates/server/1.0.5',
      changelog: 'New privacy templates'
    });
    
    // Act
    const result = await updateService.checkForUpdates(userId, deviceId, currentVersion);
    
    // Assert
    expect(result).toMatchObject({
      hasUpdate: true,
      version: '1.0.5',
      updateType: 'server',
      downloadUrl: 'https://example.com/updates/server/1.0.5'
    });
    
    // Verify both update types were checked for premium users
    expect(db.getLatestPluginUpdate).toHaveBeenCalled();
    expect(db.getLatestServerUpdate).toHaveBeenCalled();
  });
  
  test('should apply updates correctly', async () => {
    // Arrange
    const userId = 'user123';
    const deviceId = 'device123';
    const updateId = 'update123';
    const updateType = 'server';
    
    jest.spyOn(db, 'getUpdateById').mockResolvedValue({
      id: updateId,
      version: '1.1.0',
      update_type: updateType,
      update_data: {
        templates: [
          { id: 'template1', content: 'Updated template content' }
        ]
      }
    });
    jest.spyOn(db, 'recordUpdateApplication').mockResolvedValue({
      id: 'application123',
      user_id: userId,
      device_id: deviceId,
      update_id: updateId,
      applied_at: expect.any(String)
    });
    
    // Act
    const result = await updateService.applyUpdate(userId, deviceId, updateId);
    
    // Assert
    expect(result).toMatchObject({
      success: true,
      version: '1.1.0',
      updateType,
      updateData: expect.objectContaining({
        templates: expect.arrayContaining([
          expect.objectContaining({
            id: 'template1'
          })
        ])
      })
    });
    
    // Verify update application was recorded
    expect(db.recordUpdateApplication).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      device_id: deviceId,
      update_id: updateId
    }));
  });
  
  test('should maintain update history', async () => {
    // Arrange
    const userId = 'user123';
    const deviceId = 'device123';
    
    jest.spyOn(db, 'getUserUpdateHistory').mockResolvedValue([
      {
        id: 'application1',
        user_id: userId,
        device_id: deviceId,
        update_id: 'update1',
        applied_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        update: {
          version: '1.0.5',
          update_type: 'plugin',
          changelog: 'Bug fixes'
        }
      },
      {
        id: 'application2',
        user_id: userId,
        device_id: deviceId,
        update_id: 'update2',
        applied_at: new Date().toISOString(),
        update: {
          version: '1.1.0',
          update_type: 'server',
          changelog: 'New features'
        }
      }
    ]);
    
    // Act
    const result = await updateService.getUpdateHistory(userId, deviceId);
    
    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe('1.1.0');
    expect(result[1].version).toBe('1.0.5');
    
    // Verify database call
    expect(db.getUserUpdateHistory).toHaveBeenCalledWith(userId, deviceId);
  });
  
  test('should handle update failures gracefully', async () => {
    // Arrange
    const userId = 'user123';
    const deviceId = 'device123';
    const updateId = 'update123';
    
    jest.spyOn(db, 'getUpdateById').mockResolvedValue(null); // Update not found
    
    // Act
    const result = await updateService.applyUpdate(userId, deviceId, updateId);
    
    // Assert
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('not found')
    });
    
    // Verify no update application was recorded
    expect(db.recordUpdateApplication).not.toHaveBeenCalled();
  });
  
  test('should prioritize plugin updates over server updates', async () => {
    // Arrange
    const userId = 'user123';
    const deviceId = 'device123';
    const currentVersion = '1.0.0';
    
    jest.spyOn(db, 'getUserById').mockResolvedValue({ id: userId });
    jest.spyOn(db, 'getUserSubscription').mockResolvedValue({
      plan_type: 'monthly',
      status: 'active'
    });
    jest.spyOn(db, 'getLatestPluginUpdate').mockResolvedValue({
      version: '1.1.0', // Newer plugin update
      update_type: 'plugin',
      release_date: new Date().toISOString(),
      download_url: 'https://example.com/updates/1.1.0',
      changelog: 'Major plugin update'
    });
    jest.spyOn(db, 'getLatestServerUpdate').mockResolvedValue({
      version: '1.0.5', // Older server update
      update_type: 'server',
      release_date: new Date().toISOString(),
      download_url: 'https://example.com/updates/server/1.0.5',
      changelog: 'Minor server update'
    });
    
    // Act
    const result = await updateService.checkForUpdates(userId, deviceId, currentVersion);
    
    // Assert
    expect(result).toMatchObject({
      hasUpdate: true,
      version: '1.1.0', // Should return plugin update as it's newer
      updateType: 'plugin',
      downloadUrl: 'https://example.com/updates/1.1.0'
    });
  });
});
```

#### 7.2.4 Chrome Plugin Update Tests
```javascript
// chrome-plugin/test/updater.test.js
import { checkForUpdates, applyUpdate, getUpdateHistory } from '../updater.js';
import { getUserTier, hasFeature } from '../auth.js';

// Mock dependencies
jest.mock('../auth.js', () => ({
  getUserTier: jest.fn(),
  hasFeature: jest.fn()
}));

global.fetch = jest.fn();

describe('Chrome Plugin Updater', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    getUserTier.mockResolvedValue({ tier: 'free' });
    hasFeature.mockResolvedValue(false);
    
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
  });
  
  test('should check for updates with correct parameters', async () => {
    // Arrange
    const currentVersion = '1.0.0';
    const deviceId = 'device123';
    
    getUserTier.mockResolvedValue({ tier: 'free' });
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        hasUpdate: true,
        version: '1.1.0',
        updateType: 'plugin',
        downloadUrl: 'https://example.com/updates/1.1.0'
      })
    });
    
    // Act
    const result = await checkForUpdates(currentVersion, deviceId);
    
    // Assert
    expect(result).toMatchObject({
      hasUpdate: true,
      version: '1.1.0'
    });
    
    // Verify API call
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/updates/check'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining(currentVersion)
      })
    );
  });
  
  test('should apply updates correctly', async () => {
    // Arrange
    const updateId = 'update123';
    const deviceId = 'device123';
    
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        version: '1.1.0',
        updateType: 'plugin',
        updateData: {
          templates: [
            { id: 'template1', content: 'Updated template content' }
          ]
        }
      })
    });
    
    // Mock storage
    const mockStorage = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    };
    
    // Act
    const result = await applyUpdate(updateId, deviceId, mockStorage);
    
    // Assert
    expect(result.success).toBe(true);
    
    // Verify API call
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/updates/download`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining(updateId)
      })
    );
    
    // Verify storage update
    expect(mockStorage.set).toHaveBeenCalledWith(
      'templates',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template1'
        })
      ])
    );
  });
  
  test('should handle update failures gracefully', async () => {
    // Arrange
    const updateId = 'update123';
    const deviceId = 'device123';
    
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });
    
    // Act
    const result = await applyUpdate(updateId, deviceId);
    
    // Assert
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('404')
    });
  });
  
  test('should retrieve update history correctly', async () => {
    // Arrange
    const deviceId = 'device123';
    
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          version: '1.1.0',
          updateType: 'plugin',
          appliedAt: new Date().toISOString(),
          changelog: 'Major plugin update'
        },
        {
          version: '1.0.5',
          updateType: 'server',
          appliedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          changelog: 'Minor server update'
        }
      ])
    });
    
    // Act
    const result = await getUpdateHistory(deviceId);
    
    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe('1.1.0');
    expect(result[1].version).toBe('1.0.5');
    
    // Verify API call
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/updates/changelog'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining(deviceId)
      })
    );
  });
});
```

### 7.2 End-to-End Tests

#### 7.2.1 User Subscription Flow
```javascript
// e2e/subscription-flow.test.js
describe('E2E Subscription Flow', () => {
  test('Free user can upgrade to monthly subscription', async () => {
    // Simulate complete upgrade flow
  });
  
  test('Free user can upgrade to annual subscription', async () => {
    // Simulate complete upgrade flow
  });
  
  test('Monthly user can upgrade to annual subscription', async () => {
    // Simulate plan change flow
  });
  
  test('Annual user can downgrade to monthly subscription', async () => {
    // Simulate plan change flow
  });
  
  test('Premium user can cancel subscription', async () => {
    // Simulate cancellation flow
  });
});
```

#### 7.2.2 Update Distribution Tests
```javascript
// e2e/update-flow.test.js
describe('E2E Update Flow', () => {
  test('Free user receives plugin-only updates', async () => {
    // Simulate plugin update for free user
  });
  
  test('Premium user receives server updates', async () => {
    // Simulate server update for premium user
  });
  
  test('Updates maintain functionality across subscription changes', async () => {
    // Test updates during subscription changes
  });
});
```

## 8. Deployment & Operations

### 8.1 CI/CD Pipeline
- GitHub Actions for automated testing
- Separate deployment channels for plugin and backend
- Version management for updates

### 8.2 Monitoring & Analytics
- User conversion tracking
- Update success rate monitoring
- Subscription analytics
- Error tracking

### 8.3 Database Backups
- Automated database backups
- Version control for privacy database

## 9. Future Extensions

### 9.1 Potential Future Features
- Team/enterprise subscriptions
- API access for premium users
- Custom privacy policy templates
- Multi-browser support
