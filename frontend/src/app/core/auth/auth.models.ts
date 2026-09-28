export type UserRole = 'Staff' | 'Supervisor' | 'Admin';

/** The signed-in user, as `GET /api/auth/me` returns them. */
export interface CurrentUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: number | null;
  departmentName: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  /** ISO 8601 instant. */
  expiresAt: string;
  user: CurrentUser;
}
