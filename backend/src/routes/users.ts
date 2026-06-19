import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllUsers,
  getUserById,
  updateUser,
  getUserProfile
} from '../controllers/userController.js';

const router: Router = express.Router();

router.use(authenticate);

router.get('/', getAllUsers);
router.get('/profile/me', getUserProfile);
router.get('/:id', getUserById);
router.put('/:id', updateUser);

export default router;
