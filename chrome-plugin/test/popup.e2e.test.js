/**
 * @jest-environment jsdom
 */
// Interaction tests for popup.html + popup.js (jsdom + mocked chrome APIs).
// Free-tier scenarios: cached assessment rendering, refresh, menu buttons,
// plugin active toggle.
import { loadPage, flush, initPage } from './helpers/loadPage.js';
import { getAssessment, updateAssessmentInDB, checkAndInitializeDatabase } from '../db.js';
import {
  isAuthenticated,
  hasFeature,
  getCurrentUser,
  logout,
  getAuthToken,
  getSubscriptionStatus,
  getDeviceId
} from '../auth.js';
import { checkForUpdates } from '../updater.js';

jest.mock('../db.js', () => ({
  getAssessment: jest.fn(),
  updateAssessmentInDB: jest.fn().mockResolvedValue(undefined),
  checkAndInitializeDatabase: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../auth.js', () => ({
  isAuthenticated: jest.fn(),
  isPremium: jest.fn(),
  hasFeature: jest.fn(),
  getCurrentUser: jest.fn(),
  logout: jest.fn(),
  getAuthToken: jest.fn(),
  getSubscriptionStatus: jest.fn(),
  getDeviceId: jest.fn()
}));

jest.mock('../updater.js', () => ({
  checkForUpdates: jest.fn()
}));

const CACHED_ASSESSMENT = {
  domain: 'example.com',
  assessment: {
    riskLevel: 'high',
    categories: {
      dataCollection: { risk: 'high' },
      userControl: { risk: 'low' }
    },
    policyUrl: 'https://example.com/privacy'
  },
  metadata: { timestamp: 1700000000000, source: 'prepackaged' }
};

// popup.js attaches its DOMContentLoaded listener at require time
require('../popup.js');

async function initPopup({ url = 'https://example.com/page', authenticated = false } = {}) {
  loadPage('popup.html');
  chrome.tabs.query.mockResolvedValue([{ url, id: 7 }]);
  isAuthenticated.mockResolvedValue(authenticated);
  await initPage();
}

beforeEach(() => {
  jest.clearAllMocks();

  global.chrome = {
    tabs: { query: jest.fn(), create: jest.fn() },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined)
      }
    },
    action: { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() }
  };
  global.fetch = jest.fn();

  getAssessment.mockResolvedValue(CACHED_ASSESSMENT);
  checkAndInitializeDatabase.mockResolvedValue(undefined);
  updateAssessmentInDB.mockResolvedValue(undefined);
  isAuthenticated.mockResolvedValue(false);
  hasFeature.mockResolvedValue(false);
  getCurrentUser.mockResolvedValue(null);
  getAuthToken.mockResolvedValue(null);
  getSubscriptionStatus.mockResolvedValue({ success: false, active: false, tier: 'free' });
  getDeviceId.mockResolvedValue('device_123');
  checkForUpdates.mockResolvedValue({ hasUpdate: false });
});

describe('popup initialization with a cached assessment', () => {
  test('renders current URL, risk badge, categories, source info and policy link', async () => {
    await initPopup();

    expect(document.getElementById('current-url').textContent).toBe('https://example.com/page');

    const indicator = document.getElementById('risk-indicator');
    expect(indicator.textContent).toBe('!');
    expect(indicator.className).toContain('high');
    expect(document.getElementById('risk-text').textContent).toBe('High Risk');

    const details = document.getElementById('assessment-details');
    expect(details.style.display).toBe('block');
    expect(details.textContent).toContain('Data Collection: high');
    expect(details.textContent).toContain('User Control: low');

    expect(document.getElementById('data-source-info').textContent).toContain('pre-packaged database');

    const policyContainer = document.getElementById('privacy-policy-container');
    expect(policyContainer.style.display).toBe('block');
    expect(document.getElementById('privacy-policy-url').href).toBe('https://example.com/privacy');
  });

  test('shows logged-out menu and free tier badge', async () => {
    await initPopup();

    expect(document.getElementById('logged-out-menu').style.display).toBe('block');
    expect(document.getElementById('logged-in-menu').style.display).toBe('none');
    expect(document.getElementById('server-fetch-container').style.display).toBe('none');
    expect(document.querySelector('#user-tier-indicator .tier-badge').textContent).toBe('Free Tier');
  });

  test('shows invalid state for non-http pages', async () => {
    await initPopup({ url: 'chrome://extensions' });

    expect(document.getElementById('risk-indicator').textContent).toBe('-');
    expect(document.getElementById('risk-text').textContent).toBe('This page cannot be assessed');
  });

  test('shows unknown state when no cached assessment exists', async () => {
    getAssessment.mockResolvedValue(null);
    await initPopup();

    expect(document.getElementById('risk-indicator').textContent).toBe('?');
    expect(document.getElementById('risk-text').textContent).toBe('No assessment available');
    // Free tier: must not hit the server automatically
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('refresh button', () => {
  test('re-reads the local database and re-renders cached data', async () => {
    await initPopup();
    getAssessment.mockClear();

    document.getElementById('refresh-btn').click();
    await flush();

    expect(getAssessment).toHaveBeenCalledWith('example.com');
    expect(document.getElementById('risk-text').textContent).toBe('High Risk');
    expect(document.getElementById('refresh-btn').disabled).toBe(false);
  });

  test('free tier with no local data gets upgrade message, no server call', async () => {
    getAssessment.mockResolvedValue(null);
    await initPopup();

    document.getElementById('refresh-btn').click();
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(document.getElementById('risk-text').textContent).toContain('upgrade to premium');
  });

  test('premium user with no local data triggers a server assessment', async () => {
    getAssessment.mockResolvedValue(null);
    isAuthenticated.mockResolvedValue(true);
    hasFeature.mockResolvedValue(true);
    getCurrentUser.mockResolvedValue({ email: 'pro@example.com' });
    getAuthToken.mockResolvedValue('tok');
    getSubscriptionStatus.mockResolvedValue({ success: true, active: true, tier: 'monthly' });
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: 'success',
        assessment: { riskLevel: 'low', categories: { dataSharing: { risk: 'low' } } }
      })
    });

    await initPopup();
    document.getElementById('refresh-btn').click();
    await flush();

    expect(global.fetch).toHaveBeenCalled();
    const [fetchUrl, options] = global.fetch.mock.calls[0];
    expect(fetchUrl).toContain('/assessment?url=example.com');
    expect(options.headers.Authorization).toBe('Bearer tok');
    expect(updateAssessmentInDB).toHaveBeenCalled();
    expect(document.getElementById('risk-text').textContent).toBe('Low Risk');
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: 'L' });
  });
});

