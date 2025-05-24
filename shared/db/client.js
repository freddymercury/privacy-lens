const dotenv = require('dotenv');
const path = require('path');
const { 
  createServiceRoleClient, 
  createAuthedClient: createAuthedClientCore 
} = require('./connection');

// Load environment variables (look for .env in project root)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Get configuration from environment
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY
};

const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// Log configuration status
console.log('Supabase URL:', config.supabaseUrl ? 'Set' : 'Not set');
console.log('Supabase Anon Key:', config.supabaseAnonKey ? 'Set' : 'Not set');
console.log('Supabase Service Key:', config.supabaseServiceKey ? 'Set' : 'Not set');

// Create the service role client
const supabaseServiceRole = createServiceRoleClient(config, isTestEnvironment);

/**
 * Creates a Supabase client instance authenticated as a specific user using their JWT.
 * This client WILL respect RLS policies defined in your Supabase project.
 * @param {string} userAuthToken - The user's JWT (obtained from request Authorization header, e.g., "Bearer <token>"). Should be the raw token string.
 * @returns {SupabaseClient} - A Supabase client instance configured for the user.
 * @throws {Error} If Supabase URL/Anon key is missing or if no token is provided.
 */
function createAuthedClient(userAuthToken) {
  return createAuthedClientCore(config, userAuthToken, isTestEnvironment);
}

// Diagnostic check for storage property (maintaining compatibility with original)
if (supabaseServiceRole && !supabaseServiceRole.storage) {
  const keysMissing = !config.supabaseUrl || !config.supabaseServiceKey || !config.supabaseAnonKey;
  if (keysMissing && isTestEnvironment) {
    // This is the scenario where the mock is intentionally used.
  } else if (supabaseServiceRole.from && supabaseServiceRole.from().select === undefined && isTestEnvironment) {
    // This is also part of the mock scenario if the deeper mock structure was used.
  } else {
    // If storage is missing, and it's NOT the intentional mock scenario
    console.error(
      'Supabase supabaseServiceRole is missing the .storage property. ' +
      'This might indicate a problem with Supabase initialization or environment variables. ' +
      `KeysMissing: ${keysMissing}, IsTestEnv: ${isTestEnvironment}, SupabaseURL set: ${!!config.supabaseUrl}, SupabaseServiceKey set: ${!!config.supabaseServiceKey}`
    );
  }
}

module.exports = {
  supabaseServiceRole,
  createAuthedClient
}; 