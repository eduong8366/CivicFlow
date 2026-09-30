import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { pageOf, settle } from '../../../core/api/api.testing';
import { CaseListItem } from '../../../core/api/cases.models';
import { CaseSearchPage } from './case-search-page';

@Component({ template: '' })
class Blank {}

function row(overrides: Partial<CaseListItem> = {}): CaseListItem {
  return {
    id: 20,
    caseNumber: 'BLD-2026-000020',
    title: 'New Construction at 2599 Birch Ct',
    caseTypeId: 1,
    caseTypeName: 'Building Permit Application',
    status: 'InProgress',
    resolution: null,
    priority: 'High',
    requesterName: 'Rachel Martinez',
    createdAt: '2026-09-18T08:01:00+00:00',
    dueDate: '2026-10-07',
    closedAt: null,
    isOverdue: false,
    currentStep: 'Plan Review',
    currentDepartmentName: 'Planning & Zoning',
    currentAssigneeName: null,
    currentStepDueDate: '2026-09-30',
    ...overrides,
  };
}

describe('CaseSearchPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'cases', component: CaseSearchPage },
          { path: 'cases/:id', component: Blank },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url, CaseSearchPage);
    http.expectOne('/api/case-types').flush([{ id: 1, name: 'Building Permit Application', prefix: 'BLD', description: null, fields: [], steps: [] }]);
    http.expectOne('/api/departments').flush([{ id: 1, name: 'Planning & Zoning', code: 'PZ', isActive: true }]);
    http.expectOne('/api/users').flush([]);
    await settle();
    return harness.routeNativeElement!;
  }

  const searchRequest = (): TestRequest => http.expectOne((r) => r.url === '/api/cases');

  it('searches with the filters in the URL and lists the results', async () => {
    const page = await open('/cases?status=InProgress&search=birch&page=2');

    const request = searchRequest();
    expect(request.request.params.toString()).toBe('search=birch&status=InProgress&page=2');
    request.flush(pageOf([row(), row({ id: 21, caseNumber: 'CE-2026-000021', isOverdue: true, currentAssigneeName: 'Mia Chen' })], { totalCount: 27, page: 2 }));
    await settle();

    const rows = page.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const link = rows[0].querySelector('a')!;
    expect(link.textContent).toBe('BLD-2026-000020');
    expect(link.getAttribute('href')).toBe('/cases/20');
    expect(rows[0].textContent).toContain('In progress');
    expect(rows[0].textContent).toContain('Planning & Zoning queue');
    expect(rows[1].textContent).toContain('Mia Chen');
    expect(rows[1].textContent).toContain('Overdue');
    expect(page.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, ' ')).toContain('27 cases match these 2 filters');
    expect(page.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('birch');
  });

  it('words a single result in the singular', async () => {
    const page = await open('/cases?overdue=true');
    searchRequest().flush(pageOf([row()], { totalCount: 1 }));
    await settle();

    expect(page.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, ' ')).toContain('1 case matches this filter');
  });

  it('puts new filters in the URL and starts again from page 1', async () => {
    const page = await open('/cases?page=3');
    searchRequest().flush(pageOf([]));
    await settle();

    const keywords = page.querySelector<HTMLInputElement>('input[type="search"]')!;
    keywords.value = '  2599 Birch ';
    keywords.dispatchEvent(new Event('input'));
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();

    expect(TestBed.inject(Router).url).toBe('/cases?search=2599%20Birch');
    searchRequest().flush(pageOf([row()]));
  });

  it('sorts on the server when a column header is chosen', async () => {
    const page = await open('/cases');
    searchRequest().flush(pageOf([row()]));
    await settle();

    const header = [...page.querySelectorAll<HTMLElement>('th')].find((th) => th.textContent?.includes('Case'))!;
    header.querySelector<HTMLElement>('.mat-sort-header-container')!.click();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/cases?sort=CaseNumber&descending=false');
    // The current rows stay while the sorted ones load, so focus isn't lost with the table.
    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Searching…');
    const request = searchRequest();
    expect(request.request.params.get('sort')).toBe('CaseNumber');
    request.flush(pageOf([row()]));
  });

  it('says when nothing matches', async () => {
    const page = await open('/cases?status=Cancelled');
    searchRequest().flush(pageOf([]));
    await settle();

    expect(page.textContent).toContain('No cases match.');
    expect(page.querySelector('[role="status"]')?.textContent).toContain('0 cases');
  });

  it('shows the API message when the search fails', async () => {
    const page = await open('/cases');
    searchRequest().flush(
      { status: 400, errors: { CreatedTo: ["'Created To' must not be before 'Created From'."] } },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain("'Created To' must not be before 'Created From'.");
  });
});
