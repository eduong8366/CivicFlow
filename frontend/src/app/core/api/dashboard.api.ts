import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardSummary } from './dashboard.models';
import { queryParams } from './paging';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  /** The caller's dashboard; admins may narrow it to one department. */
  summary(query: { departmentId?: number } = {}): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>('/api/dashboard/summary', { params: queryParams(query) });
  }
}
