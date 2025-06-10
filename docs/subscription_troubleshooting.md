# Subscription System Troubleshooting Guide

## Overview

This guide provides solutions for common subscription-related issues in the PrivacyLens system, including debugging procedures, error resolution, and maintenance tasks.

## Common Issues and Solutions

### 1. Subscription Creation Failures

#### Issue: "User already has an active subscription"

**Symptoms**:
- User receives error when trying to create subscription
- API returns 400 status with error message
- User claims they don't have an active subscription

**Debugging Steps**:
```sql
-- Check user's subscription status
SELECT * FROM subscriptions 
WHERE user_id = 'USER_ID' 
ORDER BY created_at DESC;

-- Check for canceled subscriptions that might still be active
SELECT * FROM subscriptions 
WHERE user_id = 'USER_ID' 
AND status IN ('active', 'trialing', 'past_due');
```

**Solutions**:
1. **Canceled but still active**: If subscription is canceled but still in grace period, wait for period to end or manually update status
2. **Stripe sync issue**: Check Stripe dashboard for actual subscription status
3. **Database inconsistency**: Update database to match Stripe status

**Prevention**:
- Implement webhook handling for real-time status updates
- Add periodic sync job to reconcile database with Stripe

#### Issue: "Payment method declined"

**Symptoms**:
- Stripe returns card_declined error
- User's payment fails during subscription creation
- Error logged in subscription creation flow

**Debugging Steps**:
```bash
# Check Stripe logs
curl -X GET https://api.stripe.com/v1/events \
  -H "Authorization: Bearer sk_test_..." \
  -d "type=invoice.payment_failed"

# Check our audit logs
SELECT * FROM subscription_audit_logs 
WHERE action LIKE '%failed%' 
AND created_at > NOW() - INTERVAL '1 hour';
```

**Solutions**:
1. **Invalid payment method**: Ask user to update payment method
2. **Insufficient funds**: User needs to add funds to account
3. **Card expired**: User needs to update card information
4. **Fraud prevention**: Contact Stripe support if legitimate transaction blocked

**Prevention**:
- Validate payment methods before subscription creation
- Implement retry logic with exponential backoff
- Provide clear error messages to users

### 2. Webhook Processing Issues

#### Issue: Webhooks not being processed

**Symptoms**:
- Subscription status not updating in database
- Users reporting billing issues
- Webhook endpoint returning errors

**Debugging Steps**:
```bash
# Check webhook endpoint health
curl -X GET http://localhost/api/subscription/health

# Check NGINX logs for webhook requests
tail -f /var/log/nginx/access.log | grep "subscription/webhook"

# Check Client API logs for webhook processing
docker logs client-api | grep "webhook"
```

**Solutions**:
1. **Signature validation failing**: Verify webhook secret is correct
2. **Endpoint unreachable**: Check NGINX configuration and Client API status
3. **Database connection issues**: Verify database connectivity

**Prevention**:
- Monitor webhook endpoint health
- Set up alerts for webhook failures
- Implement webhook retry mechanism

#### Issue: "Invalid signature" errors

**Symptoms**:
- Webhook endpoint returns 400 with signature error
- Stripe dashboard shows webhook delivery failures
- Subscription updates not reflected in system

**Debugging Steps**:
```javascript
// Enable webhook debugging
const DEBUG_WEBHOOKS = true;

function debugWebhook(req) {
  if (DEBUG_WEBHOOKS) {
    console.log('Webhook Headers:', req.headers);
    console.log('Webhook Body:', req.body);
    console.log('Stripe Signature:', req.headers['stripe-signature']);
    console.log('Webhook Secret:', process.env.STRIPE_WEBHOOK_SECRET ? 'Set' : 'Missing');
  }
}
```

**Solutions**:
1. **Wrong webhook secret**: Update environment variable with correct secret
2. **Body parsing issues**: Ensure raw body is preserved for signature verification
3. **NGINX configuration**: Check if NGINX is modifying request body

**Prevention**:
- Use environment-specific webhook endpoints
- Test webhook signature validation in development
- Monitor webhook secret rotation

### 3. Subscription Status Sync Issues

#### Issue: Database status doesn't match Stripe

**Symptoms**:
- User shows as active in Stripe but free in app
- Billing successful but features not unlocked
- Inconsistent subscription data

