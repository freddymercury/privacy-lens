// Update management for PrivacyLens Chrome Plugin

import { getObjectStore } from './db.js';
import { getAuthToken, getUserTier, hasFeature, getDeviceId } from './auth.js';

// API URL
const API_URL = 'http://localhost:3000/api';

/**
 * Store update information
 * @param {Object} updateInfo - Update information to store
 * @returns {Promise<void>}
 */
async function storeUpdateInfo(updateInfo) {
  try {
    const store = await getObjectStore('updates', 'readwrite');
    const request = store.put({
      key: 'latestUpdate',
      value: updateInfo,
      lastUpdated: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('[PrivacyLens Updater] Update info stored');
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Updater] Error storing update info:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Updater] Error in storeUpdateInfo:', error);
    throw error;
  }
}

/**
 * Get stored update information
 * @returns {Promise<Object|null>} - Update information or null if not found
 */
async function getUpdateInfo() {
  try {
    const store = await getObjectStore('updates');
    const request = store.get('latestUpdate');
    
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
        console.error('[PrivacyLens Updater] Error getting update info:', event.target.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Updater] Error in getUpdateInfo:', error);
    return null;
  }
}

/**
 * Store update history
 * @param {Object} update - Update to add to history
 * @returns {Promise<void>}
 */
