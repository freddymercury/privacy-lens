// Load environment variables first
const dotenv = require('dotenv');
dotenv.config();

// Now import shared database utilities
const { createServiceRoleClient, createAuthedClient } = require('@privacy-lens/shared/db/connection.js');
const queries = require('@privacy-lens/shared/db/queries.js');

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
 * @param {string} userAuthToken - The user's JWT
 * @returns {SupabaseClient} - A Supabase client instance configured for the user.
 */
function createClientApiAuthedClient(userAuthToken) {
  return createAuthedClient(config, userAuthToken, isTestEnvironment);
}

module.exports = {
  supabaseServiceRole,
  createAuthedClient: createClientApiAuthedClient,
  queries
}; 