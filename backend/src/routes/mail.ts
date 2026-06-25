import express, { NextFunction, Request, Response, Router } from 'express';
import { sendCalendarEmployeeUpdates, sendClientMail, sendTestEmail } from '../controllers/mailController.js';
import { authenticate } from '../middleware/auth.js';

const router: Router = express.Router();

const developmentOnly = (_req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV !== 'development') {
    res.status(404).json({ error: 'Route not found' });
    return;
  }

  next();
};

router.post('/test', developmentOnly, authenticate, sendTestEmail);
router.post('/calendar-updates', sendCalendarEmployeeUpdates);
router.post('/client', sendClientMail);

export default router;