**Debugging Steps**:
```sql
-- Compare database with Stripe data
SELECT 
  s.user_id,
  s.stripe_subscription_id,
  s.status as db_status,
  s.current_period_end as db_period_end
FROM subscriptions s
WHERE s.status != 'canceled'
ORDER BY s.updated_at DESC;
```

```bash
# Check specific subscription in Stripe
curl -X GET https://api.stripe.com/v1/subscriptions/sub_XXXXXXXXXX \
  -H "Authorization: Bearer sk_test_..."
```

**Solutions**:
1. **Manual sync**: Update database to match Stripe status
2. **Webhook replay**: Replay missed webhook events from Stripe
3. **Bulk sync**: Run sync script to reconcile all subscriptions

**Sync Script Example**:
```javascript
async function syncSubscriptionWithStripe(subscriptionId) {
  try {
    // Get subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Normalize data using pure function
    const normalizedData = normalizeStripeSubscriptionData(stripeSubscription);
    
    // Update database
    await db.query(
      'UPDATE subscriptions SET status = $1, current_period_end = $2, updated_at = $3 WHERE stripe_subscription_id = $4',
      [normalizedData.status, normalizedData.current_period_end, normalizedData.updated_at, subscriptionId]
    );
    
    console.log(`Synced subscription ${subscriptionId}`);
  } catch (error) {
    console.error(`Failed to sync subscription ${subscriptionId}:`, error);
  }
}
```

**Prevention**:
- Implement regular sync jobs
- Monitor webhook delivery success rates
- Set up alerts for sync discrepancies

### 4. Chrome Plugin Integration Issues

#### Issue: Plugin not recognizing subscription status

**Symptoms**:
- Premium users see free tier limitations
- Plugin shows incorrect subscription status
- Features not unlocking after subscription

**Debugging Steps**:
```javascript
// Check plugin's subscription status call
chrome.storage.local.get(['authToken'], async (result) => {
  if (result.authToken) {
    try {
      const response = await fetch('http://localhost/api/subscription/status', {
        headers: { 'Authorization': `Bearer ${result.authToken}` }
      });
      const data = await response.json();
      console.log('Subscription Status:', data);
    } catch (error) {
      console.error('Status check failed:', error);
    }
  }
});
```

**Solutions**:
1. **Token expired**: User needs to re-authenticate
2. **API endpoint issues**: Check Client API health and routing
3. **Caching issues**: Clear plugin storage and refresh status

**Plugin Debug Commands**:
```javascript
// Clear plugin storage
chrome.storage.local.clear();

// Force subscription status refresh
checkSubscriptionStatus(true); // force refresh

// Check current auth state
chrome.storage.local.get(null, (items) => {
  console.log('Plugin Storage:', items);
});
```

**Prevention**:
- Implement automatic token refresh
- Add subscription status caching with TTL
- Monitor plugin API success rates

### 5. Payment and Billing Issues

#### Issue: Subscription created but payment failed

**Symptoms**:
- Subscription exists in database with "incomplete" status
- User charged but subscription not active
- Stripe shows payment_intent requires action

**Debugging Steps**:
```sql
-- Check incomplete subscriptions
SELECT * FROM subscriptions 
WHERE status = 'incomplete' 
AND created_at > NOW() - INTERVAL '24 hours';
```

```bash
# Check payment intents in Stripe
curl -X GET https://api.stripe.com/v1/payment_intents \
  -H "Authorization: Bearer sk_test_..." \
  -d "customer=cus_XXXXXXXXXX"
```

**Solutions**:
1. **3D Secure required**: Guide user through additional authentication
2. **Payment method issues**: Ask user to try different payment method
3. **Incomplete setup**: Complete subscription setup in Stripe dashboard

**Prevention**:
- Handle 3D Secure flows in subscription creation
- Provide clear payment status feedback
- Implement payment confirmation flows

## Debugging Procedures

### 1. Subscription Flow Debugging

#### Enable Debug Logging

```javascript
// Add to Client API environment
DEBUG_SUBSCRIPTION=true
LOG_LEVEL=debug

// Add debug middleware
app.use('/api/subscription', (req, res, next) => {
  if (process.env.DEBUG_SUBSCRIPTION) {
    console.log(`[DEBUG] ${req.method} ${req.path}`, {
      headers: req.headers,
      body: req.body,
      user: req.user?.id
    });
  }
  next();
});
```

