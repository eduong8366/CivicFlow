import { CurrentUser, LoginResponse, UserRole } from './auth.models';

export function testUser(role: UserRole = 'Staff', overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 7,
    email: 'pz.staff1@civicflow.test',
    fullName: 'Luis Ortega',
    role,
    departmentId: 1,
    departmentName: 'Planning & Zoning',
    ...overrides,
  };
}

export function loginResponse(user: CurrentUser = testUser(), minutes = 60): LoginResponse {
  return {
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    user,
  };
}

/** Puts a session in storage, as a previous sign-in would have left it. */
export function storeSession(user: CurrentUser = testUser(), minutes = 60): void {
  sessionStorage.setItem(
    'civicflow.session',
    JSON.stringify({ token: 'stored-token', expiresAt: Date.now() + minutes * 60_000, user }),
  );
}
