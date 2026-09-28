import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CaseDetail, CaseListItem, CaseSearchQuery, CreateCaseRequest } from './cases.models';
import { PagedResult, queryParams } from './paging';

@Injectable({ providedIn: 'root' })
export class CasesApi {
  private readonly http = inject(HttpClient);

  /** Cases the caller may view, matching the filters. */
  search(query: CaseSearchQuery): Observable<PagedResult<CaseListItem>> {
    return this.http.get<PagedResult<CaseListItem>>('/api/cases', { params: queryParams(query) });
  }

  get(id: number): Observable<CaseDetail> {
    return this.http.get<CaseDetail>(`/api/cases/${id}`);
  }

  /** Opens a case; its first workflow step lands in that step's department queue. */
  create(request: CreateCaseRequest): Observable<CaseDetail> {
    return this.http.post<CaseDetail>('/api/cases', request);
  }
}
