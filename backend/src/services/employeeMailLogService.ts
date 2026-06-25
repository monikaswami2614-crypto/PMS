import { createHash } from 'node:crypto';
import prisma from '../config/prisma.js';
import { EmployeeProjectUpdate, sendEmployeeProjectUpdateMail } from './employeeMailService.js';

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export const createEmployeeUpdateHash = (update: EmployeeProjectUpdate): string => (
  createHash('sha256')
    .update([
      update.employeeEmail,
      update.employeeName,
      update.projectName,
      update.projectType,
      update.deadline,
      update.statusMessage,
    ].map(normalize).join('|'))
    .digest('hex')
);

export const sendEmployeeUpdateOnce = async (update: EmployeeProjectUpdate) => {
  const updateHash = createEmployeeUpdateHash(update);
  const existingLog = await prisma.emailLog.findUnique({ where: { updateHash } });

  if (existingLog?.deliveryStatus === 'SENT') {
    return { status: 'SKIPPED' as const, emailLog: existingLog };
  }

  const emailLog = existingLog || await prisma.emailLog.create({
    data: {
      updateHash,
      recipientEmail: update.employeeEmail,
      employeeName: update.employeeName,
      projectName: update.projectName,
      projectType: update.projectType,
      deadline: update.deadline,
      statusMessage: update.statusMessage,
      deliveryStatus: 'PENDING',
    },
  });

  try {
    const providerMessageId = await sendEmployeeProjectUpdateMail(update);
    const sentLog = await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        deliveryStatus: 'SENT',
        providerMessageId,
        errorMessage: null,
      },
    });
    return { status: 'SENT' as const, emailLog: sentLog };
  } catch (error) {
    const failedLog = await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        deliveryStatus: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown email delivery error',
      },
    });
    return { status: 'FAILED' as const, emailLog: failedLog };
  }
};
