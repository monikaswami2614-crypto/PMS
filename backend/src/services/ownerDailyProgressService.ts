import prisma from '../config/prisma.js';
import { sendMail } from './emailService.js';

const TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

type ChecklistType = 'NB' | 'GH';
type ChecklistPhase = 'PRE' | 'FINAL' | 'BOTH';

type ChecklistState = {
  preCertificationChecked?: boolean | null;
  finalCertificationChecked?: boolean | null;
  preCertificationStatus?: string | null;
  finalCertificationStatus?: string | null;
};

type ProjectReport = {
  name: string;
  type: ChecklistType;
  previousProgress: number;
  currentProgress: number;
  workDoneToday: number;
  pendingPoints: number;
  missingPoints: number;
  deadlineAlerts: string[];
};

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getTodayRange = (now: Date): { dateKey: string; start: Date; end: Date } => {
  const dateKey = getDateKey(now);
  const start = new Date(`${dateKey}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateKey, start, end };
};

const formatReportDate = (date: Date): string => new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
}).format(date);

const formatDeadlineDate = (date: Date): string => new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).format(date);

const getProjectType = (project: { name: string; category: string | null; rootPath: string | null }): ChecklistType => {
  const searchableText = `${project.name} ${project.category ?? ''} ${project.rootPath ?? ''}`.toLowerCase();
  return searchableText.includes('green homes')
    || searchableText.includes('green_homes')
    || searchableText.includes('igbc gh')
    || searchableText.includes(' gh ')
    ? 'GH'
    : 'NB';
};

const isCompleted = (state: ChecklistState | undefined, phase: ChecklistPhase): boolean => {
  if (!state) return false;
  if (phase === 'FINAL') {
    return state.finalCertificationChecked === true
      || state.finalCertificationStatus === 'checked'
      || state.finalCertificationStatus === 'overridden';
  }
  return state.preCertificationChecked === true
    || state.preCertificationStatus === 'checked'
    || state.preCertificationStatus === 'overridden';
};

const getRequirementStatus = (
  state: ChecklistState | undefined,
  phase: ChecklistPhase,
): 'completed' | 'pending' | 'missing' => {
  if (isCompleted(state, phase)) return 'completed';
  const status = phase === 'FINAL' ? state?.finalCertificationStatus : state?.preCertificationStatus;
  return status === 'pending' ? 'pending' : 'missing';
};

const getProgress = (
  items: Array<{ id: string; phase: ChecklistPhase }>,
  states: Map<string, ChecklistState>,
): number => {
  if (items.length === 0) return 0;
  const completed = items.filter((item) => isCompleted(states.get(item.id), item.phase)).length;
  return Math.round((completed / items.length) * 100);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toChecklistState = (value: unknown): ChecklistState | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    preCertificationChecked: typeof value.preCertificationChecked === 'boolean'
      ? value.preCertificationChecked
      : null,
    finalCertificationChecked: typeof value.finalCertificationChecked === 'boolean'
      ? value.finalCertificationChecked
      : null,
    preCertificationStatus: typeof value.preCertificationStatus === 'string'
      ? value.preCertificationStatus
      : null,
    finalCertificationStatus: typeof value.finalCertificationStatus === 'string'
      ? value.finalCertificationStatus
      : null,
  };
};

const getDeadlineAlerts = (
  projectEndDate: Date | null,
  tasks: Array<{ title: string; status: string; dueDate: Date }>,
  todayStart: Date,
): string[] => {
  const alerts: string[] = [];
  const alertEnd = new Date(todayStart.getTime() + 4 * 24 * 60 * 60 * 1000);

  const describeDeadline = (label: string, dueDate: Date) => {
    if (dueDate < todayStart) return `OVERDUE: ${label} (${formatDeadlineDate(dueDate)})`;
    if (dueDate < new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)) {
      return `DUE TODAY: ${label}`;
    }
    if (dueDate < alertEnd) return `DUE SOON: ${label} (${formatDeadlineDate(dueDate)})`;
    return null;
  };

  if (projectEndDate) {
    const projectAlert = describeDeadline('Project deadline', projectEndDate);
    if (projectAlert) alerts.push(projectAlert);
  }

  tasks
    .filter((task) => !['done', 'completed', 'complete'].includes(task.status.toLowerCase()))
    .forEach((task) => {
      const taskAlert = describeDeadline(task.title, task.dueDate);
      if (taskAlert) alerts.push(taskAlert);
    });

  return alerts;
};

const buildText = (date: string, totalProjects: number, reports: ProjectReport[]): string => {
  const updatedReports = reports.filter((report) => report.workDoneToday !== 0);
  const lines = [
    'Owner Daily Progress Report',
    `Date: ${date}`,
    `Total projects: ${totalProjects}`,
    `Projects updated today: ${updatedReports.length}`,
    '',
  ];

  if (updatedReports.length === 0) {
    lines.push('No work done today. No project progress changed today.');
    return lines.join('\n');
  }

  updatedReports.forEach((report, index) => {
    lines.push(
      `${index + 1}. ${report.name} (${report.type})`,
      `Previous progress: ${report.previousProgress}%`,
      `Current progress: ${report.currentProgress}%`,
      `Work done today: ${report.workDoneToday > 0 ? '+' : ''}${report.workDoneToday}%`,
      `Pending points: ${report.pendingPoints}`,
      `Missing points: ${report.missingPoints}`,
      `Deadline alerts: ${report.deadlineAlerts.join('; ') || 'None'}`,
      '',
    );
  });

  return lines.join('\n');
};

const buildHtml = (date: string, totalProjects: number, reports: ProjectReport[]): string => {
  const updatedReports = reports.filter((report) => report.workDoneToday !== 0);
  const rows = updatedReports.map((report) => `
    <tr>
      <td style="padding:8px;border:1px solid #d1d5db">${escapeHtml(report.name)}</td>
      <td style="padding:8px;border:1px solid #d1d5db">${report.type}</td>
      <td style="padding:8px;border:1px solid #d1d5db;text-align:center">${report.previousProgress}%</td>
      <td style="padding:8px;border:1px solid #d1d5db;text-align:center">${report.currentProgress}%</td>
      <td style="padding:8px;border:1px solid #d1d5db;text-align:center">${report.workDoneToday > 0 ? '+' : ''}${report.workDoneToday}%</td>
      <td style="padding:8px;border:1px solid #d1d5db;text-align:center">${report.pendingPoints}</td>
      <td style="padding:8px;border:1px solid #d1d5db;text-align:center">${report.missingPoints}</td>
      <td style="padding:8px;border:1px solid #d1d5db">${escapeHtml(report.deadlineAlerts.join('; ') || 'None')}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin-bottom:8px">Owner Daily Progress Report</h2>
      <p style="margin:4px 0"><strong>Date:</strong> ${escapeHtml(date)}</p>
      <p style="margin:4px 0"><strong>Total projects:</strong> ${totalProjects}</p>
      <p style="margin:4px 0 16px"><strong>Projects updated today:</strong> ${updatedReports.length}</p>
      ${updatedReports.length === 0 ? `
        <div style="padding:14px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px">
          <strong>No work done today.</strong> No project progress changed today.
        </div>
      ` : `
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px;border:1px solid #d1d5db;text-align:left">Project</th>
              <th style="padding:8px;border:1px solid #d1d5db;text-align:left">Type</th>
              <th style="padding:8px;border:1px solid #d1d5db">Previous</th>
              <th style="padding:8px;border:1px solid #d1d5db">Current</th>
              <th style="padding:8px;border:1px solid #d1d5db">Today</th>
              <th style="padding:8px;border:1px solid #d1d5db">Pending</th>
              <th style="padding:8px;border:1px solid #d1d5db">Missing</th>
              <th style="padding:8px;border:1px solid #d1d5db;text-align:left">Deadline alerts</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `}
    </div>
  `;
};

export const sendOwnerDailyProgressMail = async (now = new Date()): Promise<string> => {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) throw new Error('OWNER_EMAIL is not configured.');

  const { start, end } = getTodayRange(now);
  const [projects, checklistItems, activityLogs] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        rootPath: true,
        endDate: true,
        checklistStatuses: {
          select: {
            checklistItemId: true,
            preCertificationChecked: true,
            finalCertificationChecked: true,
            preCertificationStatus: true,
            finalCertificationStatus: true,
          },
        },
        tasks: {
          select: { title: true, status: true, dueDate: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.certificationChecklistItem.findMany({
      select: { id: true, checklistType: true, phase: true, points: true },
    }),
    prisma.activityLog.findMany({
      where: {
        moduleName: 'CHECKLIST REVIEW',
        createdAt: { gte: start, lt: end },
        projectId: { not: null },
      },
      select: {
        projectId: true,
        oldValue: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const itemsByType = new Map<ChecklistType, typeof checklistItems>([['NB', []], ['GH', []]]);
  checklistItems.forEach((item) => itemsByType.get(item.checklistType)?.push(item));

  const logsByProject = new Map<string, typeof activityLogs>();
  activityLogs.forEach((log) => {
    if (!log.projectId) return;
    const projectLogs = logsByProject.get(log.projectId) ?? [];
    projectLogs.push(log);
    logsByProject.set(log.projectId, projectLogs);
  });

  const reports: ProjectReport[] = projects.map((project) => {
    const type = getProjectType(project);
    const items = itemsByType.get(type) ?? [];
    const currentStates = new Map<string, ChecklistState>(
      project.checklistStatuses.map((status) => [status.checklistItemId, status]),
    );
    const previousStates = new Map(currentStates);
    const restoredItemIds = new Set<string>();

    (logsByProject.get(project.id) ?? []).forEach((log) => {
      const metadata = isRecord(log.metadata) ? log.metadata : {};
      const itemId = typeof metadata.itemId === 'string' ? metadata.itemId : null;
      if (!itemId || restoredItemIds.has(itemId)) return;
      previousStates.set(itemId, toChecklistState(log.oldValue) ?? {});
      restoredItemIds.add(itemId);
    });

    const currentProgress = getProgress(items, currentStates);
    const previousProgress = getProgress(items, previousStates);
    let pendingPoints = 0;
    let missingPoints = 0;

    items.forEach((item) => {
      const status = getRequirementStatus(currentStates.get(item.id), item.phase);
      const points = item.points > 0 ? item.points : 1;
      if (status === 'pending') pendingPoints += points;
      if (status === 'missing') missingPoints += points;
    });

    return {
      name: project.name,
      type,
      previousProgress,
      currentProgress,
      workDoneToday: currentProgress - previousProgress,
      pendingPoints,
      missingPoints,
      deadlineAlerts: getDeadlineAlerts(project.endDate, project.tasks, start),
    };
  });

  const reportDate = formatReportDate(now);
  const updatedCount = reports.filter((report) => report.workDoneToday !== 0).length;
  const subject = updatedCount > 0
    ? `Owner Daily Progress Report - ${reportDate}`
    : `No work done today - ${reportDate}`;

  return sendMail({
    to: ownerEmail,
    subject,
    text: buildText(reportDate, projects.length, reports),
    html: buildHtml(reportDate, projects.length, reports),
  });
};
