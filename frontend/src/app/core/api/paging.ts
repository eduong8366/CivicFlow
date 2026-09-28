import { HttpParams } from '@angular/common/http';

/** One page of a list endpoint. Pages are 1-based. */
export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** The API's largest page size; lists that show everything at once ask for this. */
export const maxPageSize = 100;

export type QueryValue = string | number | boolean | null | undefined;

/** Query-string parameters, leaving out the ones with no value so the API applies its defaults. */
export function queryParams(values: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values) as [string, QueryValue][]) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }

  return params;
}
