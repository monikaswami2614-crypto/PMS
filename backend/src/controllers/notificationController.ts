import { Request, Response } from 'express';
import { EmailConfigurationError, EmailDeliveryError, sendMail } from '../services/emailService.js';
import { logActivity } from '../services/activityLogService.js';
import prisma from '../config/prisma.js';
import { createNotificationOnce } from '../services/notificationService.js';

interface ProjectAssignmentBody {
  assigneeEmail?: string;
  projectType?: string;
  projectName?: string;
  deadline?: string;
  status?: string;
  priority?: string;
  managerName?: string;
  managerEmail?: string;
  notes?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

interface CalendarDeadlineInput {
  id?: string;
  projectName?: string;
  dueDate?: string;
  assignedTo?: string;
  assigneeEmail?: string;
}

const toDateKey = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const formatDeadlineDate = (date: Date) => date.toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
});

export const getUnreadNotifications = async (_req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      data: notifications,
      unreadCount: notifications.length,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load notifications' });
  }
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ data: notification });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to mark notification as read' });
  }
};

export const syncCalendarNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const deadlines = Array.isArray(req.body?.deadlines) ? req.body.deadlines as CalendarDeadlineInput[] : [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = toDateKey(today);
    let created = 0;

    for (const item of deadlines) {
      const deadlineId = item.id?.trim();
      const projectName = item.projectName?.trim();
      const rawDueDate = item.dueDate?.trim();
      if (!deadlineId || !projectName || !rawDueDate) continue;

      const dueDate = new Date(`${rawDueDate}T00:00:00`);
      if (Number.isNaN(dueDate.getTime())) continue;

      const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
      let notificationType = '';
      let title = '';
      let message = '';

      if (daysUntilDue < 0) {
        notificationType = 'DEADLINE_OVERDUE';
        title = 'Overdue Deadline';
        message = `Overdue deadline: ${projectName}`;
      } else if (daysUntilDue === 0) {
        notificationType = 'DEADLINE_TODAY';
        title = 'Deadline Today';
        message = `Deadline today: ${projectName}`;
      } else if (daysUntilDue <= 7) {
        notificationType = 'DEADLINE_APPROACHING';
        title = 'Upcoming Deadline';
        message = `Deadline approaching: ${projectName} is due on ${formatDeadlineDate(dueDate)}`;
      }

      if (notificationType) {
        const duplicateKey = `${deadlineId}:${notificationType}:${todayKey}`;
        const existing = await prisma.notification.findUnique({ where: { duplicateKey }, select: { id: true } });
        await createNotificationOnce({
          type: notificationType,
          title,
          message,
          duplicateKey,
          metadata: { deadlineId, projectName, dueDate: rawDueDate },
        });
        if (!existing) created += 1;
      }

      const assignedTo = item.assignedTo?.trim();
      const assigneeEmail = item.assigneeEmail?.trim();
      if (assignedTo || assigneeEmail) {
        const assigneeLabel = assignedTo || assigneeEmail || 'Unassigned';
        const duplicateKey = `project-assigned:${projectName.toLowerCase()}:${(assigneeEmail || assignedTo || '').toLowerCase()}`;
        const existing = await prisma.notification.findUnique({ where: { duplicateKey }, select: { id: true } });
        await createNotificationOnce({
          type: 'PROJECT_ASSIGNED',
          title: 'Project Assigned',
          message: `Project assigned: ${projectName} to ${assigneeLabel}`,
          duplicateKey,
          metadata: { deadlineId, projectName, assignedTo, assigneeEmail },
        });
        if (!existing) created += 1;
      }
    }

    res.json({ success: true, created });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to sync calendar notifications' });
  }
};

