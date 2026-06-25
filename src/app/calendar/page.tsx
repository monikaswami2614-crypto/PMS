'use client';

import React, { useMemo, useState } from 'react';
import { DeadlineProjectType, getProjectSource, Project, useProjects, Task, TaskPriority, TaskStatus } from '@/context/ProjectContext';
import { CalendarDays, ChevronLeft, ChevronRight, Layers, Mail, Plus, RefreshCw, Tag, Trash2, User, X } from 'lucide-react';
import { logClientActivity } from '@/utils/activityLog';
import styles from './page.module.css';

type DeadlineStatus = TaskStatus;
type SyncedCalendarTask = Task & {
  sheetSyncKey?: string;
  sheetProjectType?: string;
  sheetAssignedTo?: string;
  sheetDeadline?: string;
};

type SheetDeadlineRow = {
  date: string;
  projectType: string;
  projectName: string;
  assignedTo: string;
  assigneeEmail: string;
  status: TaskStatus;
  note: string;
  deadline: string;
  syncKey: string;
};

const GOOGLE_SHEET_SYNC_URL = '/api/google-sheet-calendar';
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';

const statusLabels: Record<DeadlineStatus, string> = {
  todo: 'New',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Completed',
};

const priorityLabels: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDateOnly = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const formatDisplayDate = (value: string) => {
  const date = parseDateOnly(value);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const parseSheetDate = (value: string): string | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const localMatch = trimmedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  let year: number;
  let month: number;
  let day: number;

  if (isoMatch) {
    [, year, month, day] = isoMatch.map(Number);
  } else if (localMatch) {
    [, day, month, year] = localMatch.map(Number);
  } else {
    const parsedDate = new Date(trimmedValue);
    if (Number.isNaN(parsedDate.getTime())) return null;
    return formatDateOnly(parsedDate);
  }

  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year
    || parsedDate.getMonth() !== month - 1
    || parsedDate.getDate() !== day
  ) {
    return null;
  }

  return formatDateOnly(parsedDate);
};

const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let insideQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (character === '"') {
      if (insideQuotes && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === ',' && !insideQuotes) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
};

const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const createSheetSyncKey = (date: string, projectType: string, projectName: string, assigneeEmail: string) => (
  [date, projectType, projectName, assigneeEmail].map(normalizeValue).join('|')
);

const mapSheetStatus = (value: string): TaskStatus => {
  const normalizedStatus = normalizeValue(value).replace(/[-\s]+/g, '_');

  if (['done', 'completed', 'complete', 'closed'].includes(normalizedStatus)) return 'done';
  if (['in_progress', 'progress', 'active', 'ongoing'].includes(normalizedStatus)) return 'in_progress';
  if (['review', 'in_review', 'pending_review'].includes(normalizedStatus)) return 'review';
  return 'todo';
};

const mapSheetProjectType = (value: string): DeadlineProjectType => {
  const normalizedType = normalizeValue(value);
  return normalizedType === 'gh' || normalizedType.includes('green home') ? 'GH' : 'NB';
};

const calculatePriority = (deadline: string): TaskPriority => {
  if (!deadline) return 'low';

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const deadlineOnly = parseDateOnly(deadline);
  const daysRemaining = Math.ceil((deadlineOnly.getTime() - todayOnly.getTime()) / 86400000);

  if (daysRemaining < 0) return 'critical';
  if (daysRemaining <= 3) return 'high';
  if (daysRemaining <= 10) return 'medium';
  return 'low';
};

const getProjectTypeFromProject = (project?: Project): DeadlineProjectType | '' => {
  const source = getProjectSource(project);
  if (source === 'NB') return 'NB';
  if (source === 'GREEN_HOMES') return 'GH';
  return '';
};

