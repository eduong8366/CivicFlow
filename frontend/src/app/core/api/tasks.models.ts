import { CasePriority, CaseStatus, TaskOutcome, WorkflowTaskStatus } from './cases.models';
import { PageQuery } from './paging';

/** A row in My Work or a department queue: the task plus enough of its case to triage it. */
export interface TaskListItem {
  id: number;
  name: string;
  sequence: number;
  status: WorkflowTaskStatus;
  departmentId: number;
  departmentName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  dueDate: string | null;
  startedAt: string | null;
  isOverdue: boolean;
  caseId: number;
  caseNumber: string;
  caseTitle: string;
  caseTypeName: string;
  casePriority: CasePriority;
  caseStatus: CaseStatus;
}

export interface TaskQueueQuery extends PageQuery {
  /** Defaults to the caller's department. Only admins may choose another, or leave it out for all. */
  departmentId?: number;
}

export interface CompleteTaskRequest {
  outcome: TaskOutcome;
  /** Required for Reject, Return and Request info. */
  notes: string | null;
}
