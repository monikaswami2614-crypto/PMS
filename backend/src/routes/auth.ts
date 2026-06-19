import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  register,
  login,
  logout,
  refreshToken
} from '../controllers/authController.js';

const router: Router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/refresh', refreshToken);

export default router;
