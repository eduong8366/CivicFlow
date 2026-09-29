import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { settle } from '../../core/api/api.testing';
import { DashboardSummary } from '../../core/api/dashboard.models';
import { UserRole } from '../../core/auth/auth.models';
import { storeSession, testUser } from '../../core/auth/auth.testing';
import { DashboardPage } from './dashboard-page';
import { testSummary } from './dashboard.testing';

describe('DashboardPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  async function render(role: UserRole, url = '/dashboard'): Promise<void> {
    // jsdom has no canvas; Chart.js then skips drawing, which is all these tests need.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    sessionStorage.clear();
    storeSession(testUser(role, role === 'Admin' ? { departmentId: null, departmentName: null } : {}));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'dashboard', component: DashboardPage }], withComponentInputBinding()),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    page = harness.routeNativeElement!;
    await settle();
  }

  const summaryRequest = () => http.expectOne((r) => r.url === '/api/dashboard/summary');

  async function load(summary: DashboardSummary): Promise<void> {
    summaryRequest().flush(summary);
    await settle();
  }

  const tile = (label: string) =>
    [...page.querySelectorAll('.kpi')].find((t) => t.querySelector('.kpi-label')?.textContent?.trim() === label);
  const panel = (heading: string) =>
    [...page.querySelectorAll('app-chart-panel')].find((p) => p.querySelector('h2')?.textContent?.trim() === heading);

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows a supervisor their department’s figures, linked to matching searches', async () => {
    await render('Supervisor');
    const request = summaryRequest();
    // The API picks the supervisor's own department.
    expect(request.request.params.keys()).toEqual([]);
    request.flush(testSummary());
    await settle();

    expect(page.querySelector('h1')?.textContent).toBe('Planning & Zoning dashboard');
    expect(page.querySelector('.as-of')?.textContent).toContain('Monday, September 28, 2026');
    expect(tile('Open cases')?.querySelector('.kpi-value')?.textContent).toBe('12');
    expect(tile('Overdue')?.querySelector('a')?.getAttribute('href')).toBe('/cases?departmentId=1&overdue=true');
    expect(tile('Waiting in the queue')?.querySelector('a')?.getAttribute('href')).toBe('/queue');
    expect(tile('Closed this month')?.querySelector('a')).toBeNull();

    // Each chart is named by a sentence and backed by a table of the same numbers.
    const status = panel('Cases by status')!;
    expect(status.querySelector('canvas')?.getAttribute('role')).toBe('img');
    expect(status.querySelector('canvas')?.getAttribute('aria-label')).toContain('in progress 9');
    expect(status.querySelector('summary')?.textContent).toBe('Show the numbers');
    const statusLink = [...status.querySelectorAll('tbody a')].find((a) => a.textContent === 'On hold');
    expect(statusLink?.getAttribute('href')).toBe('/cases?departmentId=1&status=OnHold');

    const workload = panel('Workload')!;
    expect(workload.querySelectorAll('.legend li')).toHaveLength(2);
    expect(workload.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(workload.querySelector('tbody td.overdue')?.textContent).toBe('1');
  });

  it('gives staff a personal dashboard without workload or case search links', async () => {
    await render('Staff');
    await load(testSummary({ scope: 'Personal', departmentId: null, departmentName: null, workload: null }));

    expect(page.querySelector('h1')?.textContent).toBe('My dashboard');
    expect(panel('Workload')).toBeUndefined();
    // Case search doesn't have a "mine" filter, so the counts wouldn't match.
    expect(tile('Overdue')?.querySelector('a')).toBeNull();
    expect(panel('Cases by status')?.querySelector('tbody a')).toBeNull();
    expect(tile('Waiting in the queue')?.querySelector('a')?.getAttribute('href')).toBe('/queue');
  });

  it('lets an admin narrow the agency dashboard to a department', async () => {
    await render('Admin', '/dashboard?department=3');
    http.expectOne('/api/departments').flush([{ id: 3, name: 'Public Works', code: 'PW', isActive: true }]);
    const request = summaryRequest();
    expect(request.request.params.get('departmentId')).toBe('3');
    request.flush(testSummary({ departmentId: 3, departmentName: 'Public Works' }));
    await settle();
    await settle();

    expect(page.querySelector('h1')?.textContent).toBe('Public Works dashboard');
    expect(tile('Waiting in the queue')?.querySelector('a')?.getAttribute('href')).toBe('/queue?department=3');
    expect(page.querySelector('mat-select')?.textContent).toContain('Public Works');
  });

  it('lists departments beside people on the agency dashboard', async () => {
    await render('Admin');
    http.expectOne('/api/departments').flush([]);
    await load(testSummary({ scope: 'Agency', departmentId: null, departmentName: null }));

    expect(page.querySelector('h1')?.textContent).toBe('Agency dashboard');
    expect(tile('Overdue')?.querySelector('a')?.getAttribute('href')).toBe('/cases?overdue=true');
    expect(tile('Waiting in queues')?.querySelector('a')?.getAttribute('href')).toBe('/queue');
    expect(panel('Workload')?.querySelector('thead')?.textContent).toContain('Department');
  });

  it('says so instead of drawing an empty chart', async () => {
    await render('Supervisor');
    await load(
      testSummary({
        cycleTimes: [],
        weeklyVolume: [{ weekStart: '2026-09-28', opened: 0, closed: 0 }],
      }),
    );

    expect(panel('Time to close, last 90 days')?.querySelector('.empty')?.textContent).toBe('No cases closed in the last 90 days.');
    expect(panel('Time to close, last 90 days')?.querySelector('canvas')).toBeNull();
    expect(panel('Cases opened and closed, by week')?.querySelector('.empty')).not.toBeNull();
  });

  it('explains an unknown department', async () => {
    await render('Admin', '/dashboard?department=99');
    http.expectOne('/api/departments').flush([]);
    summaryRequest().flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('That department doesn’t exist.');
    expect(page.querySelector('.kpis')).toBeNull();
  });
});
