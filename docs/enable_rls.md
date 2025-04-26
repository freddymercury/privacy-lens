# Enabling Supabase Row Level Security (RLS)

This document outlines the steps required to enable and configure Row Level Security (RLS) for the Supabase database used by the PrivacyLens backend, ensuring that API operations respect user permissions.

**Overall Goal:** Enable Supabase RLS so that backend operations respect user permissions, while ensuring the Chrome plugin continues to function correctly via the API. The Chrome plugin itself requires no changes as it interacts solely with the backend API.

## Phase 1: Supabase Configuration (Manual Steps in Supabase Dashboard)

These steps must be performed directly within your Supabase project dashboard.

1.  **Enable RLS:**
    *   Navigate to your Supabase project dashboard -> Table Editor.
    *   For each table containing user-specific or potentially sensitive data, select the table, go to the "Row Level Security" tab, and click "Enable RLS".
    *   Tables requiring RLS include at least:
        *   `users`
        *   `subscriptions`
        *   `user_tokens`
        *   `update_applications`
    *   Consider enabling RLS for other tables based on your access control requirements (e.g., `audit_logs`, `websites`, `unassessed_urls`). Ask: Should users only see their own audit logs? Can any logged-in user see all website assessments?

2.  **Define Policies:**
    *   For each table with RLS enabled, create appropriate policies using SQL via the Supabase dashboard (Table Editor -> Row Level Security -> "New Policy").
    *   Policies determine who can perform `SELECT`, `INSERT`, `UPDATE`, `DELETE` operations on which rows.
    *   Use the `auth.uid()` function in your policies, which corresponds to the user ID (`sub` claim) in the JWT provided by the authenticated user.

    *   **Example `users` table policies:**
        ```sql
        -- Policy Name: Allow individual user read access
        -- Target roles: authenticated
        -- USING expression: (auth.uid() = id)
        CREATE POLICY "Allow individual user read access" ON public.users
        FOR SELECT USING (auth.uid() = id);

        -- Policy Name: Allow individual user update access
        -- Target roles: authenticated
        -- USING expression: (auth.uid() = id)
        -- WITH CHECK expression: (auth.uid() = id)
        CREATE POLICY "Allow individual user update access" ON public.users
        FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
        ```

    *   **Example `subscriptions` table policies:**
        ```sql
        -- Policy Name: Allow individual subscription read access
        -- Target roles: authenticated
        -- USING expression: (auth.uid() = user_id)
        CREATE POLICY "Allow individual subscription read access" ON public.subscriptions
        FOR SELECT USING (auth.uid() = user_id);

        -- Policy Name: Allow individual subscription update access
        -- Target roles: authenticated
        -- USING expression: (auth.uid() = user_id)
        -- WITH CHECK expression: (auth.uid() = user_id)
        CREATE POLICY "Allow individual subscription update access" ON public.subscriptions
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

        -- Note: INSERTs/updates triggered by webhooks (like Stripe) will likely use the service_role key via the backend and bypass RLS automatically.
        ```

    *   **Example `user_tokens` table policies:**
        ```sql
        -- Policy Name: Allow individual token read access
        -- Target roles: authenticated
        -- USING expression: (auth.uid() = user_id)
        CREATE POLICY "Allow individual token read access" ON public.user_tokens
        FOR SELECT USING (auth.uid() = user_id);

        -- Policy Name: Allow individual token revoke access
        -- Target roles: authenticated
        -- USING expression: (auth.uid() = user_id)
        -- WITH CHECK expression: (auth.uid() = user_id) -- Ensure users can only update their own tokens
        CREATE POLICY "Allow individual token revoke access" ON public.user_tokens
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

        -- Note: INSERTs for new tokens during login/register will use the service_role key via the backend.
        ```

    *   **Important:**
        *   Define policies for all relevant operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on each table according to your application's logic.
        *   Remember that the `service_role` key (used by the `supabaseServiceRole` client in the backend code) **bypasses all RLS policies**. Use it only for operations that genuinely need administrative privileges or occur outside a user context.

