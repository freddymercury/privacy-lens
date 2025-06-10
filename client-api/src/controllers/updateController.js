const db = require('../database.js');
const semver = require('semver');
const { logger } = require('../middleware/logging.js');

/**
 * Check for available updates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const checkForUpdates = async (req, res) => {
  try {
    const { currentVersion } = req.body;
    const userId = req.user.sub; // From JWT token
    const deviceId = req.user.device_id; // From JWT token
    
    if (!currentVersion) {
      return res.status(400).json({
        status: 'error',
        message: 'Current version is required'
      });
    }

    // Get user subscription status using shared subscription queries
    const subscription = await db.queries.getUserSubscription(userId);
    const isPremium = subscription && ['active', 'trialing'].includes(subscription.status);
    
    // Get latest plugin update
    const latestPluginUpdate = await getLatestUpdate('plugin');
    
    // For premium users, also check server updates
    let latestServerUpdate = null;
    if (isPremium) {
      latestServerUpdate = await getLatestUpdate('server');
    }
    
    // Determine which update to return (if any)
    let update = null;
    
    // Check if plugin update is available
    if (latestPluginUpdate && semver.gt(latestPluginUpdate.version, currentVersion)) {
      update = {
        hasUpdate: true,
        updateId: latestPluginUpdate.id,
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
          updateId: latestServerUpdate.id,
          version: latestServerUpdate.version,
          updateType: 'server',
          downloadUrl: latestServerUpdate.download_url,
          changelog: latestServerUpdate.changelog
        };
      }
    }
    
    // If no update available
    if (!update) {
      return res.json({
        status: 'success',
        update: {
          hasUpdate: false,
          currentVersion
        }
      });
    }
    
    // Log update check
    await db.queries.createAuditLog({
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
    
    res.json({
      status: 'success',
      update: update
    });
  } catch (error) {
    logger.error('Update check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check for updates'
    });
  }
};

/**
 * Apply update
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const applyUpdate = async (req, res) => {
  try {
    const { updateId } = req.body;
    const userId = req.user.sub;
    const deviceId = req.user.device_id;
    
    if (!updateId) {
      return res.status(400).json({
        status: 'error',
        message: 'Update ID is required'
      });
    }
    
    // Get update details
    const update = await getUpdateById(updateId);
    if (!update) {
      return res.status(404).json({
        status: 'error',
        message: 'Update not found'
      });
    }
    
    // Record update application
    await db.queries.recordUpdateApplication({
      user_id: userId,
      device_id: deviceId,
      update_id: updateId,
      applied_at: new Date().toISOString()
    });
    
    // Create audit log entry
    await db.queries.createAuditLog({
      action: 'update_applied',
      user_id: userId,
      details: {
        device_id: deviceId,
        update_id: updateId,
        update_version: update.version,
        update_type: update.update_type
      }
    });
    
    res.json({
      status: 'success',
      update: {
        success: true,
        version: update.version,
        updateType: update.update_type,
        updateData: update.update_data
      }
    });
  } catch (error) {
    logger.error('Update application error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to apply update'
    });
  }
};

/**
 * Get update history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUpdateHistory = async (req, res) => {
  try {
    const userId = req.user.sub;
    const deviceId = req.user.device_id;
    
    // Get user's update history
    const history = await db.queries.getUserUpdateHistory(userId, deviceId);
    
    // Create audit log entry
    await db.queries.createAuditLog({
      action: 'update_history_viewed',
      user_id: userId,
      details: {
        device_id: deviceId,
        history_count: history.length
      }
    });
    
    // Chrome plugin expects { status: 'success', history: [...] }
    res.json({
      status: 'success',
      history: history
    });
  } catch (error) {
    logger.error('Update history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get update history'
    });
  }
};

/**
 * Helper function to get latest update by type
 * @param {string} updateType - Type of update ('plugin' or 'server')
 * @returns {Promise<Object|null>} - Latest update or null
 */
const getLatestUpdate = async (updateType) => {
  const { data, error } = await db.supabaseServiceRole
    .from('updates')
    .select('*')
    .eq('update_type', updateType)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(`Error getting latest ${updateType} update:`, error);
    return null;
  }

  return data;
};

/**
 * Helper function to get update by ID
 * @param {string} updateId - Update ID
 * @returns {Promise<Object|null>} - Update or null
 */
const getUpdateById = async (updateId) => {
  const { data, error } = await db.supabaseServiceRole
    .from('updates')
    .select('*')
    .eq('id', updateId)
    .single();

  if (error) {
    logger.error(`Error getting update by ID ${updateId}:`, error);
    return null;
  }

  return data;
};

module.exports = {
  checkForUpdates,
  applyUpdate,
  getUpdateHistory
}; 