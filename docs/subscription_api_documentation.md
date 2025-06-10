# Subscription API Documentation

## Overview

The PrivacyLens Subscription API provides endpoints for managing user subscriptions, including creation, updates, cancellation, and status retrieval. The API also handles Stripe webhooks for real-time subscription updates.

## Base URL

- **Development**: `http://localhost/api/subscription`
- **Production**: `https://privacy-lens.com/api/subscription`

## Authentication

Most subscription endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

**Exception**: The webhook endpoint (`/webhook`) uses Stripe signature validation instead of JWT authentication.

## Endpoints

### Health Check

#### GET /health

Returns the health status of the subscription service.

**Authentication**: None required

**Request**:
```bash
curl -X GET http://localhost/api/subscription/health
```

**Response**:
```json
{
  "status": "healthy",
  "service": "subscription",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**:
- `200 OK`: Service is healthy

---

### Get Subscription Status

#### GET /status

Retrieves the current user's subscription status and tier information.

**Authentication**: Required (JWT)

**Request**:
```bash
curl -X GET http://localhost/api/subscription/status \
  -H "Authorization: Bearer <jwt_token>"
```

**Response (Active Subscription)**:
```json
{
  "success": true,
  "active": true,
  "tier": "monthly",
  "status": "active",
  "currentPeriodEnd": "2024-02-15T00:00:00.000Z",
  "subscription": {
    "id": 1,
    "plan_type": "monthly",
    "status": "active",
    "created_at": "2024-01-15T10:00:00.000Z",
    "current_period_end": "2024-02-15T00:00:00.000Z"
  }
}
```

**Response (No Subscription)**:
```json
{
  "success": true,
  "active": false,
  "tier": "free"
}
```

**Status Codes**:
- `200 OK`: Request successful
- `401 Unauthorized`: Invalid or missing JWT token
- `500 Internal Server Error`: Database or server error

---

### Create Subscription

#### POST /create

Creates a new subscription for the authenticated user.

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "planType": "monthly",
  "paymentMethodId": "pm_1234567890abcdef"
}
```

**Parameters**:
- `planType` (string, required): Either "monthly" or "annual"
- `paymentMethodId` (string, required): Stripe payment method ID

**Request**:
```bash
curl -X POST http://localhost/api/subscription/create \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "planType": "monthly",
    "paymentMethodId": "pm_1234567890abcdef"
  }'
```

**Response (Success)**:
```json
{
  "success": true,
  "subscription": {
    "id": "sub_1234567890abcdef",
    "status": "active",
    "current_period_start": 1640995200,
    "current_period_end": 1643673600
  },
  "clientSecret": "pi_1234567890abcdef_secret_xyz"
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "User already has an active subscription"
}
```

**Status Codes**:
- `200 OK`: Subscription created successfully
- `400 Bad Request`: Invalid parameters or user already has subscription
- `401 Unauthorized`: Invalid or missing JWT token
- `500 Internal Server Error`: Stripe API error or database error

---

### Update Subscription

#### POST /update

Updates the current user's subscription plan.

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "planType": "annual"
}
```

**Parameters**:
- `planType` (string, required): Either "monthly" or "annual"

**Request**:
```bash
curl -X POST http://localhost/api/subscription/update \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "planType": "annual"
  }'
```

**Response (Success)**:
```json
{
  "success": true,
  "subscription": {
    "id": "sub_1234567890abcdef",
    "status": "active",
    "current_period_start": 1640995200,
    "current_period_end": 1643673600
  }
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "No active subscription found"
}
```

**Status Codes**:
- `200 OK`: Subscription updated successfully
- `400 Bad Request`: Invalid plan type
- `401 Unauthorized`: Invalid or missing JWT token
- `404 Not Found`: No active subscription found
- `500 Internal Server Error`: Stripe API error or database error

---

### Cancel Subscription

#### POST /cancel

Cancels the current user's subscription.

**Authentication**: Required (JWT)

**Request**:
```bash
curl -X POST http://localhost/api/subscription/cancel \
  -H "Authorization: Bearer <jwt_token>"
