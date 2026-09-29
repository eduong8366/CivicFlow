import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminCaseType,
  AdminCaseTypeListItem,
  AdminDepartment,
  AdminUser,
  AdminUserQuery,
  CreateUserRequest,
  SaveCaseTypeRequest,
  SaveDepartmentRequest,
  UpdateUserRequest,
} from './admin.models';
import { PagedResult, queryParams } from './paging';

/** User accounts. Accounts are deactivated rather than deleted. */
@Injectable({ providedIn: 'root' })
export class AdminUsersApi {
  private readonly http = inject(HttpClient);

  list(query: AdminUserQuery = {}): Observable<PagedResult<AdminUser>> {
    return this.http.get<PagedResult<AdminUser>>('/api/admin/users', { params: queryParams(query) });
  }

  create(request: CreateUserRequest): Observable<AdminUser> {
    return this.http.post<AdminUser>('/api/admin/users', request);
  }

  update(id: number, request: UpdateUserRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`/api/admin/users/${id}`, request);
  }

  resetPassword(id: number, password: string): Observable<void> {
    return this.http.post<void>(`/api/admin/users/${id}/password`, { password });
  }
}

/** Departments, active and inactive. */
@Injectable({ providedIn: 'root' })
export class AdminDepartmentsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<AdminDepartment[]> {
    return this.http.get<AdminDepartment[]>('/api/admin/departments');
  }

  create(request: SaveDepartmentRequest): Observable<AdminDepartment> {
    return this.http.post<AdminDepartment>('/api/admin/departments', request);
  }

  /** Deactivating a department that still has users, steps or tasks is 409. */
  update(id: number, request: SaveDepartmentRequest): Observable<AdminDepartment> {
    return this.http.put<AdminDepartment>(`/api/admin/departments/${id}`, request);
  }
}

/** The case type designer's definitions, active and inactive. */
@Injectable({ providedIn: 'root' })
export class AdminCaseTypesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<AdminCaseTypeListItem[]> {
    return this.http.get<AdminCaseTypeListItem[]>('/api/admin/case-types');
  }

  get(id: number): Observable<AdminCaseType> {
    return this.http.get<AdminCaseType>(`/api/admin/case-types/${id}`);
  }

  create(request: SaveCaseTypeRequest): Observable<AdminCaseType> {
    return this.http.post<AdminCaseType>('/api/admin/case-types', request);
  }

  update(id: number, request: SaveCaseTypeRequest): Observable<AdminCaseType> {
    return this.http.put<AdminCaseType>(`/api/admin/case-types/${id}`, request);
  }
}
