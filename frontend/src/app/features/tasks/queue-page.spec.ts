import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { pageOf, settle } from '../../core/api/api.testing';
import { UserRole } from '../../core/auth/auth.models';
import { storeSession, testUser } from '../../core/auth/auth.testing';
import { testCase } from '../cases/case-detail/case-detail.testing';
import { QueuePage } from './queue-page';
import { testTaskItem } from './tasks.testing';

describe('QueuePage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  async function render(role: UserRole, url = '/queue'): Promise<void> {
    sessionStorage.clear();
    storeSession(testUser(role, role === 'Admin' ? { departmentId: null, departmentName: null } : {}));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'queue', component: QueuePage }], withComponentInputBinding()),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    page = harness.routeNativeElement!;
    await settle();
  }

  const button = (label: string) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const queueRequest = () => http.expectOne((r) => r.url === '/api/tasks/queue');

  afterEach(() => http.verify());

  it('shows staff their department’s queue, with claim but no assign', async () => {
    await render('Staff');
    const request = queueRequest();
    // The API picks the caller's own department.
    expect(request.request.params.has('departmentId')).toBe(false);
    request.flush(pageOf([testTaskItem({ isOverdue: true })]));
    await settle();

    expect(page.querySelector('h1')?.textContent).toBe('Planning & Zoning queue');
    expect(page.querySelector('.count')?.textContent?.trim()).toBe('1 unassigned task');
    expect(page.querySelector('tr.mat-mdc-row')?.classList).toContain('row-overdue');
    expect(button('Claim')?.getAttribute('aria-label')).toBe('Claim Plan Review on BLD-2026-000020');
    expect(button('Assign…')).toBeUndefined();
  });

  it('claims a task, refreshes the queue and links to the case', async () => {
    await render('Staff');
    queueRequest().flush(pageOf([testTaskItem()]));
    await settle();

    button('Claim')!.click();
    await settle();
    expect(button('Claiming…')?.disabled).toBe(true);
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/tasks/12/claim').flush(testCase());
    await settle();
    queueRequest().flush(pageOf([]));
    await settle();

    const notice = page.querySelector<HTMLElement>('.cf-alert--success')!;
    expect(notice.textContent).toContain("You claimed Plan Review on BLD-2026-000020. It's in My work.");
    expect(notice.querySelector('a')?.getAttribute('href')).toBe('/cases/20');
    expect(document.activeElement).toBe(notice);
    expect(page.querySelector('.empty')?.textContent).toContain('The queue is empty');
  });

  it('explains when someone else claimed the task first', async () => {
    await render('Staff');
    queueRequest().flush(pageOf([testTaskItem()]));
    await settle();

    button('Claim')!.click();
    await settle();
    http.expectOne('/api/tasks/12/claim').flush({ status: 409 }, { status: 409, statusText: 'Conflict' });
    await settle();
    queueRequest().flush(pageOf([]));
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('was taken or changed before your claim went through');
  });

  it('lets supervisors assign from the queue', async () => {
    await render('Supervisor');
    queueRequest().flush(pageOf([testTaskItem()]));
    await settle();

    button('Assign…')!.click();
    await settle();
    http.expectOne((r) => r.url === '/api/users').flush([
      { id: 8, fullName: 'Mia Chen', role: 'Staff', departmentId: 1, departmentName: 'Planning & Zoning', isActive: true },
    ]);
    await settle();

    const dialog = document.querySelector<HTMLElement>('mat-dialog-container')!;
    // An unassigned task has no "return to the queue" choice.
    dialog.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await settle();
    const options = [...document.querySelectorAll<HTMLElement>('mat-option')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Mia Chen']);
    options[0].click();
    await settle();
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();

    const post = http.expectOne('/api/tasks/12/assign');
    expect(post.request.body).toEqual({ assigneeId: 8 });
    const updated = testCase();
    post.flush({ ...updated, tasks: updated.tasks.map((t) => (t.id === 12 ? { ...t, assigneeId: 8, assigneeName: 'Mia Chen' } : t)) });
    await settle();
    queueRequest().flush(pageOf([]));
    await settle();

    expect(page.querySelector('.cf-alert--success')?.textContent).toContain('Plan Review on BLD-2026-000020 is assigned to Mia Chen.');
  });

  it('lets admins view one department’s queue or all of them', async () => {
    await render('Admin', '/queue?department=3');
    http.expectOne('/api/departments').flush([
      { id: 1, name: 'Planning & Zoning', code: 'PZ', isActive: true },
      { id: 3, name: 'Public Works', code: 'PW', isActive: true },
    ]);
    const request = queueRequest();
    expect(request.request.params.get('departmentId')).toBe('3');
    request.flush(pageOf([testTaskItem({ departmentId: 3, departmentName: 'Public Works' })]));
    await settle();

    expect(page.querySelector('h1')?.textContent).toBe('Public Works queue');
    expect(page.querySelector('th')?.parentElement?.textContent).not.toContain('Department');

    await harness.navigateByUrl('/queue');
    await settle();
    const all = queueRequest();
    expect(all.request.params.has('departmentId')).toBe(false);
    all.flush(pageOf([testTaskItem()]));
    await settle();

    expect(page.querySelector('h1')?.textContent).toBe('All department queues');
    // Across queues, each row says which department it's waiting in.
    expect(page.querySelector('tr.mat-mdc-header-row')?.textContent).toContain('Department');
  });

  it('says when the user has no queue', async () => {
    await render('Staff');
    queueRequest().flush({ detail: "You aren't in a department, so you have no queue." }, { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain("You aren't in a department");
  });
});
