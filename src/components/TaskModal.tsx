"use client";

import React from 'react';
import { X } from 'lucide-react';
import styles from './TaskModal.module.css';
import FolderBrowser from './FolderBrowser';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: any;
  initialStatus?: any;
  initialDueDate?: string;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} glassmorphic animate-fade-in`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.modalTitle}>Project Files</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.content}>
            <div className={styles.leftCol}>
              <FolderBrowser twoColumn />
            </div>
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

export default TaskModal;
