import { TaskListItem } from '../../core/api/tasks.models';

export function testTaskItem(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 12,
    name: 'Plan Review',
    sequence: 2,
    status: 'Active',
    departmentId: 1,
    departmentName: 'Planning & Zoning',
    assigneeId: null,
    assigneeName: null,
    dueDate: '2026-09-30',
    startedAt: '2026-09-20T19:32:00+00:00',
    isOverdue: false,
    caseId: 20,
    caseNumber: 'BLD-2026-000020',
    caseTitle: 'New Construction at 2599 Birch Ct',
    caseTypeName: 'Building Permit Application',
    casePriority: 'Normal',
    caseStatus: 'InProgress',
    ...overrides,
  };
}
