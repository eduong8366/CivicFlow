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

  /**
   * Puts the case on hold, cancels it, or reopens it (resuming an on-hold case). A reason is kept
   * on the case as an internal comment.
   */
  changeStatus(id: number, change: CaseStatusChange, reason: string | null = null): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(`/api/cases/${id}/${change}`, { reason });
  }
}

export type CaseStatusChange = 'hold' | 'cancel' | 'reopen';
