'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  FolderOpen,
  Layers3,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { getProjectSource, Project, useProjects } from '@/context/ProjectContext';
import styles from './page.module.css';

type RequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

type MatchedFile = {
  id: string;
  name: string;
  relativePath: string;
};

type Requirement = {
  id: string;
  text: string;
  status: RequirementStatus;
  matchedFiles: MatchedFile[];
};

type ReviewItem = {
  creditName: string;
  subCreditName: string;
  preRequirements: Requirement[];
  finalRequirements: Requirement[];
};

type ActivityRecord = {
  id: string;
  requirementId: string;
  phase: 'pre' | 'final';
  status: RequirementStatus;
  timestamp: string;
};

type ReviewData = {
  project: { id: string; name: string; type: 'NB' | 'GH' };
  items: ReviewItem[];
  activityHistory?: ActivityRecord[];
};

type ProjectFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension?: string | null;
  size?: number;
  modifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ProjectFolder = {
  id: string;
  name: string;
  path?: string;
  relativePath?: string;
  children: ProjectFolder[];
  files: ProjectFile[];
};

type FiltrationGroup = {
  id: string;
  requirements: Array<{ id: string; requirementName: string }>;
  submissionFiles?: ProjectFile[];
};

type FiltrationData = {
  phase: 'pre' | 'final';
  groups: FiltrationGroup[];
};

type DashboardData = {
  review: ReviewData;
  files: ProjectFile[];
  preFiltration: FiltrationData;
  finalFiltration: FiltrationData;
  aiFiltrationFileCount: number;
};

