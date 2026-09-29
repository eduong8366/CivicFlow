import { convertToParamMap } from '@angular/router';
import { parseUserFilters, toUserParams, toUserQuery } from './users-query';

describe('user list filters', () => {
  it('reads the filters from the URL, dropping malformed values', () => {
    expect(parseUserFilters(convertToParamMap({ search: ' ortega ', role: 'Supervisor', department: '2', status: 'inactive' }))).toEqual({
      search: 'ortega',
      role: 'Supervisor',
      department: 2,
      status: 'inactive',
      page: undefined,
      pageSize: undefined,
    });

    expect(parseUserFilters(convertToParamMap({ role: 'Owner', department: 'x', status: 'gone', page: '-1', pageSize: '7' }))).toEqual({
      search: undefined,
      role: undefined,
      department: undefined,
      status: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it('writes only the filters that are set, without defaults', () => {
    expect(toUserParams({ search: 'mia', role: undefined, department: 3, page: 1, pageSize: 25 })).toEqual({ search: 'mia', department: '3' });
    expect(toUserParams({ status: 'active', page: 2, pageSize: 50 })).toEqual({ status: 'active', page: '2', pageSize: '50' });
  });

  it('turns the filters into the API query', () => {
    expect(toUserQuery({ department: 3, status: 'inactive' })).toEqual({
      search: undefined,
      role: undefined,
      departmentId: 3,
      isActive: false,
      page: undefined,
      pageSize: 25,
    });
    expect(toUserQuery({}).isActive).toBeUndefined();
  });
});
