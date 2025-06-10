# Chrome Plugin Subscription Features Guide

## Overview

The PrivacyLens Chrome plugin includes comprehensive subscription management features that allow users to upgrade, manage, and monitor their subscription status directly from the browser extension.

## Subscription Features

### 1. Subscription Status Display

The plugin popup displays the current subscription status prominently:

**Free Tier Users**:
- Shows "Free Plan" badge
- Displays assessment limits (e.g., "5 assessments remaining")
- Prominent upgrade button

**Premium Users**:
- Shows plan type ("Monthly" or "Annual")
- Displays subscription status ("Active", "Expiring", etc.)
- Shows next billing date
- Access to subscription management

### 2. Subscription Management Interface

#### Upgrade Flow
1. **Trigger**: Click "Upgrade to Premium" button
2. **Plan Selection**: Choose between Monthly ($9.99/month) or Annual ($99.99/year)
3. **Payment**: Stripe payment form integration
4. **Confirmation**: Success message and immediate feature unlock

#### Plan Change Flow
1. **Access**: "Manage Subscription" button for premium users
2. **Options**: Switch between Monthly/Annual plans
3. **Proration**: Automatic proration handling via Stripe
4. **Confirmation**: Updated plan information display

#### Cancellation Flow
1. **Access**: "Cancel Subscription" option in management menu
2. **Confirmation**: Warning dialog about feature loss
3. **Processing**: Immediate cancellation via API
4. **Result**: Subscription remains active until period end

### 3. Feature Gating

The plugin implements subscription-based feature restrictions:

#### Free Tier Limitations
- **Assessment Limit**: 5 assessments per day
- **Server Assessments**: Not available (local-only assessments)
- **Detailed Reports**: Basic privacy scores only
- **Export Features**: Not available

#### Premium Tier Benefits
- **Unlimited Assessments**: No daily limits
- **Server Assessments**: Full LLM-powered analysis
- **Detailed Reports**: Comprehensive privacy breakdowns
- **Export Features**: PDF and CSV export options
- **Priority Support**: Faster response times

## API Integration

### Subscription Status Checking

The plugin regularly checks subscription status:

```javascript
// Check subscription status on popup open
async function checkSubscriptionStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/subscription/status`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const data = await response.json();
    updateUIBasedOnSubscription(data);
  } catch (error) {
    console.error('Failed to check subscription status:', error);
    // Fallback to free tier
    updateUIBasedOnSubscription({ active: false, tier: 'free' });
  }
}
```

### Subscription Creation

```javascript
async function createSubscription(planType, paymentMethodId) {
  try {
    const response = await fetch(`${API_BASE_URL}/subscription/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        planType,
        paymentMethodId
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Handle successful subscription creation
      showSuccessMessage('Subscription created successfully!');
      updateSubscriptionStatus();
    } else {
      showErrorMessage(data.error);
    }
  } catch (error) {
    showErrorMessage('Failed to create subscription');
  }
}
```

### Subscription Updates

```javascript
async function updateSubscription(newPlanType) {
  try {
    const response = await fetch(`${API_BASE_URL}/subscription/update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        planType: newPlanType
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showSuccessMessage(`Plan updated to ${newPlanType}`);
      updateSubscriptionStatus();
    } else {
      showErrorMessage(data.error);
    }
  } catch (error) {
    showErrorMessage('Failed to update subscription');
  }
}
```

## UI Components

### Subscription Status Badge

```html
<!-- Free Tier -->
<div class="subscription-badge free">
  <span class="tier">Free Plan</span>
  <span class="limit">5 assessments remaining</span>
</div>

<!-- Premium Tier -->
<div class="subscription-badge premium">
  <span class="tier">Premium Monthly</span>
  <span class="status">Active until Feb 15, 2024</span>
</div>
```

### Upgrade Button

```html
<button id="upgrade-btn" class="upgrade-button">
  <span class="icon">⭐</span>
  <span class="text">Upgrade to Premium</span>
  <span class="price">$9.99/month</span>
</button>
```

### Subscription Management Menu

```html
<div class="subscription-menu">
  <button id="change-plan-btn">Change Plan</button>
  <button id="billing-history-btn">Billing History</button>
  <button id="cancel-subscription-btn" class="danger">Cancel Subscription</button>