export const sendProjectAssignmentEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      assigneeEmail,
      projectType,
      projectName,
      deadline,
      status,
      priority,
      managerName,
      managerEmail,
      notes,
    } = req.body as ProjectAssignmentBody;

    if (!assigneeEmail || !emailPattern.test(assigneeEmail)) {
      res.status(400).json({ error: 'A valid assignee email is required' });
      return;
    }

    if (!managerName?.trim()) {
      res.status(400).json({ error: 'Manager name is required' });
      return;
    }

    if (!managerEmail || !emailPattern.test(managerEmail)) {
      res.status(400).json({ error: 'A valid manager email is required' });
      return;
    }

    if (!projectType || !projectName || !deadline || !status || !priority) {
      res.status(400).json({ error: 'Project type, project name, deadline, status, and priority are required' });
      return;
    }

    const subject = `Project Assigned - ${projectName}`;
    const text = [
      'Hello,',
      'You have been assigned a project.',
      '',
      'Project Type:',
      projectType,
      '',
      'Project Name:',
      projectName,
      '',
      'Assigned By:',
      managerName.trim(),
      '',
      'Deadline:',
      deadline,
      '',
      'Status:',
      status,
      '',
      'Priority:',
      priority,
      '',
      'Notes:',
      notes || '-',
      '',
      'Please complete the assigned work before the deadline.',
      '',
      'Thank You.',
    ].join('\n');
    const html = [
      '<h2>Project Assigned</h2>',
      '<p>You have been assigned a project.</p>',
      '<table style="border-collapse:collapse">',
      `<tr><td style="padding:4px 12px 4px 0"><strong>Project Type</strong></td><td>${escapeHtml(projectType)}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Project Name</strong></td><td>${escapeHtml(projectName)}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Assigned By</strong></td><td>${escapeHtml(managerName.trim())}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Manager Email</strong></td><td>${escapeHtml(managerEmail)}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Deadline</strong></td><td>${escapeHtml(deadline)}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Status</strong></td><td>${escapeHtml(status)}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Priority</strong></td><td>${escapeHtml(priority)}</td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0"><strong>Notes</strong></td><td>${escapeHtml(notes || '-')}</td></tr>`,
      '</table>',
      '<p>Please complete the assigned work before the deadline.</p>',
      '<p>Thank you.</p>',
    ].join('');

    try {
      const emailId = await sendMail({ to: assigneeEmail, subject, html, text });
      await logActivity({
        actionType: 'Email notification sent',
        moduleName: 'CALENDAR',
        projectName,
        description: `Assignment email sent to ${assigneeEmail} for "${projectName}".`,
        newValue: { assigneeEmail, managerEmail, subject, emailId },
        request: req,
      });
      await createNotificationOnce({
        type: 'EMAIL_SENT',
        title: 'Email Sent',
        message: `Email sent to ${assigneeEmail}`,
        duplicateKey: `email-sent:${projectName.trim().toLowerCase()}:${assigneeEmail.trim().toLowerCase()}:${deadline}`,
        metadata: { projectName, assigneeEmail, deadline },
      });
      res.json({ success: true, emailSent: true, message: 'Assignment email sent' });
    } catch (error) {
      if (error instanceof EmailConfigurationError) {
        await logActivity({
          actionType: 'Email notification failed',
          moduleName: 'CALENDAR',
          projectName,
          description: `Assignment email was not sent for "${projectName}" because Resend is not configured.`,
          metadata: { assigneeEmail, managerEmail, reason: error.message },
          request: req,
        });
        await createNotificationOnce({
          type: 'EMAIL_FAILED',
          title: 'Email Failed',
          message: `Email failed for ${projectName}`,
          duplicateKey: `email-failed:${projectName.trim().toLowerCase()}:${assigneeEmail.trim().toLowerCase()}:${deadline}`,
          metadata: { projectName, assigneeEmail, deadline, reason: error.message },
        });
        res.json({
          success: true,
          emailSent: false,
          message: 'Deadline saved. Email was not sent because Resend is not configured.',
        });
        return;
      }

      if (error instanceof EmailDeliveryError) {
        await logActivity({
          actionType: 'Email notification failed',
          moduleName: 'CALENDAR',
          projectName,
          description: `Resend failed to deliver the assignment email for "${projectName}".`,
          metadata: { assigneeEmail, managerEmail, reason: error.message },
          request: req,
        });
      }

      await createNotificationOnce({
        type: 'EMAIL_FAILED',
        title: 'Email Failed',
        message: `Email failed for ${projectName}`,
        duplicateKey: `email-failed:${projectName.trim().toLowerCase()}:${assigneeEmail.trim().toLowerCase()}:${deadline}`,
        metadata: {
          projectName,
          assigneeEmail,
          deadline,
          reason: error instanceof Error ? error.message : 'Unknown email error',
        },
      });
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send assignment email',
    });
  }
};
