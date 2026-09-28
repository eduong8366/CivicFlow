import { AuditChange, AuditEntry } from '../../core/api/activity.models';
import { AuditNames, groupAuditEntries, humanize } from './audit-events';

let nextId = 100;

function entry(
  entityType: string,
  entityId: string,
  action: string,
  changes: Record<string, Partial<AuditChange>> = {},
  overrides: Partial<AuditEntry> = {},
): AuditEntry {
  return {
    id: nextId--,
    timestamp: '2026-09-20T19:32:00+00:00',
    entityType,
    entityId,
    action,
    caseId: 1,
    caseNumber: 'BLD-2026-000020',
    userId: 7,
    userName: 'Luis Ortega',
    changes: Object.fromEntries(
      Object.entries(changes).map(([key, change]) => [key, { old: change.old ?? null, new: change.new ?? null }]),
    ),
    ...overrides,
  };
}

const names: AuditNames = {
  tasks: new Map([
    ['11', 'Intake'],
    ['12', 'Plan Review'],
  ]),
  users: new Map([
    [7, 'Luis Ortega'],
    [9, 'Mia Chen'],
  ]),
};

const texts = (entries: AuditEntry[]) => groupAuditEntries(entries, names).map((e) => e.lines.map((l) => l.text));

describe('groupAuditEntries', () => {
  it('reads one save as one event, the action first and what it set going after', () => {
    const events = groupAuditEntries(
      [
        entry('WorkflowTask', '12', 'Activated', { Status: { old: 'Pending', new: 'Active' } }),
        entry('Case', '1', 'Updated', { Status: { old: 'Open', new: 'InProgress' } }),
        entry('WorkflowTask', '11', 'Approved', { Outcome: { new: 'Approve' }, Notes: { new: 'All documents received.' } }),
      ],
      names,
    );

    expect(events).toHaveLength(1);
    expect(events[0].userName).toBe('Luis Ortega');
    expect(events[0].lines).toEqual([
      { text: 'Approved Intake', quote: 'All documents received.' },
      { text: 'Plan Review started' },
    ]);
    expect(events[0].entries).toHaveLength(3);
  });

  it('splits events by time and by person', () => {
    expect(
      texts([
        entry('WorkflowTask', '12', 'Claimed', { AssigneeId: { new: '7' } }, { timestamp: '2026-09-22T00:10:00+00:00' }),
        entry('WorkflowTask', '11', 'Assigned', { AssigneeId: { new: '9' } }, { userId: 3, userName: 'Ana Ruiz' }),
        entry('WorkflowTask', '11', 'Claimed', { AssigneeId: { new: '7' } }),
      ]),
    ).toEqual([['Claimed Plan Review'], ['Assigned Intake to Mia Chen'], ['Claimed Intake']]);
  });

  it('describes opening a case without the bookkeeping rows', () => {
    expect(
      texts([
        entry('CaseFieldValue', '5', 'Created', { Value: { new: '493-11-2774' } }),
        entry('WorkflowTask', '12', 'Created', { Name: { new: 'Plan Review' }, Status: { new: 'Pending' } }),
        entry('WorkflowTask', '11', 'Created', { Name: { new: 'Intake' }, Status: { new: 'Active' } }),
        entry('Case', '1', 'Created', { Title: { new: 'New build' } }),
      ]),
    ).toEqual([['Opened the case', 'Intake started']]);
  });

  it('names case transitions and says how a case closed', () => {
    expect(texts([entry('Case', '1', 'Closed', { Resolution: { new: 'Rejected' } })])).toEqual([
      ['Closed the case as rejected'],
    ]);
    expect(texts([entry('Case', '1', 'PutOnHold')])).toEqual([['Put the case on hold']]);
    expect(texts([entry('Case', '1', 'Updated', { Priority: { old: 'Normal', new: 'High' } })])).toEqual([
      ['Updated the case: priority'],
    ]);
  });

  it('describes comments and attachments', () => {
    expect(
      texts([
        entry('Attachment', '3', 'Created', { FileName: { new: 'site-plan.pdf' } }, { timestamp: '2026-09-26T10:00:00Z' }),
        entry('Comment', '4', 'Created', { Body: { new: 'Called the owner.' }, IsInternal: { new: 'false' } }),
      ]),
    ).toEqual([['Attached site-plan.pdf'], ['Added a public comment']]);
  });

  it('quotes long notes shortened', () => {
    const [event] = groupAuditEntries([entry('WorkflowTask', '11', 'Rejected', { Notes: { new: 'x'.repeat(500) } })], names);

    expect(event.lines[0].quote).toHaveLength(200);
    expect(event.lines[0].quote?.endsWith('…')).toBe(true);
  });

  it('still shows an event whose rows are all bookkeeping', () => {
    expect(texts([entry('Case', '1', 'Updated', { Status: { old: 'InProgress', new: 'Open' } })])).toEqual([
      ['Updated the case record'],
    ]);
  });

  it('falls back when a name is unknown', () => {
    expect(texts([entry('WorkflowTask', '99', 'Assigned', { AssigneeId: { new: '404' } })])).toEqual([
      ['Assigned a step to another user'],
    ]);
  });
});

describe('humanize', () => {
  it('turns property names into words', () => {
    expect(humanize('RequesterName')).toBe('requester name');
  });
});
