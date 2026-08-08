// Unit tests for updater.js with the db/auth module boundaries mocked.
import {
  checkForUpdates,
  applyUpdate,
  getUpdateHistory,
  getDeviceId
} from '../updater.js';
import { getObjectStore } from '../db.js';
import { getAuthToken, getDeviceId as authGetDeviceId } from '../auth.js';

jest.mock('../db.js', () => ({
  getObjectStore: jest.fn()
}));

jest.mock('../auth.js', () => ({
  getAuthToken: jest.fn(),
  getDeviceId: jest.fn(),
  hasFeature: jest.fn(),
  getUserTier: jest.fn()
}));

// In-memory stand-in for the 'updates' object store records
function makeStoreMock(records = {}) {
  return {
    put: jest.fn((value) => {
      records[value.key] = value;
      const req = {};
      setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
      return req;
    }),
    get: jest.fn((key) => {
      const req = { result: records[key] };
      setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
      return req;
    })
  };
}

let records;

beforeEach(() => {
  jest.clearAllMocks();
  records = {};
  getObjectStore.mockImplementation(() => Promise.resolve(makeStoreMock(records)));
  getAuthToken.mockResolvedValue('test-token');
  authGetDeviceId.mockResolvedValue('device_123');
  global.fetch = jest.fn();
});

describe('checkForUpdates', () => {
  test('returns hasUpdate false when not authenticated', async () => {
    getAuthToken.mockResolvedValue(null);
    const result = await checkForUpdates('2.0.0', 'device_123');
    expect(result).toEqual({ hasUpdate: false, currentVersion: '2.0.0' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns update info and stores it when an update is available', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        update: { hasUpdate: true, version: '2.1.0', updateId: 'u1', updateType: 'feature' }
      })
    });

    const result = await checkForUpdates('2.0.0', 'device_123');
    expect(result.hasUpdate).toBe(true);
    expect(result.version).toBe('2.1.0');

    // Stored for offline fallback
    expect(records.latestUpdate.value.version).toBe('2.1.0');
  });

  test('hits the /updates/check endpoint with auth header', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success', update: { hasUpdate: false } })
    });

    await checkForUpdates('2.0.0', 'device_123');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/updates/check');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(options.body)).toEqual({ currentVersion: '2.0.0', deviceId: 'device_123' });
  });

  test('falls back to stored update info when the server is unreachable', async () => {
    records.latestUpdate = { key: 'latestUpdate', value: { version: '2.2.0', updateId: 'u9' } };
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await checkForUpdates('2.0.0', 'device_123');
    expect(result.hasUpdate).toBe(true);
    expect(result.version).toBe('2.2.0');
  });

  test('reports no update on server failure with nothing stored', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const result = await checkForUpdates('2.0.0', 'device_123');
    expect(result.hasUpdate).toBe(false);
    expect(result.error).toBe('network down');
  });
});

describe('applyUpdate', () => {
  test('fails early when not authenticated', async () => {
    getAuthToken.mockResolvedValue(null);
    const result = await applyUpdate('u1', 'device_123');
    expect(result.success).toBe(false);
    expect(result.error).toBe('User not authenticated');
  });

  test('succeeds on a successful server response and records history', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        update: { success: true, version: '2.1.0', updateType: 'feature', changelog: 'stuff' }
      })
    });

    const result = await applyUpdate('u1', 'device_123');
    expect(result).toEqual({ success: true, version: '2.1.0', updateType: 'feature' });
    expect(records.updateHistory.value).toHaveLength(1);
    expect(records.updateHistory.value[0].version).toBe('2.1.0');
  });

  // Regression test: `!data.status === 'success'` used to make this check
  // never fire, so a failed status with a truthy update would be treated as
  // success.
  test('treats a non-success status as a failure even when update payload is present', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'error',
        update: { success: true, version: '2.1.0' }
      })
    });

    const result = await applyUpdate('u1', 'device_123');
    expect(result.success).toBe(false);
  });

  test('fails when update.success is false', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        update: { success: false, error: 'corrupt package' }
      })
    });

    const result = await applyUpdate('u1', 'device_123');
    expect(result.success).toBe(false);
    expect(result.error).toBe('corrupt package');
  });

  test('fails on server error responses', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'boom' })
    });

    const result = await applyUpdate('u1', 'device_123');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  test('applies updateData to provided storage', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        update: {
          success: true,
          version: '2.1.0',
          updateData: { templates: { a: 1 }, settings: { b: 2 }, rules: { c: 3 } }
        }
      })
    });

    const storage = { set: jest.fn().mockResolvedValue(undefined) };
    const result = await applyUpdate('u1', 'device_123', storage);

    expect(result.success).toBe(true);
    expect(storage.set).toHaveBeenCalledWith('templates', { a: 1 });
    expect(storage.set).toHaveBeenCalledWith('settings', { b: 2 });
    expect(storage.set).toHaveBeenCalledWith('rules', { c: 3 });
  });
});

describe('getUpdateHistory', () => {
  test('returns server history when available', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        history: [{ version: '2.0.0', appliedAt: '2025-01-01' }]
      })
    });

    const history = await getUpdateHistory();
    expect(history).toEqual([{ version: '2.0.0', appliedAt: '2025-01-01' }]);
  });

  test('falls back to local history when server fails', async () => {
    records.updateHistory = {
      key: 'updateHistory',
      value: [{ version: '1.9.0' }]
    };
    global.fetch.mockRejectedValue(new Error('offline'));

    const history = await getUpdateHistory();
    expect(history).toEqual([{ version: '1.9.0' }]);
  });

  test('returns empty array when nothing is stored and no token', async () => {
    getAuthToken.mockResolvedValue(null);
    const history = await getUpdateHistory();
    expect(history).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('getDeviceId re-export', () => {
  test('is re-exported from updater for update.js consumers', async () => {
    expect(await getDeviceId()).toBe('device_123');
  });
});
