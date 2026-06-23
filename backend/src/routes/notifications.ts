import express, { Router } from 'express';
import { sendProjectAssignmentEmail } from '../controllers/notificationController.js';

const router: Router = express.Router();

router.post('/project-assignment', sendProjectAssignmentEmail);

export default router;
