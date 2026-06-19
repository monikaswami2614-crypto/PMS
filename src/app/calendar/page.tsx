'use client';

import React, { useState } from 'react';
import { getProjectSource, useProjects, Task, TaskPriority, TaskStatus } from '@/context/ProjectContext';
import { CalendarDays, ChevronLeft, ChevronRight, Layers, Plus, Tag, User, X } from 'lucide-react';
import styles from './page.module.css';

export default function CalendarPage() {
  const { tasks, selectedProject, projects, team, addTask, updateTask, sourceFilter } = useProjects();
  
  // Calendar navigations
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [deadline, setDeadline] = useState('');

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
    setProjectId(task.project);
    setProjectName(task.title);
    setDescription(task.description);
    setAssigneeId(task.assigneeId);
    setStatus(task.status);
    setPriority(task.priority);
    setDeadline(task.dueDate);
    setIsModalOpen(true);
  };

  const handleCellClick = (dateStr: string) => {
    setSelectedTask(undefined);
    setProjectId(selectedProject === 'all' ? projects.find((project) => project.id !== 'all')?.id || '' : selectedProject);
    setProjectName('');
    setDescription('');
    setAssigneeId(team[0]?.id || '');
    setStatus('todo');
    setPriority('medium');
    setDeadline(dateStr);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(undefined);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(new Date(currentYear, Number(event.target.value), 1));
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(new Date(Number(event.target.value), currentMonth, 1));
  };

  const handleProjectDeadlineSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId || !projectName.trim() || !deadline || !assigneeId) return;

    const projectDeadline = {
      title: projectName.trim(),
      description: description.trim() || 'Project deadline tracked from calendar.',
      status,
      priority,
      dueDate: deadline,
      assigneeId,
      project: projectId,
      subtasks: selectedTask?.subtasks || [],
    };

    if (selectedTask) {
      updateTask({ ...selectedTask, ...projectDeadline });
    } else {
      addTask(projectDeadline);
    }

    handleCloseModal();
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
                  <button 
                    key={task.id}
                    className={`${styles.taskStrip} ${styles[task.priority]}`}
                    onClick={(e) => handleTaskClick(e, task)}
                    title={task.title}
                  >
                    <span className={styles.priorityDot} />
                    <span className={styles.taskTitle}>{task.title}</span>
                  </button>
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
                  <span><Layers size={14} />Project</span>
                  <select value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
                    {projects.filter(project => project.id !== 'all').map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><Tag size={14} />Project Name</span>
                  <input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="Enter project name"
                    required
                  />
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
                  <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
                    ))}
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><Tag size={14} />Status</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                    <option value="todo">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">100% Done</option>
                  </select>
                </label>

                <label className={styles.formGroup}>
                  <span><Tag size={14} />Priority</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </label>
              </div>

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
                <button type="submit" className={styles.submitBtn}>
                  {selectedTask ? 'Save Deadline' : 'Add Deadline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
