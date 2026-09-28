import { queryParams } from './paging';

describe('queryParams', () => {
  it('keeps values and leaves out empty ones', () => {
    const params = queryParams({ status: 'Open', page: 2, overdue: false, search: '', assigneeId: null, sort: undefined });

    expect(params.toString()).toBe('status=Open&page=2&overdue=false');
  });
});
