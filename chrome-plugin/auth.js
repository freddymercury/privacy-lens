// User authentication and subscription management for PrivacyLens Chrome Plugin

import { getObjectStore } from './db.js';
import { API_BASE_URL } from './config.js';

/**
 * Default user tier configuration
 */
const DEFAULT_USER_TIER = {
  tier: 'free',
  features: ['basic']
};

/**
 * Store user authentication data
 * @param {Object} authData - Authentication data to store
 * @returns {Promise<void>}
 */
async function storeAuthData(authData) {
  try {
    const store = await getObjectStore('auth', 'readwrite');
    const request = store.put({
      key: 'userData',
      value: authData,
      lastUpdated: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('[PrivacyLens Auth] User data stored');
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Auth] Error storing user data:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Auth] Error in storeAuthData:', error);
    throw error;
  }
}

/**
 * Get stored user authentication data
 * @returns {Promise<Object|null>} - User authentication data or null if not found
 */
async function getAuthData() {
  try {
    const store = await getObjectStore('auth');
    const request = store.get('userData');
    
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const result = event.target.result;
        if (result && result.value) {
          resolve(result.value);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Auth] Error getting user data:', event.target.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Auth] Error in getAuthData:', error);
    return null;
  }
}

/**
 * Clear stored user authentication data
 * @returns {Promise<void>}
 */
async function clearAuthData() {
  try {
    const store = await getObjectStore('auth', 'readwrite');
    const request = store.delete('userData');
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('[PrivacyLens Auth] User data cleared');
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Auth] Error clearing user data:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Auth] Error in clearAuthData:', error);
    throw error;
  }
}

/**
 * Generate a unique device ID
 * @returns {Promise<string>} - Device ID
 */
async function getDeviceId() {
  try {
    const store = await getObjectStore('config');
    const request = store.get('deviceId');
    
    return new Promise((resolve) => {
      request.onsuccess = async (event) => {
        const result = event.target.result;
        if (result && result.value) {
          resolve(result.value);
        } else {
          // Generate new device ID
          const deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + 
                           Math.random().toString(36).substring(2, 15);
          
          // Store device ID
          const writeStore = await getObjectStore('config', 'readwrite');
          writeStore.put({
            key: 'deviceId',
            value: deviceId,
            lastUpdated: Date.now()
          });
          
          resolve(deviceId);
        }
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Auth] Error getting device ID:', event.target.error);
        // Generate temporary device ID
        const tempDeviceId = 'temp_' + Math.random().toString(36).substring(2, 15);
        resolve(tempDeviceId);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Auth] Error in getDeviceId:', error);
    // Generate temporary device ID
    const tempDeviceId = 'temp_' + Math.random().toString(36).substring(2, 15);
    return tempDeviceId;
  }
}

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} name - User name (optional)
 * @returns {Promise<Object>} - Registration result
 */