## Phase 2: Backend Code Modifications

These changes modify the Node.js backend application.

1.  **Add Supabase Anon Key to Environment:**
    *   Retrieve your project's `anon` (public) key from the Supabase dashboard (Project Settings -> API).
    *   Add this key to your `backend/src/.env` file and ensure it's documented in `backend/src/.env.example`:
        ```dotenv
        # backend/src/.env / backend/src/.env.example

        SUPABASE_URL=your_supabase_url
        SUPABASE_KEY=your_supabase_service_role_key # Keep this for admin/system tasks
        SUPABASE_ANON_KEY=your_supabase_anon_key # Add this line
        # ... other variables
        ```

2.  **Refactor `supabaseClient.js`:**
    *   Modify this utility to provide both the RLS-bypassing client (using the `service_role` key) and a function to create user-specific clients (using the `anon` key + user JWT) that respect RLS.
    *   **File:** `backend/src/utils/supabaseClient.js`

        ```javascript
        const { createClient } = require('@supabase/supabase-js');

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_KEY; // Service Role Key (Bypasses RLS)
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // Public Anon Key (Used for RLS clients)

        let serviceRoleClient; // Client using the service role key

        const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
        if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
          if (!isTestEnvironment) {
            throw new Error('Missing Supabase credentials. Please set SUPABASE_URL, SUPABASE_KEY (service role), and SUPABASE_ANON_KEY environment variables.');
          } else {
            console.warn('Supabase credentials missing, proceeding in test mode. Mocks should be used.');
            serviceRoleClient = {}; // Placeholder for tests
          }
        } else {
          // Initialize the client that bypasses RLS (using Service Role Key)
          serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);
        }

        /**
         * Creates a Supabase client instance authenticated as a specific user using their JWT.
         * This client WILL respect RLS policies defined in your Supabase project.
         * @param {string} userAuthToken - The user's JWT (obtained from request Authorization header).
         * @returns {SupabaseClient} - A Supabase client instance configured for the user.
         * @throws {Error} If Supabase URL/Anon key is missing or if no token is provided.
         */
        const createAuthedClient = (userAuthToken) => {
          if (!supabaseUrl || !supabaseAnonKey) {
             if (!isTestEnvironment) {
               throw new Error('Missing Supabase URL or Anon Key for creating authed client.');
             } else {
                console.warn('Supabase URL/Anon Key missing in test mode for authed client.');
                return {}; // Placeholder for tests
             }
          }
          // Throw error if token is missing, as RLS operations require user context
          if (!userAuthToken) {
            throw new Error('User authentication token is required to create an RLS-scoped Supabase client.');
          }

          // Create client using the ANON key, passing the user's token in the headers.
          // Supabase backend uses this token to apply RLS policies based on auth.uid().
          return createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${userAuthToken}` } }
          });
        };

        module.exports = {
          // Export the service role client for operations that NEED to bypass RLS
          supabaseServiceRole: serviceRoleClient,
          // Export the function to create user-scoped clients that RESPECT RLS
          createAuthedClient
        };
        ```

3.  **Refactor `db.js` Functions:**
    *   Update database access functions in `backend/src/utils/db.js` to accept the `userAuthToken` when RLS should apply.
    *   Use the appropriate client (`createAuthedClient` for RLS-scoped operations, `supabaseServiceRole` for RLS-bypassing operations).

    *   **File:** `backend/src/utils/db.js` (Apply this pattern to all relevant functions)

        ```javascript
        // At the top: Update import
        const { supabaseServiceRole, createAuthedClient } = require("./supabaseClient");
        const { normalizeUrl } = require("./domainUtils"); // Keep this

        // --- Example: Function needing RLS (User-specific data) ---
        /**
         * Get user subscription (RLS should apply)
         * @param {string} userId - User ID (often redundant due to RLS but good practice)
         * @param {string} userAuthToken - The user's JWT for RLS.
         * @returns {Promise<Object|null>} - Subscription data or null if not found/allowed
         */
        const getUserSubscription = async (userId, userAuthToken) => {
          // Validate token presence before creating client
          if (!userAuthToken) throw new Error("Authentication token required for getUserSubscription");
          const userSupabase = createAuthedClient(userAuthToken); // RLS Client
          const { data, error } = await userSupabase // Use RLS client
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId) // RLS policy `auth.uid() = user_id` enforces this too
            .eq('status', 'active')
            .single();

          if (error) {
            if (error.code === 'PGRST116') { // Not found or RLS blocked
              return null;
            }
            console.error(`[DB] Error getting subscription for user ${userId}:`, error);
            throw error;
          }
          return data;
        };

        // --- Example: Function needing Service Role (System/Admin task or pre-auth lookup) ---
        /**
         * Get user by email (Used during login before user is fully authenticated - needs Service Role)
         * @param {string} email - User email
         * @returns {Promise<Object|null>} - User data or null if not found
         */
        const getUserByEmail = async (email) => {
          // Use service role client to bypass RLS for lookup
          const { data, error } = await supabaseServiceRole
            .from('users')
            .select('*') // Select password hash etc.
            .eq('email', email)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              return null;
            }
            console.error(`[DB] Error getting user by email ${email}:`, error);
            throw error;
          }
          return data;
        };

        // --- Example: Function potentially public or needing Service Role ---
        /**
         * Get assessment for a URL (Decide: Is this public? Or user-specific?)
         * Assuming public access for now, use Service Role. If needs RLS, switch client and add policy.
         * @param {string} url - The URL to get assessment for
         * @returns {Promise<Object|null>} - Assessment data or null if not found
         */
        const getAssessment = async (url) => {
          const normalizedUrl = normalizeUrl(url);
          console.log(
            `[DB] Getting assessment for URL: ${url}, Normalized: ${normalizedUrl} (using service role)`
          );
          // Using service role for now, assuming public read access to assessments
          const { data, error } = await supabaseServiceRole
            .from("websites")
            .select("*")
            .eq("url", normalizedUrl)
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              return null;
            }
            console.error(`[DB] Error getting assessment for ${normalizedUrl}:`, error);
            throw error;
          }
          return data;
        };

        // --- Review ALL functions in db.js ---
        // Decide for each function: Should RLS apply based on the operation's context?
        // - If YES (operates on user-specific data initiated by that user):
        //   1. Add `userAuthToken` parameter to the function signature.
        //   2. Use `const userSupabase = createAuthedClient(userAuthToken);` to get the client.
        //   3. Perform the query using `userSupabase`.
        // - If NO (admin task, system process, pre-auth lookup, public data access):
        //   1. Use `supabaseServiceRole` directly.
        //
        // Functions to review carefully:
        //   - getUserById (Service role if admin lookup; RLS client if fetching authenticated user's own data), updateUser, createUser (likely service role)
        //   - createSubscription, updateSubscription (Service role if via webhook; RLS client if user-initiated via API), getSubscriptionByStripeId (webhooks might need service role)
        //   - storeToken (service role?), getTokenByHash (service role?), getUserActiveTokens (RLS), updateTokenLastUsed (RLS), revokeToken (RLS)
        //   - upsertAssessment, addToUnassessedQueue, getUnassessedUrls, updateUnassessedStatus, removeFromUnassessedQueue (Client choice depends heavily on whether these are user-specific actions or admin/system tasks. Analyze each case.)
        //   - createAuditLog (depends: user action log -> RLS? system log -> service role?)
        //   - updateSuggestedPolicyUrls (likely admin/system -> service role)
        //   - getAllAssessments (public -> service role? restricted -> RLS?)
        //   - getLatestPluginUpdate, getLatestServerUpdate, getUpdateById, createUpdate (likely service role)
        //   - recordUpdateApplication (RLS), getUserUpdateHistory (RLS)
        //   - Note on RLS Errors: Be aware that RLS policy denials might sometimes result in queries returning zero rows rather than a specific permission error. Your backend logic should handle this possibility, distinguishing between "not found" and "access denied" where necessary.
        ```

4.  **Update Service and Controller Layers:**
    *   Modify the functions in your services (e.g., `authService.js`, `subscriptionService.js`) and controllers (e.g., `authController.js`, `subscriptionController.js`) that call the refactored `db.js` functions.
    *   These higher-level functions need to:
        *   Access the request object (`req`).
        *   Extract the raw JWT string from the `req.headers.authorization` header (e.g., `const token = req.headers.authorization?.split(' ')[1];`).
        *   Pass this `token` string as the `userAuthToken` argument to the `db.js` functions that now require it for RLS-scoped operations.

    *   **Example (Controller):**
        ```javascript
        // backend/src/controllers/subscriptionController.js (Conceptual)
        const db = require('../utils/db');

        const getMySubscription = async (req, res) => {
          try {
            const userId = req.user.id; // From apiAuth middleware
            const token = req.headers.authorization?.split(' ')[1]; // Extract token

            if (!token) {
              return res.status(401).json({ message: 'Authorization token missing' });
            }

            // Call the refactored db function, passing the token
            const subscription = await db.getUserSubscription(userId, token);

            if (!subscription) {
              return res.status(404).json({ message: 'Active subscription not found' });
            }
            res.json(subscription);
          } catch (error) {
            console.error("Error fetching subscription:", error);
            res.status(500).json({ message: 'Failed to fetch subscription' });
          }
        };
        ```

## Phase 3: Testing

1.  **API Testing:** Thoroughly test all API endpoints used by the Chrome plugin after implementing the backend changes. Use tools like Postman or `curl` to simulate requests with and without valid `Authorization: Bearer <token>` headers.
2.  **RLS Verification:**
    *   Test accessing/modifying data belonging to *another* user (should fail).
    *   Test accessing/modifying data belonging to the *authenticated* user (should succeed).
    *   Test endpoints that should work without authentication (if any).
    *   Test endpoints intended for admin/system use that rely on the `service_role` key.
3.  **Plugin Testing:** Perform end-to-end testing using the Chrome plugin to ensure all features (login, registration, subscription checks, data fetching via API) work as expected.
4.  **Edge Cases:** Test scenarios like expired tokens, invalid tokens, and missing tokens.

This plan provides a roadmap for securely implementing Row Level Security in your Supabase integration. Remember to carefully review each database function's purpose to determine whether it should operate under RLS or bypass it using the service role.

## Chrome Plugin Integration

The Chrome plugin already implements proper authentication handling and requires no changes to work with the RLS-enabled backend. Here's how the current implementation works:

1. **Authentication Flow:**
   * The plugin stores user authentication data (including JWT tokens) in the browser's IndexedDB via the `storeAuthData` function in `auth.js`.
   * Upon login/registration, the backend returns a JWT token which is stored locally.
   * The `getAuthToken` function retrieves this token when needed for API requests.

2. **API Request Authentication:**
   * All authenticated API requests from the plugin already include the JWT token in the Authorization header:
     ```javascript
     // Example from auth.js
     await fetch(`${API_URL}/subscription/status`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${authData.token}`
       }
     });
     ```
   * This token will be extracted by the backend middleware and passed to the Supabase client for RLS enforcement.

3. **Compatibility Verification:**
   * During Phase 3 testing, ensure that all plugin API requests continue to work with the RLS-enabled backend.
   * Verify that the plugin can still:
     * Login and register users
     * Fetch subscription status
     * Retrieve assessments
     * Report unassessed URLs
     * Trigger assessments (premium tier)

The plugin's existing authentication implementation is already compatible with the RLS changes in the backend, as it properly sends the user's JWT token with each request. The backend changes will ensure this token is used to create RLS-scoped Supabase clients that respect the user's permissions.