#### Trace Subscription Creation

```javascript
async function debugSubscriptionCreation(userId, planType, paymentMethodId) {
  console.log('=== Subscription Creation Debug ===');
  
  // 1. Check user exists
  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  console.log('User found:', user.rows.length > 0);
  
  // 2. Check existing subscriptions
  const existing = await db.query(
    'SELECT * FROM subscriptions WHERE user_id = $1',
    [userId]
  );
  console.log('Existing subscriptions:', existing.rows);
  
  // 3. Validate parameters
  const validation = validateSubscriptionCreationParams({ planType, paymentMethodId });
  console.log('Parameter validation:', validation);
  
  // 4. Check Stripe customer
  try {
    const customers = await stripe.customers.list({ email: user.rows[0].email });
    console.log('Stripe customers:', customers.data);
  } catch (error) {
    console.log('Stripe customer check failed:', error.message);
  }
  
  console.log('=== End Debug ===');
}
```

### 2. Webhook Debugging

#### Webhook Event Tracer

```javascript
function traceWebhookEvent(event) {
  console.log('=== Webhook Event Debug ===');
  console.log('Event ID:', event.id);
  console.log('Event Type:', event.type);
  console.log('Event Created:', new Date(event.created * 1000));
  console.log('Event Data:', JSON.stringify(event.data, null, 2));
  
  // Check if event should be processed
  const shouldProcess = shouldProcessWebhookEvent(event.type);
  console.log('Should process:', shouldProcess);
  
  if (event.data.object.id) {
    // Check if subscription exists in database
    db.query(
      'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
      [event.data.object.id]
    ).then(result => {
      console.log('Subscription in DB:', result.rows.length > 0);
      if (result.rows.length > 0) {
        console.log('Current DB status:', result.rows[0].status);
        console.log('Stripe status:', event.data.object.status);
      }
    });
  }
  
  console.log('=== End Webhook Debug ===');
}
```

### 3. Database Debugging

#### Subscription Data Integrity Check

```sql
-- Check for orphaned subscriptions
SELECT s.* FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL;

-- Check for duplicate active subscriptions
SELECT user_id, COUNT(*) as subscription_count
FROM subscriptions
WHERE status IN ('active', 'trialing')
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Check subscription status distribution
SELECT status, COUNT(*) as count
FROM subscriptions
GROUP BY status
ORDER BY count DESC;

-- Check recent subscription activity
SELECT 
  DATE(created_at) as date,
  COUNT(*) as new_subscriptions,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
FROM subscriptions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Monitoring and Alerts

### 1. Key Metrics to Monitor

#### Business Metrics
- Subscription creation rate
- Subscription cancellation rate
- Payment failure rate
- Revenue metrics

#### Technical Metrics
- API response times
- Error rates by endpoint
- Database query performance
- Webhook processing success rate

### 2. Alert Configuration

#### Critical Alerts
```yaml
# Subscription creation failures
- alert: SubscriptionCreationFailureRate
  expr: rate(subscription_creation_failures[5m]) > 0.1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: High subscription creation failure rate

# Webhook processing failures
- alert: WebhookProcessingFailures
  expr: rate(webhook_processing_failures[5m]) > 0.05
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: Webhook processing failures detected

# Database connection issues
- alert: DatabaseConnectionFailures
  expr: rate(database_connection_failures[1m]) > 0
  for: 30s
  labels:
    severity: critical
  annotations:
    summary: Database connection failures
```

#### Warning Alerts
```yaml
# Slow subscription API responses
- alert: SlowSubscriptionAPI
  expr: histogram_quantile(0.95, rate(subscription_api_duration_seconds_bucket[5m])) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: Subscription API responses are slow

# High subscription cancellation rate
- alert: HighCancellationRate
  expr: rate(subscription_cancellations[1h]) > rate(subscription_creations[1h]) * 0.5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: High subscription cancellation rate detected
