import type { Role, UserStatus } from '@cold-storage/contracts';

export interface UserEntity {
  id: string;
  fullName: string;
  username: string;
  employeeId: string;
  mobile: string;
  email: string;
  role: Role;
  facilityIds: string[];
  status: UserStatus;
  passwordHash: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
