const { createClient } = require('@supabase/supabase-js');

/**
 * Pure function to validate Supabase configuration
 * @param {Object} config - Configuration object with supabaseUrl, supabaseAnonKey, supabaseServiceKey
 * @param {boolean} isTestEnvironment - Whether this is a test environment
 * @returns {Object} Validation result with isValid boolean and missingKeys array
 */
function validateSupabaseConfig(config, isTestEnvironment = false) {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = config;
  const missingKeys = [];
  
  if (!supabaseUrl) missingKeys.push('SUPABASE_URL');
  if (!supabaseAnonKey) missingKeys.push('SUPABASE_KEY (anon)');
  if (!supabaseServiceKey) missingKeys.push('SUPABASE_SERVICE_KEY (service role)');
  
  return {
    isValid: missingKeys.length === 0,
    missingKeys,
    canCreateMock: isTestEnvironment && missingKeys.length > 0
  };
}

/**
 * Pure function to create a mock Supabase client for testing
 * @returns {Object} Mock client object
 */
function createMockClient() {
  const mockQueryBuilder = {
    select: () => mockQueryBuilder,
    insert: () => mockQueryBuilder,
    update: () => mockQueryBuilder,
    delete: () => mockQueryBuilder,
    eq: () => mockQueryBuilder,
    neq: () => mockQueryBuilder,
    gt: () => mockQueryBuilder,
    gte: () => mockQueryBuilder,
    lt: () => mockQueryBuilder,
    lte: () => mockQueryBuilder,
    like: () => mockQueryBuilder,
    ilike: () => mockQueryBuilder,
    is: () => mockQueryBuilder,
    in: () => mockQueryBuilder,
    contains: () => mockQueryBuilder,
    containedBy: () => mockQueryBuilder,
    rangeGt: () => mockQueryBuilder,
    rangeGte: () => mockQueryBuilder,
    rangeLt: () => mockQueryBuilder,
    rangeLte: () => mockQueryBuilder,
    rangeAdjacent: () => mockQueryBuilder,
    overlaps: () => mockQueryBuilder,
    textSearch: () => mockQueryBuilder,
    match: () => mockQueryBuilder,
    not: () => mockQueryBuilder,
    or: () => mockQueryBuilder,
    filter: () => mockQueryBuilder,
    order: () => mockQueryBuilder,
    limit: () => mockQueryBuilder,
    range: () => mockQueryBuilder,
    single: () => mockQueryBuilder,
    maybeSingle: () => mockQueryBuilder,
    csv: () => mockQueryBuilder,
    geojson: () => mockQueryBuilder,
    explain: () => mockQueryBuilder,
    rollback: () => mockQueryBuilder,
    returns: () => mockQueryBuilder,
    then: (resolve) => resolve({ data: null, error: null }),
    catch: () => mockQueryBuilder
  };

  return {
    from: () => mockQueryBuilder,
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null }),
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null })
      })
    }
  };
}

/**
 * Pure function to extract and clean user auth token
 * @param {string} userAuthToken - Token that may include "Bearer " prefix
 * @returns {string|null} Clean token string or null if invalid
 */
function extractCleanToken(userAuthToken) {
  if (!userAuthToken) return null;
  return userAuthToken.startsWith('Bearer ') 
    ? userAuthToken.split(' ')[1] 
    : userAuthToken;
}

/**
 * Creates a Supabase service role client (bypasses RLS)
 * @param {Object} config - Configuration object
 * @param {boolean} isTestEnvironment - Whether this is a test environment
 * @returns {Object} Supabase client or mock client
 */
function createServiceRoleClient(config, isTestEnvironment = false) {
  const validation = validateSupabaseConfig(config, isTestEnvironment);
  
  if (!validation.isValid) {
    if (validation.canCreateMock) {
      console.warn('Supabase credentials missing, proceeding in test mode. Mocks should be used.');
      return createMockClient();
    } else {
      throw new Error(`Missing Supabase credentials. Please set ${validation.missingKeys.join(', ')} environment variables.`);
    }
  }
  
  return createClient(config.supabaseUrl, config.supabaseServiceKey);
}

/**
 * Creates a Supabase client authenticated as a specific user (respects RLS)
 * @param {Object} config - Configuration object
 * @param {string} userAuthToken - User's JWT token
 * @param {boolean} isTestEnvironment - Whether this is a test environment
 * @returns {Object} Authenticated Supabase client
 */
function createAuthedClient(config, userAuthToken, isTestEnvironment = false) {
  const { supabaseUrl, supabaseAnonKey } = config;
  
  // Check for necessary config first
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isTestEnvironment) {
      console.warn('Supabase URL/Anon Key missing in test mode for authed client.');
      return createMockClient();
    } else {
      throw new Error('Missing Supabase URL or Anon Key (SUPABASE_KEY) for creating authed client.');
    }
  }
  
  const token = extractCleanToken(userAuthToken);
  if (!token) {
    throw new Error('User authentication token is required to create an RLS-scoped Supabase client.');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

module.exports = {
  validateSupabaseConfig,
  createMockClient,
  extractCleanToken,
  createServiceRoleClient,
  createAuthedClient
}; 