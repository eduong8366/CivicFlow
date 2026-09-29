// The API's admin contracts: user accounts, departments and the case type designer.

import { UserRole } from '../auth/auth.models';
import { FieldDataType, TaskOutcome } from './cases.models';

export const userRoles: readonly UserRole[] = ['Staff', 'Supervisor', 'Admin'];
export const fieldDataTypes: readonly FieldDataType[] = ['Text', 'Number', 'Date', 'Select', 'Checkbox'];
export const taskOutcomes: readonly TaskOutcome[] = ['Complete', 'Approve', 'Reject', 'Return', 'RequestInfo'];

/** Passwords are checked for length only, following NIST SP 800-63B. */
export const passwordRules = { minLength: 12, maxLength: 256 } as const;

/** A user account as admins manage it. `activeTaskCount` is the user's current workload. */
export interface AdminUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: number | null;
  departmentName: string | null;
  isActive: boolean;
  activeTaskCount: number;
}

export interface AdminUserQuery {
  /** Part of the name or email. */
  search?: string;
  role?: UserRole;
  departmentId?: number;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

/** Staff and supervisors must belong to a department; admins may be agency-wide. */
export interface CreateUserRequest {
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  departmentId: number | null;
}

/**
 * Replaces an account's details. Deactivating an account, or moving it to another department,
 * sends its active tasks back to their department queues.
 */
export interface UpdateUserRequest {
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: number | null;
  isActive: boolean;
}

/** A department with what depends on it. It can be deactivated only when all three counts are zero. */
export interface AdminDepartment {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
  activeUserCount: number;
  /** Workflow steps of active case types routed here. */
  activeStepCount: number;
  /** Active tasks routed here, queued or assigned. */
  activeTaskCount: number;
}

export interface SaveDepartmentRequest {
  name: string;
  /** Stored in upper case. */
  code: string;
  isActive: boolean;
}

export interface AdminCaseTypeListItem {
  id: number;
  name: string;
  prefix: string;
  description: string | null;
  isActive: boolean;
  fieldCount: number;
  stepCount: number;
  caseCount: number;
  openCaseCount: number;
}

/** `inUse`: the field has values on existing cases, so it can't be removed or change type. */
export interface AdminCaseTypeField {
  id: number;
  key: string;
  label: string;
  dataType: FieldDataType;
  isRequired: boolean;
  options: string[];
  sortOrder: number;
  inUse: boolean;
}

/** `inUse`: the step has tasks on existing cases, so it can't be removed. */
export interface AdminWorkflowStep {
  id: number;
  name: string;
  sortOrder: number;
  departmentId: number;
  departmentName: string;
  departmentIsActive: boolean;
  slaDays: number;
  allowedOutcomes: TaskOutcome[];
  inUse: boolean;
}

/** A case type as the designer edits it, active or not. */
export interface AdminCaseType {
  id: number;
  name: string;
  prefix: string;
  description: string | null;
  isActive: boolean;
  caseCount: number;
  fields: AdminCaseTypeField[];
  steps: AdminWorkflowStep[];
}

/** Items with an `id` update that field; items without one are added. */
export interface CaseTypeFieldInput {
  id: number | null;
  key: string;
  label: string;
  dataType: FieldDataType;
  isRequired: boolean;
  /** Select fields only; empty for the others. */
  options: string[];
}

export interface WorkflowStepInput {
  id: number | null;
  name: string;
  departmentId: number;
  slaDays: number;
  allowedOutcomes: TaskOutcome[];
}

/**
 * A case type's whole definition. Fields and steps are listed in form and workflow order; existing
 * ones left out are removed.
 */
export interface SaveCaseTypeRequest {
  name: string;
  prefix: string;
  description: string | null;
  isActive: boolean;
  fields: CaseTypeFieldInput[];
  steps: WorkflowStepInput[];
}
