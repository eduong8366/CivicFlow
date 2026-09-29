import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { settle } from '../../../core/api/api.testing';
import { unsavedChangesGuard } from '../../../core/unsaved-changes.guard';
import { buttonIn, choose, renderPage, submit, testDepartments, type } from '../admin.testing';
import { CaseTypeDesigner } from './case-type-designer';
import { testAdminCaseType } from './case-types.testing';

describe('CaseTypeDesigner', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  const routes = [
    { path: 'admin/case-types/new', component: CaseTypeDesigner, canDeactivate: [unsavedChangesGuard] },
    { path: 'admin/case-types/:id', component: CaseTypeDesigner, canDeactivate: [unsavedChangesGuard] },
    { path: 'admin/case-types', children: [] },
  ];

  async function render(url: string): Promise<void> {
    ({ http, harness, page } = await renderPage(routes, url));
    http.expectOne((r) => r.url === '/api/departments').flush(testDepartments);
  }

  async function renderExisting(): Promise<void> {
    await render('/admin/case-types/1');
    http.expectOne('/api/admin/case-types/1').flush(testAdminCaseType());
    await settle();
  }

  const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => page.querySelector<T>(`#${id}`)!;
  const rows = (list: 'fields' | 'steps') =>
    [...page.querySelectorAll<HTMLElement>(`section[aria-labelledby="${list}-heading"] li.row`)].map((row) => row.getAttribute('aria-label'));
  const liveRegion = () => page.querySelector('[aria-live="polite"]')?.textContent?.trim();

  afterEach(() => http.verify());

  it('shows the definition, protecting what existing cases use', async () => {
    await renderExisting();

    expect(page.querySelector('h1')?.textContent).toBe('Building Permit Application');
    expect(page.querySelector('.in-use-note')?.textContent).toContain('12 cases use this type.');
    expect(rows('fields')).toEqual(['Field 1: Parcel Number', 'Field 2: Occupancy']);
    expect(rows('steps')).toEqual(['Step 1: Intake', 'Step 2: Plan Review']);
    expect(byId('field-1-options').value).toBe('Residential\nCommercial');

    const [parcel, occupancy] = page.querySelectorAll<HTMLElement>('section[aria-labelledby="fields-heading"] li.row');
    expect(buttonIn(parcel, 'Remove field 1')?.disabled).toBe(true);
    expect(buttonIn(occupancy, 'Remove field 2')?.disabled).toBe(false);
    // A used field's type is fixed.
    expect(byId<HTMLElement>('field-0-type').getAttribute('aria-disabled')).toBe('true');
    // The first step can't return.
    const intakeReturn = [...page.querySelectorAll<HTMLElement>('#step-0-outcomes mat-checkbox')].find((c) => c.textContent?.includes('Return'))!;
    expect(intakeReturn.querySelector('input')!.disabled).toBe(true);
  });

  it('reorders steps with the keyboard buttons and saves the new order', async () => {
    await renderExisting();

    buttonIn(page, 'Move up step 2')!.click();
    await settle();
    await settle();

    expect(rows('steps')).toEqual(['Step 1: Plan Review', 'Step 2: Intake']);
    expect(liveRegion()).toBe(
      "The Plan Review step moved to position 1 of 2. The first step can't return to an earlier one, so Return was turned off for The Plan Review step.",
    );
    // Focus stays with the moved row.
    expect(document.activeElement?.id).toBe('step-0-down');

    submit(page.querySelector('form')!);
    await settle();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/admin/case-types/1');
    expect(put.request.body.steps).toEqual([
      { id: 32, name: 'Plan Review', departmentId: 1, slaDays: 10, allowedOutcomes: ['Approve', 'Reject'] },
      { id: 31, name: 'Intake', departmentId: 1, slaDays: 2, allowedOutcomes: ['Complete', 'RequestInfo'] },
    ]);
    expect(put.request.body.fields.map((f: { id: number }) => f.id)).toEqual([11, 12]);

    const type = testAdminCaseType();
    put.flush({ ...type, steps: [type.steps[1], type.steps[0]] });
    await settle();

    const notice = page.querySelector<HTMLElement>('.cf-alert--success')!;
    expect(notice.textContent).toContain('Building Permit Application was saved.');
    expect(document.activeElement).toBe(notice);
  });

  it('adds a select field whose key follows its label', async () => {
    await renderExisting();

    buttonIn(page, 'Add field')!.click();
    await settle();
    await settle();
    expect(document.activeElement?.id).toBe('field-2-label');

    type(byId('field-2-label'), 'Zoning District');
    await settle();
    expect(byId('field-2-key').value).toBe('zoningDistrict');

    await choose(byId<HTMLElement>('field-2-type'), 'Select');
    type(byId<HTMLTextAreaElement>('field-2-options') as unknown as HTMLInputElement, 'R-1\nC-2');
    submit(page.querySelector('form')!);
    await settle();

    const put = http.expectOne('/api/admin/case-types/1');
    expect(put.request.body.fields[2]).toEqual({
      id: null,
      key: 'zoningDistrict',
      label: 'Zoning District',
      dataType: 'Select',
      isRequired: false,
      options: ['R-1', 'C-2'],
    });
    put.flush(testAdminCaseType());
    await settle();
  });

  it('lists every problem before saving, linking to each', async () => {
    await renderExisting();

    type(byId('type-name'), '');
    buttonIn(page, 'Add field')!.click();
    await settle();
    await choose(byId<HTMLElement>('field-2-type'), 'Select');
    submit(page.querySelector('form')!);
    await settle();
    await settle();

    const summary = page.querySelector<HTMLElement>('.summary')!;
    expect(document.activeElement).toBe(summary);
    expect([...summary.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Name is required.',
      'Field 3: Label is required.',
      'Field 3: Key is required.',
      'Field 3: A select field needs at least one option.',
    ]);

    summary.querySelector<HTMLAnchorElement>('a[href="#field-2-label"]')!.click();
    expect(document.activeElement?.id).toBe('field-2-label');
  });

  it('shows the API’s objections on the fields they concern, and the rest in the summary', async () => {
    await renderExisting();

    buttonIn(page, 'Remove step 2')!.click();
    await settle();
    expect(liveRegion()).toBe('The Plan Review step removed.');
    submit(page.querySelector('form')!);
    await settle();

    http.expectOne('/api/admin/case-types/1').flush(
      {
        errors: {
          Prefix: ['Another case type already uses this prefix.'],
          Steps: ["The 'Plan Review' step has tasks on existing cases, so it can't be removed."],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    await settle();

    const summary = page.querySelector<HTMLElement>('.summary')!;
    expect([...summary.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Another case type already uses this prefix.',
      "The 'Plan Review' step has tasks on existing cases, so it can't be removed.",
    ]);
    expect(page.querySelector('mat-form-field:has(#type-prefix) mat-error')?.textContent).toContain('Another case type already uses this prefix.');
  });

  it('creates a case type and opens it', async () => {
    await render('/admin/case-types/new');
    await settle();

    expect(page.querySelector('h1')?.textContent).toBe('New case type');
    type(byId('type-name'), 'Tree Removal Permit');
    type(byId('type-prefix'), 'tree');
    await choose(byId<HTMLElement>('step-0-department'), 'Code Enforcement');
    submit(page.querySelector('form')!);
    await settle();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/case-types');
    expect(post.request.body).toEqual({
      name: 'Tree Removal Permit',
      prefix: 'TREE',
      description: null,
      isActive: true,
      fields: [],
      steps: [{ id: null, name: 'Intake', departmentId: 2, slaDays: 5, allowedOutcomes: ['Complete'] }],
    });
    post.flush(testAdminCaseType({ id: 40, name: 'Tree Removal Permit', prefix: 'TREE', caseCount: 0 }));
    await settle();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/admin/case-types/40');
    http.expectOne((r) => r.url === '/api/departments').flush(testDepartments);
    http.expectOne('/api/admin/case-types/40').flush(testAdminCaseType({ id: 40, name: 'Tree Removal Permit', prefix: 'TREE', caseCount: 0 }));
    await settle();

    page = harness.routeNativeElement!;
    expect(page.querySelector('.cf-alert--success')?.textContent).toContain(
      'Tree Removal Permit was created. Staff can now open TREE cases.',
    );
  });

  it('asks before leaving with unsaved changes', async () => {
    await renderExisting();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    type(byId('type-name'), 'Building Permit');
    await harness.navigateByUrl('/admin/case-types');
    expect(confirm).toHaveBeenCalledWith('Leave without saving your changes to this case type?');
    expect(TestBed.inject(Router).url).toBe('/admin/case-types/1');

    confirm.mockReturnValue(true);
    await harness.navigateByUrl('/admin/case-types');
    expect(TestBed.inject(Router).url).toBe('/admin/case-types');
    confirm.mockRestore();
  });

  it('says when the case type doesn’t exist', async () => {
    await render('/admin/case-types/99');
    http.expectOne('/api/admin/case-types/99').flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain("This case type doesn't exist.");
  });
});