type TimelineEvent = {
  id: string;
  timestamp: Date;
  type: string;
  details: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
const workflowFilesStoragePrefix = 'certification-filtration-workflow-files';

const creditDefinitions = [
  { key: 'SD', label: 'SSP / SD', color: '#14b8a6' },
  { key: 'WC', label: 'WC', color: '#3b82f6' },
  { key: 'EE', label: 'EE', color: '#f59e0b' },
  { key: 'MR', label: 'MR', color: '#a855f7' },
  { key: 'IEQ', label: 'IEQ', color: '#ec4899' },
  { key: 'IN', label: 'Innovation', color: '#22c55e' },
] as const;

const flattenFiles = (folders: ProjectFolder[]): ProjectFile[] => (
  folders.flatMap((folder) => [...folder.files, ...flattenFiles(folder.children ?? [])])
);

const findClientDataFiles = (folders: ProjectFolder[]): ProjectFile[] => {
  let currentLevel = folders;
  while (currentLevel.length > 0) {
    const clientFolder = currentLevel.find((folder) => /^0\.\s*/.test(folder.name.trim()));
    if (clientFolder) return flattenFiles([clientFolder]);
    currentLevel = currentLevel.flatMap((folder) => folder.children ?? []);
  }
  return [];
};

const isComplete = (requirement: Requirement) => (
  requirement.status === 'checked' || requirement.status === 'overridden'
);

const getCreditKey = (item: ReviewItem): typeof creditDefinitions[number]['key'] => {
  const text = `${item.creditName} ${item.subCreditName}`.trim().toUpperCase();
  const prefix = text.match(/^[A-Z]+/)?.[0] ?? '';
  if (['SD', 'SSP', 'SITE'].includes(prefix)) return 'SD';
  if (['WC', 'WE', 'WATER'].includes(prefix)) return 'WC';
  if (['EE', 'EA', 'ENERGY'].includes(prefix)) return 'EE';
  if (['MR', 'BMR', 'MATERIAL'].includes(prefix)) return 'MR';
  if (['IEQ', 'IE'].includes(prefix)) return 'IEQ';
  return 'IN';
};

const getStage = (project: Project, percent: number) => {
  if (project.checklistStage === 'FINAL_SUBMISSION') return 'Final Submission';
  if (percent >= 100) return 'Review Project';
  if (percent >= 11) return 'Progress Project';
  return 'Start Here';
};

export default function DashboardPage() {
  const { tasks, projects, selectedProject, setSelectedProject } = useProjects();
  const [displayName, setDisplayName] = useState('Sarah');
  const [activeProjectId, setActiveProjectId] = useState('');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const availableProjects = useMemo(() => projects.filter((project) => project.id !== 'all'), [projects]);
  const nbProjects = useMemo(() => availableProjects.filter((project) => getProjectSource(project) === 'NB'), [availableProjects]);
  const ghProjects = useMemo(() => availableProjects.filter((project) => getProjectSource(project) === 'GREEN_HOMES'), [availableProjects]);
  const activeProject = availableProjects.find((project) => project.id === activeProjectId) ?? null;
  const activeSource = activeProject ? getProjectSource(activeProject) : null;

  useEffect(() => {
    const loadDisplayName = () => {
      const savedProfile = window.localStorage.getItem('kamal-cogent-user-profile');
      const savedUserId = window.localStorage.getItem('kamal-cogent-user-id');
      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile) as { name?: string };
          setDisplayName(profile.name?.trim() || savedUserId || 'User');
          return;
        } catch {
          window.localStorage.removeItem('kamal-cogent-user-profile');
        }
      }
      setDisplayName(savedUserId || 'User');
    };

    loadDisplayName();
    window.addEventListener('kamal-cogent-profile-updated', loadDisplayName);
    return () => window.removeEventListener('kamal-cogent-profile-updated', loadDisplayName);
  }, []);

  useEffect(() => {
    if (activeProjectId || availableProjects.length === 0) return;
    const preferredProject = selectedProject !== 'all'
      ? availableProjects.find((project) => project.id === selectedProject)
      : null;
    const initialProject = preferredProject ?? nbProjects[0] ?? ghProjects[0];
    if (initialProject) setActiveProjectId(initialProject.id);
  }, [activeProjectId, availableProjects, ghProjects, nbProjects, selectedProject]);

  useEffect(() => {
    if (!activeProjectId) {
      setDashboardData(null);
      return;
    }

    const controller = new AbortController();
    const loadDashboard = async () => {
      setIsLoading(true);
      setError('');
      try {
        const [reviewResponse, treeResponse, preFiltrationResponse, finalFiltrationResponse] = await Promise.all([
          fetch(`${apiBase}/api/checklists/review/${activeProjectId}`, { signal: controller.signal }),
          fetch(`${apiBase}/api/projects/${activeProjectId}/tree/public`, { signal: controller.signal }),
          fetch(`${apiBase}/api/checklists/review/${activeProjectId}/filtration/pre`, { signal: controller.signal }),
          fetch(`${apiBase}/api/checklists/review/${activeProjectId}/filtration/final`, { signal: controller.signal }),
        ]);
        if (!reviewResponse.ok) throw new Error('Failed to load certification progress');
        if (!treeResponse.ok) throw new Error('Failed to load project documents');
        if (!preFiltrationResponse.ok || !finalFiltrationResponse.ok) throw new Error('Failed to load certification filtration files');
        const [reviewPayload, treePayload, preFiltrationPayload, finalFiltrationPayload] = await Promise.all([
          reviewResponse.json(),
          treeResponse.json(),
          preFiltrationResponse.json(),
          finalFiltrationResponse.json(),
        ]);
        const folders = (treePayload.data ?? []) as ProjectFolder[];
        const preFiltration = preFiltrationPayload.data as FiltrationData;
        const finalFiltration = finalFiltrationPayload.data as FiltrationData;
        const clientFiles = findClientDataFiles(folders);
        const aiGroups = [...preFiltration.groups, ...finalFiltration.groups];
        const baseDashboardData: DashboardData = {
          review: reviewPayload.data as ReviewData,
          files: flattenFiles(folders),
          preFiltration,
          finalFiltration,
          aiFiltrationFileCount: 0,
        };
        setDashboardData(baseDashboardData);
        setIsLoading(false);

        if (clientFiles.length > 0 && aiGroups.length > 0) {
          try {
            const aiResponse = await fetch(`${apiBase}/api/checklists/review/${activeProjectId}/files/match-client-data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                files: clientFiles.map((file) => ({ id: file.id })),
                groups: aiGroups.map((group) => ({ id: group.id, requirements: group.requirements })),
              }),
            });
            if (!aiResponse.ok) throw new Error('Failed to load AI filtration count');
            const aiPayload = await aiResponse.json();
            const aiFiltrationFileCount = new Set(
              (aiPayload.data ?? []).map((match: { fileId: string }) => match.fileId)
            ).size;
            setDashboardData({ ...baseDashboardData, aiFiltrationFileCount });
          } catch (aiError) {
            if ((aiError as Error).name === 'AbortError') throw aiError;
            console.warn('AI filtration count unavailable:', aiError);
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load project dashboard');
          setDashboardData(null);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadDashboard();
    return () => controller.abort();
  }, [activeProjectId]);

  const chooseProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setSelectedProject(projectId || 'all');
  };

  const preRequirements = dashboardData?.review.items.flatMap((item) => item.preRequirements) ?? [];
  const finalRequirements = dashboardData?.review.items.flatMap((item) => item.finalRequirements) ?? [];
  const preCompleted = preRequirements.filter(isComplete).length;
  const finalCompleted = finalRequirements.filter(isComplete).length;
  const progressPercent = preRequirements.length > 0 ? Math.round((preCompleted / preRequirements.length) * 100) : 0;
  const stage = activeProject ? getStage(activeProject, progressPercent) : 'Select Project';

  const projectTasks = tasks.filter((task) => task.project === activeProjectId && task.status !== 'done');
  const deadlineInfo = (() => {
    if (projectTasks.length === 0) return { priority: 'Low', detail: 'No active deadline', color: 'var(--priority-low)' };
    const now = new Date();
    const days = Math.min(...projectTasks.map((task) => Math.ceil((new Date(`${task.dueDate}T23:59:59`).getTime() - now.getTime()) / 86400000)));
    if (days <= 7) return { priority: 'High', detail: days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`, color: 'var(--priority-high)' };
    if (days <= 30) return { priority: 'Medium', detail: `${days} days remaining`, color: 'var(--priority-medium)' };
    return { priority: 'Low', detail: `${days} days remaining`, color: 'var(--priority-low)' };
  })();

  const creditProgress = creditDefinitions.map((definition) => {
    const requirements = (dashboardData?.review.items ?? [])
      .filter((item) => getCreditKey(item) === definition.key)
      .flatMap((item) => item.preRequirements);
    const completed = requirements.filter(isComplete).length;
    return {
      ...definition,
      completed,
      total: requirements.length,
      percent: requirements.length > 0 ? Math.round((completed / requirements.length) * 100) : 0,
    };
  });

  const totalCreditPoints = creditProgress.reduce((sum, credit) => sum + credit.total, 0);
  let pieCursor = 0;
  const pieSegments = creditProgress.flatMap((credit) => {
    const width = totalCreditPoints > 0 ? (credit.completed / totalCreditPoints) * 100 : 0;
    if (width === 0) return [];
    const start = pieCursor;
    pieCursor += width;
    return [`${credit.color} ${start}% ${pieCursor}%`];
  });
  pieSegments.push(`rgba(var(--contrast-surface-rgb), 0.08) ${pieCursor}% 100%`);

  const allRequirements = [...preRequirements, ...finalRequirements];
  const matchedFileIds = new Set(allRequirements.flatMap((requirement) => requirement.matchedFiles.map((file) => file.id)));
  const files = dashboardData?.files ?? [];
  const uniqueFileCount = (projectFiles: ProjectFile[]) => new Set(projectFiles.map((file) => file.id)).size;
  const savedWorkflowFiles = (() => {
    if (!activeProjectId || typeof window === 'undefined') {
      return { supportingFiles: [] as ProjectFile[], finalFiles: [] as ProjectFile[] };
    }

    return (['pre', 'final'] as const).reduce((allFiles, savedPhase) => {
      (['first', 'second'] as const).forEach((savedMode) => {
        try {
          const saved = window.localStorage.getItem(`${workflowFilesStoragePrefix}:${activeProjectId}:${savedPhase}:${savedMode}`);
          if (!saved) return;
          const parsed = JSON.parse(saved) as { supportingFiles?: ProjectFile[]; finalFiles?: ProjectFile[] };
          allFiles.supportingFiles.push(...(parsed.supportingFiles ?? []));
          allFiles.finalFiles.push(...(parsed.finalFiles ?? []));
        } catch {
          // Ignore an invalid saved workflow and keep backend-derived counts available.
        }
      });
      return allFiles;
    }, { supportingFiles: [] as ProjectFile[], finalFiles: [] as ProjectFile[] });
  })();
  const preSubmissionCount = uniqueFileCount(dashboardData?.preFiltration.groups.flatMap((group) => group.submissionFiles ?? []) ?? []);
  const finalSubmissionCount = uniqueFileCount(dashboardData?.finalFiltration.groups.flatMap((group) => group.submissionFiles ?? []) ?? []);
  const savedFinalFileIds = new Set(savedWorkflowFiles.finalFiles.map((file) => file.id));
  const supportingDocumentCount = uniqueFileCount(
    savedWorkflowFiles.supportingFiles.filter((file) => !savedFinalFileIds.has(file.id))
  );

  const requirementNames = new Map(allRequirements.map((requirement) => [requirement.id, requirement.text]));
  const timelineEvents: TimelineEvent[] = [
    ...files.map((file) => {
      const path = `${file.relativePath} ${file.path}`;
      const type = matchedFileIds.has(file.id)
        ? 'File matched'
        : /supporting/i.test(path)
          ? 'Moved to Supporting Documents'
          : /certification/i.test(path)
            ? 'Submission document updated'
            : 'Project file updated';
      return {
        id: `file-${file.id}`,
        timestamp: new Date(file.modifiedAt || file.updatedAt || file.createdAt || 0),
        type,
        details: file.name,
      };
    }),
    ...(dashboardData?.review.activityHistory ?? []).map((activity) => ({
      id: activity.id,
      timestamp: new Date(activity.timestamp),
      type: activity.status === 'overridden' ? 'Checklist point overridden' : 'Checklist point updated',
      details: requirementNames.get(activity.requirementId) || `${activity.phase} certification requirement`,
    })),
  ].filter((event) => !Number.isNaN(event.timestamp.getTime()));

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const timelineDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    const events = timelineEvents.filter((event) => event.timestamp >= date && event.timestamp < nextDate);
    return { date, events, value: events.length };
  });
  const chartWidth = 560;
  const chartHeight = 190;
  const chartBottom = 160;
  const chartMax = Math.max(1, ...timelineDays.map((day) => day.value));
  const timelinePoints = timelineDays.map((day, index) => ({
    x: 30 + (index / 6) * 510,
    y: chartBottom - (day.value / chartMax) * 130,
    ...day,
  }));
  const linePath = timelinePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${timelinePoints[6].x} ${chartBottom} L ${timelinePoints[0].x} ${chartBottom} Z`;

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.welcomeBanner}>
        <div className={styles.bannerText}>
          <h2 className={styles.greeting}>Welcome back, {displayName}!</h2>
          <p className={styles.subGreeting}>
            Here is the current operational status for <strong className="gradient-text">{activeProject?.name ?? 'your IGBC project'}</strong>.
          </p>
        </div>
        <div className={styles.dateBadge}>
          <Calendar size={16} />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      <section className={`${styles.projectSelectors} glassmorphic`} aria-label="Project selection">
        <label>
          <span>NB Projects</span>
          <select value={activeSource === 'NB' ? activeProjectId : ''} onChange={(event) => chooseProject(event.target.value)}>
            <option value="">Select NB project</option>
            {nbProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          <span>Green Homes Projects</span>
          <select value={activeSource === 'GREEN_HOMES' ? activeProjectId : ''} onChange={(event) => chooseProject(event.target.value)}>
            <option value="">Select Green Homes project</option>
            {ghProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}
      {isLoading ? (
        <div className={styles.loadingPanel}><Loader2 size={26} className={styles.loadingIcon} /> Loading selected project dashboard</div>
      ) : dashboardData && activeProject ? (
        <>
          <div className={styles.kpiGrid}>
            <article className={`${styles.statusCard} glassmorphic`}>
              <div className={styles.statusCardHeader}><span>Project Stage</span><Layers3 size={20} /></div>
              <strong>{stage}</strong>
              <div className={styles.statusCardFooter}><span className={styles.stagePill}>{stage}</span><span>{progressPercent}%</span></div>
            </article>
            <article className={`${styles.statusCard} glassmorphic`} style={{ '--status-color': deadlineInfo.color } as React.CSSProperties}>
              <div className={styles.statusCardHeader}><span>Project Priority</span><Flag size={20} /></div>
              <strong>{deadlineInfo.priority}</strong>
              <div className={styles.statusCardFooter}><span>{deadlineInfo.detail}</span></div>
            </article>
            <article className={`${styles.statusCard} glassmorphic`}>
              <div className={styles.statusCardHeader}><span>Pre Certification Progress</span><ClipboardCheck size={20} /></div>
              <strong>{preCompleted} / {preRequirements.length}</strong>
              <div className={styles.miniProgress}><span style={{ width: `${progressPercent}%` }} /></div>
            </article>
            <article className={`${styles.statusCard} glassmorphic`}>
              <div className={styles.statusCardHeader}><span>Final Certification Progress</span><CheckCircle2 size={20} /></div>
              <strong>{finalCompleted} / {finalRequirements.length}</strong>
              <div className={styles.miniProgress}><span style={{ width: `${finalRequirements.length ? Math.round((finalCompleted / finalRequirements.length) * 100) : 0}%` }} /></div>
            </article>
          </div>

          <div className={styles.chartsGrid}>
            <section className={`${styles.chartCard} glassmorphic`}>
              <div className={styles.chartHeader}><h3>Project Activity Timeline</h3><span className={styles.chartSub}>Actual updates for the current week</span></div>
              <div className={styles.chartWrapper}>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className={styles.svgChart}>
                  <defs><linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
                  {[30, 62, 95, 127, 160].map((y) => <line key={y} x1="30" y1={y} x2="540" y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />)}
                  <path d={areaPath} fill="url(#activityGradient)" />
                  <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {timelinePoints.map((point) => (
                    <g key={point.date.toISOString()} className={styles.tooltipGroup}>
                      <circle cx={point.x} cy={point.y} r="5" fill="var(--bg-primary)" stroke="var(--primary)" strokeWidth="3" />
                      <circle cx={point.x} cy={point.y} r="13" fill="transparent"><title>{point.events.length ? point.events.map((event) => `${event.type} | ${event.timestamp.toLocaleString()} | ${event.details}`).join('\n') : 'No activity'}</title></circle>
                      <text x={point.x} y="183" textAnchor="middle" fill="var(--text-muted)" fontSize="10">{point.date.toLocaleDateString('en-US', { weekday: 'short' })}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </section>

            <section className={`${styles.chartCard} glassmorphic`}>
              <div className={styles.chartHeader}><h3>Credit Completion</h3><span className={styles.chartSub}>Pre Certification performance by main credit</span></div>
              <div className={styles.donutContainer}>
                <div className={styles.creditPie} style={{ background: `conic-gradient(${pieSegments.join(', ')})` }}><div><strong>{progressPercent}%</strong><span>COMPLETE</span></div></div>
                <div className={styles.creditLegend}>
                  {creditProgress.map((credit) => (
                    <div key={credit.key} className={styles.creditLegendItem}>
                      <span style={{ background: credit.color }} />
                      <div><strong>{credit.label}</strong><small>{credit.completed}/{credit.total} · {credit.percent}% {credit.percent === 100 ? 'Complete' : 'Needs work'}</small></div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className={`${styles.healthSection} glassmorphic`}>
            <div className={styles.chartHeader}><h3>Certification Documents</h3><span className={styles.chartSub}>Live files from Certification Filtration</span></div>
            <div className={`${styles.healthGrid} ${styles.documentCountGrid}`}>
              <div><ClipboardCheck size={20} /><span>IGBC Pre Submission</span><strong>{preSubmissionCount}</strong></div>
              <div><CheckCircle2 size={20} /><span>IGBC Final Submission</span><strong>{finalSubmissionCount}</strong></div>
              <div><FolderOpen size={20} /><span>Supporting Documents</span><strong>{supportingDocumentCount}</strong></div>
              <div><Sparkles size={20} /><span>AI Filtration</span><strong>{dashboardData.aiFiltrationFileCount}</strong></div>
            </div>
          </section>
        </>
      ) : (
        <div className={styles.emptyState}><AlertCircle size={28} /><span>Select an NB or Green Homes project to load its dashboard.</span></div>
      )}
    </div>
  );
}
