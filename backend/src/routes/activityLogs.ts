import express, { Router } from 'express';
import { createActivityLog, getActivityLogs } from '../controllers/activityLogController.js';

const router: Router = express.Router();

router.get('/', getActivityLogs);
router.post('/', createActivityLog);

export default router;
