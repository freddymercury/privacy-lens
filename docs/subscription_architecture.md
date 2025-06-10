# Subscription System Architecture

## Overview

The PrivacyLens subscription system is built using a pure function architecture with clear separation between business logic and side effects. This design ensures testability, maintainability, and scalability while integrating seamlessly with Stripe for payment processing.

## Architecture Principles

### Pure Function Design

The subscription system follows strict pure function principles:

1. **Deterministic Functions**: Same input always produces same output
2. **No Side Effects**: Pure functions don't modify external state
3. **Immutable Inputs**: Input parameters are treated as read-only
4. **Dependency Injection**: External dependencies passed as parameters

### Separation of Concerns

- **Pure Business Logic**: Located in `/shared/subscription/`
- **Side Effect Wrappers**: Located in Client API controllers
- **Data Persistence**: Handled by wrapper functions
- **External API Calls**: Isolated in service layers

## System Components

### 1. Shared Subscription Modules

#### `/shared/subscription/core.js`

Contains pure functions for subscription business logic:

```javascript
// Pure validation functions
function isValidPlanType(planType) {
  return ['monthly', 'annual'].includes(planType);
}

function isActiveSubscriptionStatus(status) {
  return ['active', 'trialing'].includes(status);
}

// Pure data transformation functions
function createSubscriptionData(userId, stripeSubscriptionId, planType, status) {
  return {
    user_id: userId,
    stripe_subscription_id: stripeSubscriptionId,
    plan_type: planType,
    status: status,
    created_at: new Date(),
    updated_at: new Date()
  };
}

// Pure parameter validation
function validateSubscriptionCreationParams(params) {
  const { planType, paymentMethodId } = params;
  
  if (!planType || !isValidPlanType(planType)) {
    return { valid: false, error: 'Invalid plan type' };
  }
  
  if (!paymentMethodId || typeof paymentMethodId !== 'string') {
    return { valid: false, error: 'Invalid payment method ID' };
  }
  
  return { valid: true };
}
```

#### `/shared/subscription/stripe.js`

Contains pure functions for Stripe data processing:

```javascript
// Pure price ID mapping
function getPriceIdForPlan(planType) {
  const priceMap = {
    monthly: 'price_monthly',
    annual: 'price_annual'
  };
  return priceMap[planType];
}

// Pure webhook event validation
function isValidWebhookEvent(event) {
  return event && 
         typeof event.id === 'string' && 
         typeof event.type === 'string' &&
         event.data && 
         event.data.object;
}

function shouldProcessWebhookEvent(eventType) {
  const processableEvents = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed'
  ];
  return processableEvents.includes(eventType);
}

// Pure data normalization
function normalizeStripeSubscriptionData(stripeSubscription) {
  return {
    status: stripeSubscription.status,
    current_period_start: new Date(stripeSubscription.current_period_start * 1000),
    current_period_end: new Date(stripeSubscription.current_period_end * 1000),
    canceled_at: stripeSubscription.canceled_at ? 
      new Date(stripeSubscription.canceled_at * 1000) : null,
    updated_at: new Date()
  };
}
```

### 2. Client API Implementation

#### Subscription Controller

The controller acts as a bridge between pure functions and side effects:

```javascript
// Impure wrapper function
async function createSubscription(req, res) {
  try {
    // 1. Extract and validate parameters using pure functions
    const params = { planType: req.body.planType, paymentMethodId: req.body.paymentMethodId };
    const validation = validateSubscriptionCreationParams(params);
    
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    
    // 2. Side effect: Database queries
    const existingSubscription = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ($2, $3)',
      [req.user.id, 'active', 'trialing']
    );
    
    if (existingSubscription.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'User already has an active subscription' 
      });
    }
    
    // 3. Side effect: Stripe API calls
    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerData.stripe_customer_id,
      items: [{ price: getPriceIdForPlan(params.planType) }],
      expand: ['latest_invoice.payment_intent']
    });
    
    // 4. Pure function: Create subscription data
    const subscriptionData = createSubscriptionData(
      req.user.id,
      stripeSubscription.id,
      params.planType,
      stripeSubscription.status
    );
    
    // 5. Side effect: Database insertion
    await db.query(
      'INSERT INTO subscriptions (user_id, stripe_subscription_id, plan_type, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [subscriptionData.user_id, subscriptionData.stripe_subscription_id, subscriptionData.plan_type, subscriptionData.status, subscriptionData.created_at, subscriptionData.updated_at]
    );
    
    // 6. Pure function: Create audit log data
    const auditData = createAuditLogData(req.user.id, 'subscription_created', { plan_type: params.planType });
    
    // 7. Side effect: Audit log insertion
    await db.query(
      'INSERT INTO audit_logs (user_id, action, details, created_at) VALUES ($1, $2, $3, $4)',
      [auditData.user_id, auditData.action, JSON.stringify(auditData.details), auditData.created_at]
    );
    
    res.json({
      success: true,
      subscription: stripeSubscription,
      clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret
    });
    
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create subscription' 
    });
  }
}
```

