import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import prisma from '../config/prisma.js';

export const getAllTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tasks = await prisma.task.findMany({
      where: { assigneeId: req.userId as string },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } }
      }
    });

    res.json({
      message: 'Tasks retrieved successfully',
      data: tasks
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
};

export const getTaskById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } }
      }
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({
      message: 'Task retrieved successfully',
      data: task
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve task' });
  }
};

export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, description, project, assignee, priority, dueDate, estimatedHours, startDate, status } = req.body;

    if (!title || !project || !assignee || !dueDate) {
      res.status(400).json({ error: 'Title, project, assignee, and due date are required' });
      return;
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        project: { connect: { id: project } },
        assignee: { connect: { id: assignee } },
        priority: priority || 'medium',
        status: status || 'todo',
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: new Date(dueDate),
        estimatedHours: estimatedHours ?? 0
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } }
      }
    });

    res.status(201).json({
      message: 'Task created successfully',
      data: task
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, dueDate, estimatedHours, startDate } = req.body;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const data: any = {};
    if (title) data.title = title;
    if (description) data.description = description;
    if (status) data.status = status;
    if (priority) data.priority = priority;
    if (dueDate) data.dueDate = new Date(dueDate);
    if (estimatedHours !== undefined) data.estimatedHours = estimatedHours;
    if (startDate) data.startDate = new Date(startDate);

    const updatedTask = await prisma.task.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } }
      }
    });

    res.json({
      message: 'Task updated successfully',
      data: updatedTask
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await prisma.task.delete({ where: { id } });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

export const getTasksByProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } }
      }
    });

    res.json({
      message: 'Project tasks retrieved successfully',
      data: tasks
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve project tasks' });
  }
};
