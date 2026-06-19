"use client";

import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import styles from './TaskModal.module.css';

type ChecklistSheet = {
  name: string;
  rows: string[][];
};

type ChecklistWorkbook = {
  name: string;
  fileName: string;
  path: string;
  size: number;
  modifiedAt: string;
  sheets: ChecklistSheet[];
};

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  checklistType: 'nb' | 'gh';
  title: string;
}

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, '');
  return 'http://127.0.0.1:5000';
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / 1024 ** index).toFixed(1)} ${sizes[index]}`;
};

const ChecklistModal: React.FC<ChecklistModalProps> = ({ isOpen, onClose, checklistType, title }) => {
  const [workbook, setWorkbook] = useState<ChecklistWorkbook | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchChecklist = async () => {
      setLoading(true);
      setError(null);
      setWorkbook(null);
      setActiveSheetIndex(0);

      try {
        const response = await fetch(`${getApiBase()}/api/checklists/${checklistType}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || `Failed to load checklist (${response.status})`);
        }

        setWorkbook(payload.data ?? null);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load checklist files.');
      } finally {
        setLoading(false);
      }
    };

    fetchChecklist();
  }, [checklistType, isOpen]);

  const activeSheet = workbook?.sheets[activeSheetIndex];

  const renderWorkbook = () => {
    if (!workbook) return <div>No checklist data found.</div>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)' }}>
          <FileSpreadsheet size={18} />
          <div>
            <div style={{ fontWeight: 800 }}>{workbook.fileName}</div>
            <div style={{ marginTop: 2, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              {formatBytes(workbook.size)} - {new Date(workbook.modifiedAt).toLocaleString()}
            </div>
          </div>
        </div>

        {workbook.sheets.length > 1 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {workbook.sheets.map((sheet, index) => (
              <button
                key={sheet.name}
                type="button"
                onClick={() => setActiveSheetIndex(index)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--border-radius-sm)',
                  border: index === activeSheetIndex ? '1px solid rgba(99, 102, 241, 0.7)' : '1px solid var(--border-color)',
                  background: index === activeSheetIndex ? 'rgba(99, 102, 241, 0.18)' : 'rgba(15, 22, 38, 0.8)',
                  color: index === activeSheetIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        )}

        {activeSheet ? (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', overflow: 'auto', maxHeight: '62vh' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900, background: 'rgba(15, 22, 38, 0.48)' }}>
              <tbody>
                {activeSheet.rows.map((row, rowIndex) => (
                  <tr key={`${activeSheet.name}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => {
                      const isHeading = rowIndex === 0 || (cellIndex === 0 && row.some((value) => value.trim() !== ''));

                      return (
                        <td
                          key={`${activeSheet.name}-${rowIndex}-${cellIndex}`}
                          style={{
                            border: '1px solid rgba(148, 163, 184, 0.18)',
                            padding: '9px 10px',
                            color: cell.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontSize: '0.86rem',
                            fontWeight: isHeading ? 800 : 500,
                            lineHeight: 1.5,
                            minWidth: cellIndex === 0 ? 150 : 120,
                            maxWidth: cellIndex === 0 ? 260 : 360,
                            whiteSpace: 'pre-wrap',
                            verticalAlign: 'top',
                            background: isHeading ? 'rgba(99, 102, 241, 0.08)' : 'transparent'
                          }}
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>No readable sheets found in this checklist workbook.</div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} glassmorphic animate-fade-in`}
        style={{ width: '94vw', maxWidth: 1280, maxHeight: '94vh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.modalTitle}>{title}</h2>
            <p style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              C:\Users\monika.swami\Desktop\Leed Project
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.content} style={{ flexDirection: 'column', gap: 16, lineHeight: 1.6, minHeight: 0 }}>
            {loading && <div>Loading checklist requirements...</div>}
            {error && <div style={{ color: 'var(--priority-high)' }}>{error}</div>}
            {!loading && !error && renderWorkbook()}
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

export default ChecklistModal;
