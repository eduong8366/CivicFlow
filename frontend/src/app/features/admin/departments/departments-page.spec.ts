import { HttpTestingController } from '@angular/common/http/testing';
import { settle } from '../../../core/api/api.testing';
import { buttonIn, dialog, renderPage, routesFor, submit, testAdminDepartment, type } from '../admin.testing';
import { departmentBlockers } from './department-dialog';
import { DepartmentsPage } from './departments-page';

describe('DepartmentsPage', () => {
  let http: HttpTestingController;
  let page: HTMLElement;

  async function render(): Promise<void> {
    ({ http, page } = await renderPage(routesFor('admin/departments', DepartmentsPage), '/admin/departments'));
  }

  const list = () => http.expectOne((r) => r.method === 'GET' && r.url === '/api/admin/departments');

  afterEach(() => http.verify());

  it('lists departments with what depends on them', async () => {
    await render();
    list().flush([
      testAdminDepartment(),
      testAdminDepartment({ id: 6, name: 'Records Archive', code: 'RA', isActive: false, activeUserCount: 0, activeStepCount: 0 }),
    ]);
    await settle();

    expect(page.querySelector('.count')?.textContent?.trim()).toBe('2 departments · 1 active');
    const rows = page.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].textContent).toContain('Planning & Zoning');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/admin/users?department=1');
    expect(rows[1].classList).toContain('row-inactive');
    expect(rows[1].textContent).toContain('Inactive');
    expect(buttonIn(rows[1], 'Edit…')?.getAttribute('aria-label')).toBe('Edit Records Archive');
  });

  it('adds a department and says so', async () => {
    await render();
    list().flush([]);
    await settle();

    buttonIn(page, 'New department')!.click();
    await settle();
    const form = dialog().querySelector('form')!;
    // Nothing is sent until the form is complete.
    submit(form);
    await settle();
    expect(dialog().textContent).toContain('Name is required.');

    const [name, code] = [...dialog().querySelectorAll<HTMLInputElement>('input[matInput]')];
    type(name, ' Parks & Recreation ');
    type(code, 'pr');
    submit(form);
    await settle();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/departments');
    expect(post.request.body).toEqual({ name: 'Parks & Recreation', code: 'PR', isActive: true });
    post.flush(testAdminDepartment({ id: 7, name: 'Parks & Recreation', code: 'PR', activeUserCount: 0, activeStepCount: 0 }));
    await settle();
    list().flush([]);
    await settle();

    const notice = page.querySelector<HTMLElement>('.cf-alert--success')!;
    expect(notice.textContent).toContain('Parks & Recreation (PR) was added.');
    expect(document.activeElement).toBe(notice);
  });

  it('shows a name the API says is taken on its field', async () => {
    await render();
    list().flush([testAdminDepartment()]);
    await settle();

    buttonIn(page, 'Edit…')!.click();
    await settle();
    const [name] = [...dialog().querySelectorAll<HTMLInputElement>('input[matInput]')];
    type(name, 'Code Enforcement');
    submit(dialog().querySelector('form')!);
    await settle();

    http
      .expectOne('/api/admin/departments/1')
      .flush({ errors: { Name: ['Another department already has this name.'] } }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(dialog().querySelector('mat-error')?.textContent).toContain('Another department already has this name.');
  });

  it('won’t offer to deactivate a department that still has work', async () => {
    await render();
    list().flush([testAdminDepartment({ activeTaskCount: 1 })]);
    await settle();

    buttonIn(page, 'Edit…')!.click();
    await settle();

    const checkbox = dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.disabled).toBe(true);
    expect(dialog().textContent).toContain(
      "It can't be deactivated while it has 3 active people, 2 workflow steps and 1 active task. Move or finish those first.",
    );
    buttonIn(dialog(), 'Cancel')!.click();
    await settle();
  });

  it('describes what blocks deactivation', () => {
    expect(departmentBlockers(testAdminDepartment({ activeUserCount: 1, activeStepCount: 0 }))).toBe('1 active person');
    expect(departmentBlockers(testAdminDepartment({ activeUserCount: 0, activeStepCount: 1, activeTaskCount: 4 }))).toBe(
      '1 workflow step and 4 active tasks',
    );
    expect(departmentBlockers(testAdminDepartment({ activeUserCount: 0, activeStepCount: 0 }))).toBeNull();
  });
});