export default function CalendarPage() {
  const { tasks, selectedProject, projects, team, addTask, updateTask, deleteTask, sourceFilter } = useProjects();
  
  // Calendar navigations
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [projectType, setProjectType] = useState<DeadlineProjectType | ''>('');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [deadline, setDeadline] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetSyncMessage, setSheetSyncMessage] = useState('');
  const [sheetSyncError, setSheetSyncError] = useState('');

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const todayYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: todayYear - 2000 + 1 }, (_, index) => 2000 + index);

  // Get name of current month
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Filter tasks based on project
  const sourceByProjectId = new Map(projects.map((project) => [project.id, getProjectSource(project)]));
  const selectableProjects = projects.filter((project) => project.id !== 'all');
  const projectsByType = useMemo(() => selectableProjects.filter((project) => {
    if (!projectType) return false;
    return getProjectTypeFromProject(project) === projectType;
  }), [projectType, selectableProjects]);
  const selectedProjectRecord = selectableProjects.find((project) => project.id === projectId);
  const calculatedPriority = calculatePriority(deadline);
  const filteredTasks = tasks.filter((task) => {
    if (selectedProject !== 'all' && task.project !== selectedProject) return false;
    const syncedTask = task as SyncedCalendarTask;
    const taskSource = sourceByProjectId.get(task.project) || (
      syncedTask.sheetSyncKey
        ? (mapSheetProjectType(syncedTask.sheetProjectType || task.projectType || '') === 'GH' ? 'GREEN_HOMES' : 'NB')
        : null
    );
    if (sourceFilter && taskSource !== sourceFilter) return false;
    return true;
  });

  // Navigate months
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Generate calendar days
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);

  // Previous month days to pad beginning of grid
  const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonthIndex);
  
  const calendarCells = [];

  // Add padded days from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateStr = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarCells.push({ day, dateStr, isCurrentMonth: false, month: prevMonthIndex, year: prevYear });
  }

  // Add current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarCells.push({ day, dateStr, isCurrentMonth: true, month: currentMonth, year: currentYear });
  }

  // Add padded days from next month to make a complete 6-row grid (42 cells)
  const nextMonthIndex = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  const remainingCells = 42 - calendarCells.length;
  
  for (let day = 1; day <= remainingCells; day++) {
    const dateStr = `${nextYear}-${String(nextMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarCells.push({ day, dateStr, isCurrentMonth: false, month: nextMonthIndex, year: nextYear });
  }

  const handleTaskClick = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setSelectedTask(task);
    setIsDetailsOpen(true);
  };

  const handleCellClick = (dateStr: string) => {
    const defaultProject = selectedProject === 'all'
      ? selectableProjects[0]
      : selectableProjects.find((project) => project.id === selectedProject) || selectableProjects[0];
    const nextProjectType = getProjectTypeFromProject(defaultProject) || 'NB';
    const nextProject = selectableProjects.find((project) => getProjectTypeFromProject(project) === nextProjectType);
    const defaultAssignee = team[0];

    setSelectedTask(undefined);
    setProjectType(nextProjectType);
    setProjectId(nextProject?.id || '');
    setDescription('');
    setAssigneeId(defaultAssignee?.id || '');
    setStatus('todo');
    setDeadline(dateStr);
    setAssigneeEmail(defaultAssignee?.email || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(undefined);
    setFormError('');
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedTask(undefined);
  };

  const handleDeleteDeadline = () => {
    if (!selectedTask) return;

    deleteTask(selectedTask.id);
    void logClientActivity({
      actionType: 'Deadline deleted',
      moduleName: 'CALENDAR',
      projectId: selectedTask.project,
      projectName: selectedTask.title,
      description: `Deadline deleted for "${selectedTask.title}".`,
      oldValue: selectedTask,
    });
    handleCloseDetails();
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(new Date(currentYear, Number(event.target.value), 1));
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(new Date(Number(event.target.value), currentMonth, 1));
  };

  const handleProjectTypeChange = (nextProjectType: DeadlineProjectType) => {
    const nextProjects = selectableProjects.filter((project) => getProjectTypeFromProject(project) === nextProjectType);

    setProjectType(nextProjectType);
    setProjectId(nextProjects[0]?.id || '');
  };

  const handleAssigneeChange = (nextAssigneeId: string) => {
    const nextAssignee = team.find((member) => member.id === nextAssigneeId);

    setAssigneeId(nextAssigneeId);
    setAssigneeEmail(nextAssignee?.email || '');
  };

  const handleProjectDeadlineSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const projectName = selectedProjectRecord?.name?.trim() || '';
    const trimmedEmail = assigneeEmail.trim();

    if (!projectType) {
      setFormError('Please select project type.');
      return;
    }

    if (!projectId || !projectName) {
      setFormError('Please select project name.');
      return;
    }

    if (!deadline) {
      setFormError('Please select deadline.');
      return;
    }

    if (!trimmedEmail) {
      setFormError('Please enter assignee email.');
      return;
    }

    if (!emailPattern.test(trimmedEmail)) {
      setFormError('Please enter a valid assignee email.');
      return;
    }

    const projectDeadline = {
      title: projectName,
      description: description.trim() || 'Project deadline tracked from calendar.',
      status,
      priority: calculatedPriority,
      dueDate: deadline,
      assigneeId,
      assigneeEmail: trimmedEmail,
      projectType,
      project: projectId,
      subtasks: selectedTask?.subtasks || [],
    };

    setIsSubmitting(true);
    setFormError('');

    try {
      if (selectedTask) {
        updateTask({ ...selectedTask, ...projectDeadline });
        void logClientActivity({
          actionType: 'Deadline updated',
          moduleName: 'CALENDAR',
          projectId,
          projectName,
          description: `Deadline updated for "${projectName}".`,
          oldValue: selectedTask,
          newValue: projectDeadline,
        });
      } else {
        addTask(projectDeadline);
        void logClientActivity({
          actionType: 'Deadline created',
          moduleName: 'CALENDAR',
          projectId,
          projectName,
          description: `Deadline created for "${projectName}".`,
          newValue: projectDeadline,
        });
      }

      handleCloseModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Deadline was saved, but email could not be sent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSheetSync = async () => {
    setIsSyncingSheet(true);
    setSheetSyncMessage('');
    setSheetSyncError('');

    try {
      const response = await fetch(`${GOOGLE_SHEET_SYNC_URL}?cacheBust=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Google Sheet could not be loaded (${response.status}).`);
      }

      const rows = parseCsv(await response.text());
      const headers = (rows[0] || []).map((header) => normalizeValue(header));
      const requiredHeaders = ['date', 'project type', 'project name', 'assigned to', 'assignee email', 'status', 'note'];
      const headerIndexes = Object.fromEntries(requiredHeaders.map((header) => [header, headers.indexOf(header)]));
      const missingHeaders = requiredHeaders.filter((header) => headerIndexes[header] === -1);
      const deadlineHeaderIndex = headers.findIndex((header) => header === 'deadline' || header === 'deadline date');

      if (deadlineHeaderIndex === -1) missingHeaders.push('deadline');

      if (missingHeaders.length > 0) {
        throw new Error(`Missing Google Sheet columns: ${missingHeaders.join(', ')}.`);
      }

      const incomingRows = new Map<string, SheetDeadlineRow>();
      let skippedRows = 0;

      rows.slice(1).forEach((row) => {
        const date = parseSheetDate(row[headerIndexes.date] || '');
        const projectName = (row[headerIndexes['project name']] || '').trim();

        if (!date || !projectName) {
          skippedRows += 1;
          return;
        }

        const projectType = (row[headerIndexes['project type']] || '').trim();
        const assigneeEmail = (row[headerIndexes['assignee email']] || '').trim();
        const syncKey = createSheetSyncKey(date, projectType, projectName, assigneeEmail);

        incomingRows.set(syncKey, {
          date,
          projectType,
          projectName,
          assignedTo: (row[headerIndexes['assigned to']] || '').trim(),
          assigneeEmail,
          status: mapSheetStatus(row[headerIndexes.status] || ''),
          note: (row[headerIndexes.note] || '').trim(),
          deadline: parseSheetDate(row[deadlineHeaderIndex] || '') || '',
          syncKey,
        });
      });

      const existingByKey = new Map<string, SyncedCalendarTask>();
      (tasks as SyncedCalendarTask[]).forEach((task) => {
        const taskProjectType = task.sheetProjectType || task.projectType || '';
        const taskKey = task.sheetSyncKey || (
          task.assigneeEmail
            ? createSheetSyncKey(task.dueDate, taskProjectType, task.title, task.assigneeEmail)
            : ''
        );
        if (taskKey) existingByKey.set(taskKey, task);
      });

      let createdCount = 0;
      let updatedCount = 0;
      const employeeMailUpdates: Array<{
        employeeName: string;
        employeeEmail: string;
        projectName: string;
        projectType: string;
        deadline: string;
        statusMessage: string;
      }> = [];

      for (const sheetRow of incomingRows.values()) {
        const matchedProject = selectableProjects.find(
          (project) => normalizeValue(project.name) === normalizeValue(sheetRow.projectName),
        );
        const matchedAssignee = team.find(
          (member) => (
            sheetRow.assigneeEmail
              ? normalizeValue(member.email) === normalizeValue(sheetRow.assigneeEmail)
              : normalizeValue(member.name) === normalizeValue(sheetRow.assignedTo)
          ),
        );
        const existingTask = existingByKey.get(sheetRow.syncKey);
        const projectTypeValue = mapSheetProjectType(sheetRow.projectType);
        const syncedTask = {
          title: sheetRow.projectName,
          description: sheetRow.note,
          status: sheetRow.status,
          priority: calculatePriority(sheetRow.date),
          dueDate: sheetRow.date,
          assigneeId: matchedAssignee?.id || '',
          assigneeEmail: sheetRow.assigneeEmail,
          managerName: sheetRow.assignedTo,
          projectType: projectTypeValue,
          project: matchedProject?.id || `google-sheet:${normalizeValue(sheetRow.projectName)}`,
          subtasks: existingTask?.subtasks || [],
          sheetSyncKey: sheetRow.syncKey,
          sheetProjectType: sheetRow.projectType,
          sheetAssignedTo: sheetRow.assignedTo,
          sheetDeadline: sheetRow.deadline,
        };

        if (existingTask) {
          updateTask({ ...existingTask, ...syncedTask });
          updatedCount += 1;
        } else {
          addTask(syncedTask);
          createdCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 1));
        }

        if (sheetRow.assignedTo && emailPattern.test(sheetRow.assigneeEmail) && sheetRow.deadline) {
          employeeMailUpdates.push({
            employeeName: sheetRow.assignedTo,
            employeeEmail: sheetRow.assigneeEmail,
            projectName: sheetRow.projectName,
            projectType: sheetRow.projectType || projectTypeValue,
            deadline: formatDisplayDate(sheetRow.deadline),
            statusMessage: `${statusLabels[sheetRow.status]}${sheetRow.note ? ` - ${sheetRow.note}` : ''}`,
          });
        }
      }

      if (employeeMailUpdates.length > 0) {
        try {
          const mailResponse = await fetch(`${apiBase}/api/mail/calendar-updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: employeeMailUpdates }),
          });

          if (!mailResponse.ok && mailResponse.status !== 207) {
            const payload = await mailResponse.json().catch(() => null);
            console.warn('Employee calendar email sync failed:', payload?.error || mailResponse.statusText);
          }
        } catch (mailError) {
          console.warn('Employee calendar email sync failed:', mailError);
        }
      }

      const firstImportedRow = incomingRows.values().next().value as SheetDeadlineRow | undefined;
      if (firstImportedRow) setCurrentDate(parseDateOnly(firstImportedRow.date));

      const skippedMessage = skippedRows > 0 ? ` ${skippedRows} invalid row${skippedRows === 1 ? '' : 's'} skipped.` : '';
      setSheetSyncMessage(
        incomingRows.size === 0
          ? `No rows with a valid Date and Project Name were found.${skippedMessage}`
          : `Google Sheet synced: ${createdCount} created, ${updatedCount} updated.${skippedMessage}`,
      );
      void logClientActivity({
        actionType: 'Google Sheet calendar synced',
        moduleName: 'CALENDAR',
        description: `Google Sheet calendar sync completed: ${createdCount} deadline${createdCount === 1 ? '' : 's'} created, ${updatedCount} updated, and ${skippedRows} skipped.`,
        newValue: { createdCount, updatedCount, skippedRows, validRows: incomingRows.size },
        metadata: {
          source: 'Google Sheet',
          sheetId: '1uBQeUD1j3Jb6HXLrD87Y7vZ26ghjPS6DWHWYb5PKs6k',
        },
      });
    } catch (error) {
      setSheetSyncError(error instanceof Error ? error.message : 'Google Sheet sync failed.');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateStr === todayStr;
  };

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className={styles.container}>
      {/* Calendar Header with Controls */}
      <div className={`${styles.calendarHeader} glassmorphic`}>
        <div className={styles.dateSelectors}>
          <select
            className={styles.monthSelect}
            value={currentMonth}
            onChange={handleMonthChange}
            aria-label="Select month"
          >
            {monthNames.map((month, index) => (
              <option key={month} value={index}>{month}</option>
            ))}
          </select>

          <select
            className={styles.yearSelect}
            value={currentYear}
            onChange={handleYearChange}
            aria-label="Select year"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <div className={styles.controls}>
          <button
            className={styles.syncSheetBtn}
            onClick={handleGoogleSheetSync}
            disabled={isSyncingSheet}
          >
            <RefreshCw size={15} className={isSyncingSheet ? styles.spinning : ''} />
            {isSyncingSheet ? 'Syncing...' : 'Sync Google Sheet'}
          </button>
          <button className={styles.todayBtn} onClick={handleToday}>
            Today
          </button>
          <div className={styles.navGroup}>
            <button className={styles.navBtn} onClick={handlePrevMonth} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <button className={styles.navBtn} onClick={handleNextMonth} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {(sheetSyncMessage || sheetSyncError) && (
        <div className={sheetSyncError ? styles.syncError : styles.syncSuccess} role="status">
          {sheetSyncError || sheetSyncMessage}
        </div>
      )}

      {/* Weekday Labels */}
      <div className={styles.weeksGrid}>
        {daysOfWeek.map((day) => (
          <div key={day} className={styles.weekLabel}>
            {day}
          </div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className={`${styles.daysGrid} glassmorphic`}>
        {calendarCells.map(({ day, dateStr, isCurrentMonth }, idx) => {
          // Find tasks due on this date
          const cellTasks = filteredTasks.filter(t => t.dueDate === dateStr);
          const cellIsToday = isToday(dateStr);

          return (
            <div 
              key={idx} 
              className={`${styles.cell} ${!isCurrentMonth ? styles.paddedCell : ''} ${cellIsToday ? styles.todayCell : ''}`}
              onClick={() => handleCellClick(dateStr)}
            >
              {/* Day Header */}
              <div className={styles.cellHeader}>
                <span className={`${styles.dayNum} ${cellIsToday ? styles.todayNum : ''}`}>
                  {day}
                </span>
                {isCurrentMonth && (
                  <button 
                    className={styles.cellAddBtn} 
                    onClick={(e) => { e.stopPropagation(); handleCellClick(dateStr); }}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>

              {/* Due Tasks strips */}
              <div className={styles.cellTasks}>
                {cellTasks.slice(0, 3).map((task) => (
                  (() => {
                    const assignee = team.find((member) => member.id === task.assigneeId);
                    const syncedTask = task as SyncedCalendarTask;
                    const assigneeName = assignee?.name || syncedTask.sheetAssignedTo || task.managerName || 'Unassigned';
                    const taskPriority = task.status === 'done' ? 'done' : task.priority;

                    return (
                      <button
                        key={task.id}
                        className={`${styles.taskStrip} ${styles[taskPriority]}`}
                        onClick={(e) => handleTaskClick(e, task)}
                        title={`${task.title} - ${statusLabels[task.status]} - ${priorityLabels[task.priority]} - ${assigneeName}`}
                      >
                        <span className={styles.priorityDot} />
                        <span className={styles.taskTitle}>{task.title}</span>
                        <span className={styles.taskMeta}>
                          {statusLabels[task.status]} · {priorityLabels[task.priority]} · {assigneeName}
                        </span>
                      </button>
                    );
                  })()
                ))}
                {cellTasks.length > 3 && (
                  <div className={styles.moreTasks}>
                    +{cellTasks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Project deadline form */}
      {isModalOpen && (
        <div className={styles.deadlineOverlay} onClick={handleCloseModal}>
          <div className={`${styles.deadlineModal} glassmorphic animate-fade-in`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{selectedTask ? 'Edit Project Deadline' : 'Add Project Deadline'}</h2>
              <button type="button" className={styles.closeBtn} onClick={handleCloseModal} aria-label="Close form">
                <X size={20} />
              </button>
            </div>

            <form className={styles.deadlineForm} onSubmit={handleProjectDeadlineSubmit}>
              <div className={styles.formGrid}>
                <label className={styles.formGroup}>
                  <span><Layers size={14} />Project Type</span>
                  <select value={projectType} onChange={(event) => handleProjectTypeChange(event.target.value as DeadlineProjectType)} required>
                    <option value="">Select project type</option>
                    <option value="NB">NB</option>
                    <option value="GH">GH</option>
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><Tag size={14} />Project Name</span>
                  <select value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
                    <option value="">Select project name</option>
                    {projectsByType.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><CalendarDays size={14} />Deadline</span>
                  <input
                    type="date"
                    lang="en-GB"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    required
                  />
                </label>

                <label className={styles.formGroup}>
                  <span><User size={14} />Assign</span>
                  <select value={assigneeId} onChange={(event) => handleAssigneeChange(event.target.value)} required>
                    <option value="">Select assignee</option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
                    ))}
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><Mail size={14} />Assignee Email</span>
                  <input
                    type="email"
                    value={assigneeEmail}
                    onChange={(event) => setAssigneeEmail(event.target.value)}
                    placeholder="Enter assignee email"
                    required
                  />
                </label>

                <label className={styles.formGroup}>
                  <span><Tag size={14} />Status</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                    <option value="todo">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Completed</option>
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><Tag size={14} />Priority</span>
                  <input
                    className={`${styles.priorityField} ${styles[calculatedPriority]}`}
                    value={`${priorityLabels[calculatedPriority]} Priority`}
                    readOnly
                    aria-readonly="true"
                  />
                </label>
              </div>

              {formError && <div className={styles.formError}>{formError}</div>}

              <label className={`${styles.formGroup} ${styles.fullWidth}`}>
                <span>Project Notes</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add project notes or deadline details"
                />
              </label>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : selectedTask ? 'Save Deadline' : 'Add Deadline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDetailsOpen && selectedTask && (
        <div className={styles.deadlineOverlay} onClick={handleCloseDetails}>
          <div className={`${styles.deadlineModal} glassmorphic animate-fade-in`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Project Deadline Details</h2>
              <button type="button" className={styles.closeBtn} onClick={handleCloseDetails} aria-label="Close details">
                <X size={20} />
              </button>
            </div>

            <div className={styles.deadlineForm}>
              <div className={styles.detailsGrid}>
                <div className={styles.detailItem}>
                  <span><Layers size={14} />Project Type</span>
                  <strong>{(selectedTask as SyncedCalendarTask).sheetProjectType || selectedTask.projectType || getProjectTypeFromProject(selectableProjects.find((project) => project.id === selectedTask.project)) || '-'}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><Tag size={14} />Project Name</span>
                  <strong>{selectedTask.title}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span>
                    <CalendarDays size={14} />
                    {(selectedTask as SyncedCalendarTask).sheetSyncKey ? 'Event Date' : 'Deadline'}
                  </span>
                  <strong>{formatDisplayDate(selectedTask.dueDate)}</strong>
                </div>

                {(selectedTask as SyncedCalendarTask).sheetDeadline && (
                  <div className={styles.detailItem}>
                    <span><CalendarDays size={14} />Project Deadline</span>
                    <strong>{formatDisplayDate((selectedTask as SyncedCalendarTask).sheetDeadline || '')}</strong>
                  </div>
                )}

                <div className={styles.detailItem}>
                  <span><User size={14} />Assigned Person</span>
                  <strong>{team.find((member) => member.id === selectedTask.assigneeId)?.name || (selectedTask as SyncedCalendarTask).sheetAssignedTo || selectedTask.managerName || 'Unassigned'}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><Mail size={14} />Assignee Email</span>
                  <strong>{selectedTask.assigneeEmail || team.find((member) => member.id === selectedTask.assigneeId)?.email || '-'}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><Tag size={14} />Status</span>
                  <strong>{statusLabels[selectedTask.status]}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><Tag size={14} />Priority</span>
                  <strong className={`${styles.priorityBadge} ${styles[selectedTask.priority]}`}>{priorityLabels[selectedTask.priority]}</strong>
                </div>
              </div>

              <div className={`${styles.detailItem} ${styles.fullWidth}`}>
                <span>Project Notes</span>
                <p className={styles.detailNotes}>{selectedTask.description || 'No notes added.'}</p>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={handleCloseDetails}>Close</button>
                <button type="button" className={styles.deleteDeadlineBtn} onClick={handleDeleteDeadline}>
                  <Trash2 size={16} />
                  <span>Delete Deadline</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
