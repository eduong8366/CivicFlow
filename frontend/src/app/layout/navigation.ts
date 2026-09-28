import { CurrentUser } from '../core/auth/auth.models';

export interface NavItem {
  label: string;
  path: string;
}

export interface NavSection {
  /** Sections after the first have a heading. */
  heading?: string;
  items: NavItem[];
}

/**
 * The sidebar for a user, following the permission matrix. Hiding a link is a convenience: the
 * routes are guarded and the API enforces every rule itself.
 */
export function navigationFor(user: CurrentUser): NavSection[] {
  const isAdmin = user.role === 'Admin';
  const work: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'My work', path: '/my-work' },
  ];

  // Admins see every department's queue; others see their own, if they have a department.
  if (isAdmin) {
    work.push({ label: 'Department queues', path: '/queue' });
  } else if (user.departmentId !== null) {
    work.push({ label: 'Department queue', path: '/queue' });
  }

  work.push({ label: 'Case search', path: '/cases' }, { label: 'New case', path: '/cases/new' });

  const sections: NavSection[] = [{ items: work }];
  if (isAdmin) {
    sections.push({
      heading: 'Administration',
      items: [
        { label: 'Users', path: '/admin/users' },
        { label: 'Departments', path: '/admin/departments' },
        { label: 'Case types', path: '/admin/case-types' },
        { label: 'Audit log', path: '/audit' },
      ],
    });
  } else if (user.role === 'Supervisor') {
    sections.push({ heading: 'Oversight', items: [{ label: 'Audit log', path: '/audit' }] });
  }

  return sections;
}
