import { formatDate, formatNumber } from '@angular/common';
import { CaseField, CasePriority, CaseResolution, CaseStatus, TaskOutcome } from '../core/api/cases.models';

// Words for the API's enum names, as people read them.

const statusLabels: Record<CaseStatus, string> = {
  Open: 'Open',
  InProgress: 'In progress',
  OnHold: 'On hold',
  Closed: 'Closed',
  Cancelled: 'Cancelled',
};

export function caseStatusLabel(status: CaseStatus, resolution: CaseResolution | null = null): string {
  return status === 'Closed' && resolution === 'Rejected' ? 'Closed · Rejected' : statusLabels[status];
}

export function priorityLabel(priority: CasePriority): string {
  return priority;
}

const outcomeLabels: Record<TaskOutcome, string> = {
  Complete: 'Complete',
  Approve: 'Approve',
  Reject: 'Reject',
  Return: 'Return',
  RequestInfo: 'Request info',
};

const outcomePastLabels: Record<TaskOutcome, string> = {
  Complete: 'Completed',
  Approve: 'Approved',
  Reject: 'Rejected',
  Return: 'Returned',
  RequestInfo: 'Info requested',
};

/** The outcome as a choice: "Request info". */
export function outcomeLabel(outcome: TaskOutcome): string {
  return outcomeLabels[outcome];
}

/** The outcome as a result: "Approved". */
export function outcomePastLabel(outcome: TaskOutcome): string {
  return outcomePastLabels[outcome];
}

/** "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** A custom field's stored text as people read it, or null when it was left blank. */
export function formatFieldValue(field: Pick<CaseField, 'dataType' | 'value'>): string | null {
  const value = field.value;
  if (value === null || value === '') {
    return field.dataType === 'Checkbox' ? 'No' : null;
  }

  switch (field.dataType) {
    case 'Checkbox':
      return value === 'true' ? 'Yes' : 'No';
    case 'Date':
      return formatDate(value, 'mediumDate', 'en-US');
    case 'Number': {
      const number = Number(value);
      return Number.isFinite(number) ? formatNumber(number, 'en-US', '1.0-4') : value;
    }
    default:
      return value;
  }
}
