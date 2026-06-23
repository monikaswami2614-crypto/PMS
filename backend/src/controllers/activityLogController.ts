import { Request, Response } from 'express';
import prisma from '../config/prisma.js';
import { logActivity } from '../services/activityLogService.js';

const toPositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(Math.floor(parsed), max) : Math.floor(parsed);
};

export const getActivityLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      projectId,
      userId,
      moduleName,
      actionType,
      search,
    } = req.query;

    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 25, 100);
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(String(startDate));
      if (endDate) {
        const end = new Date(String(endDate));
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (projectId) where.projectId = String(projectId);
    if (userId) where.userId = String(userId);
    if (moduleName) where.moduleName = String(moduleName);
    if (actionType) where.actionType = String(actionType);

    if (search) {
      const query = String(search);
      where.OR = [
        { userName: { contains: query, mode: 'insensitive' } },
        { userEmail: { contains: query, mode: 'insensitive' } },
        { actionType: { contains: query, mode: 'insensitive' } },
        { moduleName: { contains: query, mode: 'insensitive' } },
        { projectName: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({
      message: 'Activity logs retrieved',
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve activity logs' });
  }
};

export const createActivityLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      user,
      actionType,
      moduleName,
      projectId,
      projectName,
      description,
      oldValue,
      newValue,
      metadata,
    } = req.body || {};

    if (!actionType || !moduleName || !description) {
      res.status(400).json({ error: 'actionType, moduleName, and description are required' });
      return;
    }

    await logActivity({
      user,
      actionType,
      moduleName,
      projectId,
      projectName,
      description,
      oldValue,
      newValue,
      metadata,
      request: req,
    });

    res.status(201).json({ message: 'Activity logged' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create activity log' });
  }
};
