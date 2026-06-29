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

type ReportActivity = {
  employeeName: string;
  employeeEmail: string | null;
  action: string;
  module: string;
  description: string;
  occurredAt: string;
  previousData: string | null;
  currentData: string | null;
};

type TaskDeadline = {
  title: string;
  status: string;
  dueDate: string;
  assignee: string;
};

type ProjectReport = {
  name: string;
  type: ChecklistType;
  previousProgress: number;
  currentProgress: number;
  workDoneToday: number;
  totalRequirements: number;
  completedRequirements: number;
  pendingRequirements: number;
  missingRequirements: number;
  completedPoints: number;
  pendingPoints: number;
  missingPoints: number;
  completedData: string[];
  pendingData: string[];
  missingData: string[];
  projectDeadline: string;
  deadlineAlerts: string[];
  taskDeadlines: TaskDeadline[];
  employees: string[];
  activities: ReportActivity[];
  hasUpdates: boolean;
};

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const humanizeKey = (value: string): string => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const describeData = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    return value.map((item) => describeData(item)).join('; ');
  }
  if (!isRecord(value)) return String(value);

  const ignoredKeys = new Set(['createdAt', 'updatedAt', 'projectId', 'checklistItemId']);
  const entries = Object.entries(value).filter(([key]) => !ignoredKeys.has(key));
  if (entries.length === 0) return 'None';
  return entries
    .map(([key, item]) => `${humanizeKey(key)}: ${describeData(item)}`)
    .join(' | ');
};

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