describe('menu buttons', () => {
  test('login button opens login.html in a new tab', async () => {
    await initPopup();
    document.getElementById('login-btn').click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'login.html' });
  });

  test('subscription and updates buttons open their pages', async () => {
    await initPopup();
    document.getElementById('subscription-btn').click();
    document.getElementById('updates-btn').click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'subscription.html' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'update.html' });
  });

  test('logout button calls auth.logout and returns to logged-out UI', async () => {
    logout.mockResolvedValue({ success: true });
    await initPopup({ authenticated: true });

    expect(document.getElementById('logged-in-menu').style.display).toBe('block');

    // After logout the user is no longer authenticated
    isAuthenticated.mockResolvedValue(false);
    document.getElementById('logout-btn').click();
    await flush();

    expect(logout).toHaveBeenCalled();
    expect(document.getElementById('logged-out-menu').style.display).toBe('block');
  });

  test('shows user email when authenticated', async () => {
    getCurrentUser.mockResolvedValue({ email: 'user@example.com' });
    await initPopup({ authenticated: true });
    expect(document.getElementById('user-email').textContent).toBe('user@example.com');
  });
});

describe('server fetch button (premium)', () => {
  test('is visible for premium users and fetches + stores + displays', async () => {
    isAuthenticated.mockResolvedValue(true);
    hasFeature.mockImplementation((f) => Promise.resolve(f === 'serverFetch'));
    getCurrentUser.mockResolvedValue({ email: 'pro@example.com' });
    getAuthToken.mockResolvedValue('tok');
    getSubscriptionStatus.mockResolvedValue({ success: true, active: true, tier: 'annual' });
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: 'success',
        assessment: { riskLevel: 'medium', categories: {} }
      })
    });

    await initPopup({ authenticated: true });

    const container = document.getElementById('server-fetch-container');
    expect(container.style.display).toBe('block');

    const btn = document.getElementById('server-fetch-btn');
    btn.click();
    await flush();

    expect(global.fetch).toHaveBeenCalled();
    expect(global.fetch.mock.calls[0][0]).toContain('/assessment?url=example.com');
    expect(updateAssessmentInDB).toHaveBeenCalled();
    expect(document.getElementById('risk-text').textContent).toBe('Medium Risk');
    expect(btn.disabled).toBe(false);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: 'M' });
  });
});

describe('plugin active toggle', () => {
  test('turning off persists state and shows inactive', async () => {
    await initPopup();

    const toggle = document.getElementById('active-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ pluginActive: false });
    expect(document.getElementById('risk-indicator').textContent).toBe('OFF');
    expect(document.getElementById('risk-text').textContent).toBe('Plugin is inactive');
  });

  test('popup starts inactive when stored state is off', async () => {
    chrome.storage.local.get.mockResolvedValue({ pluginActive: false });
    await initPopup();

    expect(document.getElementById('risk-indicator').textContent).toBe('OFF');
    expect(getAssessment).not.toHaveBeenCalled();
  });
});

describe('update notification', () => {
  test('marks the updates button when an update is available', async () => {
    checkForUpdates.mockResolvedValue({ hasUpdate: true, version: '2.1.0' });
    await initPopup({ authenticated: true });

    const updatesBtn = document.getElementById('updates-btn');
    expect(updatesBtn.textContent).toBe('Update Available!');
  });
});