### 3. Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chrome Plugin │    │   Client API     │    │ Shared Modules  │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ Subscription│ │───▶│ │ Subscription │ │───▶│ │ Pure        │ │
│ │ UI          │ │    │ │ Controller   │ │    │ │ Functions   │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│                 │    │        │         │    │                 │
│ ┌─────────────┐ │    │        ▼         │    │ ┌─────────────┐ │
│ │ Feature     │ │    │ ┌──────────────┐ │    │ │ Validation  │ │
│ │ Gating      │ │    │ │ Side Effect  │ │    │ │ Logic       │ │
│ └─────────────┘ │    │ │ Wrappers     │ │    │ └─────────────┘ │
└─────────────────┘    │ └──────────────┘ │    └─────────────────┘
                       │        │         │
                       │        ▼         │
                       │ ┌──────────────┐ │
                       │ │ Database     │ │
                       │ │ Operations   │ │
                       │ └──────────────┘ │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Stripe API     │
                       │                  │
                       │ ┌──────────────┐ │
                       │ │ Subscriptions│ │
                       │ │ Customers    │ │
                       │ │ Webhooks     │ │
                       │ └──────────────┘ │
                       └──────────────────┘
```

### 4. Database Schema

#### Subscriptions Table

```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255),
  plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('monthly', 'annual')),
  status VARCHAR(50) NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

#### Audit Logs Table

```sql
CREATE TABLE subscription_audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  action VARCHAR(100) NOT NULL,
  details JSONB,
  stripe_event_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON subscription_audit_logs(user_id);
CREATE INDEX idx_audit_logs_subscription_id ON subscription_audit_logs(subscription_id);
CREATE INDEX idx_audit_logs_action ON subscription_audit_logs(action);
```

## Integration Points

### 1. Stripe Integration

#### Webhook Processing Flow

```
Stripe Event ──▶ NGINX ──▶ Client API ──▶ Signature Validation
                                              │
                                              ▼
                                        Pure Event Validation
                                              │
                                              ▼
                                        Database Update
                                              │
                                              ▼
                                        Audit Log Creation
```

#### Webhook Event Handling

```javascript
async function handleWebhook(req, res) {
  try {
    // 1. Side effect: Stripe signature validation
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    // 2. Pure function: Event validation
    if (!isValidWebhookEvent(event)) {
      return res.status(400).json({ error: 'Invalid webhook event' });
    }
    
    // 3. Pure function: Check if event should be processed
    if (!shouldProcessWebhookEvent(event.type)) {
      return res.json({ received: true });
    }
    
    // 4. Side effect: Find subscription in database
    const subscription = await db.query(
      'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
      [event.data.object.id]
    );
    
    if (subscription.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    // 5. Pure function: Normalize Stripe data
    const normalizedData = normalizeStripeSubscriptionData(event.data.object);
    
    // 6. Side effect: Update subscription
    await db.query(
      'UPDATE subscriptions SET status = $1, current_period_end = $2, updated_at = $3 WHERE stripe_subscription_id = $4',
      [normalizedData.status, normalizedData.current_period_end, normalizedData.updated_at, event.data.object.id]
    );
    
    // 7. Pure function: Create audit log details
    const auditDetails = createWebhookAuditLogDetails(event.type, event.data.object);
    
    // 8. Side effect: Insert audit log
    await db.query(
      'INSERT INTO subscription_audit_logs (user_id, action, details, stripe_event_id, created_at) VALUES ($1, $2, $3, $4, $5)',
      [subscription.rows[0].user_id, `webhook_${event.type}`, JSON.stringify(auditDetails), event.id, new Date()]
    );
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(400).json({ error: error.message });
  }
}
```

### 2. NGINX Routing

#### Configuration

```nginx
# Subscription endpoints routing
location /api/subscription/ {
    proxy_pass http://client-api:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # CORS headers for Chrome plugin
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, stripe-signature" always;
    add_header Access-Control-Allow-Credentials "true" always;
    
    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        return 204;
    }
}

# Special handling for webhooks (raw body required)
location /api/subscription/webhook {
    proxy_pass http://client-api:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Preserve raw body for Stripe signature verification
    proxy_request_buffering off;
    client_max_body_size 1m;
}
```

## Testing Architecture

### 1. Pure Function Testing

Pure functions are tested in isolation with comprehensive coverage:

