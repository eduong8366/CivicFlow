import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { settle } from '../../../core/api/api.testing';
import { CaseType } from '../../../core/api/cases.models';
import { testCase } from '../case-detail/case-detail.testing';
import { NewCasePage } from './new-case-page';

const buildingPermit: CaseType = {
  id: 1,
  name: 'Building Permit Application',
  prefix: 'BLD',
  description: 'New construction, additions and alterations.',
  fields: [
    { id: 1, key: 'parcelNumber', label: 'Parcel number', dataType: 'Text', isRequired: true, options: [], sortOrder: 0 },
    { id: 2, key: 'valuation', label: 'Estimated valuation', dataType: 'Number', isRequired: false, options: [], sortOrder: 1 },
    { id: 3, key: 'startDate', label: 'Planned start date', dataType: 'Date', isRequired: false, options: [], sortOrder: 2 },
    { id: 4, key: 'projectType', label: 'Project type', dataType: 'Select', isRequired: false, options: ['New', 'Addition'], sortOrder: 3 },
    { id: 5, key: 'confirmed', label: 'Plans attached', dataType: 'Checkbox', isRequired: true, options: [], sortOrder: 4 },
  ],
  steps: [
    { id: 1, name: 'Intake', sortOrder: 0, departmentId: 1, departmentName: 'Planning & Zoning', slaDays: 3, allowedOutcomes: ['Complete'] },
    { id: 2, name: 'Plan Review', sortOrder: 1, departmentId: 1, departmentName: 'Planning & Zoning', slaDays: 10, allowedOutcomes: ['Approve'] },
  ],
};

const itRequest: CaseType = {
  id: 2,
  name: 'IT Service Request',
  prefix: 'IT',
  description: null,
  fields: [{ id: 9, key: 'assetTag', label: 'Asset tag', dataType: 'Text', isRequired: false, options: [], sortOrder: 0 }],
  steps: [{ id: 9, name: 'Triage', sortOrder: 0, departmentId: 5, departmentName: 'IT', slaDays: 1, allowedOutcomes: ['Complete'] }],
};

describe('NewCasePage', () => {
  let fixture: ComponentFixture<NewCasePage>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let router: Router;

  async function render(query: Record<string, string> = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NewCasePage);
    page = fixture.nativeElement;
    await settle();
    http.expectOne('/api/case-types').flush([buildingPermit, itRequest]);
    await settle();
  }

  afterEach(() => http.verify());

  const input = (label: string) =>
    [...page.querySelectorAll<HTMLInputElement>('input, textarea')].find((i) => i.labels?.[0]?.textContent?.trim().startsWith(label))!;

  async function type(label: string, value: string): Promise<void> {
    const field = input(label);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  }

  async function chooseType(name: string): Promise<void> {
    input(name).click();
    await settle();
  }

  async function submit(): Promise<void> {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  it('offers the active case types and shows the chosen one’s workflow', async () => {
    await render();

    expect(page.querySelectorAll('mat-radio-button')).toHaveLength(2);
    expect(page.textContent).not.toContain('Requester');

    await chooseType('Building Permit Application');

    expect(page.querySelector('[aria-label="Workflow"]')?.textContent).toContain('Intake');
    expect(page.textContent).toContain('Due in about 13 days');
  });

  it('renders the chosen type’s own fields, labelled', async () => {
    await render();
    await chooseType('Building Permit Application');

    expect(page.querySelector('#fields-heading')?.textContent).toBe('Building Permit Application details');
    expect(input('Parcel number').type).toBe('text');
    expect(input('Estimated valuation').type).toBe('number');
    expect(input('Planned start date').type).toBe('date');
    expect(page.querySelector('mat-select#field-projectType')).not.toBeNull();
    expect(input('Plans attached').type).toBe('checkbox');

    await chooseType('IT Service Request');

    expect(page.querySelector('#field-parcelNumber')).toBeNull();
    expect(input('Asset tag')).toBeDefined();
  });

  it('preselects a type from the link', async () => {
    await render({ type: '2' });

    expect(page.querySelector('#fields-heading')?.textContent).toBe('IT Service Request details');
  });

  it('lists every problem before sending anything', async () => {
    await render();
    await chooseType('Building Permit Application');

    await submit();

    http.expectNone('/api/cases');
    const summary = page.querySelector<HTMLElement>('.summary')!;
    expect(document.activeElement).toBe(summary);
    expect([...summary.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Title is required.',
      'Parcel number is required.',
      'Tick “Plans attached” to continue.',
      'Requester name is required.',
    ]);
    expect(summary.querySelector('a')?.getAttribute('href')).toBe('#title');
  });

  it('sends the case with its fields as text and opens it', async () => {
    await render();
    await chooseType('Building Permit Application');
    await type('Title', ' New build at 2599 Birch Ct ');
    await type('Parcel number', '493-11-2774');
    await type('Estimated valuation', '627000.5');
    await type('Planned start date', '2026-11-17');
    input('Plans attached').click();
    await type('Name', 'Rachel Martinez');
    await type('Email', 'rachel@example.com');

    await submit();

    const request = http.expectOne('/api/cases');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      caseTypeId: 1,
      title: 'New build at 2599 Birch Ct',
      description: null,
      priority: 'Normal',
      requesterName: 'Rachel Martinez',
      requesterEmail: 'rachel@example.com',
      requesterPhone: null,
      requesterAddress: null,
      fields: {
        parcelNumber: '493-11-2774',
        valuation: '627000.5',
        startDate: '2026-11-17',
        projectType: null,
        confirmed: 'true',
      },
    });
    request.flush(testCase({ id: 42 }));

    expect(router.navigate).toHaveBeenCalledWith(['/cases', 42], { state: { created: true } });
  });

  it('shows the API’s validation messages on their fields', async () => {
    await render();
    await chooseType('Building Permit Application');
    await type('Title', 'New build');
    await type('Parcel number', 'nope');
    input('Plans attached').click();
    await type('Name', 'Rachel Martinez');
    await submit();

    http.expectOne('/api/cases').flush(
      {
        status: 400,
        errors: {
          'Fields.parcelNumber': ['Parcel number must look like 000-00-0000.'],
          Other: ['Something else is wrong.'],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    const summary = page.querySelector('.summary')!;
    expect(summary.textContent).toContain('Parcel number must look like 000-00-0000.');
    expect(summary.textContent).toContain('Something else is wrong.');
    expect(input('Parcel number').closest('mat-form-field')?.textContent).toContain('Parcel number must look like 000-00-0000.');
    expect(input('Parcel number').getAttribute('aria-invalid')).toBe('true');
  });
});
