"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar, User, Tag, CheckSquare, Layers } from 'lucide-react';
import { useProjects, Task, TaskStatus, TaskPriority, SubTask } from '@/context/ProjectContext';
import styles from './TaskModal.module.css';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task;
  initialStatus?: TaskStatus;
  initialDueDate?: string;
}

const TaskFormModal: React.FC<TaskFormModalProps> = ({ isOpen, onClose, task, initialStatus, initialDueDate }) => {
  const { projects, team, addTask, updateTask, deleteTask, toggleSubtask } = useProjects();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [project, setProject] = useState('');
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate);
      setAssigneeId(task.assigneeId);
      setProject(task.project);
      setSubtasks(task.subtasks);
    } else {
      setTitle('');
      setDescription('');
      setStatus(initialStatus || 'todo');
      setPriority('medium');
      setDueDate(initialDueDate || new Date().toISOString().split('T')[0]);
      setAssigneeId(team[0]?.id || '');
      setProject(projects.find(p => p.id !== 'all')?.id || '');
      setSubtasks([]);
    }
  }, [task, isOpen, initialStatus, initialDueDate, team, projects]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const taskData = {
      title,
      description,
      status,
      priority,
      dueDate,
      assigneeId,
      project,
      subtasks,
    };

    if (task) {
      updateTask({ ...task, ...taskData });
    } else {
      addTask(taskData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (task && window.confirm('Are you sure you want to delete this task?')) {
      deleteTask(task.id);
      onClose();
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    const newSub: SubTask = {
      id: `s-${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };

    setSubtasks([...subtasks, newSub]);
    setNewSubtaskTitle('');
  };

  const handleDeleteSubtask = (subId: string) => {
    setSubtasks(subtasks.filter(sub => sub.id !== subId));
  };

  const handleToggleSubtaskLocal = (subId: string) => {
    if (task) {
      toggleSubtask(task.id, subId);
      setSubtasks(subtasks.map(s => s.id === subId ? { ...s, completed: !s.completed } : s));
    } else {
      setSubtasks(subtasks.map(s => s.id === subId ? { ...s, completed: !s.completed } : s));
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} glassmorphic animate-fade-in`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.modalTitle}>
            {task ? 'Edit Task Details' : 'Create New Project'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.content}>
            <div className={styles.leftCol}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Project Name</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add project name..." className={styles.input} required />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide additional details or notes..." className={styles.textarea} rows={4} />
              </div>

              <div className={styles.subtasksSection}>
                <label className={styles.label}><CheckSquare size={16} /><span>Project Checklist</span></label>
                <div className={styles.subtaskList}>
                  {subtasks.map((sub) => (
                    <div key={sub.id} className={styles.subtaskItem}>
                      <input type="checkbox" checked={sub.completed} onChange={() => handleToggleSubtaskLocal(sub.id)} className={styles.checkbox} />
                      <span className={`${styles.subtaskText} ${sub.completed ? styles.completed : ''}`}>{sub.title}</span>
                      <button type="button" onClick={() => handleDeleteSubtask(sub.id)} className={styles.deleteSubtaskBtn} aria-label="Delete subtask"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>

                <div className={styles.addSubtaskWrapper}>
                  <input type="text" value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} placeholder="Add checklist item..." className={styles.subtaskInput} />
                  <button type="button" onClick={handleAddSubtask} className={styles.addSubtaskBtn}><Plus size={16} /></button>
                </div>
              </div>
            </div>

            <div className={styles.rightCol}>
              <div className={styles.formGroup}>
                <label className={styles.label}><Layers size={14} /><span>Project</span></label>
                <select value={project} onChange={(e) => setProject(e.target.value)} className={styles.select} required>
                  {projects.filter(p => p.id !== 'all').map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}><User size={14} /><span>Assignee</span></label>
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={styles.select} required>
                  {team.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.role})</option>))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}><Tag size={14} /><span>Status</span></label>
                <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={styles.select}>
                  <option value="todo">Fresh Project</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done / Completed</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}><Tag size={14} /><span>Priority</span></label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={styles.select}>
                  <option value="high">🔴 High Priority</option>
                  <option value="medium">🟡 Medium Priority</option>
                  <option value="low">🔵 Low Priority</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}><Calendar size={14} /><span>Due Date</span></label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={styles.inputDate} required />
              </div>
            </div>
          </div>

          <div className={styles.footer}>
            {task && (<button type="button" onClick={handleDelete} className={styles.deleteBtn}><Trash2 size={16} /><span>Delete Task</span></button>)}
            <div className={styles.mainActions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
              <button type="submit" className={styles.submitBtn}>{task ? 'Save Changes' : 'Create Project'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskFormModal;
