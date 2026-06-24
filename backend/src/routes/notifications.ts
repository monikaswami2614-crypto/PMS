import express, { Router } from 'express';
import {
  getUnreadNotifications,
  markNotificationRead,
  sendProjectAssignmentEmail,
  syncCalendarNotifications,
} from '../controllers/notificationController.js';

const router: Router = express.Router();

router.get('/', getUnreadNotifications);
router.post('/calendar-sync', syncCalendarNotifications);
router.patch('/:id/read', markNotificationRead);
router.post('/project-assignment', sendProjectAssignmentEmail);

export default router;
