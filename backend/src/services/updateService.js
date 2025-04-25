// Update Service for PrivacyLens
const db = require('../utils/db');
const semver = require('semver');

/**
 * Check for available updates
 * @param {string} userId - User ID
 * @param {string} deviceId - Device ID
 * @param {string} currentVersion - Current version
 * @returns {Promise<Object>} - Update information
 */
const checkForUpdates = async (userId, deviceId, currentVersion) => {
  try {
    // Get user subscription status
    const user = await db.getUserById(userId);
    const subscription = await db.getUserSubscription(userId);
    const isPremium = subscription && subscription.status === 'active';
    
    // Get latest plugin update
    const latestPluginUpdate = await db.getLatestPluginUpdate();
    
    // For premium users, also check server updates
    let latestServerUpdate = null;
    if (isPremium) {
      latestServerUpdate = await db.getLatestServerUpdate();
    }
    
    // Determine which update to return (if any)
    let update = null;
    
    // Check if plugin update is available
    if (latestPluginUpdate && semver.gt(latestPluginUpdate.version, currentVersion)) {
      update = {
        hasUpdate: true,
        version: latestPluginUpdate.version,
        updateType: 'plugin',
        downloadUrl: latestPluginUpdate.download_url,
        changelog: latestPluginUpdate.changelog
      };
    }
    
    // For premium users, check if server update is newer than plugin update
    if (isPremium && latestServerUpdate) {
      // If no plugin update or server update is newer
      if (!update || semver.gt(latestServerUpdate.version, update.version)) {
        update = {
          hasUpdate: true,
          version: latestServerUpdate.version,
          updateType: 'server',
          downloadUrl: latestServerUpdate.download_url,
          changelog: latestServerUpdate.changelog
        };
      }
    }
    
    // If no update available
    if (!update) {
      return {
        hasUpdate: false,
        currentVersion
      };
    }
    
    // Log update check
    await db.createAuditLog({
      action: 'update_check',
      user_id: userId,
      details: {
        device_id: deviceId,
        current_version: currentVersion,
        update_available: update.hasUpdate,
        update_version: update.version,
        update_type: update.updateType
      }
    });
    
    return update;
  } catch (error) {
    console.error('Update check error:', error);
    throw error;
  }
};

/**
 * Apply update
 * @param {string} userId - User ID
 * @param {string} deviceId - Device ID
 * @param {string} updateId - Update ID
 * @returns {Promise<Object>} - Update result
 */
const applyUpdate = async (userId, deviceId, updateId) => {
  try {
    // Get update
    const update = await db.getUpdateById(updateId);
    if (!update) {
      return {
        success: false,
        error: 'Update not found'
      };
    }
    
    // Record update application
    await db.recordUpdateApplication({
      user_id: userId,
      device_id: deviceId,
      update_id: updateId,
      applied_at: new Date().toISOString()
    });
    
    // Create audit log entry
    await db.createAuditLog({
      action: 'update_applied',
      user_id: userId,
      details: {
        device_id: deviceId,
        update_id: updateId,
        update_version: update.version,
        update_type: update.update_type
      }
    });
    
    return {
      success: true,
      version: update.version,
      updateType: update.update_type,
      updateData: update.update_data
    };
  } catch (error) {
    console.error('Update application error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get update history for a user
 * @param {string} userId - User ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<Array>} - Update history
 */
const getUpdateHistory = async (userId, deviceId) => {
  try {
    const history = await db.getUserUpdateHistory(userId, deviceId);
    
    // Format history for client
    return history.map(entry => ({
      version: entry.update.version,
      updateType: entry.update.update_type,
      appliedAt: entry.applied_at,
      changelog: entry.update.changelog
    }));
  } catch (error) {
    console.error('Get update history error:', error);
    throw error;
  }
};

/**
 * Create a new update
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} - Created update
 */
const createUpdate = async (updateData) => {
  try {
    const update = await db.createUpdate({
      ...updateData,
      created_at: new Date().toISOString()
    });
    
    // Create audit log entry
    await db.createAuditLog({
      action: 'update_created',
      user_id: updateData.created_by,
      details: {
        update_id: update.id,
        update_version: update.version,
        update_type: update.update_type
      }
    });
    
    return update;
  } catch (error) {
    console.error('Create update error:', error);
    throw error;
  }
};

module.exports = {
  checkForUpdates,
  applyUpdate,
  getUpdateHistory,
  createUpdate
};
