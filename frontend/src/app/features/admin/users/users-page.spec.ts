import { HttpTestingController } from '@angular/common/http/testing';
import { pageOf, settle } from '../../../core/api/api.testing';
import { buttonIn, choose, dialog, renderPage, routesFor, submit, testAdminUser, testDepartments, type } from '../admin.testing';
import { workloadWarning } from './user-dialog';
import { UsersPage } from './users-page';

describe('UsersPage', () => {
  let http: HttpTestingController;
  let page: HTMLElement;

  async function render(url = '/admin/users'): Promise<void> {
    ({ http, page } = await renderPage(routesFor('admin/users', UsersPage), url));
    http.expectOne((r) => r.url === '/api/departments').flush(testDepartments);
  }

  const list = () => http.expectOne((r) => r.method === 'GET' && r.url === '/api/admin/users');
  const inputs = () => [...dialog().querySelectorAll<HTMLInputElement>('input[matInput]')];

  afterEach(() => http.verify());

  it('filters from the URL, so other pages can link to a department’s people', async () => {
    await render('/admin/users?department=1&status=active');
    const request = list();
    expect(request.request.params.get('departmentId')).toBe('1');
    expect(request.request.params.get('isActive')).toBe('true');
    expect(request.request.params.get('pageSize')).toBe('25');
    request.flush(pageOf([testAdminUser(), testAdminUser({ id: 9, fullName: 'Rae Kim', isActive: false, activeTaskCount: 0 })]));
    await settle();

    expect(page.querySelector('.count')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2 accounts match these 2 filters');
    const rows = page.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].textContent).toContain('pz.staff1@civicflow.test');
    // Active tasks link to the cases they're working.
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/cases?assigneeId=7');
    expect(rows[1].classList).toContain('row-inactive');

    // Filtering navigates, and the new URL drives the request.
    type(page.querySelector<HTMLInputElement>('input[type="search"]')!, 'kim');
    submit(page.querySelector('form')!);
    await settle();
    const filtered = list();
    expect(filtered.request.params.get('search')).toBe('kim');
    expect(filtered.request.params.get('departmentId')).toBe('1');
    filtered.flush(pageOf([]));
    await settle();
    expect(page.querySelector('.empty')?.textContent).toContain('No accounts match');
  });

  it('adds a user, needing a department for staff but not for admins', async () => {
    await render();
    list().flush(pageOf([]));
    await settle();

    buttonIn(page, 'New user')!.click();
    await settle();
    const [name, email, password] = inputs();
    type(name, 'Dana Reyes');
    type(email, 'dana.reyes@civicflow.test');
    type(password, 'short');
    submit(dialog().querySelector('form')!);
    await settle();

    const errors = [...dialog().querySelectorAll('mat-error')].map((e) => e.textContent?.trim());
    expect(errors).toContain('Password must be at least 12 characters.');
    expect(errors).toContain('Department is required.');

    type(password, 'correct horse battery');
    await choose(dialog().querySelector('mat-select')!, 'Code Enforcement');
    // Inactive departments aren't offered.
    expect(document.querySelectorAll('mat-option').length).toBe(0);
    submit(dialog().querySelector('form')!);
    await settle();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/users');
    expect(post.request.body).toEqual({
      email: 'dana.reyes@civicflow.test',
      fullName: 'Dana Reyes',
      role: 'Staff',
      departmentId: 2,
      password: 'correct horse battery',
    });
    post.flush(testAdminUser({ id: 30, fullName: 'Dana Reyes', email: 'dana.reyes@civicflow.test' }));
    await settle();
    list().flush(pageOf([]));
    await settle();

    expect(page.querySelector('.cf-alert--success')?.textContent).toContain('Dana Reyes can now sign in as dana.reyes@civicflow.test.');
  });

  it('warns that deactivating someone returns their tasks to the queue', async () => {
    await render();
    list().flush(pageOf([testAdminUser()]));
    await settle();

    buttonIn(page, 'Edit…')!.click();
    await settle();
    expect(dialog().querySelector('.cf-alert--warning')).toBeNull();

    const active = [...dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].at(-1)!;
    active.click();
    await settle();
    expect(dialog().querySelector('.cf-alert--warning')?.textContent).toContain(
      'Their 2 active tasks go back to the department queues, for someone else to claim.',
    );

    submit(dialog().querySelector('form')!);
    await settle();
    const put = http.expectOne('/api/admin/users/7');
    expect(put.request.body).toEqual({
      email: 'pz.staff1@civicflow.test',
      fullName: 'Luis Ortega',
      role: 'Staff',
      departmentId: 1,
      isActive: false,
    });
    put.flush(testAdminUser({ isActive: false, activeTaskCount: 0 }));
    await settle();
    list().flush(pageOf([]));
    await settle();

    expect(page.querySelector('.cf-alert--success')?.textContent).toContain(
      'Luis Ortega was deactivated. Their tasks went back to the department queues.',
    );
  });

  it('won’t let admins lock themselves out', async () => {
    await render();
    list().flush(pageOf([testAdminUser({ id: 1, fullName: 'Avery Admin', role: 'Admin', departmentId: null, departmentName: null })]));
    await settle();

    expect(page.querySelector('tr.mat-mdc-row')?.textContent).toContain('(you)');
    buttonIn(page, 'Edit…')!.click();
    await settle();

    const radios = [...dialog().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    expect([...dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].at(-1)!.disabled).toBe(true);
    expect(dialog().textContent).toContain("You can't change your own role or deactivate your own account");

    // The disabled role still counts: an admin may stay agency-wide.
    submit(dialog().querySelector('form')!);
    await settle();
    const put = http.expectOne('/api/admin/users/1');
    expect(put.request.body.role).toBe('Admin');
    expect(put.request.body.departmentId).toBeNull();
    expect(put.request.body.isActive).toBe(true);
    put.flush(testAdminUser({ id: 1, fullName: 'Avery Admin', role: 'Admin', departmentId: null, departmentName: null }));
    await settle();
    list().flush(pageOf([]));
    await settle();
  });

  it('resets a password from the row’s menu', async () => {
    await render();
    list().flush(pageOf([testAdminUser()]));
    await settle();

    buttonIn(page, 'More')!.click();
    await settle();
    expect(document.querySelector('a[mat-menu-item]')?.getAttribute('href')).toBe('/audit?userId=7');
    buttonIn(document, 'Reset password…')!.click();
    await settle();

    const password = dialog().querySelector<HTMLInputElement>('input[matInput]')!;
    type(password, 'a much longer passphrase');
    submit(dialog().querySelector('form')!);
    await settle();
    const post = http.expectOne('/api/admin/users/7/password');
    expect(post.request.body).toEqual({ password: 'a much longer passphrase' });
    post.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    list().flush(pageOf([testAdminUser()]));
    await settle();

    expect(page.querySelector('.cf-alert--success')?.textContent).toContain("Luis Ortega's password was changed.");
  });

  it('words the workload warning for a department move', () => {
    const user = testAdminUser({ activeTaskCount: 1 });
    expect(workloadWarning(user, { isActive: true, departmentId: 2 })).toBe('Their active task goes back to the Planning & Zoning queue.');
    expect(workloadWarning(user, { isActive: true, departmentId: 1 })).toBeNull();
    expect(workloadWarning(testAdminUser({ activeTaskCount: 0 }), { isActive: false, departmentId: 1 })).toBeNull();
  });
});
