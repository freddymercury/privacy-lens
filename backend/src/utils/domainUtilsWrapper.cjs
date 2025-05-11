// CommonJS wrapper for domainUtils.js to be used by db.cjs
// This allows db.cjs to use the ES module exports from domainUtils.js

// Logger placeholder until dynamic import completes
let logger = {
  info: (...args) => console.log('[domainUtilsWrapper]', ...args),
  error: (...args) => console.error('[domainUtilsWrapper]', ...args)
};

// Dynamic import for logger
(async () => {
  try {
    const loggerModule = await import('../lib/logger-phase3.js');
    const createLogger = loggerModule.createLogger;
    logger = createLogger('domainUtilsWrapper');
  } catch (error) {
    console.error('[domainUtilsWrapper] Error loading logger:', error);
  }
})();

// Use dynamic import to load the ES module
let normalizeUrl;
let getNormalizedDomain;
let isGoogleDomain;
let initializationComplete = false;
let initializationError = null;

// Create a promise that will resolve when initialization is complete
const initializationPromise = new Promise((resolve, reject) => {
  // Initialize the exports asynchronously
  (async () => {
    try {
      const domainUtils = await import('./domainUtils.js');
      normalizeUrl = domainUtils.normalizeUrl;
      getNormalizedDomain = domainUtils.getNormalizedDomain;
      isGoogleDomain = domainUtils.isGoogleDomain;
      logger.info('Successfully loaded domainUtils.js');
      initializationComplete = true;
      resolve();
    } catch (error) {
      logger.error('Error loading domainUtils.js:', { error });
      initializationError = error;
      reject(error);
    }
  })();
});

// Export the functions that will be populated asynchronously
module.exports = {
  get normalizeUrl() {
    if (!initializationComplete) {
      if (initializationError) {
        throw initializationError;
      }
      throw new Error('normalizeUrl not initialized yet. The dynamic import may still be in progress.');
    }
    return normalizeUrl;
  },
  get getNormalizedDomain() {
    if (!initializationComplete) {
      if (initializationError) {
        throw initializationError;
      }
      throw new Error('getNormalizedDomain not initialized yet. The dynamic import may still be in progress.');
    }
    return getNormalizedDomain;
  },
  get isGoogleDomain() {
    if (!initializationComplete) {
      if (initializationError) {
        throw initializationError;
      }
      throw new Error('isGoogleDomain not initialized yet. The dynamic import may still be in progress.');
    }
    return isGoogleDomain;
  },
  // Export the initialization promise so consumers can await it
  initializationPromise
};
