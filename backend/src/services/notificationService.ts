import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';

interface CreateNotificationInput {
  type: string;
  title: string;
  message: string;
  duplicateKey: string;
  metadata?: Prisma.InputJsonObject;
}

export const createNotificationOnce = async ({
  type,
  title,
  message,
  duplicateKey,
  metadata,
}: CreateNotificationInput) => {
  return prisma.notification.upsert({
    where: { duplicateKey },
    update: {},
    create: {
      type,
      title,
      message,
      duplicateKey,
      metadata,
    },
  });
};

export const createProjectAddedNotification = async (projectId: string, projectName: string) => {
  return createNotificationOnce({
    type: 'PROJECT_ADDED',
    title: 'New Project Added',
    message: `New project added: ${projectName}`,
    duplicateKey: `project-added:${projectId}`,
    metadata: { projectId, projectName },
  });
};
