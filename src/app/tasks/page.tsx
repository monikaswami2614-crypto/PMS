'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
import ProjectFilesModal from '@/components/ProjectFilesModal';
import { Eye, FolderTree, Search, SlidersHorizontal } from 'lucide-react';
import { logClientActivity } from '@/utils/activityLog';
import styles from './page.module.css';

export default function TaskListPage() {
  const { selectedProject, projects, sourceFilter, refreshProjects } = useProjects();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [showProjectFilesModal, setShowProjectFilesModal] = useState(false);
  const [projectForModal, setProjectForModal] = useState<{ id: string; name?: string } | null>(null);

  useEffect(() => {
    const query = searchParams?.get('search') ?? '';
    setSearchQuery(query);
  }, [searchParams]);

  const visibleProjects = projects.filter((project) => {
    if (project.id === 'all') return false;
    if (selectedProject !== 'all' && project.id !== selectedProject) return false;

    const projectSource = getProjectSource(project);
    if (!projectSource) return false;
    if (sourceFilter && projectSource !== sourceFilter) return false;

    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    const searchableText = `${project.name} ${project.description} ${project.category} ${project.rootPath ?? ''}`.toLowerCase();
    return searchableText.includes(query);
  });

  const openProjectData = (projectId: string, projectName?: string) => {
    setProjectForModal({ id: projectId, name: projectName });
    setShowProjectFilesModal(true);
    void logClientActivity({
      actionType: 'File viewed',
      moduleName: 'FILES',
      projectId,
      projectName,
      description: `Project files viewed for "${projectName || projectId}".`,
      metadata: { source: 'Project List data tree' },
    });
  };

  const handleProjectContextMenu = async (event: React.MouseEvent<HTMLTableRowElement>, project: typeof projects[number]) => {
    event.preventDefault();
    event.stopPropagation();

    const shouldDelete = window.confirm(`Delete project "${project.name}"?\n\nThis will delete the project from the database and remove its project folder.`);
    if (!shouldDelete) return;

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
      const response = await fetch(`${apiBase}/api/projects/${project.id}/public`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete project.');
      }

      await refreshProjects();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to delete project.');
    }
  };

  const getSourceLabel = (project: typeof projects[number]) => {
    const source = getProjectSource(project);
    if (source === 'NB') return 'NB';
    if (source === 'GREEN_HOMES') return 'Green Homes';
    return 'Project';
  };

  const totalFolders = visibleProjects.reduce((total, project) => total + (project.folderCount ?? 0), 0);
  const totalFiles = visibleProjects.reduce((total, project) => total + (project.fileCount ?? 0), 0);

  return (
    <div className={styles.container}>
      <div className={`${styles.toolbar} glassmorphic`}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filtersGroup}>
          <div className={styles.summaryPill}>
            <FolderTree size={14} />
            <span>{visibleProjects.length} projects</span>
          </div>
          <div className={styles.summaryPill}>
            <span>{totalFolders} folders</span>
          </div>
          <div className={styles.summaryPill}>
            <span>{totalFiles} files</span>
          </div>
        </div>

      </div>

      <div className={`${styles.tableCard} glassmorphic`}>
        {visibleProjects.length > 0 ? (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thTitle}>Project</th>
                  <th>Source</th>
                  <th>Folders</th>
                  <th>Files</th>
                  <th>Status</th>
                  <th>Root Path</th>
                  <th className={styles.thActions}>View</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => openProjectData(project.id, project.name)}
                    onContextMenu={(event) => handleProjectContextMenu(event, project)}
                    className={styles.tableRow}
                  >
                    <td className={styles.tdTitle}>
                      <div className={styles.titleWrapper}>
                        <span className={styles.taskTitle}>{project.name}</span>
                        <span className={styles.taskDesc}>{project.description || 'No description available'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.projectName}>{getSourceLabel(project)}</span>
                    </td>
                    <td>{project.folderCount ?? 0}</td>
                    <td>{project.fileCount ?? 0}</td>
                    <td>
                      <span className="badge badge-low">{project.status || 'active'}</span>
                    </td>
                    <td>
                      <span className={styles.pathText}>{project.rootPath || '-'}</span>
                    </td>
                    <td className={styles.tdActions}>
                      <div className={styles.actionsCell} onClick={(event) => event.stopPropagation()}>
                        <button
                          className={styles.viewRowBtn}
                          onClick={() => openProjectData(project.id, project.name)}
                          title="View project data"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <SlidersHorizontal size={48} className={styles.emptyIcon} />
            <h3>No projects match your filters</h3>
            <p>Try clearing the search or source filter to view available projects.</p>
          </div>
        )}
      </div>

      {showProjectFilesModal && projectForModal && (
        <ProjectFilesModal
          isOpen={showProjectFilesModal}
          onClose={() => setShowProjectFilesModal(false)}
          projectId={projectForModal.id}
          projectName={projectForModal.name}
          fullView={true}
        />
      )}
    </div>
  );
}
