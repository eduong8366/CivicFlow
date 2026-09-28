import { CaseDetail, WorkflowTask } from '../../../core/api/cases.models';

export function testTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    id: 1,
    name: 'Intake',
    sequence: 1,
    departmentId: 1,
    departmentName: 'Planning & Zoning',
    assigneeId: null,
    assigneeName: null,
    status: 'Pending',
    outcome: null,
    allowedOutcomes: ['Approve', 'Reject'],
    notes: null,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    isOverdue: false,
    actions: { canClaim: false, canAssign: false, canComplete: false },
    ...overrides,
  };
}

export function testCase(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 20,
    caseNumber: 'BLD-2026-000020',
    title: 'New Construction at 2599 Birch Ct',
    description: 'Two-storey house.',
    caseType: { id: 1, name: 'Building Permit Application', prefix: 'BLD' },
    status: 'InProgress',
    resolution: null,
    priority: 'Normal',
    requester: { name: 'Rachel Martinez', email: 'rachel@example.com', phone: '(217) 555-0122', address: '3764 Lincoln Blvd' },
    createdBy: { id: 5, fullName: 'Priya Raman' },
    createdAt: '2026-09-18T08:01:00+00:00',
    dueDate: '2026-10-07',
    closedAt: null,
    isOverdue: false,
    fields: [
      { fieldId: 1, key: 'parcelNumber', label: 'Parcel number', dataType: 'Text', isRequired: true, value: '493-11-2774' },
      { fieldId: 2, key: 'valuation', label: 'Estimated valuation', dataType: 'Number', isRequired: false, value: '627000' },
      { fieldId: 3, key: 'squareFeet', label: 'Square footage', dataType: 'Number', isRequired: false, value: null },
      { fieldId: 4, key: 'ownerOccupied', label: 'Owner-occupied', dataType: 'Checkbox', isRequired: false, value: 'false' },
    ],
    tasks: [
      testTask({
        id: 11,
        status: 'Completed',
        outcome: 'Approve',
        assigneeId: 7,
        assigneeName: 'Luis Ortega',
        completedAt: '2026-09-20T19:32:00+00:00',
      }),
      testTask({
        id: 12,
        name: 'Plan Review',
        sequence: 2,
        status: 'Active',
        assigneeId: 7,
        assigneeName: 'Luis Ortega',
        dueDate: '2026-09-30',
        startedAt: '2026-09-20T19:32:00+00:00',
      }),
      testTask({ id: 13, name: 'Inspection', sequence: 3, departmentId: 3, departmentName: 'Public Works' }),
    ],
    actions: { canHold: false, canCancel: false, canReopen: false },
    ...overrides,
  };
}
