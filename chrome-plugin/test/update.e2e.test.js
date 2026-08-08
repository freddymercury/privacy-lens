/**
 * @jest-environment jsdom
 */
// Interaction tests for update.html + update.js (jsdom + mocked updater module).
import { loadPage, flush, initPage } from './helpers/loadPage.js';
import {
  checkForUpdates,
  applyUpdate,
  getUpdateHistory,
  getDeviceId
} from '../updater.js';

jest.mock('../updater.js', () => ({
  checkForUpdates: jest.fn(),
  applyUpdate: jest.fn(),
  getUpdateHistory: jest.fn(),
  getDeviceId: jest.fn()
}));

function setLocationStub() {
  delete window.location;
  window.location = { href: '' };
}

// update.js grabs DOM elements at module load; page must be in the DOM first.
setLocationStub();
loadPage('update.html');
require('../update.js');

beforeEach(async () => {
  jest.clearAllMocks();
  setLocationStub();
  getDeviceId.mockResolvedValue('device_123');
  getUpdateHistory.mockResolvedValue([
    { version: '2.0.0', appliedAt: '2025-04-23T00:00:00Z', changelog: 'Initial release' }
  ]);
  checkForUpdates.mockResolvedValue({ hasUpdate: false, currentVersion: '2.0.0' });
  global.chrome = { runtime: { reload: jest.fn() } };
  await initPage();
});

describe('page load', () => {
  test('checks for updates on load and shows up-to-date view', () => {
    expect(checkForUpdates).toHaveBeenCalledWith('2.0.0', 'device_123');
    expect(document.getElementById('up-to-date-view').style.display).toBe('block');
    expect(document.getElementById('update-available-view').style.display).toBe('none');
    expect(document.getElementById('update-success').textContent).toBe('You are using the latest version.');
  });

  test('renders update history from the updater module', () => {
    const changelog = document.getElementById('changelog');
    expect(changelog.textContent).toContain('Version 2.0.0');
    expect(changelog.textContent).toContain('Initial release');
  });

  test('shows empty history message when there is none', async () => {
    getUpdateHistory.mockResolvedValue([]);
    await initPage();
    expect(document.getElementById('changelog').textContent).toContain('No update history available.');
  });

  // NOTE: latestUpdateInfo is module-level state in update.js and this file
  // requires the module once, so this test must run before any test that
  // completes an "update available" check.
  test('apply button refuses to apply without a prior successful update check', async () => {
    document.getElementById('apply-update-button').click();
    await flush();

    expect(applyUpdate).not.toHaveBeenCalled();
    expect(document.getElementById('update-error').textContent).toContain('No update information available');
  });
});

describe('check for updates button', () => {
  test('switches to update-available view with version, type and changelog', async () => {
    checkForUpdates.mockResolvedValue({
      hasUpdate: true,
      version: '2.1.0',
      updateId: 'u1',
      updateType: 'Feature Update',
      changelog: '- New stuff'
    });

    document.getElementById('check-updates-button').click();
    await flush();

    expect(document.getElementById('update-available-view').style.display).toBe('block');
    expect(document.getElementById('up-to-date-view').style.display).toBe('none');
    expect(document.getElementById('new-version').textContent).toBe('2.1.0');
    expect(document.getElementById('update-type').textContent).toBe('Feature Update');
    expect(document.getElementById('update-changelog').textContent).toBe('- New stuff');
    expect(document.getElementById('update-success').textContent).toContain('2.1.0');
  });

  test('shows an error when the update check fails', async () => {
    checkForUpdates.mockRejectedValue(new Error('offline'));

    document.getElementById('check-updates-button').click();
    await flush();

    expect(document.getElementById('update-error').textContent).toBe('Failed to check for updates. Please try again later.');
  });
});

describe('apply update button', () => {
  async function makeUpdateAvailable() {
    checkForUpdates.mockResolvedValue({
      hasUpdate: true,
      version: '2.1.0',
      updateId: 'u1',
      updateType: 'Feature Update',
      changelog: '- New stuff'
    });
    document.getElementById('check-updates-button').click();
    await flush();
  }

  test('applies the pending update and shows progress to 100%', async () => {
    applyUpdate.mockResolvedValue({ success: true, version: '2.1.0' });
    await makeUpdateAvailable();

    document.getElementById('apply-update-button').click();
    await flush();

    expect(applyUpdate).toHaveBeenCalledWith('u1', 'device_123');
    expect(document.getElementById('progress-bar').style.width).toBe('100%');
    expect(document.getElementById('update-success').textContent).toContain('2.1.0');
  });

  test('shows an error and hides progress when apply fails', async () => {
    applyUpdate.mockResolvedValue({ success: false, error: 'bad package' });
    await makeUpdateAvailable();

    document.getElementById('apply-update-button').click();
    await flush();

    expect(document.getElementById('update-error').textContent).toBe('bad package');
    expect(document.getElementById('progress-container').style.display).toBe('none');
  });
});

describe('back button', () => {
  test('returns to popup.html', () => {
    document.getElementById('back-button').click();
    expect(window.location.href).toBe('popup.html');
  });
});
