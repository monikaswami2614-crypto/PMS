import { Request } from 'express';
import prisma from '../config/prisma.js';

type ActivityUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

type LogActivityInput = {
  user?: ActivityUser | null;
  actionType: string;
  moduleName: string;
  projectId?: string | null;
  projectName?: string | null;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  request?: Request;
};

const getHeaderValue = (request: Request | undefined, name: string): string | undefined => {
  const value = request?.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

export const getActivityUserFromRequest = (request?: Request): ActivityUser => ({
  id: getHeaderValue(request, 'x-user-id') || undefined,
  name: getHeaderValue(request, 'x-user-name') || undefined,
  email: getHeaderValue(request, 'x-user-email') || undefined,
});

export const logActivity = async ({
  user,
  actionType,
  moduleName,
  projectId,
  projectName,
  description,
  oldValue,
  newValue,
  metadata,
  request,
}: LogActivityInput): Promise<void> => {
  const requestUser = getActivityUserFromRequest(request);
  let resolvedUser = user || requestUser;

  if (resolvedUser?.id && (!resolvedUser.name || !resolvedUser.email)) {
    const storedUser = await prisma.user.findUnique({
      where: { id: resolvedUser.id },
      select: { id: true, name: true, email: true },
    });
    if (storedUser) {
      resolvedUser = {
        id: storedUser.id,
        name: resolvedUser.name || storedUser.name,
        email: resolvedUser.email || storedUser.email,
      };
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: resolvedUser?.id || null,
      userName: resolvedUser?.name || null,
      userEmail: resolvedUser?.email || null,
      actionType,
      moduleName,
      projectId: projectId || null,
      projectName: projectName || null,
      description,
      oldValue: oldValue === undefined ? undefined : oldValue as object,
      newValue: newValue === undefined ? undefined : newValue as object,
      metadata: metadata === undefined ? undefined : metadata as object,
      ipAddress: request?.ip || null,
      userAgent: request?.headers['user-agent'] || null,
    },
  });
};
