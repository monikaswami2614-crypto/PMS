"use client";

import React, { useState } from 'react';
import { Layers, Tag, X } from 'lucide-react';
import { DeadlineProjectType, useProjects } from '@/context/ProjectContext';
import styles from './TaskModal.module.css';

interface CreateNewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';

export const CreateNewProjectModal: React.FC<CreateNewProjectModalProps> = ({ isOpen, onClose }) => {
  const { refreshProjects } = useProjects();
  const [projectType, setProjectType] = useState<DeadlineProjectType>('NB');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = projectName.trim();
    if (!cleanName) {
      setError('Project Name is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/api/projects/create-blank/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectType, projectName: cleanName }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create project.');
      }

      await refreshProjects();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} glassmorphic animate-fade-in`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.modalTitle}>Create New Project</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.content} style={{ flexDirection: 'column', gap: 18 }}>
            <label className={styles.formGroup}>
              <span className={styles.label}><Layers size={14} />Project Type</span>
              <select
                className={styles.select}
                value={projectType}
                onChange={(event) => setProjectType(event.target.value as DeadlineProjectType)}
                required
              >
                <option value="NB">NB</option>
                <option value="GH">GH</option>
              </select>
            </label>

            <label className={styles.formGroup}>
              <span className={styles.label}><Tag size={14} />Project Name</span>
              <input
                className={styles.input}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Enter project name"
                required
              />
            </label>

            {error && (
              <div style={{ color: 'var(--priority-high)', fontSize: '0.86rem', fontWeight: 700 }}>
                {error}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <div className={styles.mainActions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNewProjectModal;
