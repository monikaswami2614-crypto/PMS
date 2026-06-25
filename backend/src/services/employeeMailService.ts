import { sendMail } from './emailService.js';

export interface EmployeeProjectUpdate {
  employeeName: string;
  employeeEmail: string;
  projectName: string;
  projectType: string;
  deadline: string;
  statusMessage: string;
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const sendEmployeeProjectUpdateMail = async ({
  employeeName,
  employeeEmail,
  projectName,
  projectType,
  deadline,
  statusMessage,
}: EmployeeProjectUpdate): Promise<string> => {
  const subject = `Project update: ${projectName}`;
  const text = [
    `Hello ${employeeName},`,
    '',
    'Your project work has been updated.',
    '',
    `Employee: ${employeeName}`,
    `Project: ${projectName}`,
    `Project Type: ${projectType}`,
    `Deadline: ${deadline}`,
    `Status / Update: ${statusMessage}`,
    '',
    'Please review the project calendar for the latest details.',
  ].join('\n');
  const html = [
    `<p>Hello ${escapeHtml(employeeName)},</p>`,
    '<p>Your project work has been updated.</p>',
    '<table style="border-collapse:collapse;font-family:Arial,sans-serif">',
    `<tr><td style="padding:5px 14px 5px 0"><strong>Employee</strong></td><td>${escapeHtml(employeeName)}</td></tr>`,
    `<tr><td style="padding:5px 14px 5px 0"><strong>Project</strong></td><td>${escapeHtml(projectName)}</td></tr>`,
    `<tr><td style="padding:5px 14px 5px 0"><strong>Project Type</strong></td><td>${escapeHtml(projectType)}</td></tr>`,
    `<tr><td style="padding:5px 14px 5px 0"><strong>Deadline</strong></td><td>${escapeHtml(deadline)}</td></tr>`,
    `<tr><td style="padding:5px 14px 5px 0"><strong>Status / Update</strong></td><td>${escapeHtml(statusMessage)}</td></tr>`,
    '</table>',
    '<p>Please review the project calendar for the latest details.</p>',
  ].join('');

  return sendMail({
    to: employeeEmail,
    subject,
    html,
    text,
  });
};
