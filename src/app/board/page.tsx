'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getProjectSource, ProjectSourceFilter, useProjects } from '@/context/ProjectContext';
import ProjectListModal from '@/components/ProjectListModal';
import { CheckCircle2, ChevronDown, Clock3, ExternalLink, Loader2, Plus, TimerReset, X } from 'lucide-react';
import styles from './page.module.css';

type BoardStage = 'START_HERE' | 'PROGRESS' | 'REVIEW' | 'FINAL_SUBMISSION';

type ApiProject = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  rootPath?: string | null;
  checklistStage?: BoardStage | string;
  folderCount?: number;
  fileCount?: number;
};

type Requirement = {
  status: 'pending' | 'missing' | 'checked' | 'overridden';
  text: string;
  matchedFiles: MatchedFile[];
};

type MatchedFile = {
  id: string;
  name: string;
  relativePath: string;
  extension?: string | null;
  size?: number;
};

type ChecklistReview = {
  project: {
    type: 'NB' | 'GH';
  };
  items: Array<{
    creditName: string;
    mainCategory?: string | null;
    creditGroup?: string | null;
    subCreditName: string;
    preRequirements: Requirement[];
    finalRequirements: Requirement[];
  }>;
};

type CheckedRequirementGroup = {
  id: string;
  creditName: string;
  moduleName: string;
  certificationType: 'Pre Certification' | 'Final Certification';
  requirementText: string;
  matchedFiles: MatchedFile[];
};

type BoardProject = ApiProject & {
  projectType: 'NB' | 'GH' | 'Project';
  preChecked: number;
  preTotal: number;
  finalChecked: number;
  finalTotal: number;
  progressPercent: number;
  stage: BoardStage;
  categoryProgress: CategoryProgress[];
  checkedRequirements: CheckedRequirementGroup[];
};

