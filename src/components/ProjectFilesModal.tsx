"use client";

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import styles from './TaskModal.module.css';

interface FileNode {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension?: string;
  size?: number;
}

interface FolderNode {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  children: FolderNode[];
  files: FileNode[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  fullView?: boolean;
}

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  return 'http://127.0.0.1:5000';
};

const ProjectFilesModal: React.FC<Props> = ({ isOpen, onClose, projectId, projectName, fullView = false }) => {
  const [tree, setTree] = useState<FolderNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    const fetchTree = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/projects/${projectId}/tree/public`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load project tree (${res.status})`);
        }

        const json = await res.json();
        setTree(json.data || []);
      } catch (err: any) {
        setError(err.message || 'Unable to load project tree');
      } finally {
        setLoading(false);
      }
    };

    fetchTree();
  }, [isOpen, projectId]);

  const renderFolder = (folder: FolderNode, level = 0) => (
    <div key={folder.id} style={{ paddingLeft: level * 24, marginBottom: 24, borderLeft: level > 0 ? '1px solid var(--border-color)' : 'none', paddingBottom: 16 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', marginBottom: 8 }}>📁 {folder.name}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 12, fontFamily: 'monospace' }}>{folder.relativePath || folder.path}</div>
      {folder.files.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 24, color: 'var(--text-secondary)', listStyle: 'none' }}>
          {folder.files.map((file) => (
            <li key={file.id} style={{ marginBottom: 8, fontSize: '0.9rem' }}>
              📄 {file.name}{file.extension ? ` (${file.extension})` : ''} {file.size ? `— ${(file.size / 1024).toFixed(2)} KB` : ''}
            </li>
          ))}
        </ul>
      )}
      {folder.children.map((child) => renderFolder(child, level + 1))}
    </div>
  );

  if (!isOpen) return null;

  const modalStyle: React.CSSProperties | undefined = fullView 
    ? { 
        maxWidth: '90vw', 
        width: '90vw', 
        maxHeight: '92vh',
        height: '92vh',
        display: 'flex',
        flexDirection: 'column'
      } 
    : undefined;

  const contentStyle: React.CSSProperties | undefined = fullView
    ? {
        flex: 1,
        overflowY: 'auto',
        padding: '32px 40px',
        fontSize: '0.95rem',
        lineHeight: '1.7'
      }
    : undefined;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} glassmorphic animate-fade-in`} style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.modalTitle} style={fullView ? { fontSize: '1.5rem' } : undefined}>{projectName ? `${projectName} — Data Tree` : 'Project Data'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.content} style={{ flexDirection: 'column', gap: 16, ...contentStyle }}>
            {loading && <div>Loading available project data…</div>}
            {error && <div style={{ color: 'var(--priority-high)' }}>{error}</div>}
            {!loading && !error && tree?.length === 0 && <div>No folder or file data available for this project.</div>}
            {!loading && !error && tree && tree.length > 0 && tree.map((folder) => renderFolder(folder))}
          </div>

          <div className={styles.footer} style={fullView ? { marginTop: 'auto', padding: '16px 40px' } : undefined}>
            <div className={styles.mainActions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectFilesModal;
