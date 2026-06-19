'use client';

import React from 'react';
import { Calendar, CheckSquare, MessageSquare } from 'lucide-react';
import { useProjects, Task } from '@/context/ProjectContext';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
  const { team, projects } = useProjects();

  const assignee = team.find((member) => member.id === task.assigneeId);
  const projectObj = projects.find((p) => p.id === task.project);

  // Compute subtask numbers
  const totalSubtasks = task.subtasks.length;
  const completedSubtasks = task.subtasks.filter((sub) => sub.completed).length;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Convert priority to style variables
  const getPriorityClass = () => {
    switch (task.priority) {
      case 'high':
        return styles.priorityHigh;
      case 'medium':
        return styles.priorityMedium;
      case 'low':
        return styles.priorityLow;
      default:
        return '';
    }
  };

  // Check if date is overdue
  const isOverdue = () => {
    if (task.status === 'done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateObj = new Date(task.dueDate);
    return dueDateObj < today;
  };

  return (
    <div
      className={`${styles.card} glassmorphic glow-on-hover`}
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      {/* Project details & Priority tag */}
      <div className={styles.header}>
        <span className={styles.projectTag}>{projectObj?.name || 'Task'}</span>
        <span className={`${styles.priorityBadge} ${getPriorityClass()}`}>
          {task.priority}
        </span>
      </div>

      {/* Title & Description */}
      <h4 className={styles.title}>{task.title}</h4>
      <p className={styles.description}>{task.description}</p>

      {/* Subtask progress bar */}
      {totalSubtasks > 0 && (
        <div className={styles.subtaskSection}>
          <div className={styles.subtaskHeader}>
            <div className={styles.subtaskIconText}>
              <CheckSquare size={13} />
              <span>Subtasks</span>
            </div>
            <span className={styles.subtaskProgressVal}>
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Divider */}
      <div className={styles.divider} />

      {/* Footer assignee & due date */}
      <div className={styles.footer}>
        {/* Assignee Avatar */}
        {assignee ? (
          <div className={styles.assignee}>
            <img
              src={assignee.avatarUrl}
              alt={assignee.name}
              title={`${assignee.name} (${assignee.role})`}
              className={styles.avatar}
            />
            <span className={styles.assigneeName}>{assignee.name.split(' ')[0]}</span>
          </div>
        ) : (
          <div className={styles.assigneeUnassigned}>Unassigned</div>
        )}

        {/* Due Date */}
        <div className={`${styles.dueDate} ${isOverdue() ? styles.overdue : ''}`}>
          <Calendar size={12} />
          <span>
            {new Date(task.dueDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
export default TaskCard;
