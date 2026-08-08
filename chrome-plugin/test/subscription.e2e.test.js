/**
 * @jest-environment jsdom
 */
// Interaction tests for subscription.html + subscription.js (jsdom + mocked auth module).
import { loadPage, flush, initPage } from './helpers/loadPage.js';
import {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getCurrentUser,
  logout
} from '../auth.js';

jest.mock('../auth.js', () => ({
  getUserTier: jest.fn(),
  isPremium: jest.fn(),
  createSubscription: jest.fn(),
  updateSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  getSubscriptionStatus: jest.fn(),
  logout: jest.fn(),
  getCurrentUser: jest.fn()
}));

function setLocationStub() {
  delete window.location;
  window.location = { href: '' };
}

// subscription.js grabs DOM elements at module load; page must be in the DOM first.
setLocationStub();
loadPage('subscription.html');
require('../subscription.js');

beforeEach(async () => {
  jest.clearAllMocks();
  setLocationStub();
  getSubscriptionStatus.mockResolvedValue({ success: true, active: false, tier: 'free' });
  getCurrentUser.mockResolvedValue({ email: 'user@example.com' });
  window.confirm = jest.fn().mockReturnValue(true);
  // Reset mutable DOM state left over from earlier tests
  const cancelBtn = document.getElementById('cancel-subscription-button');
  cancelBtn.disabled = false;
  cancelBtn.textContent = 'Cancel Subscription';
  document.getElementById('subscription-error').style.display = 'none';
  document.getElementById('subscription-success').style.display = 'none';
  await initPage();
});

describe('page load', () => {
  test('shows free tier view for users without an active subscription', () => {
    expect(document.getElementById('free-tier-view').style.display).toBe('block');
    expect(document.getElementById('premium-tier-view').style.display).toBe('none');
  });

  test('shows premium view with plan and billing date for active subscribers', async () => {
    getSubscriptionStatus.mockResolvedValue({
      success: true,
      active: true,
      tier: 'annual',
      currentPeriodEnd: '2026-05-23T00:00:00Z'
    });
    await initPage();

    expect(document.getElementById('premium-tier-view').style.display).toBe('block');
    expect(document.getElementById('free-tier-view').style.display).toBe('none');
    expect(document.getElementById('current-plan').textContent).toBe('Annual');
    expect(document.getElementById('next-billing-date').textContent).toContain('2026');
  });

  test('shows an error when subscription status cannot be loaded', async () => {
    getSubscriptionStatus.mockResolvedValue({ success: false, active: false, error: 'server down' });
    await initPage();

    expect(document.getElementById('subscription-error').textContent).toContain('server down');
  });
});

describe('plan selection', () => {
  test('clicking annual plan marks it selected and deselects monthly', () => {
    document.getElementById('annual-plan').click();
    expect(document.getElementById('annual-plan').classList.contains('selected')).toBe(true);
    expect(document.getElementById('monthly-plan').classList.contains('selected')).toBe(false);
  });

  test('clicking monthly plan switches back', () => {
    document.getElementById('annual-plan').click();
    document.getElementById('monthly-plan').click();
    expect(document.getElementById('monthly-plan').classList.contains('selected')).toBe(true);
    expect(document.getElementById('annual-plan').classList.contains('selected')).toBe(false);
  });
});

describe('subscribe button', () => {
  test('creates a monthly subscription by default', async () => {
    createSubscription.mockResolvedValue({ success: true, subscription: {} });
    getSubscriptionStatus
      .mockResolvedValueOnce({ success: true, active: false, tier: 'free' }) // init
      .mockResolvedValue({ success: true, active: true, tier: 'monthly' });  // after subscribe

    document.getElementById('subscribe-button').click();
    await flush();

    expect(createSubscription).toHaveBeenCalledTimes(1);
    const [planType, paymentMethodId] = createSubscription.mock.calls[0];
    expect(planType).toBe('monthly');
    expect(paymentMethodId).toMatch(/^pm_/);
    expect(document.getElementById('subscription-success').textContent).toContain('Subscription successful');
  });

  test('creates an annual subscription when annual plan is selected', async () => {
    createSubscription.mockResolvedValue({ success: true, subscription: {} });

    document.getElementById('annual-plan').click();
    document.getElementById('subscribe-button').click();
    await flush();

    expect(createSubscription.mock.calls[0][0]).toBe('annual');
  });

  test('requires a logged-in user', async () => {
    getCurrentUser.mockResolvedValue(null);
    document.getElementById('subscribe-button').click();
    await flush();

    expect(createSubscription).not.toHaveBeenCalled();
    expect(document.getElementById('subscription-error').textContent).toBe('You must be logged in to subscribe.');
  });

  test('shows error and hides payment section when creation fails', async () => {
    createSubscription.mockResolvedValue({ success: false, error: 'card declined' });
    document.getElementById('subscribe-button').click();
    await flush();

    expect(document.getElementById('subscription-error').textContent).toBe('card declined');
    expect(document.getElementById('payment-processing').style.display).toBe('none');
  });
});

describe('cancel subscription button', () => {
  beforeEach(async () => {
    getSubscriptionStatus.mockResolvedValue({
      success: true,
      active: true,
      tier: 'monthly',
      currentPeriodEnd: '2026-05-23T00:00:00Z'
    });
    await initPage();
  });

  test('does nothing when the user declines the confirmation', async () => {
    window.confirm.mockReturnValue(false);
    document.getElementById('cancel-subscription-button').click();
    await flush();

    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  test('cancels after confirmation and shows access-until-period-end state', async () => {
    cancelSubscription.mockResolvedValue({ success: true, subscription: {} });
    document.getElementById('cancel-subscription-button').click();
    await flush();

    expect(cancelSubscription).toHaveBeenCalled();
    expect(document.getElementById('subscription-success').textContent).toContain('has been canceled');
    // Still active until period end -> button reflects pending cancellation
    expect(document.getElementById('cancel-subscription-button').disabled).toBe(true);
  });

  test('shows error when cancellation fails', async () => {
    cancelSubscription.mockResolvedValue({ success: false, error: 'stripe error' });
    document.getElementById('cancel-subscription-button').click();
    await flush();

    expect(document.getElementById('subscription-error').textContent).toBe('stripe error');
  });
});

describe('navigation buttons', () => {
  test('back button returns to popup.html', () => {
    document.getElementById('back-button').click();
    expect(window.location.href).toBe('popup.html');
  });

  test('logout button signs out and goes to login.html', async () => {
    logout.mockResolvedValue({ success: true });
    document.getElementById('logout-button').click();
    await flush();

    expect(logout).toHaveBeenCalled();
    expect(window.location.href).toBe('login.html');
  });
});
