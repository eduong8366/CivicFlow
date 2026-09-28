import { ParamMap, Params } from '@angular/router';
import { casePriorities, CasePriority, CaseSearchQuery, CaseSortField, CaseStatus, caseStatuses } from '../../../core/api/cases.models';

// The search lives in the URL (?status=Open&page=2), so a search can be bookmarked, shared and
// returned to with Back. These convert between the URL and the API query, dropping anything
// malformed rather than sending it on.

export const defaultPageSize = 25;
export const pageSizes = [10, 25, 50, 100];

const sortFields: readonly CaseSortField[] = ['CreatedAt', 'DueDate', 'Priority', 'CaseNumber'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** The API query a search URL describes. */
export function parseSearchParams(params: ParamMap): CaseSearchQuery {
  const text = (key: string) => params.get(key)?.trim() || undefined;
  const id = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const oneOf = <T extends string>(key: string, values: readonly T[]) => {
    const value = params.get(key);
    return values.includes(value as T) ? (value as T) : undefined;
  };
  const date = (key: string) => {
    const value = params.get(key);
    return value && datePattern.test(value) ? value : undefined;
  };

  const pageSize = id('pageSize');
  return {
    search: text('search'),
    caseTypeId: id('caseTypeId'),
    status: oneOf<CaseStatus>('status', caseStatuses),
    priority: oneOf<CasePriority>('priority', casePriorities),
    departmentId: id('departmentId'),
    assigneeId: id('assigneeId'),
    createdFrom: date('createdFrom'),
    createdTo: date('createdTo'),
    overdue: params.get('overdue') === 'true' ? true : undefined,
    sort: oneOf<CaseSortField>('sort', sortFields),
    descending: params.get('descending') === 'false' ? false : undefined,
    page: id('page'),
    pageSize: pageSize && pageSizes.includes(pageSize) ? pageSize : undefined,
  };
}

/** The URL query parameters for a search, leaving out empty filters and defaults. */
export function toSearchParams(query: CaseSearchQuery): Params {
  const params: Params = {};
  for (const [key, value] of Object.entries(query) as [keyof CaseSearchQuery, unknown][]) {
    if (value === undefined || value === null || value === '' || value === false) {
      // `descending=false` is the one false worth keeping: the default is descending.
      if (!(key === 'descending' && value === false)) {
        continue;
      }
    }

    if ((key === 'page' && value === 1) || (key === 'pageSize' && value === defaultPageSize)) {
      continue;
    }

    params[key] = String(value);
  }

  return params;
}
