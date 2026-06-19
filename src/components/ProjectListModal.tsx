"use client";

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import styles from './TaskModal.module.css';

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  folderCount?: number;
  fileCount?: number;
}

interface ProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceName: string;
  sourcePath: string;
  onSelectProject?: (projectId: string, projectName: string) => void;
}

const ProjectListModal: React.FC<ProjectListModalProps> = ({ isOpen, onClose, sourceName, sourcePath, onSelectProject }) => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchProjects = async () => {
      setLoading(true);
      setError(null);

      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:5000';
      const importUrl = `${baseUrl}/api/projects/import/public`;
      const projectUrl = `${baseUrl}/api/projects/public`;

      try {
        if (sourcePath) {
          await fetch(importUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ absolutePath: sourcePath }),
          });
        }

        const response = await fetch(projectUrl);
        if (!response.ok) {
          throw new Error('Failed to load projects.');
        }

        const payload = await response.json();
        const projectsArray = Array.isArray(payload) ? payload : (payload?.data ?? []);
        setProjects(projectsArray);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to fetch projects.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [isOpen, sourcePath]);

  if (!isOpen) return null;

  const visibleProjects = projects.filter((project) => project.id !== 'all');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} glassmorphic animate-fade-in`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.modalTitle}>{sourceName}</h2>
            <p style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{sourcePath}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.content} style={{ flexDirection: 'column', gap: '16px' }}>
            {loading && <div>Loading projects...</div>}
            {error && <div style={{ color: '#f97316' }}>{error}</div>}
            {!loading && !error && visibleProjects.length === 0 && (
              <div>No projects found for this source.</div>
            )}

            {!loading && !error && visibleProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={styles.projectListItem}
                onClick={() => onSelectProject?.(project.id, project.name)}
                style={{
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{project.name}</div>
                    <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{project.description || 'No description available'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{project.category || 'Project'}</div>
                    <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {project.folderCount ?? 0} folders · {project.fileCount ?? 0} files
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className={styles.footer}>
            <div className={styles.mainActions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectListModal;
