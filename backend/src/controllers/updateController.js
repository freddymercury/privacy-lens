// Update Controller for PrivacyLens

const updateService = require('../services/updateService');

/**
 * Check for available updates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const checkForUpdates = async (req, res) => {
  try {
    const { currentVersion } = req.body;
    const userId = req.user.id;
    const deviceId = req.user.deviceId;

    if (!currentVersion) {
      return res.status(400).json({
        status: 'error',
        message: 'Current version is required'
      });
    }

    const update = await updateService.checkForUpdates(userId, deviceId, currentVersion);

    return res.status(200).json({
      status: 'success',
      update
    });
  } catch (error) {
    console.error('Check for updates error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to check for updates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Download update
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const downloadUpdate = async (req, res) => {
  try {
    const { updateId } = req.body;
    const userId = req.user.id;
    const deviceId = req.user.deviceId;

    if (!updateId) {
      return res.status(400).json({
        status: 'error',
        message: 'Update ID is required'
      });
    }

    const result = await updateService.applyUpdate(userId, deviceId, updateId);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error || 'Failed to apply update'
      });
    }

    return res.status(200).json({
      status: 'success',
      update: result
    });
  } catch (error) {
    console.error('Download update error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to download update',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const userId = req.user.id;
    const deviceId = req.user.deviceId;

    const history = await updateService.getUpdateHistory(userId, deviceId);

    return res.status(200).json({
      status: 'success',
      history
    });
  } catch (error) {
    console.error('Get update history error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get update history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create update (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createUpdate = async (req, res) => {
  try {
    const { version, updateType, downloadUrl, changelog, updateData } = req.body;
    const userId = req.user.id;

    if (!version || !updateType || !downloadUrl) {
      return res.status(400).json({
        status: 'error',
        message: 'Version, update type, and download URL are required'
      });
    }

    const update = await updateService.createUpdate({
      version,
      update_type: updateType,
      download_url: downloadUrl,
      changelog: changelog || '',
      update_data: updateData || {},
      created_by: userId,
      created_at: new Date().toISOString()
    });

    return res.status(201).json({
      status: 'success',
      update
    });
  } catch (error) {
    console.error('Create update error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create update',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  checkForUpdates,
  downloadUpdate,
  getUpdateHistory,
  createUpdate
};
