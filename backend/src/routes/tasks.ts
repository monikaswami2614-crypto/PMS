import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTasksByProject
} from '../controllers/taskController.js';

const router: Router = express.Router();

router.use(authenticate);

router.get('/', getAllTasks);
router.post('/', createTask);
router.get('/project/:projectId', getTasksByProject);
router.get('/:id', getTaskById);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;
