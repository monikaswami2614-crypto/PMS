export interface IProject {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  rootPath?: string | null;
  status: 'active' | 'archived' | 'completed';
  startDate: Date;
  endDate?: Date | null;
  ownerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
