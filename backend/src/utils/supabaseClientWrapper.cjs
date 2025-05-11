// CommonJS wrapper for supabaseClient.js to be used by db.cjs
// This allows db.cjs to use the ES module exports from supabaseClient.js

// Logger placeholder until dynamic import completes
let logger = {
  info: (...args) => console.log('[supabaseClientWrapper]', ...args),
  error: (...args) => console.error('[supabaseClientWrapper]', ...args)
};

// Dynamic import for logger
(async () => {
  try {
    const loggerModule = await import('../lib/logger-phase3.js');
    const createLogger = loggerModule.createLogger;
    logger = createLogger('supabaseClientWrapper');
  } catch (error) {
    console.error('[supabaseClientWrapper] Error loading logger:', error);
  }
})();

// Use dynamic import to load the ES module
let supabaseServiceRole;
let createAuthedClient;
let initializationComplete = false;
let initializationError = null;

// Create a promise that will resolve when initialization is complete
const initializationPromise = new Promise((resolve, reject) => {
  // Initialize the exports asynchronously
  (async () => {
    try {
      const supabaseClient = await import('./supabaseClient.js');
      supabaseServiceRole = supabaseClient.supabaseServiceRole;
      createAuthedClient = supabaseClient.createAuthedClient;
      logger.info('Successfully loaded supabaseClient.js');
      initializationComplete = true;
      resolve();
    } catch (error) {
      logger.error('Error loading supabaseClient.js:', { error });
      initializationError = error;
      reject(error);
    }
  })();
});

// Export the variables that will be populated asynchronously
module.exports = {
  get supabaseServiceRole() {
    if (!initializationComplete) {
      if (initializationError) {
        throw initializationError;
      }
      throw new Error('supabaseServiceRole not initialized yet. The dynamic import may still be in progress.');
    }
    return supabaseServiceRole;
  },
  get createAuthedClient() {
    if (!initializationComplete) {
      if (initializationError) {
        throw initializationError;
      }
      throw new Error('createAuthedClient not initialized yet. The dynamic import may still be in progress.');
    }
    return createAuthedClient;
  },
  // Export the initialization promise so consumers can await it
  initializationPromise
};
