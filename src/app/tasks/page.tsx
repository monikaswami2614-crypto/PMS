'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getProjectSource, useProjects, Task } from '@/context/ProjectContext';
import { TaskModal } from '@/components/TaskModal';
import TaskFormModal from '@/components/TaskFormModal';
import ProjectFilesModal from '@/components/ProjectFilesModal';
import { Eye, FolderTree, Plus, Search, SlidersHorizontal } from 'lucide-react';
import styles from './page.module.css';

export default function TaskListPage() {
  const { selectedProject, projects, sourceFilter } = useProjects();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
  };

  const handleCreateClick = () => {
    setSelectedTask(undefined);
    setIsModalOpen(true);
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

        <button className={styles.addTaskBtn} onClick={handleCreateClick}>
          <Plus size={16} />
          <span>Add Task</span>
        </button>
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

      {isModalOpen && (
        selectedProject === 'all' ? (
          <TaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        ) : (
          <TaskFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} task={selectedTask} />
        )
      )}

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
