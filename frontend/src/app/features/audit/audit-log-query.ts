import { ParamMap, Params } from '@angular/router';
import { AuditQuery } from '../../core/api/activity.models';

// The audit log's filters live in the URL (?userId=5&action=Claimed), so other pages can link to
// someone's changes or one record's history. Malformed values are dropped.

export const auditPageSizes = [25, 50, 100];

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Record types as people read them. The last five are admin-only: they aren't part of a case. */
export const entityTypeLabels: Record<string, string> = {
  Case: 'Case',
  WorkflowTask: 'Workflow step',
  Comment: 'Comment',
  Attachment: 'Attachment',
  CaseFieldValue: 'Case field value',
  User: 'User account',
  Department: 'Department',
  CaseType: 'Case type',
  CaseTypeField: 'Case type field',
  WorkflowStepTemplate: 'Case type step',
};

export const caseEntityTypes = ['Case', 'WorkflowTask', 'Comment', 'Attachment', 'CaseFieldValue'];
export const adminEntityTypes = ['User', 'Department', 'CaseType', 'CaseTypeField', 'WorkflowStepTemplate'];

/** Every action the audit log records, in roughly the order work happens. */
export const auditActions = [
  'Created',
  'Updated',
  'Deleted',
  'Activated',
  'Claimed',
  'Assigned',
  'Unassigned',
  'Completed',
  'Approved',
  'Rejected',
  'Returned',
  'InfoRequested',
  'Skipped',
  'PutOnHold',
  'Resumed',
  'Reopened',
  'Cancelled',
  'Closed',
];

/** "PutOnHold" → "Put on hold". */
export function actionLabel(action: string): string {
  const words = action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entityTypeLabel(entityType: string): string {
  return entityTypeLabels[entityType] ?? entityType;
}

export function parseAuditParams(params: ParamMap): AuditQuery {
  const id = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const date = (key: string) => {
    const value = params.get(key);
    return value && datePattern.test(value) ? value : undefined;
  };
  const entityType = params.get('entityType') ?? '';
  const action = params.get('action') ?? '';
  const pageSize = id('pageSize');
  const known = entityType in entityTypeLabels;

  return {
    entityType: known ? entityType : undefined,
    // One record's history only makes sense with its type.
    entityId: known ? params.get('entityId')?.trim().slice(0, 50) || undefined : undefined,
    caseId: id('caseId'),
    userId: id('userId'),
    action: auditActions.includes(action) ? action : undefined,
    from: date('from'),
    to: date('to'),
    page: id('page'),
    pageSize: pageSize && auditPageSizes.includes(pageSize) ? pageSize : undefined,
  };
}

/** Query parameters for the filters, leaving out empty ones and defaults. */
export function toAuditParams(query: AuditQuery): Params {
  const params: Params = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if ((key === 'page' && value === 1) || (key === 'pageSize' && value === auditPageSizes[0])) {
      continue;
    }

    params[key] = String(value);
  }

  return params;
}
