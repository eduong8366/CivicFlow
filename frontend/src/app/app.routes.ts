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
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'my-work',
        title: 'My work',
        loadComponent: () => import('./features/tasks/my-work-page').then((m) => m.MyWorkPage),
      },
      {
        path: 'queue',
        title: 'Department queue',
        loadComponent: () => import('./features/tasks/queue-page').then((m) => m.QueuePage),
      },
      {
        path: 'cases',
        title: 'Case search',
        loadComponent: () => import('./features/cases/case-search/case-search-page').then((m) => m.CaseSearchPage),
      },
      {
        path: 'cases/new',
        title: 'New case',
        loadComponent: () => import('./features/cases/new-case/new-case-page').then((m) => m.NewCasePage),
      },
      {
        // The page retitles itself with the case number once the case loads.
        path: 'cases/:id',
        title: 'Case',
        loadComponent: () => import('./features/cases/case-detail/case-detail-page').then((m) => m.CaseDetailPage),
      },
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