</div>
```

## Error Handling

### Network Errors

```javascript
function handleSubscriptionError(error) {
  if (error.name === 'NetworkError') {
    showErrorMessage('Network connection failed. Please check your internet connection.');
  } else if (error.status === 401) {
    // Token expired, redirect to login
    redirectToLogin();
  } else if (error.status === 429) {
    showErrorMessage('Too many requests. Please try again later.');
  } else {
    showErrorMessage('An unexpected error occurred. Please try again.');
  }
}
```

### Stripe Payment Errors

```javascript
function handleStripeError(error) {
  switch (error.code) {
    case 'card_declined':
      showErrorMessage('Your card was declined. Please try a different payment method.');
      break;
    case 'insufficient_funds':
      showErrorMessage('Insufficient funds. Please check your account balance.');
      break;
    case 'expired_card':
      showErrorMessage('Your card has expired. Please update your payment method.');
      break;
    default:
      showErrorMessage('Payment failed. Please try again or contact support.');
  }
}
```

## User Experience Flows

### First-Time User Flow

1. **Install Plugin**: User installs PrivacyLens extension
2. **Registration**: Create account or sign in
3. **Free Trial**: Immediate access to 5 free assessments
4. **Upgrade Prompt**: After using 3-4 assessments, show upgrade benefits
5. **Conversion**: Streamlined upgrade process with clear value proposition

### Existing User Flow

1. **Status Check**: Plugin checks subscription status on startup
2. **Feature Access**: Enable/disable features based on subscription
3. **Renewal Reminders**: Show renewal notices 7 days before expiration
4. **Seamless Experience**: No interruption for active subscribers

### Cancellation Flow

1. **Access**: User clicks "Cancel Subscription" in settings
2. **Retention**: Show benefits and offer to pause instead
3. **Confirmation**: Clear warning about feature loss
4. **Processing**: Immediate API call to cancel
5. **Feedback**: Optional cancellation reason survey
6. **Grace Period**: Features remain active until period end

## Configuration

### API Endpoints

The plugin is configured to use the following subscription endpoints:

```javascript
const SUBSCRIPTION_ENDPOINTS = {
  status: '/api/subscription/status',
  create: '/api/subscription/create',
  update: '/api/subscription/update',
  cancel: '/api/subscription/cancel'
};
```

### Environment Configuration

```javascript
// Development
const API_BASE_URL = 'http://localhost';

// Production
const API_BASE_URL = 'https://privacy-lens.com';
```

### Feature Flags

```javascript
const FEATURE_FLAGS = {
  serverAssessments: subscription.active && subscription.tier !== 'free',
  unlimitedAssessments: subscription.active,
  exportFeatures: subscription.active,
  prioritySupport: subscription.active
};
```

## Testing

### Manual Testing Checklist

#### Free Tier Testing
- [ ] Install plugin and verify free tier status
- [ ] Perform 5 assessments and verify limit enforcement
- [ ] Verify upgrade prompts appear appropriately
- [ ] Test upgrade flow with test payment method

#### Premium Tier Testing
- [ ] Verify premium features are unlocked
- [ ] Test unlimited assessments
- [ ] Test server assessment functionality
- [ ] Verify subscription management options

#### Subscription Management Testing
- [ ] Test plan changes (monthly ↔ annual)
- [ ] Test subscription cancellation
- [ ] Verify grace period behavior
- [ ] Test subscription renewal

### Automated Testing

```javascript
// Test subscription status checking
describe('Subscription Status', () => {
  test('should display free tier for unauthenticated users', async () => {
    const status = await getSubscriptionStatus();
    expect(status.tier).toBe('free');
    expect(status.active).toBe(false);
  });
  
  test('should display premium tier for active subscribers', async () => {
    mockAuthToken('premium_user_token');
    const status = await getSubscriptionStatus();
    expect(status.tier).toBe('monthly');
    expect(status.active).toBe(true);
  });
});
```

## Troubleshooting

### Common Issues

#### Subscription Status Not Updating
- **Cause**: Network connectivity or API errors
- **Solution**: Implement retry logic and offline fallback
- **Prevention**: Cache last known status locally

#### Payment Failures
- **Cause**: Invalid payment methods or Stripe issues
- **Solution**: Clear error messages and alternative payment options
- **Prevention**: Validate payment methods before submission

#### Feature Access Issues
- **Cause**: Subscription status caching or sync delays
- **Solution**: Force refresh subscription status
- **Prevention**: Implement real-time webhook updates

### Debug Mode

Enable debug mode for detailed subscription logging:

```javascript
// Add to manifest.json for development
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; script-src-elem 'self' 'unsafe-inline';"
}

// Enable debug logging
const DEBUG_SUBSCRIPTION = true;

function debugLog(message, data) {
  if (DEBUG_SUBSCRIPTION) {
    console.log(`[Subscription Debug] ${message}`, data);
  }
}
```

## Support and Maintenance

### Monitoring

Track key subscription metrics:
- Conversion rate (free → premium)
- Churn rate (cancellations)
- Feature usage by tier
- Payment failure rates

### Updates

When updating subscription features:
1. Test thoroughly in development
2. Deploy to staging environment
3. Verify with test Stripe account
4. Monitor error rates after production deployment
5. Have rollback plan ready

### User Support

Common support scenarios:
- Payment method updates
- Plan change requests
- Cancellation assistance
- Feature access issues
- Billing inquiries 