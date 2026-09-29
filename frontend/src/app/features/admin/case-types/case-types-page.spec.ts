import { HttpTestingController } from '@angular/common/http/testing';
import { settle } from '../../../core/api/api.testing';
import { renderPage, routesFor } from '../admin.testing';
import { CaseTypesPage } from './case-types-page';
import { testCaseTypeListItem } from './case-types.testing';

describe('CaseTypesPage', () => {
  let http: HttpTestingController;
  let page: HTMLElement;

  afterEach(() => http.verify());

  it('lists every type with links to design it and to its cases', async () => {
    ({ http, page } = await renderPage(routesFor('admin/case-types', CaseTypesPage), '/admin/case-types'));
    http.expectOne('/api/admin/case-types').flush([
      testCaseTypeListItem(),
      testCaseTypeListItem({ id: 5, name: 'Noise Complaint', prefix: 'NC', isActive: false, caseCount: 0, openCaseCount: 0 }),
    ]);
    await settle();

    expect(page.querySelector('.count')?.textContent?.trim()).toBe('2 types · 1 active');
    const [permit, noise] = page.querySelectorAll('tr.mat-mdc-row');
    expect(permit.querySelector('a')?.getAttribute('href')).toBe('/admin/case-types/1');
    const cases = [...permit.querySelectorAll('a')].find((a) => a.getAttribute('href')?.startsWith('/cases'))!;
    expect(cases.getAttribute('href')).toBe('/cases?caseTypeId=1');
    expect(cases.getAttribute('aria-label')).toBe('12 Building Permit Application cases, 5 open');
    expect(noise.classList).toContain('row-inactive');
    expect(page.querySelector('a[href="/admin/case-types/new"]')?.textContent?.trim()).toBe('New case type');
  });
});
