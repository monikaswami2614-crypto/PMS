import { Request, Response } from 'express';
import { EmailConfigurationError, sendMail } from '../services/emailService.js';

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

    try {
      await sendMail({ to: assigneeEmail, replyTo: managerEmail, subject, text });
      res.json({ success: true, emailSent: true, message: 'Assignment email sent' });
    } catch (error) {
      if (error instanceof EmailConfigurationError) {
        res.json({
          success: true,
          emailSent: false,
          message: 'Deadline saved. Email was not sent because SMTP credentials are not configured.',
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send assignment email',
    });
  }
};
