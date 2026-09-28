import { convertToParamMap } from '@angular/router';
import { parseSearchParams, toSearchParams } from './case-search-query';

describe('case search query', () => {
  it('reads every filter from the URL', () => {
    const query = parseSearchParams(
      convertToParamMap({
        search: '  birch ',
        caseTypeId: '2',
        status: 'OnHold',
        priority: 'Urgent',
        departmentId: '3',
        assigneeId: '9',
        createdFrom: '2026-09-01',
        createdTo: '2026-09-30',
        overdue: 'true',
        sort: 'DueDate',
        descending: 'false',
        page: '3',
        pageSize: '50',
      }),
    );

    expect(query).toEqual({
      search: 'birch',
      caseTypeId: 2,
      status: 'OnHold',
      priority: 'Urgent',
      departmentId: 3,
      assigneeId: 9,
      createdFrom: '2026-09-01',
      createdTo: '2026-09-30',
      overdue: true,
      sort: 'DueDate',
      descending: false,
      page: 3,
      pageSize: 50,
    });
  });

  it('drops malformed values instead of sending them to the API', () => {
    const query = parseSearchParams(
      convertToParamMap({
        caseTypeId: 'abc',
        status: 'Deleted',
        departmentId: '-1',
        createdFrom: '09/01/2026',
        sort: 'Title',
        page: '1.5',
        pageSize: '1000',
        search: '   ',
      }),
    );

    expect(Object.values(query).filter((v) => v !== undefined)).toEqual([]);
  });

  it('writes only the filters that are set, and no defaults', () => {
    expect(
      toSearchParams({
        search: 'birch',
        status: 'Open',
        overdue: false,
        assigneeId: undefined,
        page: 1,
        pageSize: 25,
        descending: undefined,
      }),
    ).toEqual({ search: 'birch', status: 'Open' });
  });

  it('keeps an ascending sort and non-default paging', () => {
    expect(toSearchParams({ sort: 'CaseNumber', descending: false, page: 2, pageSize: 50 })).toEqual({
      sort: 'CaseNumber',
      descending: 'false',
      page: '2',
      pageSize: '50',
    });
  });
});
