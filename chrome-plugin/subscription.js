// Subscription management for PrivacyLens Chrome Plugin

import { 
  getUserTier, 
  isPremium, 
  createSubscription, 
  updateSubscription, 
  cancelSubscription, 
  getSubscriptionStatus,
  logout, 
  getCurrentUser 
} from './auth.js';

// DOM Elements
const freeTierView = document.getElementById('free-tier-view');
const premiumTierView = document.getElementById('premium-tier-view');
const currentPlanElement = document.getElementById('current-plan');
const nextBillingDateElement = document.getElementById('next-billing-date');
const monthlyPlanOption = document.getElementById('monthly-plan');
const annualPlanOption = document.getElementById('annual-plan');
const subscribeButton = document.getElementById('subscribe-button');
const cancelSubscriptionButton = document.getElementById('cancel-subscription-button');
const backButton = document.getElementById('back-button');
const logoutButton = document.getElementById('logout-button');
const subscriptionError = document.getElementById('subscription-error');
const subscriptionSuccess = document.getElementById('subscription-success');
const paymentProcessingSection = document.getElementById('payment-processing');
const loadingIndicator = document.querySelector('.loading');

// Selected plan type (monthly/annual)
let selectedPlanType = 'monthly';

// Initialize subscription page
document.addEventListener('DOMContentLoaded', async () => {
  try {
    showLoading(true);
    
    // Get current subscription status from the API
    const subscriptionStatus = await getSubscriptionStatus();
    
    if (subscriptionStatus.success && subscriptionStatus.active) {
      // Show premium tier view
      freeTierView.style.display = 'none';
      premiumTierView.style.display = 'block';
      
      // Update subscription details
      currentPlanElement.textContent = subscriptionStatus.tier === 'annual' ? 'Annual' : 'Monthly';
      
      // Format expiration date
      if (subscriptionStatus.currentPeriodEnd) {
        const expirationDate = new Date(subscriptionStatus.currentPeriodEnd);
        nextBillingDateElement.textContent = expirationDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } else {
        nextBillingDateElement.textContent = 'N/A';
      }
    } else {
      // Show free tier view
      freeTierView.style.display = 'block';
      premiumTierView.style.display = 'none';
      
      // If there was an error getting subscription status, show it
      if (!subscriptionStatus.success && subscriptionStatus.error) {
        showError(`Failed to load subscription status: ${subscriptionStatus.error}`);
      }
    }
  } catch (error) {
    console.error('[PrivacyLens Subscription] Error initializing subscription page:', error);
    showError('Failed to load subscription information. Please try again later.');
    
    // Default to showing free tier view on error
    freeTierView.style.display = 'block';
    premiumTierView.style.display = 'none';
  } finally {
    showLoading(false);
  }
});

// Toggle between monthly and annual plans
monthlyPlanOption.addEventListener('click', () => {
  monthlyPlanOption.classList.add('selected');
  annualPlanOption.classList.remove('selected');
  selectedPlanType = 'monthly';
});

annualPlanOption.addEventListener('click', () => {
  annualPlanOption.classList.add('selected');
  monthlyPlanOption.classList.remove('selected');
  selectedPlanType = 'annual';
});

// Handle subscription button click
subscribeButton.addEventListener('click', async () => {
  clearMessages();
  showLoading(true);
  
  try {
    // Get current user
    const user = await getCurrentUser();
    
    if (!user) {
      showError('You must be logged in to subscribe.');
      showLoading(false);
      return;
    }
    
    // Show payment processing section
    paymentProcessingSection.style.display = 'block';
    
    // Simulate payment method selection (in a real implementation, this would use Stripe Elements)
    // For development/testing, we'll use a mock payment method ID
    const paymentMethodId = 'pm_' + Math.random().toString(36).substring(2, 15);
    
    // Create subscription
    const result = await createSubscription(selectedPlanType, paymentMethodId);
    
    if (result.success) {
      // Show success message
      showSuccess('Subscription successful! You now have access to premium features.');
      
      // Refresh subscription status
      const subscriptionStatus = await getSubscriptionStatus();
      
      if (subscriptionStatus.success && subscriptionStatus.active) {
        // Update UI to show premium tier
        setTimeout(() => {
          freeTierView.style.display = 'none';
          premiumTierView.style.display = 'block';
          
          // Update subscription details
          currentPlanElement.textContent = subscriptionStatus.tier === 'annual' ? 'Annual' : 'Monthly';
          
          // Format expiration date
          if (subscriptionStatus.currentPeriodEnd) {
            const expirationDate = new Date(subscriptionStatus.currentPeriodEnd);
            nextBillingDateElement.textContent = expirationDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          } else {
            nextBillingDateElement.textContent = 'N/A';
          }
          
          // Hide payment processing section
          paymentProcessingSection.style.display = 'none';
        }, 2000);
      }
    } else {
      showError(result.error || 'Subscription failed. Please try again.');
      // Hide payment processing section
      paymentProcessingSection.style.display = 'none';
    }
  } catch (error) {
    console.error('[PrivacyLens Subscription] Subscription error:', error);
    showError('An unexpected error occurred. Please try again.');
    // Hide payment processing section
    paymentProcessingSection.style.display = 'none';
  } finally {
    showLoading(false);
  }
});

// Handle cancel subscription button click
cancelSubscriptionButton.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
    return;
  }
  
  clearMessages();
  showLoading(true);
  
  try {
    const result = await cancelSubscription();
    
    if (result.success) {
      // Show success message
      showSuccess('Your subscription has been canceled. You will have access to premium features until the end of your billing period.');
      
      // Refresh subscription status to get updated information
      const subscriptionStatus = await getSubscriptionStatus();
      
      if (subscriptionStatus.success) {
        if (!subscriptionStatus.active) {
          // Subscription is immediately inactive, switch to free tier view
          setTimeout(() => {
            freeTierView.style.display = 'block';
            premiumTierView.style.display = 'none';
          }, 2000);
        } else {
          // Subscription is still active until period end, update UI to show cancellation status
          cancelSubscriptionButton.textContent = 'Subscription will end at billing period';
          cancelSubscriptionButton.disabled = true;
        }
      }
    } else {
      showError(result.error || 'Failed to cancel subscription. Please try again.');
    }
  } catch (error) {
    console.error('[PrivacyLens Subscription] Cancellation error:', error);
    showError('An unexpected error occurred. Please try again.');
  } finally {
    showLoading(false);
  }
});

// Handle back button click
backButton.addEventListener('click', () => {
  window.location.href = 'popup.html';
});

// Handle logout button click
logoutButton.addEventListener('click', async () => {
  try {
    await logout();
    window.location.href = 'login.html';
  } catch (error) {
    console.error('[PrivacyLens Subscription] Logout error:', error);
    showError('Failed to logout. Please try again.');
  }
});

// Helper functions
function showError(message) {
  subscriptionError.textContent = message;
  subscriptionError.style.display = 'block';
  subscriptionSuccess.style.display = 'none';
}

function showSuccess(message) {
  subscriptionSuccess.textContent = message;
  subscriptionSuccess.style.display = 'block';
  subscriptionError.style.display = 'none';
}

function clearMessages() {
  subscriptionError.style.display = 'none';
  subscriptionSuccess.style.display = 'none';
}

function showLoading(show) {
  if (loadingIndicator) {
    loadingIndicator.style.display = show ? 'block' : 'none';
  }
}
