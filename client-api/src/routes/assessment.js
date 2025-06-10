const express = require('express');
const { getAssessment } = require('../controllers/assessmentController.js');

const router = express.Router();

// GET /api/assessment - Get privacy assessment for a URL
router.get('/', getAssessment);

module.exports = router; 