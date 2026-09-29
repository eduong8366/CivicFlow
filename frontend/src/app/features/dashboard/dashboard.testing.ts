import { DashboardSummary } from '../../core/api/dashboard.models';

/** A department dashboard (Planning & Zoning), as the API returns it to its supervisor. */
export function testSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    scope: 'Department',
    departmentId: 1,
    departmentName: 'Planning & Zoning',
    asOf: '2026-09-28',
    kpis: { openCases: 12, overdueCases: 2, dueThisWeek: 4, closedThisMonth: 3, queuedTasks: 5 },
    casesByStatus: [
      { status: 'Open', count: 1 },
      { status: 'InProgress', count: 9 },
      { status: 'OnHold', count: 2 },
      { status: 'Closed', count: 6 },
      { status: 'Cancelled', count: 0 },
    ],
    workload: [
      { userId: 7, fullName: 'Luis Ortega', role: 'Staff', departmentName: 'Planning & Zoning', activeTasks: 4, overdueTasks: 1 },
      { userId: 8, fullName: 'Dana Whitfield', role: 'Supervisor', departmentName: 'Planning & Zoning', activeTasks: 2, overdueTasks: 0 },
    ],
    cycleTimes: [
      { caseTypeId: 1, caseTypeName: 'Building Permit Application', closedCount: 5, averageDays: 18.4, medianDays: 17.7 },
    ],
    weeklyVolume: [
      { weekStart: '2026-09-14', opened: 3, closed: 1 },
      { weekStart: '2026-09-21', opened: 5, closed: 2 },
      { weekStart: '2026-09-28', opened: 1, closed: 0 },
    ],
    ...overrides,
  };
}
