import { Entity } from '../common/entity';

export const ROLES = ['Admin', 'Doctor', 'Reception'] as const;
export type Role = (typeof ROLES)[number];

export interface User extends Entity {
  name: string;
  email: string;
  role: Role;
  /** Shown in the team list, e.g. "Admin · Lead doctor". */
  title: string;
  status: 'Active' | 'Invited';
  /** Absent for invited members who have not set a password yet. */
  passwordHash?: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;
