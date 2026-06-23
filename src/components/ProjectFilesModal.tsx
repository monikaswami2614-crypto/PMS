"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
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

type CertificationPhase = 'all' | 'pre' | 'final';

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  return 'http://127.0.0.1:5000';
};

const normalizeText = (value?: string): string => (value ?? '').toLowerCase().replace(/[\s._-]+/g, '');

const getFolderSearchText = (folder: FolderNode): string => `${folder.name} ${folder.path} ${folder.relativePath}`.toLowerCase();

const getFileSearchText = (file: FileNode): string => `${file.name} ${file.path} ${file.relativePath} ${file.extension ?? ''}`.toLowerCase();

const matchesPhase = (folder: FolderNode, phase: CertificationPhase): boolean => {
  if (phase === 'all') return true;

  const text = normalizeText(`${folder.name} ${folder.path} ${folder.relativePath}`);
  if (phase === 'pre') return text.includes('precertification') || text.includes('precertificate');
  return text.includes('finalcertification') || text.includes('finalcertificate');
};

const filterTree = (folders: FolderNode[], phase: CertificationPhase, query: string): FolderNode[] => {
  const search = query.trim().toLowerCase();

  const filterFolder = (folder: FolderNode, phaseActive: boolean): FolderNode | null => {
    const nextPhaseActive = phaseActive || matchesPhase(folder, phase);
    const filteredChildren = folder.children
      .map((child) => filterFolder(child, nextPhaseActive))
      .filter((child): child is FolderNode => Boolean(child));

    const filteredFiles = folder.files.filter((file) => {
      if (!nextPhaseActive) return false;
      if (!search) return true;
      return getFileSearchText(file).includes(search);
    });

    const folderMatchesSearch = !search || getFolderSearchText(folder).includes(search);
    const shouldShowFolder = filteredChildren.length > 0 || (nextPhaseActive && (folderMatchesSearch || filteredFiles.length > 0));

    if (!shouldShowFolder) return null;

    return {
      ...folder,
      files: search && folderMatchesSearch ? folder.files : filteredFiles,
      children: filteredChildren,
    };
  };

  return folders
    .map((folder) => filterFolder(folder, phase === 'all'))
    .filter((folder): folder is FolderNode => Boolean(folder));
};

const flattenFolders = (folders: FolderNode[]): FolderNode[] => (
  folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)])
);

const findFolderById = (folders: FolderNode[], folderId: string): FolderNode | null => {
  for (const folder of folders) {
    if (folder.id === folderId) return folder;
    const child = findFolderById(folder.children, folderId);
    if (child) return child;
  }

  return null;
};

const ProjectFilesModal: React.FC<Props> = ({ isOpen, onClose, projectId, projectName, fullView = false }) => {
  const [tree, setTree] = useState<FolderNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<CertificationPhase>('all');
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [treeSearch, setTreeSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setPhaseFilter('all');
    setSelectedFolderId('all');
    setTreeSearch('');

    const fetchTree = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/projects/${projectId}/tree/public`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load project tree (${res.status})`);
        }

        const json = await res.json();
        setTree(json.data || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to load project tree');
      } finally {
        setLoading(false);
      }
    };

    fetchTree();
  }, [isOpen, projectId]);

  const folderOptions = useMemo(() => flattenFolders(tree ?? []), [tree]);

  const visibleTree = useMemo(() => {
    if (!tree) return [];

    const selectedTree = selectedFolderId === 'all'
      ? tree
      : [findFolderById(tree, selectedFolderId)].filter((folder): folder is FolderNode => Boolean(folder));

    return filterTree(selectedTree, phaseFilter, treeSearch);
  }, [phaseFilter, selectedFolderId, tree, treeSearch]);

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
          <div className={styles.treeToolbar}>
            <select
              className={styles.treeSelect}
              value={phaseFilter}
              onChange={(event) => setPhaseFilter(event.target.value as CertificationPhase)}
              aria-label="Certification filter"
            >
              <option value="all">All</option>
              <option value="pre">Pre Certification</option>
              <option value="final">Final Certification</option>
            </select>

            <select
              className={styles.treeSelect}
              value={selectedFolderId}
              onChange={(event) => setSelectedFolderId(event.target.value)}
              aria-label="Folder filter"
            >
              <option value="all">All Folders</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.relativePath || folder.name}
                </option>
              ))}
            </select>

            <div className={styles.treeSearchWrapper}>
              <Search size={16} className={styles.treeSearchIcon} />
              <input
                className={styles.treeSearchInput}
                value={treeSearch}
                onChange={(event) => setTreeSearch(event.target.value)}
                placeholder="Search files or folders..."
                type="search"
              />
            </div>
          </div>

          <div className={styles.content} style={{ flexDirection: 'column', gap: 16, ...contentStyle }}>
            {loading && <div>Loading available project data…</div>}
            {error && <div style={{ color: 'var(--priority-high)' }}>{error}</div>}
            {!loading && !error && tree?.length === 0 && <div>No folder or file data available for this project.</div>}
            {!loading && !error && tree && tree.length > 0 && visibleTree.length === 0 && <div>No matching folder or file found.</div>}
            {!loading && !error && visibleTree.length > 0 && visibleTree.map((folder) => renderFolder(folder))}
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
