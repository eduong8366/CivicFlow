import { CurrentUser, UserRole } from '../core/auth/auth.models';
import { navigationFor } from './navigation';

function user(role: UserRole, departmentId: number | null = 1): CurrentUser {
  return { id: 1, email: 'x@civicflow.test', fullName: 'X', role, departmentId, departmentName: departmentId ? 'PZ' : null };
}

const labels = (u: CurrentUser) => navigationFor(u).flatMap((s) => s.items.map((i) => i.label));
const headings = (u: CurrentUser) => navigationFor(u).map((s) => s.heading).filter(Boolean);

describe('navigationFor', () => {
  it('gives staff their work and no oversight', () => {
    expect(labels(user('Staff'))).toEqual(['Dashboard', 'My work', 'Department queue', 'Case search', 'New case']);
    expect(headings(user('Staff'))).toEqual([]);
  });

  it('gives supervisors the audit log', () => {
    expect(headings(user('Supervisor'))).toEqual(['Oversight']);
    expect(labels(user('Supervisor'))).toContain('Audit log');
    expect(labels(user('Supervisor'))).not.toContain('Users');
  });

  it('gives admins every queue and the administration pages', () => {
    const admin = user('Admin', null);

    expect(labels(admin)).toContain('Department queues');
    expect(headings(admin)).toEqual(['Administration']);
    expect(labels(admin)).toEqual(expect.arrayContaining(['Users', 'Departments', 'Case types', 'Audit log']));
  });

  it('leaves out the queue for someone without a department', () => {
    expect(labels(user('Staff', null))).not.toContain('Department queue');
  });
});
