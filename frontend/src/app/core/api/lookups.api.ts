import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Department, UserLookup } from './activity.models';
import { queryParams } from './paging';

/** Reference lists for any signed-in user. */
@Injectable({ providedIn: 'root' })
export class LookupsApi {
  private readonly http = inject(HttpClient);

  departments(options: { includeInactive?: boolean } = {}): Observable<Department[]> {
    return this.http.get<Department[]>('/api/departments', { params: queryParams(options) });
  }

  /** Active users (or all, to put names to old audit entries), optionally one department's. */
  users(options: { departmentId?: number; includeInactive?: boolean } = {}): Observable<UserLookup[]> {
    return this.http.get<UserLookup[]>('/api/users', { params: queryParams(options) });
  }
}