async function addToUpdateHistory(update) {
  try {
    // Get current history
    const store = await getObjectStore('updates');
    const request = store.get('updateHistory');
    
    let history = [];
    
    await new Promise((resolve) => {
      request.onsuccess = (event) => {
        const result = event.target.result;
        if (result && result.value) {
          history = result.value;
        }
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Updater] Error getting update history:', event.target.error);
        resolve();
      };
    });
    
    // Add new update to history
    history.unshift({
      ...update,
      appliedAt: new Date().toISOString()
    });
    
    // Limit history to 20 items
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    
    // Store updated history
    const writeStore = await getObjectStore('updates', 'readwrite');
    const writeRequest = writeStore.put({
      key: 'updateHistory',
      value: history,
      lastUpdated: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      writeRequest.onsuccess = () => {
        console.log('[PrivacyLens Updater] Update history stored');
        resolve();
      };
      
      writeRequest.onerror = (event) => {
        console.error('[PrivacyLens Updater] Error storing update history:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Updater] Error in addToUpdateHistory:', error);
    throw error;
  }
}

/**
 * Get update history
 * @returns {Promise<Array>} - Update history
 */
async function getUpdateHistory() {
  try {
    // Try to get from server first
    const token = await getAuthToken();
    const deviceId = await getDeviceId();
    
    if (token) {
      try {
        const response = await fetch(`${API_URL}/updates/changelog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ deviceId })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.history) {
            return data.history;
          }
        }
      } catch (error) {
        console.error('[PrivacyLens Updater] Error fetching update history from server:', error);
        // Fall back to local history
      }
    }
    
    // Fall back to local history
    const store = await getObjectStore('updates');
    const request = store.get('updateHistory');
    
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const result = event.target.result;
        if (result && result.value) {
          resolve(result.value);
        } else {
          resolve([]);
        }
      };
      
      request.onerror = (event) => {
        console.error('[PrivacyLens Updater] Error getting update history:', event.target.error);
        resolve([]);
      };
    });
  } catch (error) {
    console.error('[PrivacyLens Updater] Error in getUpdateHistory:', error);
    return [];
  }
}

/**
 * Check for available updates
 * @param {string} currentVersion - Current version
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} - Update information
 */
async function checkForUpdates(currentVersion, deviceId) {
  try {
    const token = await getAuthToken();
    
    if (!token) {
      return {
        hasUpdate: false,
        currentVersion
      };
    }
    
    const response = await fetch(`${API_URL}/updates/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        currentVersion,
        deviceId
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Update check failed');
    }
    
    if (data.status === 'success' && data.update) {
      // Store update info if there's an update available
      if (data.update.hasUpdate) {
        await storeUpdateInfo(data.update);
      }
      
      return data.update;
    }
    
    return {
      hasUpdate: false,
      currentVersion
    };
  } catch (error) {
    console.error('[PrivacyLens Updater] Update check error:', error);
    
    // Return stored update info if available
    const storedUpdateInfo = await getUpdateInfo();
    if (storedUpdateInfo && storedUpdateInfo.version && storedUpdateInfo.version !== currentVersion) {
      return {
        ...storedUpdateInfo,
        hasUpdate: true
      };
    }
    
    return {
      hasUpdate: false,
      currentVersion,
      error: error.message
    };
  }
}

/**
 * Apply update
 * @param {string} updateId - Update ID
 * @param {string} deviceId - Device ID
 * @param {Object} storage - Storage object to update
 * @returns {Promise<Object>} - Update result
 */
async function applyUpdate(updateId, deviceId, storage = null) {
  try {
    const token = await getAuthToken();
    
    if (!token) {
      return {
        success: false,
        error: 'User not authenticated'
      };
    }
    
    const response = await fetch(`${API_URL}/updates/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        updateId,
        deviceId
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.status === 'success' || !data.update || !data.update.success) {
      throw new Error(data.update?.error || 'Update application failed');
    }
    
    const update = data.update;
    
    // Apply update data to storage if provided
    if (storage && update.updateData) {
      try {
        // Apply templates
        if (update.updateData.templates) {
          await storage.set('templates', update.updateData.templates);
        }
        
        // Apply other update data as needed
        if (update.updateData.settings) {
          await storage.set('settings', update.updateData.settings);
        }
        
        if (update.updateData.rules) {
          await storage.set('rules', update.updateData.rules);
        }
      } catch (storageError) {
        console.error('[PrivacyLens Updater] Error applying update to storage:', storageError);
        throw new Error('Failed to apply update to local storage');
      }
    }
    
    // Add to update history
    await addToUpdateHistory({
      version: update.version,
      updateType: update.updateType,
      changelog: update.changelog || 'No changelog provided'
    });
    
    return {
      success: true,
      version: update.version,
      updateType: update.updateType
    };
  } catch (error) {
    console.error('[PrivacyLens Updater] Update application error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Schedule regular update checks
 * @param {string} currentVersion - Current version
 * @param {Function} onUpdateAvailable - Callback when update is available
 * @returns {void}
 */
function scheduleUpdateChecks(currentVersion, onUpdateAvailable) {
  // Check for updates on startup
  setTimeout(async () => {
    try {
      const deviceId = await getDeviceId();
      const updateInfo = await checkForUpdates(currentVersion, deviceId);
      
      if (updateInfo.hasUpdate && typeof onUpdateAvailable === 'function') {
        onUpdateAvailable(updateInfo);
      }
    } catch (error) {
      console.error('[PrivacyLens Updater] Startup update check error:', error);
    }
  }, 5000); // Wait 5 seconds after startup
  
  // Set up periodic checks
  const checkInterval = 1000 * 60 * 60 * 6; // Check every 6 hours
  setInterval(async () => {
    try {
      const deviceId = await getDeviceId();
      const updateInfo = await checkForUpdates(currentVersion, deviceId);
      
      if (updateInfo.hasUpdate && typeof onUpdateAvailable === 'function') {
        onUpdateAvailable(updateInfo);
      }
    } catch (error) {
      console.error('[PrivacyLens Updater] Periodic update check error:', error);
    }
  }, checkInterval);
  
  // For premium users, check more frequently
  setInterval(async () => {
    try {
      const isPremium = await hasFeature('premium');
      if (isPremium) {
        const deviceId = await getDeviceId();
        const updateInfo = await checkForUpdates(currentVersion, deviceId);
        
        if (updateInfo.hasUpdate && typeof onUpdateAvailable === 'function') {
          onUpdateAvailable(updateInfo);
        }
      }
    } catch (error) {
      console.error('[PrivacyLens Updater] Premium update check error:', error);
    }
  }, 1000 * 60 * 60); // Check every hour for premium users
}

// Export functions
export {
  checkForUpdates,
  applyUpdate,
  getUpdateHistory,
  scheduleUpdateChecks,
  getDeviceId
};