const getTodayRange = (now: Date): { start: Date; end: Date } => {
  const dateKey = getDateKey(now);
  const start = new Date(`${dateKey}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
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

const formatActivityTime = (date: Date): string => new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
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

const isMeaningfulProjectUpdate = (actionType: string): boolean => (
  !/(?:viewed|opened|user login|user logout|mail sent|email notification)/i.test(actionType)
);

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

const renderDataList = (title: string, items: string[]): string => `
  <div style="margin-top:12px">
    <strong>${escapeHtml(title)} (${items.length})</strong>
    ${items.length === 0
      ? '<span style="color:#64748b">: None</span>'
      : `<ul style="margin:6px 0 0;padding-left:20px">${items
        .map((item) => `<li style="margin:2px 0">${escapeHtml(item)}</li>`)
        .join('')}</ul>`}
  </div>
`;

const buildText = (date: string, totalProjects: number, reports: ProjectReport[]): string => {
  const updatedReports = reports.filter((report) => report.hasUpdates);
  const lines = [
    'Owner Project Update Report',
    `Date: ${date}`,
    `Total projects: ${totalProjects}`,
    `Projects updated today: ${updatedReports.length}`,
    '',
  ];

  if (updatedReports.length === 0) {
    lines.push('No project updates were recorded today.');
    return lines.join('\n');
  }

  updatedReports.forEach((report, index) => {
    lines.push(
      `${index + 1}. ${report.name}`,
      `Project type: ${report.type}`,
      `Employee(s): ${report.employees.join(', ') || 'System / unknown user'}`,
      `Previous completion: ${report.previousProgress}%`,
      `Current completion: ${report.currentProgress}%`,
      `Completion change: ${report.workDoneToday > 0 ? '+' : ''}${report.workDoneToday}%`,
      `Completed data: ${report.completedRequirements}/${report.totalRequirements} (${report.completedPoints} points)`,
      `Pending data: ${report.pendingRequirements}/${report.totalRequirements} (${report.pendingPoints} points)`,
      `Missing data: ${report.missingRequirements}/${report.totalRequirements} (${report.missingPoints} points)`,
      `Project deadline: ${report.projectDeadline}`,
      `Deadline alerts: ${report.deadlineAlerts.join('; ') || 'None'}`,
      '',
      'Changes:',
    );

    report.activities.forEach((activity) => {
      lines.push(
        `- ${activity.occurredAt} | ${activity.employeeName} | ${activity.action}`,
        `  ${activity.description}`,
      );
      if (activity.previousData) lines.push(`  Previous: ${activity.previousData}`);
      if (activity.currentData) lines.push(`  Current: ${activity.currentData}`);
    });

    if (report.taskDeadlines.length > 0) {
      lines.push('', 'Open task deadlines:');
      report.taskDeadlines.forEach((task) => {
        lines.push(`- ${task.title}: ${task.dueDate} | ${task.status} | ${task.assignee}`);
      });
    }

    lines.push(
      '',
      `Completed items: ${report.completedData.join('; ') || 'None'}`,
      `Pending items: ${report.pendingData.join('; ') || 'None'}`,
      `Missing items: ${report.missingData.join('; ') || 'None'}`,
      '',
    );
  });

  return lines.join('\n');
};

const buildHtml = (date: string, totalProjects: number, reports: ProjectReport[]): string => {
  const updatedReports = reports.filter((report) => report.hasUpdates);
  const projectCards = updatedReports.map((report) => {
    const activityRows = report.activities.map((activity) => `
      <tr>
        <td style="padding:8px;border:1px solid #dbe3ee;vertical-align:top;white-space:nowrap">${escapeHtml(activity.occurredAt)}</td>
        <td style="padding:8px;border:1px solid #dbe3ee;vertical-align:top">
          <strong>${escapeHtml(activity.employeeName)}</strong>
          ${activity.employeeEmail ? `<br><span style="color:#64748b">${escapeHtml(activity.employeeEmail)}</span>` : ''}
        </td>
        <td style="padding:8px;border:1px solid #dbe3ee;vertical-align:top">
          <strong>${escapeHtml(activity.action)}</strong>
          <div style="color:#64748b;font-size:12px">${escapeHtml(activity.module)}</div>
        </td>
        <td style="padding:8px;border:1px solid #dbe3ee;vertical-align:top">
          ${escapeHtml(activity.description)}
          ${activity.previousData ? `<div style="margin-top:5px"><strong>Previous:</strong> ${escapeHtml(activity.previousData)}</div>` : ''}
          ${activity.currentData ? `<div style="margin-top:3px"><strong>Current:</strong> ${escapeHtml(activity.currentData)}</div>` : ''}
        </td>
      </tr>
    `).join('');

    const taskRows = report.taskDeadlines.map((task) => `
      <tr>
        <td style="padding:7px;border:1px solid #dbe3ee">${escapeHtml(task.title)}</td>
        <td style="padding:7px;border:1px solid #dbe3ee">${escapeHtml(task.status)}</td>
        <td style="padding:7px;border:1px solid #dbe3ee">${escapeHtml(task.dueDate)}</td>
        <td style="padding:7px;border:1px solid #dbe3ee">${escapeHtml(task.assignee)}</td>
      </tr>
    `).join('');

    return `
      <section style="margin:0 0 22px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden">
        <div style="padding:14px 16px;background:#eef2ff;border-bottom:1px solid #cbd5e1">
          <h3 style="margin:0 0 4px;color:#1e293b">${escapeHtml(report.name)}</h3>
          <div style="color:#475569">
            <strong>Type:</strong> ${report.type}
            &nbsp; | &nbsp;
            <strong>Employee(s):</strong> ${escapeHtml(report.employees.join(', ') || 'System / unknown user')}
            &nbsp; | &nbsp;
            <strong>Deadline:</strong> ${escapeHtml(report.projectDeadline)}
          </div>
        </div>
        <div style="padding:16px">
          <table style="border-collapse:collapse;width:100%;font-size:13px;text-align:center">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:8px;border:1px solid #dbe3ee">Previous completion</th>
                <th style="padding:8px;border:1px solid #dbe3ee">Current completion</th>
                <th style="padding:8px;border:1px solid #dbe3ee">Change</th>
                <th style="padding:8px;border:1px solid #dbe3ee">Completed</th>
                <th style="padding:8px;border:1px solid #dbe3ee">Pending</th>
                <th style="padding:8px;border:1px solid #dbe3ee">Missing</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:10px;border:1px solid #dbe3ee">${report.previousProgress}%</td>
                <td style="padding:10px;border:1px solid #dbe3ee"><strong>${report.currentProgress}%</strong></td>
                <td style="padding:10px;border:1px solid #dbe3ee">${report.workDoneToday > 0 ? '+' : ''}${report.workDoneToday}%</td>
                <td style="padding:10px;border:1px solid #dbe3ee">${report.completedRequirements}/${report.totalRequirements}<br>${report.completedPoints} points</td>
                <td style="padding:10px;border:1px solid #dbe3ee">${report.pendingRequirements}/${report.totalRequirements}<br>${report.pendingPoints} points</td>
                <td style="padding:10px;border:1px solid #dbe3ee">${report.missingRequirements}/${report.totalRequirements}<br>${report.missingPoints} points</td>
              </tr>
            </tbody>
          </table>

          <p style="margin:14px 0 6px"><strong>Deadline alerts:</strong> ${escapeHtml(report.deadlineAlerts.join('; ') || 'None')}</p>

          <h4 style="margin:18px 0 8px">Changes made today</h4>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:8px;border:1px solid #dbe3ee;text-align:left">Time</th>
                <th style="padding:8px;border:1px solid #dbe3ee;text-align:left">Employee</th>
                <th style="padding:8px;border:1px solid #dbe3ee;text-align:left">Action</th>
                <th style="padding:8px;border:1px solid #dbe3ee;text-align:left">Details</th>
              </tr>
            </thead>
            <tbody>${activityRows}</tbody>
          </table>

          ${report.taskDeadlines.length > 0 ? `
            <h4 style="margin:18px 0 8px">Open task deadlines</h4>
            <table style="border-collapse:collapse;width:100%;font-size:13px">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:7px;border:1px solid #dbe3ee;text-align:left">Task</th>
                  <th style="padding:7px;border:1px solid #dbe3ee;text-align:left">Status</th>
                  <th style="padding:7px;border:1px solid #dbe3ee;text-align:left">Deadline</th>
                  <th style="padding:7px;border:1px solid #dbe3ee;text-align:left">Employee</th>
                </tr>
              </thead>
              <tbody>${taskRows}</tbody>
            </table>
          ` : ''}

          ${renderDataList('Completed data', report.completedData)}
          ${renderDataList('Pending data', report.pendingData)}
          ${renderDataList('Missing data', report.missingData)}
        </div>
      </section>
    `;
  }).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:1100px;margin:auto">
      <h2 style="margin-bottom:8px">Owner Project Update Report</h2>
      <p style="margin:4px 0"><strong>Date:</strong> ${escapeHtml(date)}</p>
      <p style="margin:4px 0"><strong>Total projects:</strong> ${totalProjects}</p>
      <p style="margin:4px 0 18px"><strong>Projects updated today:</strong> ${updatedReports.length}</p>
      ${updatedReports.length === 0 ? `
        <div style="padding:14px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px">
          <strong>No project updates were recorded today.</strong>
        </div>
      ` : projectCards}
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
          select: {
            title: true,
            status: true,
            dueDate: true,
            assignee: { select: { name: true, email: true } },
          },
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.certificationChecklistItem.findMany({
      select: {
        id: true,
        checklistType: true,
        phase: true,
        points: true,
        creditCode: true,
        requirementName: true,
        documentName: true,
      },
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        projectId: { not: null },
      },
      select: {
        projectId: true,
        userName: true,
        userEmail: true,
        actionType: true,
        moduleName: true,
        description: true,
        oldValue: true,
        newValue: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const itemsByType = new Map<ChecklistType, typeof checklistItems>([['NB', []], ['GH', []]]);
  checklistItems.forEach((item) => itemsByType.get(item.checklistType)?.push(item));

  const meaningfulLogs = activityLogs.filter((log) => isMeaningfulProjectUpdate(log.actionType));
  const logsByProject = new Map<string, typeof meaningfulLogs>();
  meaningfulLogs.forEach((log) => {
    if (!log.projectId) return;
    const projectLogs = logsByProject.get(log.projectId) ?? [];
    projectLogs.push(log);
    logsByProject.set(log.projectId, projectLogs);
  });

  const reports: ProjectReport[] = projects.map((project) => {
    const type = getProjectType(project);
    const items = itemsByType.get(type) ?? [];
    const projectLogs = logsByProject.get(project.id) ?? [];
    const currentStates = new Map<string, ChecklistState>(
      project.checklistStatuses.map((status) => [status.checklistItemId, status]),
    );
    const previousStates = new Map(currentStates);
    const restoredItemIds = new Set<string>();

    projectLogs.forEach((log) => {
      const metadata = isRecord(log.metadata) ? log.metadata : {};
      const oldValue = isRecord(log.oldValue) ? log.oldValue : {};
      const newValue = isRecord(log.newValue) ? log.newValue : {};
      const itemId = typeof metadata.itemId === 'string'
        ? metadata.itemId
        : typeof oldValue.requirementId === 'string'
          ? oldValue.requirementId
          : typeof newValue.requirementId === 'string'
            ? newValue.requirementId
            : null;
      const previousState = toChecklistState(log.oldValue);
      if (!itemId || restoredItemIds.has(itemId) || !previousState) return;
      previousStates.set(itemId, previousState);
      restoredItemIds.add(itemId);
    });

    const currentProgress = getProgress(items, currentStates);
    const previousProgress = getProgress(items, previousStates);
    const completedData: string[] = [];
    const pendingData: string[] = [];
    const missingData: string[] = [];
    let completedPoints = 0;
    let pendingPoints = 0;
    let missingPoints = 0;

    items.forEach((item) => {
      const status = getRequirementStatus(currentStates.get(item.id), item.phase);
      const points = item.points > 0 ? item.points : 1;
      const label = `${item.creditCode}: ${item.requirementName || item.documentName}`;
      if (status === 'completed') {
        completedPoints += points;
        completedData.push(label);
      }
      if (status === 'pending') {
        pendingPoints += points;
        pendingData.push(label);
      }
      if (status === 'missing') {
        missingPoints += points;
        missingData.push(label);
      }
    });

    const displayLogs = projectLogs.filter((log) => {
      if (log.userName || log.userEmail) return true;
      const normalizedModule = log.moduleName.replace(/[^a-z]/gi, '').toLowerCase();
      return !projectLogs.some((candidate) => (
        Boolean(candidate.userName || candidate.userEmail)
        && candidate.moduleName.replace(/[^a-z]/gi, '').toLowerCase() === normalizedModule
        && Math.abs(candidate.createdAt.getTime() - log.createdAt.getTime()) < 10_000
      ));
    });

    const activities: ReportActivity[] = displayLogs.map((log) => ({
      employeeName: log.userName || log.userEmail || 'System / unknown user',
      employeeEmail: log.userEmail,
      action: log.actionType,
      module: humanizeKey(log.moduleName),
      description: log.description,
      occurredAt: formatActivityTime(log.createdAt),
      previousData: log.oldValue === null ? null : describeData(log.oldValue),
      currentData: log.newValue === null ? null : describeData(log.newValue),
    }));

    const employees = Array.from(new Set(activities
      .filter((activity) => activity.employeeName !== 'System / unknown user')
      .map((activity) => activity.employeeName)));
    const openTasks = project.tasks.filter(
      (task) => !['done', 'completed', 'complete'].includes(task.status.toLowerCase()),
    );

    return {
      name: project.name,
      type,
      previousProgress,
      currentProgress,
      workDoneToday: currentProgress - previousProgress,
      totalRequirements: items.length,
      completedRequirements: completedData.length,
      pendingRequirements: pendingData.length,
      missingRequirements: missingData.length,
      completedPoints,
      pendingPoints,
      missingPoints,
      completedData,
      pendingData,
      missingData,
      projectDeadline: project.endDate ? formatDeadlineDate(project.endDate) : 'Not set',
      deadlineAlerts: getDeadlineAlerts(project.endDate, project.tasks, start),
      taskDeadlines: openTasks.map((task) => ({
        title: task.title,
        status: task.status,
        dueDate: formatDeadlineDate(task.dueDate),
        assignee: task.assignee?.name || task.assignee?.email || 'Unassigned',
      })),
      employees,
      activities,
      hasUpdates: projectLogs.length > 0 || currentProgress !== previousProgress,
    };
  });

  const reportDate = formatReportDate(now);
  const updatedCount = reports.filter((report) => report.hasUpdates).length;
  const subject = updatedCount > 0
    ? `Owner Project Update Report - ${updatedCount} project${updatedCount === 1 ? '' : 's'} updated - ${reportDate}`
    : `No project updates - ${reportDate}`;

  return sendMail({
    to: ownerEmail,
    subject,
    text: buildText(reportDate, projects.length, reports),
    html: buildHtml(reportDate, projects.length, reports),
  });
};
