import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditEntry, AuditQuery } from './activity.models';
import { PagedResult, PageQuery, queryParams } from './paging';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  /** A case's history, including its tasks, comments and attachments, newest first. */
  caseHistory(caseId: number, page: PageQuery = {}): Observable<PagedResult<AuditEntry>> {
    return this.http.get<PagedResult<AuditEntry>>(`/api/cases/${caseId}/audit`, { params: queryParams(page) });
  }

  /**
   * The agency audit log, newest first. Supervisors see entries for cases involving their
   * department; admins see everything, including changes outside cases.
   */
  search(query: AuditQuery = {}): Observable<PagedResult<AuditEntry>> {
    return this.http.get<PagedResult<AuditEntry>>('/api/audit', { params: queryParams(query) });
  }
}
