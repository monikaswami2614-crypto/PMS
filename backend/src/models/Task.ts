export interface ITask {
  id: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  assigneeId?: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in-progress' | 'in-review' | 'done';
  startDate?: Date | null;
  dueDate: Date;
  estimatedHours: number;
  createdAt: Date;
  updatedAt: Date;
}
