import cron from 'node-cron';
import { sendOwnerDailyProgressMail } from '../services/ownerDailyProgressService.js';

const TIME_ZONE = 'Asia/Kolkata';
let isRunning = false;

export const startOwnerDailyProgressCron = (): void => {
  cron.schedule('7 16 * * *', async () => {
    if (isRunning) {
      console.warn('[Owner daily progress cron] Previous run is still in progress; skipping this run.');
      return;
    }

    isRunning = true;
    try {
      const messageId = await sendOwnerDailyProgressMail();
      console.log(`[Owner daily progress cron] Email sent successfully (${messageId}).`);
    } catch (error) {
      console.error(
        '[Owner daily progress cron] Failed to send email:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      isRunning = false;
    }
  }, {
    timezone: TIME_ZONE,
  });

  console.log('[Owner daily progress cron] Scheduled daily at 4:07 PM Asia/Kolkata.');
};
