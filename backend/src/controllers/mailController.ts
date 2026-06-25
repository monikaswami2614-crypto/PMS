import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { EmailConfigurationError, EmailDeliveryError, sendMail } from '../services/emailService.js';
import { EmployeeProjectUpdate } from '../services/employeeMailService.js';
import { sendEmployeeUpdateOnce } from '../services/employeeMailLogService.js';
import { logActivity } from '../services/activityLogService.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const sendClientMail = async (req: AuthRequest, res: Response): Promise<void> => {
  const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
  const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : '';

  if (!to || !emailPattern.test(to)) {
    res.status(400).json({ error: 'A valid client email is required.' });
    return;
  }

  if (!subject) {
    res.status(400).json({ error: 'Email subject is required.' });
    return;
  }

  if (!text) {
    res.status(400).json({ error: 'Email body is required.' });
    return;
  }

  try {
    const html = escapeHtml(text).replace(/\r?\n/g, '<br>');
    const emailId = await sendMail({ to, subject, text, html });

    await logActivity({
      actionType: 'Client mail sent',
      moduleName: 'CHECKLIST_REVIEW',
      projectId: projectId || undefined,
      projectName: projectName || undefined,
      description: `Client checklist email sent to ${to}${projectName ? ` for "${projectName}"` : ''}.`,
      newValue: { to, subject, emailId },
      request: req,
    });

    res.json({ success: true, message: 'Client mail sent successfully.', emailId });
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      res.status(503).json({ error: error.message });
      return;
    }

    if (error instanceof EmailDeliveryError) {
      res.status(502).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to send client mail.' });
  }
};

export const sendCalendarEmployeeUpdates = async (req: AuthRequest, res: Response): Promise<void> => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let invalid = 0;
  const failures: Array<{ projectName: string; employeeEmail: string; error: string }> = [];

  for (const rawUpdate of updates) {
    const update: EmployeeProjectUpdate = {
      employeeName: typeof rawUpdate?.employeeName === 'string' ? rawUpdate.employeeName.trim() : '',
      employeeEmail: typeof rawUpdate?.employeeEmail === 'string' ? rawUpdate.employeeEmail.trim() : '',
      projectName: typeof rawUpdate?.projectName === 'string' ? rawUpdate.projectName.trim() : '',
      projectType: typeof rawUpdate?.projectType === 'string' ? rawUpdate.projectType.trim() : '',
      deadline: typeof rawUpdate?.deadline === 'string' ? rawUpdate.deadline.trim() : '',
      statusMessage: typeof rawUpdate?.statusMessage === 'string' ? rawUpdate.statusMessage.trim() : '',
    };

    if (
      !update.employeeName
      || !emailPattern.test(update.employeeEmail)
      || !update.projectName
      || !update.projectType
      || !update.deadline
      || !update.statusMessage
    ) {
      invalid += 1;
      continue;
    }

    try {
      const result = await sendEmployeeUpdateOnce(update);
      if (result.status === 'SENT') sent += 1;
      if (result.status === 'SKIPPED') skipped += 1;
      if (result.status === 'FAILED') {
        failed += 1;
        failures.push({
          projectName: update.projectName,
          employeeEmail: update.employeeEmail,
          error: result.emailLog.errorMessage || 'Email delivery failed',
        });
      }
    } catch (error) {
      failed += 1;
      failures.push({
        projectName: update.projectName,
        employeeEmail: update.employeeEmail,
        error: error instanceof Error ? error.message : 'Email processing failed',
      });
    }
  }

  res.status(failed > 0 ? 207 : 200).json({
    success: failed === 0,
    sent,
    skipped,
    failed,
    invalid,
    failures,
  });
};

export const sendTestEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';

  if (!to || !emailPattern.test(to)) {
    res.status(400).json({ error: 'A valid recipient email is required in the "to" field.' });
    return;
  }

  try {
    const emailId = await sendMail({
      to,
      subject: 'Project Management System - Resend test',
      html: '<h2>Resend integration is working</h2><p>This is a development test email from the Project Management System.</p>',
      text: 'Resend integration is working. This is a development test email from the Project Management System.',
    });

    res.json({ success: true, message: 'Test email sent.', emailId });
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      res.status(503).json({ error: error.message });
      return;
    }

    if (error instanceof EmailDeliveryError) {
      res.status(502).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to send test email.' });
  }
};