type CategoryProgress = {
  key: string;
  shortName: string;
  fullName: string;
  checked: number;
  total: number;
  percent: number;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';

const STAGES: Array<{ id: BoardStage; title: string; eyebrow: string; color: string }> = [
  { id: 'START_HERE', title: 'Start Here', eyebrow: 'New added projects', color: 'var(--text-secondary)' },
  { id: 'PROGRESS', title: 'Progress Projects', eyebrow: 'Active work', color: 'var(--status-inprogress)' },
  { id: 'REVIEW', title: 'Review Projects', eyebrow: 'Ready for checking', color: 'var(--status-review)' },
  { id: 'FINAL_SUBMISSION', title: 'Final Submission', eyebrow: 'Completed work', color: 'var(--status-done)' },
];

const getAutoStage = (progressPercent: number): BoardStage => {
  if (progressPercent >= 100) return 'REVIEW';
  if (progressPercent >= 11) return 'PROGRESS';
  return 'START_HERE';
};

const getSourceFromBoardProject = (project: ApiProject): ProjectSourceFilter => {
  return getProjectSource({
    name: project.name,
    category: project.category || '',
    rootPath: project.rootPath || null,
  });
};

const CREDIT_CATEGORIES = [
  { key: 'SD', shortName: 'SD', fullName: 'Site Development' },
  { key: 'WE', shortName: 'WE', fullName: 'Water Efficiency' },
  { key: 'EE', shortName: 'EE', fullName: 'Energy Efficiency' },
  { key: 'MR', shortName: 'MR', fullName: 'Materials & Resources' },
  { key: 'IEQ', shortName: 'IEQ', fullName: 'Indoor Environmental Quality' },
  { key: 'IN', shortName: 'IN', fullName: 'Innovation / Design Process' },
] as const;

const getCategoryInfo = (item: ChecklistReview['items'][number], projectType: 'NB' | 'GH') => {
  const categoryText = [item.mainCategory, item.creditGroup, item.creditName, item.subCreditName]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toUpperCase();
  const leadingCode = categoryText.match(/^[A-Z]+/)?.[0] ?? '';

  if (projectType === 'NB') {
    if (leadingCode === 'SSP' || leadingCode === 'SITE') return CREDIT_CATEGORIES[0];
    if (leadingCode === 'WE' || leadingCode === 'WATER') return CREDIT_CATEGORIES[1];
    if (leadingCode === 'EE' || leadingCode === 'EA' || leadingCode === 'ENERGY') return CREDIT_CATEGORIES[2];
    if (leadingCode === 'BMR' || leadingCode === 'MR') return CREDIT_CATEGORIES[3];
    if (leadingCode === 'IEQ' || leadingCode === 'IE') return CREDIT_CATEGORIES[4];
    if (leadingCode === 'IN' || leadingCode === 'IDP' || leadingCode === 'CREDIT') return CREDIT_CATEGORIES[5];
  }

  if (leadingCode === 'WE' || categoryText.includes('WATER')) return CREDIT_CATEGORIES[1];
  if (leadingCode === 'EE' || leadingCode === 'EA' || categoryText.includes('ENERGY')) return CREDIT_CATEGORIES[2];
  if (leadingCode === 'MR' || categoryText.includes('MATERIAL')) return CREDIT_CATEGORIES[3];
  if (leadingCode === 'IEQ' || leadingCode === 'IE' || categoryText.includes('INDOOR')) return CREDIT_CATEGORIES[4];
  if (leadingCode === 'IN' || leadingCode === 'IDP' || categoryText.includes('INNOVATION') || categoryText.includes('DESIGN PROCESS')) {
    return CREDIT_CATEGORIES[5];
  }

  return CREDIT_CATEGORIES[0];
};

const getCategoryProgress = (items: ChecklistReview['items'], projectType: 'NB' | 'GH'): CategoryProgress[] => {
  const categories = new Map<string, Omit<CategoryProgress, 'percent'>>(
    CREDIT_CATEGORIES.map((category) => [
      category.key,
      {
        ...category,
        checked: 0,
        total: 0,
      },
    ]),
  );

  items.forEach((item) => {
    const category = getCategoryInfo(item, projectType);
    const requirements = item.preRequirements;
    const checked = requirements.filter((requirement) => (
      requirement.status === 'checked' || requirement.status === 'overridden'
    )).length;
    const existing = categories.get(category.key)!;
    categories.set(category.key, {
      ...existing,
      checked: existing.checked + checked,
      total: existing.total + requirements.length,
    });
  });

  return Array.from(categories.values()).map((category) => ({
    ...category,
    percent: category.total > 0 ? Math.round((category.checked / category.total) * 100) : 0,
  }));
};

const mapProjectWithReview = async (project: ApiProject): Promise<BoardProject> => {
  try {
    const response = await fetch(`${apiBase}/api/checklists/review/${project.id}`);
    if (!response.ok) throw new Error('Checklist review unavailable');

    const payload = await response.json();
    const review = payload.data as ChecklistReview;
    const preRequirements = review.items.flatMap((item) => item.preRequirements);
    const finalRequirements = review.items.flatMap((item) => item.finalRequirements);
    const isCompleted = (requirement: Requirement) => requirement.status === 'checked' || requirement.status === 'overridden';
    const preChecked = preRequirements.filter(isCompleted).length;
    const finalChecked = finalRequirements.filter(isCompleted).length;
    const progressPercent = preRequirements.length > 0 ? Math.round((preChecked / preRequirements.length) * 100) : 0;
    const stage = project.checklistStage === 'FINAL_SUBMISSION' ? 'FINAL_SUBMISSION' : getAutoStage(progressPercent);
    const categoryProgress = getCategoryProgress(review.items, review.project.type);
    const checkedRequirements = review.items.flatMap((item) => [
      ...item.preRequirements
        .filter(isCompleted)
        .map((requirement) => ({
          id: `${requirement.text}-pre`,
          creditName: item.creditName,
          moduleName: item.subCreditName,
          certificationType: 'Pre Certification' as const,
          requirementText: requirement.text,
          matchedFiles: requirement.matchedFiles || [],
        })),
      ...item.finalRequirements
        .filter(isCompleted)
        .map((requirement) => ({
          id: `${requirement.text}-final`,
          creditName: item.creditName,
          moduleName: item.subCreditName,
          certificationType: 'Final Certification' as const,
          requirementText: requirement.text,
          matchedFiles: requirement.matchedFiles || [],
        })),
    ]);

    return {
      ...project,
      projectType: review.project.type,
      preChecked,
      preTotal: preRequirements.length,
      finalChecked,
      finalTotal: finalRequirements.length,
      progressPercent,
      stage,
      categoryProgress,
      checkedRequirements,
    };
  } catch {
    const projectSource = getSourceFromBoardProject(project);

    return {
      ...project,
      projectType: projectSource === 'NB' ? 'NB' : projectSource === 'GREEN_HOMES' ? 'GH' : 'Project',
      preChecked: 0,
      preTotal: 0,
      finalChecked: 0,
      finalTotal: 0,
      progressPercent: 0,
      stage: project.checklistStage === 'FINAL_SUBMISSION' ? 'FINAL_SUBMISSION' : 'START_HERE',
      categoryProgress: [],
      checkedRequirements: [],
    };
  }
};

export default function ProjectsPage() {
  const { sourceFilter } = useProjects();
  const [boardProjects, setBoardProjects] = useState<BoardProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showProjectListModal, setShowProjectListModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<BoardProject | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  const loadBoardProjects = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/api/projects/public`);
      if (!response.ok) throw new Error('Failed to load projects');

      const payload = await response.json();
      const projects = (payload.data || []) as ApiProject[];
      const mappedProjects = await Promise.all(projects.map(mapProjectWithReview));
      const reconciledProjects = [...mappedProjects];

      for (const project of mappedProjects) {
        if (project.checklistStage !== 'FINAL_SUBMISSION' || project.progressPercent >= 100) continue;

        const shouldMoveBack = window.confirm(
          `${project.name} is now ${project.progressPercent}% complete. Move it back from Final Submission to Review Projects?`
        );
        if (!shouldMoveBack) continue;

        const stageResponse = await fetch(`${apiBase}/api/projects/${project.id}/stage/review/public`, {
          method: 'PATCH',
        });
        if (!stageResponse.ok) throw new Error(`Failed to move ${project.name} back to Review Projects`);

        const projectIndex = reconciledProjects.findIndex((item) => item.id === project.id);
        if (projectIndex >= 0) {
          reconciledProjects[projectIndex] = {
            ...reconciledProjects[projectIndex],
            checklistStage: 'REVIEW',
            stage: 'REVIEW',
          };
        }
      }

      setBoardProjects(reconciledProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project activity board');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoardProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    if (!sourceFilter) return boardProjects;
    return boardProjects.filter((project) => getSourceFromBoardProject(project) === sourceFilter);
  }, [boardProjects, sourceFilter]);

  const openProjectData = (project: BoardProject) => {
    if (project.stage !== 'REVIEW' && project.stage !== 'FINAL_SUBMISSION') return;
    setSelectedProject(project);
  };

  const moveToFinalSubmission = async (project: BoardProject) => {
    setBoardProjects((currentProjects) => currentProjects.map((item) => (
      item.id === project.id ? { ...item, checklistStage: 'FINAL_SUBMISSION', stage: 'FINAL_SUBMISSION' } : item
    )));

    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}/stage/final-submission/public`, {
        method: 'PATCH',
      });

      if (!response.ok) throw new Error('Failed to move project to final submission');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move project to final submission');
      loadBoardProjects();
    }
  };

  const toggleCategoryProgress = (projectId: string) => {
    setExpandedProjectIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(projectId)) {
        nextIds.delete(projectId);
      } else {
        nextIds.add(projectId);
      }
      return nextIds;
    });
  };

  const renderProjectCard = (project: BoardProject, stageId: BoardStage) => {
    const isCategoryProgressExpanded = expandedProjectIds.has(project.id);

    return (
      <div
        key={project.id}
        role={stageId === 'REVIEW' || stageId === 'FINAL_SUBMISSION' ? 'button' : undefined}
        tabIndex={stageId === 'REVIEW' || stageId === 'FINAL_SUBMISSION' ? 0 : undefined}
        className={`${styles.projectCard} ${stageId === 'START_HERE' || stageId === 'PROGRESS' ? styles.staticCard : ''}`}
        onClick={() => openProjectData(project)}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && (stageId === 'REVIEW' || stageId === 'FINAL_SUBMISSION')) {
            openProjectData(project);
          }
        }}
      >
        <div className={styles.projectCardHeader}>
          <span className={styles.projectTypeBadge}>{project.projectType}</span>
          <span className={styles.stageBadge}>{STAGES.find((stage) => stage.id === project.stage)?.title}</span>
        </div>

        <h3>{project.name}</h3>
        {project.description && <p>{project.description}</p>}

        <div className={styles.progressValue}>{project.progressPercent}%</div>
        <div className={styles.progressLine}>
          <span style={{ width: `${project.progressPercent}%` }} />
        </div>

        <button
          type="button"
          className={styles.creditProgressToggle}
          aria-expanded={isCategoryProgressExpanded}
          onClick={(event) => {
            event.stopPropagation();
            toggleCategoryProgress(project.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span>Show Credit Progress</span>
          <ChevronDown size={14} className={isCategoryProgressExpanded ? styles.toggleIconOpen : undefined} />
        </button>

        {isCategoryProgressExpanded && (
          <div className={styles.categoryProgressList} onClick={(event) => event.stopPropagation()}>
            {project.categoryProgress.length > 0 ? (
              project.categoryProgress.map((category) => (
                <div key={category.key} className={styles.categoryProgressItem}>
                  <div className={styles.categoryProgressHeader}>
                    <div>
                      <strong>{category.shortName}</strong>
                      {category.fullName && category.fullName !== category.shortName && <span>{category.fullName}</span>}
                    </div>
                    <span>{category.percent}%</span>
                  </div>
                  <div className={styles.categoryProgressMeta}>
                    {category.checked}/{category.total}
                  </div>
                  <div className={styles.categoryProgressLine}>
                    <span style={{ width: `${category.percent}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyCategoryProgress}>No credit progress available</div>
            )}
          </div>
        )}

        <div className={styles.cardMeta}>
          <span>Pre {project.preChecked}/{project.preTotal}</span>
          <span>Final {project.finalChecked}/{project.finalTotal}</span>
        </div>

        {stageId === 'REVIEW' && (
          <button
            type="button"
            className={styles.finalSubmissionBtn}
            onClick={(event) => {
              event.stopPropagation();
              moveToFinalSubmission(project);
            }}
          >
            Move to Final Submission
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.projectsPage}>
      {error && <div className={styles.errorBox}>{error}</div>}

      {isLoading ? (
        <div className={styles.loadingPanel}>
          <Loader2 size={26} className={styles.loadingIcon} />
          <span>Loading project activity</span>
        </div>
      ) : (
        <div className={styles.stageList}>
          {STAGES.map((stage) => {
            const stageProjects = filteredProjects.filter((project) => project.stage === stage.id);

            return (
              <section className={styles.stageSection} key={stage.id}>
                <div className={styles.stageHeading}>
                  <div>
                    <span className={styles.stageEyebrow}>
                      <span style={{ backgroundColor: stage.color, boxShadow: `0 0 12px ${stage.color}` }} />
                      {stage.eyebrow}
                    </span>
                    <h2>{stage.title}</h2>
                  </div>
                  <strong>{stageProjects.length}</strong>
                </div>

                <div className={styles.stageGrid}>
                  {stageProjects.length > 0 ? (
                    stageProjects.map((project) => renderProjectCard(project, stage.id))
                  ) : stage.id === 'START_HERE' ? (
                    <button className={styles.emptyNewProject} type="button" onClick={() => setShowProjectListModal(true)}>
                      <Plus size={16} />
                      <span>Add new project</span>
                    </button>
                  ) : (
                    <div className={styles.emptyStage}>
                      {stage.id === 'PROGRESS' && <Clock3 size={22} />}
                      {stage.id === 'REVIEW' && <TimerReset size={22} />}
                      {stage.id === 'FINAL_SUBMISSION' && <CheckCircle2 size={22} />}
                      <span>No projects in this stage</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ProjectListModal
        isOpen={showProjectListModal}
        onClose={() => setShowProjectListModal(false)}
        sourceName="Project Source"
        sourcePath=""
        onSelectProject={() => {
          setShowProjectListModal(false);
        }}
      />
      {selectedProject && (
        <div className={styles.modalOverlay} onClick={() => setSelectedProject(null)}>
          <div className={`${styles.checkedFilesModal} glassmorphism`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{selectedProject.name} - Checked Requirement Files</h2>
              <button type="button" className={styles.closeButton} onClick={() => setSelectedProject(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.checkedTree}>
              {selectedProject.checkedRequirements.length > 0 ? (
                selectedProject.checkedRequirements.map((requirement) => (
                  <section key={requirement.id} className={styles.checkedGroup}>
                    <h3>{requirement.creditName}</h3>
                    <div className={styles.treeBranch}>
                      <div className={styles.treeLabel}>{requirement.moduleName || '-'}</div>
                      <div className={styles.treeLabel}>{requirement.certificationType}</div>
                      <div className={styles.requirementBlock}>{requirement.requirementText}</div>
                      <div className={styles.fileList}>
                        {requirement.matchedFiles.length > 0 ? (
                          requirement.matchedFiles.map((file) => (
                            <button
                              key={file.id}
                              type="button"
                              className={styles.fileRow}
                              onClick={() => window.open(`/files/editor/${file.id}`, '_blank', 'noopener,noreferrer')}
                            >
                              <span className={styles.fileName}>{file.name}</span>
                              <span>{file.relativePath || '-'}</span>
                              <span>{file.extension || 'file'}</span>
                              <span>{typeof file.size === 'number' ? `${(file.size / 1024).toFixed(2)} KB` : '-'}</span>
                              <ExternalLink size={14} />
                            </button>
                          ))
                        ) : (
                          <div className={styles.noFiles}>No matched files found</div>
                        )}
                      </div>
                    </div>
                  </section>
                ))
              ) : (
                <div className={styles.noFiles}>No checked requirement files found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
