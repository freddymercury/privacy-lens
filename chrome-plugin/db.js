// Database operations for PrivacyGuard Chrome Plugin

/**
 * Database configuration
 */
const DB_NAME = 'privacyGuardDB';
const DB_VERSION = 2;
const ASSESSMENT_STORE = 'assessments';
const CONFIG_STORE = 'config';
const AUTH_STORE = 'auth';

/**
 * Initialize the database with the required object stores and indexes
 * @returns {Promise<IDBDatabase>} - The initialized database
 */
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('[PrivacyGuard DB] Database error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      console.log('[PrivacyGuard DB] Database initialized successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('[PrivacyGuard DB] Database upgrade needed');

      // Create assessments object store
      if (!db.objectStoreNames.contains(ASSESSMENT_STORE)) {
        const assessmentStore = db.createObjectStore(ASSESSMENT_STORE, { keyPath: 'domain' });
        
        // Create indexes
        assessmentStore.createIndex('timestamp', 'metadata.timestamp', { unique: false });
        assessmentStore.createIndex('riskLevel', 'assessment.riskLevel', { unique: false });
        
        console.log('[PrivacyGuard DB] Created assessments store with indexes');
      }

      // Create config object store
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        const configStore = db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
        
        // Create index
        configStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        
        console.log('[PrivacyGuard DB] Created config store with indexes');
      }
      
      // Create auth object store
      if (!db.objectStoreNames.contains(AUTH_STORE)) {
        const authStore = db.createObjectStore(AUTH_STORE, { keyPath: 'key' });
        
        // Create index
        authStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        
        console.log('[PrivacyGuard DB] Created auth store with indexes');
      }
    };
  });
}

