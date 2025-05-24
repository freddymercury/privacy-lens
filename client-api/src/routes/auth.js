import express from 'express';
import { register, login, validate, refresh, revoke } from '../controllers/authController.js';

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

export default router; 