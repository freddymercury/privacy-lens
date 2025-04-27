const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY; // Public Anon Key (Used for RLS clients)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Service Role Key (Bypasses RLS)

let serviceRoleClient; // Client using the service role key

const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// Validate keys unless in test environment
if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  if (!isTestEnvironment) {
    // Determine which keys are missing for a clearer error message
    const missingKeys = [];
    if (!supabaseUrl) missingKeys.push('SUPABASE_URL');
    if (!supabaseAnonKey) missingKeys.push('SUPABASE_KEY (anon)');
    if (!supabaseServiceKey) missingKeys.push('SUPABASE_SERVICE_KEY (service role)');
    throw new Error(`Missing Supabase credentials. Please set ${missingKeys.join(', ')} environment variables.`);
  } else {
    console.warn('Supabase credentials missing, proceeding in test mode. Mocks should be used.');
    // Provide placeholder objects for tests if keys are missing
    serviceRoleClient = { from: () => ({ select: () => {}, insert: () => {}, update: () => {}, delete: () => {} }) }; // Basic mock structure
  }
} else {
  // Initialize the client that bypasses RLS (using Service Role Key)
  serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Creates a Supabase client instance authenticated as a specific user using their JWT.
 * This client WILL respect RLS policies defined in your Supabase project.
 * @param {string} userAuthToken - The user's JWT (obtained from request Authorization header, e.g., "Bearer <token>"). Should be the raw token string.
 * @returns {SupabaseClient} - A Supabase client instance configured for the user.
 * @throws {Error} If Supabase URL/Anon key is missing or if no token is provided.
 */
const createAuthedClient = (userAuthToken) => {
  // Check for necessary config first
  if (!supabaseUrl || !supabaseAnonKey) {
     if (!isTestEnvironment) {
       throw new Error('Missing Supabase URL or Anon Key (SUPABASE_KEY) for creating authed client.');
     } else {
        console.warn('Supabase URL/Anon Key missing in test mode for authed client.');
        // Return a basic mock structure for tests
        return { from: () => ({ select: () => {}, insert: () => {}, update: () => {}, delete: () => {} }) };
     }
  }

  // Throw error if token is missing, as RLS operations require user context
  // Ensure the token is just the token string, not "Bearer <token>"
  const token = userAuthToken?.startsWith('Bearer ') ? userAuthToken.split(' ')[1] : userAuthToken;
  if (!token) {
    throw new Error('User authentication token is required to create an RLS-scoped Supabase client.');
  }

  // Create client using the ANON key, passing the user's token in the headers.
  // Supabase backend uses this token to apply RLS policies based on auth.uid().
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
};

module.exports = {
  // Export the service role client for operations that NEED to bypass RLS
  supabaseServiceRole: serviceRoleClient,
  // Export the function to create user-scoped clients that RESPECT RLS
  createAuthedClient
};