```javascript
describe('Subscription Core Functions', () => {
  describe('validateSubscriptionCreationParams', () => {
    test('should validate monthly plan type', () => {
      const params = { planType: 'monthly', paymentMethodId: 'pm_123' };
      const result = validateSubscriptionCreationParams(params);
      expect(result.valid).toBe(true);
    });
    
    test('should reject invalid plan type', () => {
      const params = { planType: 'invalid', paymentMethodId: 'pm_123' };
      const result = validateSubscriptionCreationParams(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid plan type');
    });
  });
  
  describe('createSubscriptionData', () => {
    test('should create subscription data object', () => {
      const result = createSubscriptionData('user123', 'sub_123', 'monthly', 'active');
      expect(result.user_id).toBe('user123');
      expect(result.stripe_subscription_id).toBe('sub_123');
      expect(result.plan_type).toBe('monthly');
      expect(result.status).toBe('active');
      expect(result.created_at).toBeInstanceOf(Date);
    });
  });
});
```

### 2. Integration Testing

Integration tests verify the complete flow with mocked external dependencies:

```javascript
describe('Subscription Integration', () => {
  test('should create subscription end-to-end', async () => {
    // Mock database responses
    mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // No existing subscription
    mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert success
    
    // Mock Stripe response
    mockStripe.subscriptions.create.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      latest_invoice: { payment_intent: { client_secret: 'pi_secret' } }
    });
    
    const response = await request(app)
      .post('/api/subscription/create')
      .set('Authorization', 'Bearer valid_token')
      .send({ planType: 'monthly', paymentMethodId: 'pm_123' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

### 3. Load Testing

Performance tests ensure the system scales under load:

```javascript
describe('Subscription Load Tests', () => {
  test('should handle 50 concurrent status requests', async () => {
    const promises = Array(50).fill().map(() => 
      request(app)
        .get('/api/subscription/status')
        .set('Authorization', 'Bearer valid_token')
    );
    
    const responses = await Promise.all(promises);
    const successfulResponses = responses.filter(r => r.status === 200);
    
    expect(successfulResponses.length).toBeGreaterThan(45); // 90% success rate
  });
});
```

## Monitoring and Observability

### 1. Metrics Collection

Key metrics tracked for subscription system:

- **Business Metrics**:
  - Subscription creation rate
  - Plan change frequency
  - Cancellation rate
  - Revenue metrics

- **Technical Metrics**:
  - API response times
  - Error rates by endpoint
  - Database query performance
  - Stripe API latency

- **User Experience Metrics**:
  - Payment success rate
  - Feature usage by tier
  - Plugin engagement metrics

### 2. Logging Strategy

Structured logging for subscription events:

```javascript
const logger = require('pino')({
  name: 'subscription-service',
  level: process.env.LOG_LEVEL || 'info'
});

// Log subscription events
logger.info({
  event: 'subscription_created',
  userId: req.user.id,
  planType: params.planType,
  stripeSubscriptionId: stripeSubscription.id,
  timestamp: new Date().toISOString()
}, 'Subscription created successfully');

// Log errors with context
logger.error({
  event: 'subscription_creation_failed',
  userId: req.user.id,
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
}, 'Failed to create subscription');
```

### 3. Health Checks

Comprehensive health monitoring:

```javascript
async function getSubscriptionHealth() {
  const health = {
    status: 'healthy',
    service: 'subscription',
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  try {
    // Database connectivity
    await db.query('SELECT 1');
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'unhealthy';
  }
  
  try {
    // Stripe API connectivity (if configured)
    if (process.env.STRIPE_SECRET_KEY) {
      await stripe.customers.list({ limit: 1 });
      health.checks.stripe = 'healthy';
    } else {
      health.checks.stripe = 'mock';
    }
  } catch (error) {
    health.checks.stripe = 'unhealthy';
    health.status = 'degraded';
  }
  
  return health;
}
```

## Security Considerations

### 1. Authentication & Authorization

- JWT token validation for all user-facing endpoints
- User context verification for subscription operations
- Rate limiting to prevent abuse

### 2. Stripe Security

- Webhook signature verification
- Secure API key management
- PCI compliance through Stripe's infrastructure

### 3. Data Protection

- Sensitive data encryption at rest
- Secure transmission (HTTPS/TLS)
- Audit logging for compliance

## Deployment Architecture

### 1. Process Separation

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Monolith      │    │   Client API    │    │   Shared        │
│   Backend       │    │   Process       │    │   Modules       │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Core        │ │    │ │ Auth        │ │    │ │ Pure        │ │
│ │ Business    │ │    │ │ Assessment  │ │    │ │ Functions   │ │
│ │ Logic       │ │    │ │ Subscription│ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │                 │    │                 │
│ Port: 3000      │    │ Port: 3001      │    │ NPM Package     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2. Load Balancing

NGINX handles routing and load balancing:

```
Internet ──▶ NGINX ──▶ Client API (Subscription)
              │
              └──────▶ Monolith (Other endpoints)
```

### 3. Scalability

- Horizontal scaling of Client API processes
- Database connection pooling
- Caching for subscription status queries
- Async webhook processing

This architecture ensures the subscription system is maintainable, testable, and scalable while providing a seamless user experience across all PrivacyLens components. 