async function register(email, password, name = '') {
  try {
    const deviceId = await getDeviceId();
    
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        name,
        deviceId
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }
    
    // Store authentication data
    await storeAuthData({
      user: data.user,
      token: data.token,
      deviceId
    });
    
    return {
      success: true,
      user: data.user
    };
  } catch (error) {
    console.error('[PrivacyLens Auth] Registration error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - Login result
 */
async function login(email, password) {
  try {
    const deviceId = await getDeviceId();
    
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        deviceId
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }
    
    // Store authentication data (user, token, deviceId only)
    await storeAuthData({
      user: data.user,
      token: data.token,
      // subscription: data.subscription, // Removed: Subscription data is no longer returned by login
      deviceId
    });
    
    return {
      success: true,
      user: data.user
      // subscription: data.subscription // Removed
    };
  } catch (error) {
    console.error('[PrivacyLens Auth] Login error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Logout user
 * @returns {Promise<Object>} - Logout result
 */
async function logout() {
  try {
    const authData = await getAuthData();
    
    if (authData && authData.token) {
      // Revoke token on server
      try {
        await fetch(`${API_BASE_URL}/auth/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.token}`
          },
          body: JSON.stringify({
            token: authData.token
          })
        });
      } catch (error) {
        console.error('[PrivacyLens Auth] Error revoking token:', error);
        // Continue with logout even if token revocation fails
      }
    }
    
    // Clear authentication data
    await clearAuthData();
    
    return {
      success: true
    };
  } catch (error) {
    console.error('[PrivacyLens Auth] Logout error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} - Whether user is authenticated
 */
async function isAuthenticated() {
  try {
    const authData = await getAuthData();
    
    if (!authData || !authData.token) {
      return false;
    }
    
    // Validate token
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: authData.token
      })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.valid) {
      // Token is invalid, clear auth data
      await clearAuthData();
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[PrivacyLens Auth] Authentication check error:', error);
    return false;
  }
}

/**
 * Refresh authentication token
 * @returns {Promise<boolean>} - Whether token refresh was successful
 */
async function refreshToken() {
  try {
    const authData = await getAuthData();
    
    if (!authData || !authData.token) {
      return false;
    }
    
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: authData.token
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Token refresh failed, clear auth data
      await clearAuthData();
      return false;
    }
    
    // Update stored token
    await storeAuthData({
      ...authData,
      token: data.token
    });
    
    return true;
  } catch (error) {
    console.error('[PrivacyLens Auth] Token refresh error:', error);
    return false;
  }
}

/**
 * Get the user's tier information
 * @returns {Promise<Object>} - The user tier information
 */
async function getUserTier() {
  try {
    const authData = await getAuthData();
    
    if (!authData || !authData.token) {
      return DEFAULT_USER_TIER;
    }
    
    // Get subscription status from server
    const response = await fetch(`${API_BASE_URL}/subscription/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.token}`
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return DEFAULT_USER_TIER;
    }
    
    // Update stored subscription data
    await storeAuthData({
      ...authData,
      subscription: data.subscription
    });
    
    // Map subscription to tier
    if (data.subscription && data.subscription.active) {
      return {
        tier: data.subscription.tier,
        features: ['basic', 'advanced', 'premium'],
        expiresAt: data.subscription.currentPeriodEnd
      };
    }
    
    return DEFAULT_USER_TIER;
  } catch (error) {
    console.error('[PrivacyLens Auth] Error getting user tier:', error);
    return DEFAULT_USER_TIER;
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
    
    // Check if the feature exists in the features array
    return tierInfo.features.includes(featureName);
  } catch (error) {
    console.error(`[PrivacyLens Auth] Error checking feature ${featureName}:`, error);
    return false; // Default to not having the feature on error
  }
}

/**
 * Check if the user is in the premium tier
 * @returns {Promise<boolean>} - Whether the user is in the premium tier
 */
async function isPremium() {
  try {
    const tierInfo = await getUserTier();
    return tierInfo.tier !== 'free';
  } catch (error) {
    console.error('[PrivacyLens Auth] Error checking premium status:', error);
    return false;
  }
}

/**
 * Create a subscription
 * @param {string} planType - Plan type (monthly/annual)
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} - Subscription result
 */
async function createSubscription(planType, paymentMethodId) {
  try {
    const authData = await getAuthData();
    
    if (!authData || !authData.token) {
      throw new Error('User not authenticated');
    }
    
    const response = await fetch(`${API_BASE_URL}/subscription/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.token}`
      },
      body: JSON.stringify({
        planType,
        paymentMethodId
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Subscription creation failed');
    }
    
    // Update stored subscription data
    await storeAuthData({
      ...authData,
      subscription: data.subscription
    });
    
    return {
      success: true,
      subscription: data.subscription,
      clientSecret: data.clientSecret
    };
  } catch (error) {
    console.error('[PrivacyLens Auth] Subscription creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update subscription
 * @param {string} planType - New plan type (monthly/annual)
 * @returns {Promise<Object>} - Update result
 */
async function updateSubscription(planType) {
  try {
    const authData = await getAuthData();
    
    if (!authData || !authData.token) {
      throw new Error('User not authenticated');
    }
    
    const response = await fetch(`${API_BASE_URL}/subscription/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.token}`
      },
      body: JSON.stringify({
        planType
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Subscription update failed');
    }
    
    // Update stored subscription data
    await storeAuthData({
      ...authData,
      subscription: data.subscription
    });
    
    return {
      success: true,
      subscription: data.subscription
    };
  } catch (error) {
    console.error('[PrivacyLens Auth] Subscription update error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cancel subscription
 * @returns {Promise<Object>} - Cancellation result
 */
async function cancelSubscription() {
  try {
    const authData = await getAuthData();
    
    if (!authData || !authData.token) {
      throw new Error('User not authenticated');
    }
    
    const response = await fetch(`${API_BASE_URL}/subscription/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.token}`
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Subscription cancellation failed');
    }
    
    // Update stored subscription data
    await storeAuthData({
      ...authData,
      subscription: data.subscription
    });
    
    return {
      success: true,
      subscription: data.subscription
    };
  } catch (error) {
    console.error('[PrivacyLens Auth] Subscription cancellation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get the authenticated user's token
 * @returns {Promise<string|null>} - JWT token or null if not authenticated
 */
async function getAuthToken() {
  try {
    const authData = await getAuthData();
    return authData && authData.token ? authData.token : null;
  } catch (error) {
    console.error('[PrivacyLens Auth] Error getting auth token:', error);
    return null;
  }
}

/**
 * Get the authenticated user's information
 * @returns {Promise<Object|null>} - User information or null if not authenticated
 */
async function getCurrentUser() {
  try {
    const authData = await getAuthData();
    return authData && authData.user ? authData.user : null;
  } catch (error) {
    console.error('[PrivacyLens Auth] Error getting current user:', error);
    return null;
  }
}

// Export functions
export {
  register,
  login,
  logout,
  isAuthenticated,
  refreshToken,
  getUserTier,
  hasFeature,
  isPremium,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getAuthToken,
  getCurrentUser,
  getDeviceId
};
