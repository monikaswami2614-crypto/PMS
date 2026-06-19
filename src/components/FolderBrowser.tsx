'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './FolderBrowser.module.css';

export type FileSystemEntry = {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size: number;
  createdAt: string;
  modifiedAt: string;
};

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  return 'http://127.0.0.1:5000';
};

const buildUrl = (relativePath?: string): string => {
  const url = new URL(`${getApiBase()}/api/folders`);
  if (relativePath) {
    url.searchParams.set('path', relativePath);
  }
  return url.toString();
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
};

const FolderBrowser: React.FC<{ twoColumn?: boolean }> = ({ twoColumn = false }) => {
  const [entries, setEntries] = useState<FileSystemEntry[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentPath = useMemo(() => breadcrumb.join('/'), [breadcrumb]);

  const loadEntries = async (path?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildUrl(path));
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load folder contents (${response.status})`);
      }

      const json = await response.json();
      setEntries(json.data || []);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : 'Unable to load folder data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const openDirectory = (entry: FileSystemEntry) => {
    if (entry.type !== 'directory') return;
    const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    setBreadcrumb((prev) => [...prev, entry.name]);
    loadEntries(nextPath);
  };

  const goUp = () => {
    const next = [...breadcrumb];
    next.pop();
    setBreadcrumb(next);
    loadEntries(next.join('/'));
  };

  const renderEntries = () => {
    if (loading) {
      return <div className={styles.empty}>Loading folder contents…</div>;
    }

    if (error) {
      return <div className={styles.error}>{error}</div>;
    }

    if (entries.length === 0) {
      return <div className={styles.empty}>No files or folders found here.</div>;
    }

    return (
      <div className={styles.fileList}>
        {entries.map((entry) => (
          <button
            key={entry.relativePath}
            className={`${styles.fileItem} ${entry.type === 'directory' ? styles.directory : ''}`}
            onClick={() => openDirectory(entry)}
            type="button"
          >
            <div className={styles.fileIcon}>
              {entry.type === 'directory' ? '📁' : '📄'}
            </div>
            <div className={styles.fileDetails}>
              <div className={styles.fileName}>{entry.name}</div>
              <div className={styles.fileMeta}>
                {entry.type === 'file' ? `${formatBytes(entry.size)} • ` : ''}
                {new Date(entry.modifiedAt).toLocaleString()}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.browserHeader}>
        <div>
          <div className={styles.browserTitle}>Project Folder Browser</div>
          <div className={styles.breadcrumbText}>{currentPath || 'Root'}</div>
        </div>
        {breadcrumb.length > 0 && (
          <button className={styles.upButton} onClick={goUp} type="button">
            Up
          </button>
        )}
      </div>

      {renderEntries()}
    </div>
  );
};

export default FolderBrowser;
