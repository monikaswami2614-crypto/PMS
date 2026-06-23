'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type DeadlineProjectType = 'NB' | 'GH';
export type ProjectSourceFilter = 'NB' | 'GREEN_HOMES' | null;

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: string;
  assigneeEmail?: string;
  managerName?: string;
  managerEmail?: string;
  projectType?: DeadlineProjectType;
  project: string;
  subtasks: SubTask[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarUrl: string;
  status: 'active' | 'away' | 'offline';
}

export interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  rootPath?: string | null;
  status?: string;
  checklistStage?: string;
  folderCount?: number;
  fileCount?: number;
}

interface ProjectContextType {
  projects: Project[];
  tasks: Task[];
  team: TeamMember[];
  selectedProject: string;
  setSelectedProject: (projectId: string) => void;
  sourceFilter: ProjectSourceFilter;
  setSourceFilter: (source: ProjectSourceFilter) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (task: Task) => void;
  deleteTask: (taskId: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  addTeamMember: (member: Omit<TeamMember, 'id' | 'avatarUrl' | 'status'> & { avatarUrl?: string }) => void;
  deleteTeamMember: (memberId: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const initialProjects: Project[] = [
  { id: 'all', name: 'All Projects', description: 'Overview of all active projects', category: 'All' },
];

const initialTeam: TeamMember[] = [];

const demoMemberEmails = new Set([
  'jane.c@company.com',
  'cody.f@company.com',
  'esther.h@company.com',
  'ronald.r@company.com',
  'guy.h@company.com',
]);

const initialTasks: Task[] = [
  {
    id: 't-1',
    title: 'Design Dashboard Layout Wireframes',
    description: 'Create beautiful mockups for the main dashboard interface. Ensure it feels modern, spacious, and displays all key analytics cleanly.',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-05-24',
    assigneeId: 'm5',
    project: 'alpha-portal',
    subtasks: [
      { id: 's-1-1', title: 'Research competitor dashboards', completed: true },
      { id: 's-1-2', title: 'Sketch initial grid system layout', completed: true },
      { id: 's-1-3', title: 'Export high-fidelity designs from Figma', completed: false },
    ],
  },
  {
    id: 't-2',
    title: 'Setup Database Connection Pooling',
    description: 'Implement database connection pools in serverless API routes to decrease latency during spike periods.',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-05-28',
    assigneeId: 'm2',
    project: 'quantum-db',
    subtasks: [
      { id: 's-2-1', title: 'Configure pool client timeouts', completed: false },
      { id: 's-2-2', title: 'Write integration test under load', completed: false },
    ],
  },
  {
    id: 't-3',
    title: 'Develop Landing Page Copy',
    description: 'Draft the messaging copy for the main Q3 campaign landing pages. Focused on features, pricing, and social proof.',
    status: 'review',
    priority: 'medium',
    dueDate: '2026-05-23',
    assigneeId: 'm1',
    project: 'marketing-q3',
    subtasks: [
      { id: 's-3-1', title: 'Write outline and hero hook', completed: true },
      { id: 's-3-2', title: 'Draft features section details', completed: true },
      { id: 's-3-3', title: 'Review with SEO team', completed: false },
    ],
  },
  {
    id: 't-4',
    title: 'Migrate State Management to Context API',
    description: 'Replace standard prop-drilling with a unified React Context provider for handling projects and task listings globally.',
    status: 'done',
    priority: 'medium',
    dueDate: '2026-05-20',
    assigneeId: 'm3',
    project: 'alpha-portal',
    subtasks: [
      { id: 's-4-1', title: 'Design Types and Interfaces', completed: true },
      { id: 's-4-2', title: 'Implement State Provider', completed: true },
      { id: 's-4-3', title: 'Refactor header and board selectors', completed: true },
    ],
  },
  {
    id: 't-5',
    title: 'Write API endpoint end-to-end tests',
    description: 'Cover all critical CRUD operations in the task routing system with Jest and Supertest.',
    status: 'todo',
    priority: 'low',
    dueDate: '2026-06-02',
    assigneeId: 'm4',
    project: 'quantum-db',
    subtasks: [
      { id: 's-5-1', title: 'Create mock environments', completed: false },
      { id: 's-5-2', title: 'Write status mutation assertions', completed: false },
    ],
  },
  {
    id: 't-6',
    title: 'Design Social Media Ad Set Templates',
    description: 'Create standard layouts in 1:1, 16:9, and 9:16 aspect ratios for LinkedIn and Twitter promotion campaigns.',
    status: 'done',
    priority: 'low',
    dueDate: '2026-05-18',
    assigneeId: 'm5',
    project: 'marketing-q3',
    subtasks: [
      { id: 's-6-1', title: 'Find high-quality background photos', completed: true },
      { id: 's-6-2', title: 'Render layout permutations', completed: true },
    ],
  },
];

export const getProjectSource = (project?: Pick<Project, 'name' | 'category' | 'rootPath'>): Exclude<ProjectSourceFilter, null> | null => {
  if (!project) return null;

  const searchableText = `${project.name ?? ''} ${project.category ?? ''} ${project.rootPath ?? ''}`.toLowerCase();

  if (searchableText.includes('green homes') || searchableText.includes('green_homes') || searchableText.includes('igbc gh')) {
    return 'GREEN_HOMES';
  }

  if (searchableText.includes('nb project') || searchableText.includes('nb projects') || searchableText.includes(' nb ')) {
    return 'NB';
  }

  return null;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projectsState, setProjectsState] = useState<Project[]>(initialProjects);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [team, setTeam] = useState<TeamMember[]>(initialTeam);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<ProjectSourceFilter>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Hydrate state from LocalStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Fetch projects from backend public API and merge with the 'All Projects' sentinel
      (async () => {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
          const res = await fetch(`${apiBase}/api/projects/public`);
          if (res.ok) {
            const json = await res.json();
            const remoteProjects: Project[] = (json.data || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description || '',
              category: p.category || '',
              rootPath: p.rootPath || null,
              status: p.status || '',
              checklistStage: p.checklistStage || '',
              folderCount: p.folderCount ?? 0,
              fileCount: p.fileCount ?? 0,
            }));
            setProjectsState([{ id: 'all', name: 'All Projects', description: 'Overview of all active projects', category: 'All' }, ...remoteProjects]);
          } else {
            console.warn('Failed to load projects from API:', res.status);
          }
        } catch (err) {
          console.warn('Error fetching projects:', err);
        }
      })();

      const storedTasks = localStorage.getItem('pms_tasks');
      const storedTeam = localStorage.getItem('pms_team');
      
      if (storedTasks) {
        try {
          setTasks(JSON.parse(storedTasks));
        } catch (e) {
          console.error('Failed to parse tasks from localStorage', e);
        }
      }
      
      if (storedTeam) {
        try {
          const parsedTeam = JSON.parse(storedTeam) as TeamMember[];
          setTeam(parsedTeam.filter((member) => !demoMemberEmails.has(member.email)));
        } catch (e) {
          console.error('Failed to parse team from localStorage', e);
        }
      }
      setIsLoaded(true);
    }
  }, []);

  // Save to LocalStorage on changes
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem('pms_tasks', JSON.stringify(tasks));
    }
  }, [tasks, isLoaded]);

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem('pms_team', JSON.stringify(team));
    }
  }, [team, isLoaded]);

  const addTask = (newTask: Omit<Task, 'id'>) => {
    const id = `t-${Date.now()}`;
    const taskWithId: Task = { ...newTask, id };
    setTasks((prev) => [...prev, taskWithId]);
  };

  const updateTask = (updatedTask: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t))
    );
  };

  const addTeamMember = (newMember: Omit<TeamMember, 'id' | 'avatarUrl' | 'status'> & { avatarUrl?: string }) => {
    const restoredProfiles = typeof window !== 'undefined' ? window.localStorage.getItem('pms_deleted_team_profiles') : null;
    let restoredId = '';

    if (restoredProfiles) {
      try {
        const profiles = JSON.parse(restoredProfiles) as TeamMember[];
        const restoredProfile = profiles.find((profile) => profile.email.toLowerCase() === newMember.email.toLowerCase());
        restoredId = restoredProfile?.id ?? '';
      } catch {
        window.localStorage.removeItem('pms_deleted_team_profiles');
      }
    }

    const id = restoredId || `m${Date.now()}`;
    // Random avatar selection from predefined list of avatars to keep layout gorgeous
    const avatarIds = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    ];
    const avatarUrl = newMember.avatarUrl?.trim() || avatarIds[Math.floor(Math.random() * avatarIds.length)];
    
    const member: TeamMember = {
      ...newMember,
      id,
      avatarUrl,
      status: 'active',
    };
    setTeam((prev) => [...prev, member]);
  };

  const deleteTeamMember = (memberId: string) => {
    setTeam((prev) => prev.filter((member) => member.id !== memberId));
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          const updatedSubtasks = task.subtasks.map((sub) =>
            sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub
          );
          return { ...task, subtasks: updatedSubtasks };
        }
        return task;
      })
    );
  };

  return (
    <ProjectContext.Provider
      value={{
        projects: projectsState,
        tasks,
        team,
        selectedProject,
        setSelectedProject,
        sourceFilter,
        setSourceFilter,
        addTask,
        updateTask,
        deleteTask,
        updateTaskStatus,
        addTeamMember,
        deleteTeamMember,
        toggleSubtask,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};
