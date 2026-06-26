import path from 'path';
import { promises as fs } from 'fs';
import { Request, Response } from 'express';
import prisma from '../config/prisma.js';
import { logActivity } from '../services/activityLogService.js';
import { sendFilePreviewPage, sendInlineFile } from '../utils/filePreview.js';

export const openFileEditor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        name: true,
        path: true,
        relativePath: true,
        extension: true,
        size: true,
        modifiedAt: true,
        projectId: true,
        project: { select: { name: true } },
      },
    });

    if (!file) {
      res.status(404).send('File not found');
      return;
    }

    const filePath = path.resolve(file.path);
    await logActivity({
      actionType: 'File viewed',
      moduleName: 'FILES',
      projectId: file.projectId,
      projectName: file.project?.name || null,
      description: `File "${file.name}" viewed.`,
      metadata: { fileId, filePath },
      request: req,
    });

    try {
      await fs.access(filePath);
    } catch {
      res.status(200).type('html').send(`
        <!doctype html>
        <html>
          <head><title>File Editor</title></head>
          <body style="font-family: system-ui, sans-serif; background: #0f172a; color: #e5e7eb; padding: 32px;">
            <h1 style="font-size: 20px;">File unavailable</h1>
            <p>The file record exists, but the file was not found on disk.</p>
            <p><strong>${file.name}</strong></p>
          </body>
        </html>
      `);
      return;
    }

    sendFilePreviewPage(res, file, `${req.baseUrl}${req.path}/raw`);
  } catch (error) {
    res.status(500).send('Failed to open file');
  }
};

export const openRawFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { name: true, path: true },
    });

    if (!file) {
      res.status(404).send('File not found');
      return;
    }

    const filePath = path.resolve(file.path);
    try {
      await fs.access(filePath);
    } catch {
      res.status(404).send('File not found on disk');
      return;
    }

    sendInlineFile(res, filePath, file.name);
  } catch (error) {
    res.status(500).send('Failed to open file');
  }
};
