import { Response } from 'express';
import bcryptjs from 'bcryptjs';
import jwt, { Secret } from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import { JWT_CONFIG } from '../config/constants.js';

const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_CONFIG.secret as any, {
    expiresIn: JWT_CONFIG.expiresIn
  } as any);
};

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'user'
      }
    });

    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        status: true,
        password: true
      }
    });

    if (!user || !(await bcryptjs.compare(password, user.password))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const decoded = jwt.verify(token, JWT_CONFIG.secret) as { userId: string };
    const newToken = generateToken(decoded.userId);

    res.json({
      message: 'Token refreshed',
      token: newToken
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
