const express = require('express');
const { register, login, validate, refresh, revoke } = require('../controllers/authController.js');

const router = express.Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/validate
router.post('/validate', validate);

// POST /api/auth/refresh
router.post('/refresh', refresh);

// POST /api/auth/revoke (logout)
router.post('/revoke', revoke);

module.exports = router; 