```

### 3. Health Check Implementation

```javascript
async function comprehensiveHealthCheck() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
    metrics: {}
  };
  
  try {
    // Database connectivity
    const dbStart = Date.now();
    await db.query('SELECT 1');
    health.checks.database = 'healthy';
    health.metrics.database_response_time = Date.now() - dbStart;
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'unhealthy';
    health.checks.database_error = error.message;
  }
  
  try {
    // Stripe API connectivity
    if (process.env.STRIPE_SECRET_KEY) {
      const stripeStart = Date.now();
      await stripe.customers.list({ limit: 1 });
      health.checks.stripe = 'healthy';
      health.metrics.stripe_response_time = Date.now() - stripeStart;
    } else {
      health.checks.stripe = 'mock';
    }
  } catch (error) {
    health.checks.stripe = 'unhealthy';
    if (health.status === 'healthy') health.status = 'degraded';
    health.checks.stripe_error = error.message;
  }
  
  try {
    // Check recent subscription activity
    const recentActivity = await db.query(
      'SELECT COUNT(*) as count FROM subscriptions WHERE created_at > NOW() - INTERVAL \'1 hour\''
    );
    health.metrics.recent_subscriptions = parseInt(recentActivity.rows[0].count);
  } catch (error) {
    health.metrics.recent_subscriptions_error = error.message;
  }
  
  return health;
}
```

## Maintenance Tasks

### 1. Regular Sync Jobs

#### Daily Subscription Sync
```javascript
async function dailySubscriptionSync() {
  console.log('Starting daily subscription sync...');
  
  try {
    // Get all active subscriptions from database
    const subscriptions = await db.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE status IN ($1, $2)',
      ['active', 'trialing']
    );
    
    let syncCount = 0;
    let errorCount = 0;
    
    for (const sub of subscriptions.rows) {
      try {
        await syncSubscriptionWithStripe(sub.stripe_subscription_id);
        syncCount++;
      } catch (error) {
        console.error(`Failed to sync ${sub.stripe_subscription_id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`Sync completed: ${syncCount} synced, ${errorCount} errors`);
  } catch (error) {
    console.error('Daily sync failed:', error);
  }
}

// Schedule daily sync
setInterval(dailySubscriptionSync, 24 * 60 * 60 * 1000); // 24 hours
```

### 2. Cleanup Tasks

#### Remove Old Audit Logs
```sql
-- Remove audit logs older than 1 year
DELETE FROM subscription_audit_logs 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Archive old canceled subscriptions
INSERT INTO subscriptions_archive 
SELECT * FROM subscriptions 
WHERE status = 'canceled' 
AND canceled_at < NOW() - INTERVAL '6 months';

DELETE FROM subscriptions 
WHERE status = 'canceled' 
AND canceled_at < NOW() - INTERVAL '6 months';
```

### 3. Performance Optimization

#### Database Index Maintenance
```sql
-- Analyze subscription table performance
ANALYZE subscriptions;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'subscriptions'
ORDER BY idx_scan DESC;

-- Rebuild indexes if needed
REINDEX TABLE subscriptions;
```

## Emergency Procedures

### 1. Subscription Service Outage

#### Immediate Actions
1. Check service health endpoints
2. Verify database connectivity
3. Check NGINX routing configuration
4. Review recent deployments

#### Rollback Procedure
```bash
# Rollback Client API deployment
docker-compose down client-api
docker-compose up -d client-api:previous-version

# Verify service recovery
curl -f http://localhost/api/subscription/health

# Check subscription endpoints
curl -f http://localhost/api/subscription/status \
  -H "Authorization: Bearer test_token"
```

### 2. Payment Processing Issues

#### Stripe API Outage
1. Monitor Stripe status page
2. Enable graceful degradation mode
3. Queue subscription operations for retry
4. Communicate with users about temporary issues

#### Database Corruption
1. Stop all subscription operations
2. Restore from latest backup
3. Replay webhook events since backup
4. Verify data integrity

### 3. Security Incidents

#### Webhook Endpoint Compromise
1. Rotate webhook secret immediately
2. Update environment variables
3. Review audit logs for suspicious activity
4. Verify subscription data integrity

#### API Key Compromise
1. Rotate Stripe API keys
2. Update environment variables
3. Review Stripe dashboard for unauthorized activity
4. Audit recent subscription operations

This troubleshooting guide should help resolve most subscription-related issues and provide procedures for maintaining system health and security. 