import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import prisma from '../config/prisma.js';

export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      message: 'Users retrieved successfully',
      data: users
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      message: 'User retrieved successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
};

export const getUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId as string },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      message: 'User profile retrieved successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, avatar, role } = req.body;

    const currentUser = await prisma.user.findUnique({ where: { id: req.userId as string } });
    if (!currentUser) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    if (id !== req.userId && currentUser.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to update other users' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const data: any = {};
    if (name) data.name = name;
    if (avatar) data.avatarUrl = avatar;
    if (role && currentUser.role === 'admin') data.role = role;

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
};