/**
 * Open a connection to the database
 * @returns {Promise<IDBDatabase>} - The database connection
 */
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('[PrivacyGuard DB] Error opening database:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      // This shouldn't happen here, as we should have initialized the DB already
      console.warn('[PrivacyGuard DB] Unexpected upgrade needed during openDatabase');
      const db = event.target.result;
      
      // Create stores if they don't exist (fallback)
      if (!db.objectStoreNames.contains(ASSESSMENT_STORE)) {
        db.createObjectStore(ASSESSMENT_STORE, { keyPath: 'domain' });
      }
      
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
      }
      
      if (!db.objectStoreNames.contains(AUTH_STORE)) {
        db.createObjectStore(AUTH_STORE, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Get an object store for transaction
 * @param {string} storeName - The name of the object store
 * @param {string} mode - The transaction mode ('readonly' or 'readwrite')
 * @returns {Promise<IDBObjectStore>} - The object store
 */
async function getObjectStore(storeName, mode = 'readonly') {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

/**
 * Check if the database has been initialized
 * @returns {Promise<boolean>} - Whether the database is initialized
 */
async function isDatabaseInitialized() {
  try {
    const store = await getObjectStore(CONFIG_STORE);
    const request = store.get('databaseInitialized');
    
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const result = event.target.result;
        resolve(result && result.value === true);
      };
      
      request.onerror = () => {
        console.error('[PrivacyGuard DB] Error checking database initialization');
        resolve(false);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in isDatabaseInitialized:', error);
    return false;
  }
}

/**
 * Set the database initialization status
 * @param {boolean} status - The initialization status
 * @returns {Promise<void>}
 */
async function setDatabaseInitialized(status) {
  try {
    const store = await getObjectStore(CONFIG_STORE, 'readwrite');
    const request = store.put({
      key: 'databaseInitialized',
      value: status,
      timestamp: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in setDatabaseInitialized:', error);
    throw error;
  }
}

/**
 * Store an assessment in the database
 * @param {Object} assessment - The assessment to store
 * @returns {Promise<void>}
 */
async function storeAssessment(assessment) {
  try {
    const store = await getObjectStore(ASSESSMENT_STORE, 'readwrite');
    const request = store.put(assessment);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error('[PrivacyGuard DB] Error storing assessment:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in storeAssessment:', error);
    throw error;
  }
}

/**
 * Get an assessment from the database
 * @param {string} domain - The domain to get the assessment for
 * @returns {Promise<Object|null>} - The assessment or null if not found
 */
async function getAssessment(domain) {
  try {
    const store = await getObjectStore(ASSESSMENT_STORE);
    const request = store.get(domain);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyGuard DB] Error getting assessment:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in getAssessment:', error);
    throw error;
  }
}

/**
 * Update an assessment in the database
 * @param {Object} assessment - The assessment to update
 * @returns {Promise<void>}
 */
async function updateAssessmentInDB(assessment) {
  return storeAssessment(assessment); // Uses put which overwrites existing
}

/**
 * Bulk insert assessments into the database
 * @param {Array<Object>} assessments - The assessments to insert
 * @returns {Promise<void>}
 */
async function bulkInsertAssessments(assessments) {
  try {
    if (!assessments || !Array.isArray(assessments) || assessments.length === 0) {
      console.error('[PrivacyGuard DB] No assessments to insert:', assessments);
      return;
    }
    
    console.log(`[PrivacyGuard DB] Starting bulk insert of ${assessments.length} assessments`);
    
    const db = await openDatabase();
    const transaction = db.transaction(ASSESSMENT_STORE, 'readwrite');
    const store = transaction.objectStore(ASSESSMENT_STORE);
    
    // Track progress
    let insertedCount = 0;
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`[PrivacyGuard DB] Bulk insert completed: ${insertedCount}/${assessments.length} assessments inserted`);
        resolve();
      };
      
      transaction.onerror = (event) => {
        console.error('[PrivacyGuard DB] Error in bulk insert:', event.target.error);
        reject(event.target.error);
      };
      
      // Add each assessment to the store
      assessments.forEach((assessment, index) => {
        try {
          if (!assessment || !assessment.domain) {
            console.error(`[PrivacyGuard DB] Invalid assessment at index ${index}:`, assessment);
            return; // Skip this one
          }
          
          const request = store.put(assessment);
          
          request.onsuccess = () => {
            insertedCount++;
            
            // Log progress for large datasets
            if (assessments.length > 100 && insertedCount % 100 === 0) {
              console.log(`[PrivacyGuard DB] Bulk insert progress: ${insertedCount}/${assessments.length}`);
            }
          };
          
          request.onerror = (event) => {
            console.error(`[PrivacyGuard DB] Error inserting assessment for domain ${assessment.domain}:`, event.target.error);
            // Continue with other assessments
          };
        } catch (itemError) {
          console.error(`[PrivacyGuard DB] Error processing assessment at index ${index}:`, itemError);
          // Continue with other assessments
        }
      });
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in bulkInsertAssessments:', error);
    throw error;
  }
}

/**
 * Bulk update assessments in the database
 * @param {Array<Object>} assessments - The assessments to update
 * @returns {Promise<void>}
 */
async function bulkUpdateAssessmentsInDB(assessments) {
  return bulkInsertAssessments(assessments); // Uses put which overwrites existing
}

/**
 * Get assessments by risk level
 * @param {string} riskLevel - The risk level to filter by
 * @returns {Promise<Array<Object>>} - The matching assessments
 */
async function getAssessmentsByRiskLevel(riskLevel) {
  try {
    const store = await getObjectStore(ASSESSMENT_STORE);
    const index = store.index('riskLevel');
    const request = index.getAll(riskLevel.toLowerCase());
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyGuard DB] Error getting assessments by risk level:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in getAssessmentsByRiskLevel:', error);
    throw error;
  }
}

/**
 * Update last sync information
 * @param {Object} syncInfo - The sync information
 * @returns {Promise<void>}
 */
async function updateLastSyncInfo(syncInfo) {
  try {
    const store = await getObjectStore(CONFIG_STORE, 'readwrite');
    const request = store.put({
      key: 'lastSync',
      value: syncInfo,
      lastUpdated: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in updateLastSyncInfo:', error);
    throw error;
  }
}

/**
 * Get last sync information
 * @returns {Promise<Object|null>} - The last sync info or null if not found
 */
async function getLastSyncInfo() {
  try {
    const store = await getObjectStore(CONFIG_STORE);
    const request = store.get('lastSync');
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const result = event.target.result;
        resolve(result ? result.value : null);
      };
      
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in getLastSyncInfo:', error);
    throw error;
  }
}

/**
 * Check and initialize the database if needed
 * @returns {Promise<void>}
 */
async function checkAndInitializeDatabase() {
  try {
    // Ensure database is created with correct schema
    await initializeDatabase();
    
    // Check if already initialized
    const isInitialized = await isDatabaseInitialized();
    
    if (!isInitialized) {
      console.log('[PrivacyGuard DB] Database not initialized, loading pre-packaged data');
      await loadPrepackagedDatabase();
    } else {
      console.log('[PrivacyGuard DB] Database already initialized');
    }
  } catch (error) {
    console.error('[PrivacyGuard DB] Error in checkAndInitializeDatabase:', error);
    throw error;
  }
}

/**
 * Load the pre-packaged database
 * @returns {Promise<void>}
 */
async function loadPrepackagedDatabase() {
  try {
    // Fetch the pre-packaged database file
    const response = await fetch(chrome.runtime.getURL('assessments.json'));
    const prepackagedData = await response.json();
    
    // Validate the data
    if (!prepackagedData.assessments || typeof prepackagedData.assessments !== 'object') {
      throw new Error('Invalid pre-packaged database format');
    }
    
    const assessmentCount = Object.keys(prepackagedData.assessments).length;
    console.log(`[PrivacyGuard DB] Loaded pre-packaged database with ${assessmentCount} assessments`);
    
    // Transform the data for database storage
    const transformedData = Object.entries(prepackagedData.assessments).map(([domain, data]) => ({
      domain,
      assessment: data.assessment,
      metadata: {
        ...data.metadata,
        source: "prepackaged"
      }
    }));
    
    console.log(`[PrivacyGuard DB] Transformed ${transformedData.length} assessments for database storage`);
    
    // Bulk insert into the database
    await bulkInsertAssessments(transformedData);
    
    // Verify the data was inserted
    const db = await openDatabase();
    const transaction = db.transaction(ASSESSMENT_STORE, 'readonly');
    const store = transaction.objectStore(ASSESSMENT_STORE);
    const countRequest = store.count();
    
    const count = await new Promise((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = (event) => reject(event.target.error);
    });
    
    console.log(`[PrivacyGuard DB] Verified ${count} assessments in database after bulk insert`);
    
    // Mark database as initialized
    await setDatabaseInitialized(true);
    
    console.log('[PrivacyGuard DB] Pre-packaged database loaded successfully');
  } catch (error) {
    console.error('[PrivacyGuard DB] Error loading pre-packaged database:', error);
    throw error;
  }
}

// Export functions
export {
  initializeDatabase,
  openDatabase,
  getObjectStore,
  isDatabaseInitialized,
  setDatabaseInitialized,
  storeAssessment,
  getAssessment,
  updateAssessmentInDB,
  bulkInsertAssessments,
  bulkUpdateAssessmentsInDB,
  getAssessmentsByRiskLevel,
  updateLastSyncInfo,
  getLastSyncInfo,
  checkAndInitializeDatabase,
  loadPrepackagedDatabase,
  // Constants
  ASSESSMENT_STORE,
  CONFIG_STORE,
  AUTH_STORE
};
