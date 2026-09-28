import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';
import { Shell } from './layout/shell';

const planned = () => import('./features/status/status-pages').then((m) => m.PlannedPage);

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Dashboard', loadComponent: planned, data: { milestone: 'M11' } },
      { path: 'my-work', title: 'My work', loadComponent: planned, data: { milestone: 'M10' } },
      { path: 'queue', title: 'Department queue', loadComponent: planned, data: { milestone: 'M10' } },
      { path: 'cases', title: 'Case search', loadComponent: planned, data: { milestone: 'M9' } },
      { path: 'cases/new', title: 'New case', loadComponent: planned, data: { milestone: 'M9' } },
      { path: 'cases/:id', title: 'Case', loadComponent: planned, data: { milestone: 'M9' } },
      {
        path: 'audit',
        title: 'Audit log',
        canActivate: [roleGuard('Supervisor', 'Admin')],
        loadComponent: planned,
        data: { milestone: 'M12' },
      },
      {
        path: 'admin',
        canActivate: [roleGuard('Admin')],
        children: [
          { path: 'users', title: 'Users', loadComponent: planned, data: { milestone: 'M12' } },
          { path: 'departments', title: 'Departments', loadComponent: planned, data: { milestone: 'M12' } },
          { path: 'case-types', title: 'Case types', loadComponent: planned, data: { milestone: 'M12' } },
          { path: '', pathMatch: 'full', redirectTo: 'users' },
        ],
      },
      {
        path: 'forbidden',
        title: 'Access denied',
        loadComponent: () => import('./features/status/status-pages').then((m) => m.ForbiddenPage),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('./features/status/status-pages').then((m) => m.NotFoundPage),
      },
    ],
  },
];
