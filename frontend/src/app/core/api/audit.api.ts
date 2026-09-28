import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditEntry } from './activity.models';
import { PagedResult, PageQuery, queryParams } from './paging';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  /** A case's history, including its tasks, comments and attachments, newest first. */
  caseHistory(caseId: number, page: PageQuery = {}): Observable<PagedResult<AuditEntry>> {
    return this.http.get<PagedResult<AuditEntry>>(`/api/cases/${caseId}/audit`, { params: queryParams(page) });
  }
}
