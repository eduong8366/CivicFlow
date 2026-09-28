// The API's case, workflow and case type contracts. Enums arrive as their names; dates as
// yyyy-MM-dd (`DateOnly`) and instants as ISO 8601 with an offset.

export type CaseStatus = 'Open' | 'InProgress' | 'OnHold' | 'Closed' | 'Cancelled';
export type CaseResolution = 'Completed' | 'Rejected';
export type CasePriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type FieldDataType = 'Text' | 'Number' | 'Date' | 'Select' | 'Checkbox';
export type WorkflowTaskStatus = 'Pending' | 'Active' | 'Completed' | 'Skipped';
export type TaskOutcome = 'Complete' | 'Approve' | 'Reject' | 'Return' | 'RequestInfo';

export const caseStatuses: readonly CaseStatus[] = ['Open', 'InProgress', 'OnHold', 'Closed', 'Cancelled'];
export const casePriorities: readonly CasePriority[] = ['Low', 'Normal', 'High', 'Urgent'];

export interface UserSummary {
  id: number;
  fullName: string;
}

/** A row in case search. The "current" columns describe the case's active task, if any. */
export interface CaseListItem {
  id: number;
  caseNumber: string;
  title: string;
  caseTypeId: number;
  caseTypeName: string;
  status: CaseStatus;
  resolution: CaseResolution | null;
  priority: CasePriority;
  requesterName: string;
  createdAt: string;
  dueDate: string | null;
  closedAt: string | null;
  isOverdue: boolean;
  currentStep: string | null;
  currentDepartmentName: string | null;
  currentAssigneeName: string | null;
  currentStepDueDate: string | null;
}

export type CaseSortField = 'CreatedAt' | 'DueDate' | 'Priority' | 'CaseNumber';

/** Case search filters, all optional. */
export interface CaseSearchQuery {
  caseTypeId?: number;
  status?: CaseStatus;
  priority?: CasePriority;
  /** Cases with any task, past or future, routed to this department. */
  departmentId?: number;
  /** Cases whose active task is assigned to this user. */
  assigneeId?: number;
  /** yyyy-MM-dd, UTC, inclusive. */
  createdFrom?: string;
  createdTo?: string;
  overdue?: boolean;
  /** Part of the case number, title or requester name. */
  search?: string;
  sort?: CaseSortField;
  descending?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CaseField {
  fieldId: number;
  key: string;
  label: string;
  dataType: FieldDataType;
  isRequired: boolean;
  /** Null when left blank. */
  value: string | null;
}

/**
 * One step instance. A returned or reopened step has several instances with the same `sequence`;
 * the last is its current state.
 */
export interface WorkflowTask {
  id: number;
  name: string;
  sequence: number;
  departmentId: number;
  departmentName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  status: WorkflowTaskStatus;
  outcome: TaskOutcome | null;
  allowedOutcomes: TaskOutcome[];
  notes: string | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  actions: { canClaim: boolean; canAssign: boolean; canComplete: boolean };
}

export interface CaseDetail {
  id: number;
  caseNumber: string;
  title: string;
  description: string | null;
  caseType: { id: number; name: string; prefix: string };
  status: CaseStatus;
  resolution: CaseResolution | null;
  priority: CasePriority;
  requester: { name: string; email: string | null; phone: string | null; address: string | null };
  createdBy: UserSummary;
  createdAt: string;
  dueDate: string | null;
  closedAt: string | null;
  isOverdue: boolean;
  fields: CaseField[];
  tasks: WorkflowTask[];
  actions: { canHold: boolean; canCancel: boolean; canReopen: boolean };
}

/**
 * A new case. `fields` maps each custom field's key to its value as text: numbers in invariant
 * form, dates as yyyy-MM-dd and checkboxes as "true"/"false".
 */
export interface CreateCaseRequest {
  caseTypeId: number;
  title: string;
  description: string | null;
  priority: CasePriority;
  requesterName: string;
  requesterEmail: string | null;
  requesterPhone: string | null;
  requesterAddress: string | null;
  fields: Record<string, string | null>;
}

export interface CaseTypeField {
  id: number;
  key: string;
  label: string;
  dataType: FieldDataType;
  isRequired: boolean;
  options: string[];
  sortOrder: number;
}

export interface WorkflowStep {
  id: number;
  name: string;
  sortOrder: number;
  departmentId: number;
  departmentName: string;
  slaDays: number;
  allowedOutcomes: TaskOutcome[];
}

/** An active case type with the definitions the New Case form renders. */
export interface CaseType {
  id: number;
  name: string;
  prefix: string;
  description: string | null;
  fields: CaseTypeField[];
  steps: WorkflowStep[];
}
