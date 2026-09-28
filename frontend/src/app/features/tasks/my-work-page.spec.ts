import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { pageOf, settle } from '../../core/api/api.testing';
import { storeSession, testUser } from '../../core/auth/auth.testing';
import { MyWorkPage } from './my-work-page';
import { testTaskItem } from './tasks.testing';

describe('MyWorkPage', () => {
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    sessionStorage.clear();
    storeSession(testUser('Staff'));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    page = TestBed.createComponent(MyWorkPage).nativeElement;
    await settle();
  });

  afterEach(() => http.verify());

  it('lists the user’s tasks with overdue ones marked', async () => {
    const request = http.expectOne((r) => r.url === '/api/tasks/mine');
    expect(request.request.params.get('pageSize')).toBe('25');
    request.flush(
      pageOf([
        testTaskItem({ id: 5, isOverdue: true, dueDate: '2026-09-21', casePriority: 'Urgent' }),
        testTaskItem({ caseStatus: 'OnHold' }),
      ]),
    );
    await settle();

    const rows = [...page.querySelectorAll('tr.mat-mdc-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].classList).toContain('row-overdue');
    expect(rows[0].textContent).toContain('Overdue');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/cases/20');
    expect(rows[1].textContent).toContain('On hold');
    expect(page.querySelector('.count')?.textContent?.trim()).toBe('2 active tasks · 1 overdue');
    // My Work has no claim buttons; the tasks are already the user's.
    expect(page.querySelector('tr.mat-mdc-row button')).toBeNull();
  });

  it('points to the queue when nothing is assigned', async () => {
    http.expectOne((r) => r.url === '/api/tasks/mine').flush(pageOf([]));
    await settle();

    expect(page.querySelector('.empty')?.textContent).toContain('Nothing is assigned to you right now.');
    expect(page.querySelector('.hint a')?.getAttribute('href')).toBe('/queue');
  });

  it('says when the tasks could not be loaded', async () => {
    http.expectOne((r) => r.url === '/api/tasks/mine').flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain("Your tasks couldn't be loaded.");
  });
});
