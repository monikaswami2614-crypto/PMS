import { promises as fs } from 'fs';
import path from 'path';
import { SERVER_CONFIG } from '../config/constants.js';

export type FileSystemEntry = {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size: number;
  createdAt: string;
  modifiedAt: string;
};

const getRootPath = (): string => {
  if (!SERVER_CONFIG.scanRootPath) {
    throw new Error('SCAN_ROOT_PATH is not configured. Set it in your environment variables.');
  }
  return path.resolve(SERVER_CONFIG.scanRootPath);
};

const getResolvedPath = (relativePath: string): string => {
  const rootPath = getRootPath();
  const cleanedRelativePath = relativePath.replace(/\\/g, '/');
  const normalizedRelativePath = path.normalize(`/${cleanedRelativePath}`);
  const resolvedPath = path.resolve(rootPath, normalizedRelativePath);

  if (!resolvedPath.startsWith(rootPath)) {
    throw new Error('Access to the requested path is not allowed.');
  }

  return resolvedPath;
};

const toFileSystemEntry = async (entryPath: string, rootPath: string): Promise<FileSystemEntry> => {
  const stats = await fs.stat(entryPath);
  return {
    name: path.basename(entryPath),
    relativePath: path.relative(rootPath, entryPath).split(path.sep).join('/'),
    type: stats.isDirectory() ? 'directory' : 'file',
    size: stats.size,
    createdAt: stats.birthtime.toISOString(),
    modifiedAt: stats.mtime.toISOString()
  };
};

export const listFolderContents = async (relativePath = ''): Promise<FileSystemEntry[]> => {
  const rootPath = getRootPath();
  const directoryPath = getResolvedPath(relativePath);
  const directoryStat = await fs.stat(directoryPath);

  if (!directoryStat.isDirectory()) {
    throw new Error('Requested path is not a directory');
  }

  const entries = await fs.readdir(directoryPath);
  const entryPromises = entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry);
    return toFileSystemEntry(entryPath, rootPath);
  });

  return Promise.all(entryPromises);
};

export const getFileMetadata = async (relativePath: string): Promise<FileSystemEntry> => {
  const rootPath = getRootPath();
  const filePath = getResolvedPath(relativePath);
  const fileStat = await fs.stat(filePath);

  if (fileStat.isDirectory()) {
    throw new Error('Requested path is a directory, expected a file');
  }

  return {
    name: path.basename(filePath),
    relativePath: path.relative(rootPath, filePath).split(path.sep).join('/'),
    type: 'file',
    size: fileStat.size,
    createdAt: fileStat.birthtime.toISOString(),
    modifiedAt: fileStat.mtime.toISOString()
  };
};

export type ScannedFile = {
  name: string;
  path: string; // absolute
  relativePath: string; // relative to provided root
  extension: string | null;
  size: number;
  modifiedAt: string;
};

export type ScannedFolder = {
  name: string;
  path: string; // absolute
  relativePath: string; // relative to provided root
  children: Array<ScannedFolder | ScannedFile>;
};

/**
 * Recursively scan an absolute folder path and return a tree of folders/files.
 * This function accepts any absolute path and does not require the configured SCAN_ROOT_PATH.
 */
export const scanAbsoluteFolder = async (absoluteRootPath: string): Promise<ScannedFolder> => {
  const root = path.resolve(absoluteRootPath);

  const walk = async (dir: string): Promise<ScannedFolder> => {
    const entries = await fs.readdir(dir);
    const children: Array<ScannedFolder | ScannedFile> = [];

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      const stats = await fs.stat(entryPath);
      const rel = path.relative(root, entryPath).split(path.sep).join('/');

      if (stats.isDirectory()) {
        const folder = await walk(entryPath);
        children.push(folder);
      } else {
        const ext = path.extname(entry).toLowerCase().replace('.', '') || null;
        children.push({
          name: entry,
          path: entryPath,
          relativePath: rel,
          extension: ext,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }

    return {
      name: path.basename(dir),
      path: dir,
      relativePath: path.relative(root, dir).split(path.sep).join('/'),
      children
    };
  };

  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error('Provided path is not a directory');

  return walk(root);
};
