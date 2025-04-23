// User authentication and tier management for PrivacyGuard Chrome Plugin

import { getObjectStore } from './db.js';

/**
 * Default user tier configuration
 */
const DEFAULT_USER_TIER = {
  tier: 'free',
  expirationDate: null,
  features: {
    serverFetch: false,
    advancedAnalytics: false
  }
};

/**
 * Get the user's tier information
 * @returns {Promise<Object>} - The user tier information
 */
async function getUserTier() {
  try {
    const store = await getObjectStore('config');
    const request = store.get('userTier');
    
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const result = event.target.result;
        if (result && result.value) {
          resolve(result.value);
        } else {
          // Return default tier if not set
          resolve(DEFAULT_USER_TIER);
        }
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyGuard Auth] Error getting user tier:', event.target.error);
        // Return default tier on error
        resolve(DEFAULT_USER_TIER);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard Auth] Error in getUserTier:', error);
    return DEFAULT_USER_TIER;
  }
}

/**
 * Set the user's tier information
 * @param {Object} tierInfo - The tier information to set
 * @returns {Promise<void>}
 */
async function setUserTier(tierInfo) {
  try {
    const store = await getObjectStore('config', 'readwrite');
    const request = store.put({
      key: 'userTier',
      value: tierInfo,
      lastUpdated: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('[PrivacyGuard Auth] User tier updated:', tierInfo.tier);
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyGuard Auth] Error setting user tier:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard Auth] Error in setUserTier:', error);
    throw error;
  }
}

/**
 * Check if the user is in the paid tier
 * @returns {Promise<boolean>} - Whether the user is in the paid tier
 */
async function isUserPaidTier() {
  try {
    const tierInfo = await getUserTier();
    
    // Check if user is in paid tier and subscription hasn't expired
    if (tierInfo.tier === 'paid') {
      // If there's an expiration date, check if it's in the future
      if (tierInfo.expirationDate) {
        return Date.now() < tierInfo.expirationDate;
      }
      return true; // Paid with no expiration
    }
    
    return false; // Not paid tier
  } catch (error) {
    console.error('[PrivacyGuard Auth] Error in isUserPaidTier:', error);
    return false; // Default to free tier on error
  }
}

/**
 * Check if the user has a specific feature
 * @param {string} featureName - The name of the feature to check
 * @returns {Promise<boolean>} - Whether the user has the feature
 */
async function hasFeature(featureName) {
  try {
    const tierInfo = await getUserTier();
    
    // If user is paid tier but expired, check if they should still have the feature
    if (tierInfo.tier === 'paid' && tierInfo.expirationDate && Date.now() > tierInfo.expirationDate) {
      // For expired paid accounts, return false for all features
      return false;
    }
    
    // Check if the feature exists and is enabled
    return !!(tierInfo.features && tierInfo.features[featureName]);
  } catch (error) {
    console.error(`[PrivacyGuard Auth] Error checking feature ${featureName}:`, error);
    return false; // Default to not having the feature on error
  }
}

/**
 * Initialize user tier if not already set
 * @returns {Promise<void>}
 */
async function initializeUserTier() {
  try {
    const store = await getObjectStore('config');
    const request = store.get('userTier');
    
    return new Promise((resolve, reject) => {
      request.onsuccess = async (event) => {
        const result = event.target.result;
        if (!result) {
          // User tier not set, initialize with default
          try {
            await setUserTier(DEFAULT_USER_TIER);
            console.log('[PrivacyGuard Auth] Initialized user tier to default (free)');
          } catch (error) {
            console.error('[PrivacyGuard Auth] Error initializing user tier:', error);
          }
        } else {
          console.log('[PrivacyGuard Auth] User tier already initialized');
        }
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyGuard Auth] Error checking user tier initialization:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyGuard Auth] Error in initializeUserTier:', error);
    throw error;
  }
}

/**
 * Upgrade user to paid tier
 * @param {number} [expirationDays=30] - Number of days until expiration
 * @returns {Promise<void>}
 */
async function upgradeToPaidTier(expirationDays = 30) {
  try {
    // Calculate expiration date
    const expirationDate = expirationDays 
      ? Date.now() + (expirationDays * 24 * 60 * 60 * 1000) 
      : null;
    
    // Create paid tier configuration
    const paidTierConfig = {
      tier: 'paid',
      expirationDate: expirationDate,
      features: {
        serverFetch: true,
        advancedAnalytics: true
      }
    };
    
    // Update user tier
    await setUserTier(paidTierConfig);
    console.log(`[PrivacyGuard Auth] User upgraded to paid tier, expires in ${expirationDays} days`);
  } catch (error) {
    console.error('[PrivacyGuard Auth] Error upgrading to paid tier:', error);
    throw error;
  }
}

/**
 * Downgrade user to free tier
 * @returns {Promise<void>}
 */
async function downgradeToFreeTier() {
  try {
    await setUserTier(DEFAULT_USER_TIER);
    console.log('[PrivacyGuard Auth] User downgraded to free tier');
  } catch (error) {
    console.error('[PrivacyGuard Auth] Error downgrading to free tier:', error);
    throw error;
  }
}

// Export functions
export {
  getUserTier,
  setUserTier,
  isUserPaidTier,
  hasFeature,
  initializeUserTier,
  upgradeToPaidTier,
  downgradeToFreeTier
};
