import { HttpTestingController } from '@angular/common/http/testing';
import { AuditEntry } from '../../core/api/activity.models';
import { pageOf, settle } from '../../core/api/api.testing';
import { buttonIn, choose, renderPage, routesFor, submit } from '../admin/admin.testing';
import { AuditLogPage } from './audit-log-page';

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 900,
    timestamp: '2026-09-28T15:04:05+00:00',
    entityType: 'Department',
    entityId: '3',
    action: 'Updated',
    caseId: null,
    caseNumber: null,
    userId: 1,
    userName: 'Avery Admin',
    changes: { Name: { old: 'Public Works', new: 'Public Works & Utilities' } },
    ...overrides,
  };
}

describe('AuditLogPage', () => {
  let http: HttpTestingController;
  let page: HTMLElement;

  async function render(url: string, role: 'Admin' | 'Supervisor' = 'Admin'): Promise<void> {
    ({ http, page } = await renderPage(routesFor('audit', AuditLogPage), url, role));
    http.expectOne((r) => r.url === '/api/users').flush([
      { id: 1, fullName: 'Avery Admin', role: 'Admin', departmentId: null, departmentName: null, isActive: true },
      { id: 5, fullName: 'Mia Chen', role: 'Staff', departmentId: 1, departmentName: 'Planning & Zoning', isActive: false },
    ]);
  }

  const search = () => http.expectOne((r) => r.url === '/api/audit');
  const cells = (row: Element) => [...row.querySelectorAll('td')].slice(1, 4).map((td) => text(td));
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  afterEach(() => http.verify());

  it('shows entries with who, what and the values that changed', async () => {
    await render('/audit');
    const request = search();
    expect(request.request.params.get('pageSize')).toBe('25');
    request.flush(
      pageOf([
        entry(),
        entry({ id: 901, entityType: 'WorkflowTask', entityId: '44', action: 'PutOnHold', caseId: 20, caseNumber: 'BLD-2026-000020', userId: null, userName: null, changes: {} }),
      ]),
    );
    await settle();

    const [department, task] = page.querySelectorAll('tr.mat-mdc-row');
    expect(cells(department)).toEqual(['Avery Admin', 'Updated', 'Department #3']);
    expect(department.querySelector('a')?.getAttribute('href')).toBe('/audit?entityType=Department&entityId=3');
    expect(text(department.querySelector('dt'))).toBe('name');
    expect(text(department.querySelector('dd'))).toBe('Public Works → Public Works & Utilities');

    expect(cells(task)).toEqual(['System', 'Put on hold', 'Workflow step #44 on BLD-2026-000020']);
    expect(task.querySelector('a[href="/cases/20"]')).not.toBeNull();
    expect(text(task.querySelector('.changes'))).toBe('None recorded');
  });

  it('filters by the URL, and filtering navigates', async () => {
    await render('/audit?userId=5&from=2026-09-01');
    const first = search();
    expect(first.request.params.get('userId')).toBe('5');
    expect(first.request.params.get('from')).toBe('2026-09-01');
    first.flush(pageOf([]));
    await settle();

    expect(text(page.querySelector('.count'))).toBe('0 entries match these 2 filters');

    await choose(page.querySelectorAll<HTMLElement>('mat-select')[2], 'Claimed');
    submit(page.querySelector('form')!);
    await settle();
    const next = search();
    expect(next.request.params.get('action')).toBe('Claimed');
    expect(next.request.params.get('userId')).toBe('5');
    next.flush(pageOf([]));
    await settle();

    buttonIn(page, 'Clear filters')!.click();
    await settle();
    const cleared = search();
    expect(cleared.request.params.keys()).toEqual(['pageSize']);
    cleared.flush(pageOf([]));
    await settle();
  });

  it('shows one record’s history from a link, and can widen it', async () => {
    await render('/audit?entityType=Department&entityId=3');
    const request = search();
    expect(request.request.params.get('entityId')).toBe('3');
    request.flush(pageOf([entry()]));
    await settle();

    expect(text(page.querySelector('.record-filter'))).toContain('Showing the history of Department #3 only.');
    buttonIn(page, 'Show all records')!.click();
    await settle();
    const widened = search();
    expect(widened.request.params.get('entityType')).toBe('Department');
    expect(widened.request.params.has('entityId')).toBe(false);
    widened.flush(pageOf([]));
    await settle();
  });

  it('offers supervisors only the records of cases', async () => {
    await render('/audit', 'Supervisor');
    search().flush(pageOf([]));
    await settle();

    expect(text(page.querySelector('.lede'))).toContain('Changes to cases that involve your department.');
    page.querySelectorAll<HTMLElement>('.mat-mdc-select-trigger')[1].click();
    await settle();
    const options = [...document.querySelectorAll('mat-option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Any record', 'Case', 'Workflow step', 'Comment', 'Attachment', 'Case field value']);
  });
});
