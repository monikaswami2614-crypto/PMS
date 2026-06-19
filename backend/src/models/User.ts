export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;
  avatarUrl?: string | null;
  role: 'user' | 'manager' | 'admin';
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