```

**Response (Success)**:
```json
{
  "success": true,
  "subscription": {
    "id": "sub_1234567890abcdef",
    "status": "canceled",
    "canceled_at": 1640995200
  }
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "No active subscription found"
}
```

**Status Codes**:
- `200 OK`: Subscription canceled successfully
- `401 Unauthorized`: Invalid or missing JWT token
- `404 Not Found`: No active subscription found
- `500 Internal Server Error`: Stripe API error or database error

---

### Stripe Webhook

#### POST /webhook

Handles Stripe webhook events for subscription updates.

**Authentication**: Stripe signature validation (not JWT)

**Headers**:
- `stripe-signature` (required): Stripe webhook signature for verification

**Request**:
```bash
curl -X POST http://localhost/api/subscription/webhook \
  -H "stripe-signature: t=1640995200,v1=signature_hash" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_1234567890abcdef",
    "type": "customer.subscription.updated",
    "data": {
      "object": {
        "id": "sub_1234567890abcdef",
        "status": "active"
      }
    }
  }'
```

**Response (Success)**:
```json
{
  "received": true
}
```

**Response (Error)**:
```json
{
  "error": "Invalid signature"
}
```

**Supported Webhook Events**:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Status Codes**:
- `200 OK`: Webhook processed successfully
- `400 Bad Request`: Invalid signature or malformed event
- `500 Internal Server Error`: Database error during processing

## Error Handling

### Common Error Responses

**Authentication Error**:
```json
{
  "error": "Authentication required"
}
```

**Invalid Token**:
```json
{
  "error": "Invalid token"
}
```

**Validation Error**:
```json
{
  "success": false,
  "error": "Invalid plan type. Must be 'monthly' or 'annual'"
}
```

**Stripe Error**:
```json
{
  "success": false,
  "error": "Your card was declined"
}
```

**Database Error**:
```json
{
  "success": false,
  "error": "Database connection failed"
}
```

### Error Codes

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid parameters or request format |
| 401 | Unauthorized - Missing or invalid authentication |
| 404 | Not Found - Resource not found (e.g., no subscription) |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server or external service error |

## Rate Limiting

The subscription API implements rate limiting to prevent abuse:

- **Status endpoint**: 100 requests per minute per user
- **Create/Update/Cancel**: 10 requests per minute per user
- **Webhook endpoint**: 1000 requests per minute (global)

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995260
```

## CORS Support

The API supports Cross-Origin Resource Sharing (CORS) for Chrome plugin integration:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, stripe-signature
Access-Control-Allow-Credentials: true
```

## Stripe Integration

### Price IDs

The API uses the following Stripe price IDs:

- **Monthly Plan**: `price_monthly` (configured in environment)
- **Annual Plan**: `price_annual` (configured in environment)

### Webhook Security

Webhook endpoints verify Stripe signatures using the webhook secret:

```javascript
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

### Customer Management

- New users automatically get Stripe customers created
- Existing customers are reused for multiple subscriptions
- Customer metadata includes the PrivacyLens user ID

## Testing

### Development Testing

For development and testing, the API uses a mock Stripe client when `STRIPE_SECRET_KEY` is not configured:

```javascript
// Mock responses for development
const mockStripe = {
  subscriptions: {
    create: () => Promise.resolve({ id: 'sub_mock', status: 'active' })
  }
};
```

### Test Endpoints

Use the health endpoint to verify the service is running:

```bash
curl http://localhost/api/subscription/health
```

### Authentication Testing

Test authentication with a valid JWT token:

```bash
# This should return 401
curl http://localhost/api/subscription/status

# This should return 200 with subscription data
curl -H "Authorization: Bearer <valid_token>" \
     http://localhost/api/subscription/status
``` 