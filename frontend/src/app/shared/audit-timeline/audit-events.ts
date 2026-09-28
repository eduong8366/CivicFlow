import { AuditEntry } from '../../core/api/activity.models';

/** Names for ids the audit log stores: tasks by id, users by id. */
export interface AuditNames {
  tasks: ReadonlyMap<string, string>;
  users: ReadonlyMap<number, string>;
}

export interface AuditLine {
  text: string;
  /** Notes or a comment body worth showing with the line. */
  quote?: string;
}

/** Everything one person changed in one save, described in plain sentences. */
export interface AuditEvent {
  key: string;
  timestamp: string;
  userName: string | null;
  lines: AuditLine[];
  /** The raw rows, for anyone checking exactly what changed. */
  entries: AuditEntry[];
}

const quoteLength = 200;

/**
 * Turns audit rows (newest first) into a readable history. One save writes one row per changed
 * record, all with the same timestamp, so rows with the same timestamp and user become one event:
 * approving a step reads "Approved Intake" and "Plan Review started" together. Bookkeeping rows
 * (pending steps created, field values saved, Open → In progress) are left out of the sentences
 * but stay in the event's raw rows.
 */
export function groupAuditEntries(entries: readonly AuditEntry[], names: AuditNames): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const entry of entries) {
    const last = events.at(-1);
    if (last && last.timestamp === entry.timestamp && last.entries[0].userId === entry.userId) {
      last.entries.push(entry);
    } else {
      events.push({ key: String(entry.id), timestamp: entry.timestamp, userName: entry.userName, lines: [], entries: [entry] });
    }
  }

  for (const event of events) {
    const described = event.entries
      .map((entry) => ({ line: describe(entry, names), rank: rank(entry) }))
      .filter((item): item is { line: AuditLine; rank: number } => item.line !== null)
      .sort((a, b) => a.rank - b.rank);
    event.lines = described.length ? described.map((item) => item.line) : [{ text: 'Updated the case record' }];
  }

  return events;
}

function describe(entry: AuditEntry, names: AuditNames): AuditLine | null {
  const changes = entry.changes;
  const newValue = (property: string) => changes[property]?.new ?? null;

  switch (entry.entityType) {
    case 'Case':
      return describeCase(entry, newValue);

    case 'WorkflowTask': {
      const step = newValue('Name') ?? names.tasks.get(entry.entityId) ?? 'a step';
      const notes = quote(newValue('Notes'));
      switch (entry.action) {
        case 'Created':
          // Pending instances are bookkeeping; an instance created active (a return or reopen) starts work.
          return newValue('Status') === 'Active' ? started(step, newValue('AssigneeId'), names) : null;
        case 'Activated':
          return started(step, newValue('AssigneeId'), names);
        case 'Claimed':
          return { text: `Claimed ${step}` };
        case 'Assigned':
          return { text: `Assigned ${step} to ${userName(newValue('AssigneeId'), names)}` };
        case 'Unassigned':
          return { text: `Returned ${step} to the department queue` };
        case 'Approved':
          return withQuote(`Approved ${step}`, notes);
        case 'Completed':
          return withQuote(`Completed ${step}`, notes);
        case 'Rejected':
          return withQuote(`Rejected ${step}`, notes);
        case 'Returned':
          return withQuote(`Returned ${step} to the previous step`, notes);
        case 'InfoRequested':
          return withQuote(`Requested information on ${step}`, notes);
        case 'Skipped':
          return { text: `${step} skipped` };
        default:
          return { text: `Updated ${step}` };
      }
    }

    case 'Comment':
      return entry.action === 'Created'
        ? withQuote(newValue('IsInternal') === 'false' ? 'Added a public comment' : 'Added an internal comment', quote(newValue('Body')))
        : { text: `${entry.action} a comment` };

    case 'Attachment':
      return entry.action === 'Created'
        ? { text: `Attached ${newValue('FileName') ?? 'a file'}` }
        : { text: `${entry.action} an attachment` };

    case 'CaseFieldValue':
      // Values saved with a new case are part of opening it.
      return entry.action === 'Created' ? null : { text: 'Updated the case details' };

    default:
      return { text: `${entry.action} ${entry.entityType}` };
  }
}

function describeCase(entry: AuditEntry, newValue: (property: string) => string | null): AuditLine | null {
  switch (entry.action) {
    case 'Created':
      return { text: 'Opened the case' };
    case 'PutOnHold':
      return { text: 'Put the case on hold' };
    case 'Resumed':
      return { text: 'Resumed the case' };
    case 'Reopened':
      return { text: 'Reopened the case' };
    case 'Cancelled':
      return { text: 'Cancelled the case' };
    case 'Closed':
      return { text: newValue('Resolution') === 'Rejected' ? 'Closed the case as rejected' : 'Closed the case' };
    default: {
      // Open ↔ In progress follows from work on a task, which has its own line.
      const properties = Object.keys(entry.changes).filter((p) => p !== 'Status');
      return properties.length ? { text: `Updated the case: ${properties.map(humanize).join(', ')}` } : null;
    }
  }
}

function started(step: string, assigneeId: string | null, names: AuditNames): AuditLine {
  return { text: assigneeId ? `${step} started, assigned to ${userName(assigneeId, names)}` : `${step} started` };
}

function userName(id: string | null, names: AuditNames): string {
  return (id && names.users.get(Number(id))) || 'another user';
}

function withQuote(text: string, notes: string | undefined): AuditLine {
  return notes ? { text, quote: notes } : { text };
}

function quote(value: string | null): string | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }

  return text.length > quoteLength ? `${text.slice(0, quoteLength - 1).trimEnd()}…` : text;
}

/** Order within an event: what was done, then what it set going. */
function rank(entry: AuditEntry): number {
  if (entry.entityType === 'Case') {
    return entry.action === 'Created' ? 0 : 4;
  }

  if (entry.entityType === 'WorkflowTask') {
    return entry.action === 'Activated' || entry.action === 'Created' ? 3 : 2;
  }

  return 1;
}

/** `RequesterName` → "requester name". */
export function humanize(property: string): string {
  return property.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
