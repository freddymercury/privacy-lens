const express = require('express');
const { authenticateToken } = require('../middleware/auth.js');
const updateController = require('../controllers/updateController.js');

const router = express.Router();

// POST /api/updates/check - Check for available updates
router.post('/check', authenticateToken, updateController.checkForUpdates);

// POST /api/updates/download - Download/apply an update (Chrome plugin expects this endpoint)
router.post('/download', authenticateToken, updateController.applyUpdate);

// POST /api/updates/apply - Apply an update (alternative endpoint)
router.post('/apply', authenticateToken, updateController.applyUpdate);

// POST /api/updates/changelog - Get update history (Chrome plugin expects this endpoint)
router.post('/changelog', authenticateToken, updateController.getUpdateHistory);

// GET /api/updates/history - Get update history (alternative endpoint)
router.get('/history', authenticateToken, updateController.getUpdateHistory);

// Health check endpoint for update service
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    service: 'updates',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 