import { ParamMap, Params } from '@angular/router';
import { AdminUserQuery, userRoles } from '../../../core/api/admin.models';
import { UserRole } from '../../../core/auth/auth.models';

// The user list's filters live in the URL (?role=Supervisor&department=2), so other pages can
// link to them, e.g. a department's people. Malformed values are dropped.

export const userPageSizes = [25, 50, 100];

export type UserStatusFilter = 'active' | 'inactive';

export interface UserFilters {
  search?: string;
  role?: UserRole;
  department?: number;
  status?: UserStatusFilter;
  page?: number;
  pageSize?: number;
}

export function parseUserFilters(params: ParamMap): UserFilters {
  const id = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const role = params.get('role') as UserRole;
  const status = params.get('status');
  const pageSize = id('pageSize');

  return {
    search: params.get('search')?.trim().slice(0, 100) || undefined,
    role: userRoles.includes(role) ? role : undefined,
    department: id('department'),
    status: status === 'active' || status === 'inactive' ? status : undefined,
    page: id('page'),
    pageSize: pageSize && userPageSizes.includes(pageSize) ? pageSize : undefined,
  };
}

/** Query parameters for the filters, leaving out empty ones and defaults. */
export function toUserParams(filters: UserFilters): Params {
  const params: Params = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if ((key === 'page' && value === 1) || (key === 'pageSize' && value === userPageSizes[0])) {
      continue;
    }

    params[key] = String(value);
  }

  return params;
}

/** The API query for the filters. */
export function toUserQuery(filters: UserFilters): AdminUserQuery {
  return {
    search: filters.search,
    role: filters.role,
    departmentId: filters.department,
    isActive: filters.status === undefined ? undefined : filters.status === 'active',
    page: filters.page,
    pageSize: filters.pageSize ?? userPageSizes[0],
  };
}
