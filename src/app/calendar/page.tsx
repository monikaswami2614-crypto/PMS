'use client';

import React, { useMemo, useState } from 'react';
import { DeadlineProjectType, getProjectSource, Project, useProjects, Task, TaskPriority, TaskStatus } from '@/context/ProjectContext';
import { CalendarDays, ChevronLeft, ChevronRight, Layers, Mail, Plus, Tag, Trash2, User, X } from 'lucide-react';
import styles from './page.module.css';

type DeadlineStatus = TaskStatus;

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

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
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
    if (sourceFilter && sourceByProjectId.get(task.project) !== sourceFilter) return false;
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
      } else {
        addTask(projectDeadline);
      }

      handleCloseModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Deadline was saved, but email could not be sent.');
    } finally {
      setIsSubmitting(false);
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
                    const taskPriority = task.status === 'done' ? 'done' : task.priority;

                    return (
                      <button
                        key={task.id}
                        className={`${styles.taskStrip} ${styles[taskPriority]}`}
                        onClick={(e) => handleTaskClick(e, task)}
                        title={`${task.title} - ${statusLabels[task.status]} - ${priorityLabels[task.priority]} - ${assignee?.name || 'Unassigned'}`}
                      >
                        <span className={styles.priorityDot} />
                        <span className={styles.taskTitle}>{task.title}</span>
                        <span className={styles.taskMeta}>
                          {statusLabels[task.status]} · {priorityLabels[task.priority]} · {assignee?.name || 'Unassigned'}
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
                  <strong>{selectedTask.projectType || getProjectTypeFromProject(selectableProjects.find((project) => project.id === selectedTask.project)) || '-'}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><Tag size={14} />Project Name</span>
                  <strong>{selectedTask.title}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><CalendarDays size={14} />Deadline</span>
                  <strong>{selectedTask.dueDate}</strong>
                </div>

                <div className={styles.detailItem}>
                  <span><User size={14} />Assigned Person</span>
                  <strong>{team.find((member) => member.id === selectedTask.assigneeId)?.name || 'Unassigned'}</strong>
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
