import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure environment variables are loaded
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Now access environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY; // Public Anon Key (Used for RLS clients)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Service Role Key (Bypasses RLS)

console.log('Supabase URL:', supabaseUrl ? 'Set' : 'Not set');
console.log('Supabase Anon Key:', supabaseAnonKey ? 'Set' : 'Not set');
console.log('Supabase Service Key:', supabaseServiceKey ? 'Set' : 'Not set');

let supabaseServiceRole; // Client using the service role key

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
    supabaseServiceRole = { 
      from: () => ({ 
        select: () => Promise.resolve({ data: null, error: null }), 
        insert: () => Promise.resolve({ data: null, error: null }), 
        update: () => Promise.resolve({ data: null, error: null }), 
        delete: () => Promise.resolve({ data: null, error: null }),
        rpc: () => Promise.resolve({ data: null, error: null }) 
      }),
      storage: { 
        from: () => ({ 
          upload: () => Promise.resolve({ data: null, error: null }),
          download: () => Promise.resolve({ data: null, error: null }),
          createSignedUrl: () => Promise.resolve({ data: { signedUrl: ''}, error: null })
        })
      } 
    }; // Basic mock structure
  }
} else {
  // Initialize the client that bypasses RLS (using Service Role Key)
  supabaseServiceRole = createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Creates a Supabase client instance authenticated as a specific user using their JWT.
 * This client WILL respect RLS policies defined in your Supabase project.
 * @param {string} userAuthToken - The user's JWT (obtained from request Authorization header, e.g., "Bearer <token>"). Should be the raw token string.
 * @returns {SupabaseClient} - A Supabase client instance configured for the user.
 * @throws {Error} If Supabase URL/Anon key is missing or if no token is provided.
 */
export const createAuthedClient = (userAuthToken) => {
  // Check for necessary config first
  if (!supabaseUrl || !supabaseAnonKey) {
     if (!isTestEnvironment) {
       throw new Error('Missing Supabase URL or Anon Key (SUPABASE_KEY) for creating authed client.');
     } else {
        console.warn('Supabase URL/Anon Key missing in test mode for authed client.');
        // Return a basic mock structure for tests
        return { 
          from: () => ({ 
            select: () => Promise.resolve({ data: null, error: null }), 
            insert: () => Promise.resolve({ data: null, error: null }), 
            update: () => Promise.resolve({ data: null, error: null }), 
            delete: () => Promise.resolve({ data: null, error: null }),
            rpc: () => Promise.resolve({ data: null, error: null }) 
          }) 
        };
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

// Diagnostic check for storage property
if (supabaseServiceRole && !supabaseServiceRole.storage) { // Check if supabaseServiceRole itself is defined
  const keysMissing = !supabaseUrl || !supabaseServiceKey || !supabaseAnonKey;
  if (keysMissing && isTestEnvironment) {
    // This is the scenario where the mock is intentionally used.
    // The console.warn should have already been printed.
  } else if (supabaseServiceRole.from().select === undefined && isTestEnvironment) {
    // This is also part of the mock scenario if the deeper mock structure was used.
  }
  else {
    // If storage is missing, and it's NOT the intentional mock scenario
    console.error( // Changed to console.error to avoid crashing server on startup if this check fails unexpectedly
      'Supabase supabaseServiceRole is missing the .storage property. ' +
      'This might indicate a problem with Supabase initialization or environment variables. ' +
      `KeysMissing: ${keysMissing}, IsTestEnv: ${isTestEnvironment}, SupabaseURL set: ${!!supabaseUrl}, SupabaseServiceKey set: ${!!supabaseServiceKey}`
    );
    // Consider if throwing an error is appropriate here or if logging is sufficient
    // throw new Error('Supabase client storage initialization failed.');
  }
}

// Export the service role client for operations that NEED to bypass RLS
export { supabaseServiceRole };
// createAuthedClient is already exported as a named export.
