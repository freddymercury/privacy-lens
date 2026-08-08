// Unit tests for db.js using an in-memory IndexedDB fake (no external deps).
import {
  initializeDatabase,
  openDatabase,
  getObjectStore,
  isDatabaseInitialized,
  setDatabaseInitialized,
  storeAssessment,
  getAssessment,
  updateAssessmentInDB,
  bulkInsertAssessments,
  getAssessmentsByRiskLevel,
  updateLastSyncInfo,
  getLastSyncInfo,
  checkAndInitializeDatabase,
  ASSESSMENT_STORE,
  CONFIG_STORE,
  AUTH_STORE,
  UPDATES_STORE
} from '../db.js';
import { createFakeIndexedDB } from './helpers/fakeIndexedDB.js';

// Sample pre-packaged payload served by the mocked fetch
const PREPACKAGED = {
  version: '1.0.0',
  generatedAt: 1700000000000,
  assessments: {
    'example.com': {
      assessment: { riskLevel: 'high', categories: { dataCollection: { risk: 'high' } } },
      metadata: { timestamp: 1700000000000, version: '1.0.0' }
    },
    'safe.org': {
      assessment: { riskLevel: 'low', categories: {} },
      metadata: { timestamp: 1700000000000, version: '1.0.0' }
    }
  }
};

beforeEach(() => {
  global.indexedDB = createFakeIndexedDB();
  global.chrome = { runtime: { getURL: (p) => p } };
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve(PREPACKAGED)
  });
});

describe('initializeDatabase / openDatabase', () => {
  test('creates all required object stores including updates', async () => {
    const db = await initializeDatabase();

    expect(db.objectStoreNames.contains(ASSESSMENT_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(CONFIG_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(AUTH_STORE)).toBe(true);
    // Regression: updater.js writes to this store; it must exist.
    expect(db.objectStoreNames.contains(UPDATES_STORE)).toBe(true);
  });

  test('getObjectStore returns a usable store for updates (regression)', async () => {
    await initializeDatabase();
    const store = await getObjectStore(UPDATES_STORE, 'readwrite');
    await new Promise((resolve, reject) => {
      const req = store.put({ key: 'latestUpdate', value: { version: '2.1.0' } });
      req.onsuccess = resolve;
      req.onerror = (e) => reject(e.target.error);
    });

    const readStore = await getObjectStore(UPDATES_STORE);
    const result = await new Promise((resolve) => {
      const req = readStore.get('latestUpdate');
      req.onsuccess = (e) => resolve(e.target.result);
    });
    expect(result.value).toEqual({ version: '2.1.0' });
  });

  test('openDatabase falls back to creating stores on unexpected upgrade', async () => {
    // Open without initializeDatabase first; the fallback upgrade handler
    // should still create the stores.
    const db = await openDatabase();
    expect(db.objectStoreNames.contains(ASSESSMENT_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(UPDATES_STORE)).toBe(true);
  });
});

describe('assessment CRUD', () => {
  beforeEach(() => initializeDatabase());

  const record = {
    domain: 'test.com',
    assessment: { riskLevel: 'medium', categories: {} },
    metadata: { timestamp: 1, source: 'server' }
  };

  test('storeAssessment + getAssessment round trip', async () => {
    await storeAssessment(record);
    expect(await getAssessment('test.com')).toEqual(record);
  });

  test('getAssessment returns null for unknown domain', async () => {
    expect(await getAssessment('missing.com')).toBeNull();
  });

  test('updateAssessmentInDB overwrites existing record', async () => {
    await storeAssessment(record);
    await updateAssessmentInDB({ ...record, assessment: { riskLevel: 'low', categories: {} } });
    const fetched = await getAssessment('test.com');
    expect(fetched.assessment.riskLevel).toBe('low');
  });

  test('bulkInsertAssessments inserts multiple records and skips invalid ones', async () => {
    await bulkInsertAssessments([
      record,
      { domain: 'second.com', assessment: { riskLevel: 'high' }, metadata: { timestamp: 2 } },
      null,
      { assessment: { riskLevel: 'low' } } // no domain -> skipped
    ]);

    expect(await getAssessment('test.com')).toEqual(record);
    expect((await getAssessment('second.com')).assessment.riskLevel).toBe('high');
  });

  test('bulkInsertAssessments no-ops on empty input', async () => {
    await expect(bulkInsertAssessments([])).resolves.toBeUndefined();
    await expect(bulkInsertAssessments(null)).resolves.toBeUndefined();
  });

  test('getAssessmentsByRiskLevel filters via index', async () => {
    await bulkInsertAssessments([
      record,
      { domain: 'risky.com', assessment: { riskLevel: 'high' }, metadata: { timestamp: 2 } }
    ]);

    const high = await getAssessmentsByRiskLevel('high');
    expect(high.map((r) => r.domain)).toEqual(['risky.com']);
  });
});

describe('config store helpers', () => {
  beforeEach(() => initializeDatabase());

  test('initialization flag round trip', async () => {
    // Note: db.js resolves `result && result.value === true`, so the very
    // first check returns undefined (falsy) rather than strict false.
    expect(await isDatabaseInitialized()).toBeFalsy();
    await setDatabaseInitialized(true);
    expect(await isDatabaseInitialized()).toBe(true);
  });

  test('last sync info round trip', async () => {
    expect(await getLastSyncInfo()).toBeNull();
    const syncInfo = { at: 12345, count: 2 };
    await updateLastSyncInfo(syncInfo);
    expect(await getLastSyncInfo()).toEqual(syncInfo);
  });
});

describe('checkAndInitializeDatabase (pre-packaged load)', () => {
  test('loads pre-packaged assessments on first run and marks initialized', async () => {
    await checkAndInitializeDatabase();

    const example = await getAssessment('example.com');
    expect(example.assessment.riskLevel).toBe('high');
    expect(example.metadata.source).toBe('prepackaged');
    expect(await getAssessment('safe.org')).not.toBeNull();
    expect(await isDatabaseInitialized()).toBe(true);
  });

  test('does not reload pre-packaged data when already initialized', async () => {
    await checkAndInitializeDatabase();
    global.fetch.mockClear();

    // Overwrite a record, then run init again: fetch should not be called
    // and the local change must survive.
    await storeAssessment({
      domain: 'example.com',
      assessment: { riskLevel: 'low', categories: {} },
      metadata: { timestamp: 9, source: 'server' }
    });
    await checkAndInitializeDatabase();

    expect(global.fetch).not.toHaveBeenCalled();
    expect((await getAssessment('example.com')).assessment.riskLevel).toBe('low');
  });
});
