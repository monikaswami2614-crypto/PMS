import { Request, Response } from 'express';
import { listFolderContents, getFileMetadata } from '../services/fileSystemService.js';

export const getFolderContents = async (req: Request, res: Response): Promise<void> => {
  try {
    const relativePath = typeof req.query.path === 'string' ? req.query.path : '';
    const entries = await listFolderContents(relativePath);

    res.json({
      message: 'Folder contents retrieved successfully',
      data: entries
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read folder contents' });
  }
};

export const getFileInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const relativePath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!relativePath) {
      res.status(400).json({ error: 'Query parameter path is required' });
      return;
    }

    const metadata = await getFileMetadata(relativePath);

    res.json({
      message: 'File metadata retrieved successfully',
      data: metadata
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read file metadata' });
  }
};
