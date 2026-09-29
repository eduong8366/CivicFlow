import { UserSummary } from './cases.models';

export interface Comment {
  id: number;
  caseId: number;
  body: string;
  isInternal: boolean;
  author: UserSummary;
  createdAt: string;
}

export interface CreateCommentRequest {
  body: string;
  /** Internal comments are for staff only; the API defaults to internal. */
  isInternal: boolean;
}

export interface Attachment {
  id: number;
  caseId: number;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: UserSummary;
  uploadedAt: string;
}

/** One property's value before and after a change, as text. Null means no value. */
export interface AuditChange {
  old: string | null;
  new: string | null;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  /** Case, WorkflowTask, Comment, Attachment, CaseFieldValue, User… */
  entityType: string;
  entityId: string;
  /** Created, Updated, Deleted, or a workflow transition such as Claimed or Approved. */
  action: string;
  caseId: number | null;
  caseNumber: string | null;
  /** Null for system changes. */
  userId: number | null;
  userName: string | null;
  /** Keyed by property name, e.g. `Status`. */
  changes: Record<string, AuditChange>;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
}

/** A colleague as lookups show them: no email or account details. */
export interface UserLookup {
  id: number;
  fullName: string;
  role: 'Staff' | 'Supervisor' | 'Admin';
  departmentId: number | null;
  departmentName: string | null;
  isActive: boolean;
}

/** Agency audit log filters, all optional. */
export interface AuditQuery {
  /** Case, WorkflowTask, Comment, Attachment, User, Department, CaseType… */
  entityType?: string;
  entityId?: string;
  caseId?: number;
  userId?: number;
  action?: string;
  /** yyyy-MM-dd, UTC, inclusive. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
