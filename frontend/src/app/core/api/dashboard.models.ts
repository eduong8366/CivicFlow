import { UserRole } from '../auth/auth.models';
import { CaseStatus } from './cases.models';

/** Whose work a dashboard covers: staff see their own, supervisors their department, admins the agency. */
export type DashboardScope = 'Personal' | 'Department' | 'Agency';

/** `GET /api/dashboard/summary`. Dates are Pacific-time days (`yyyy-MM-dd`). */
export interface DashboardSummary {
  scope: DashboardScope;
  departmentId: number | null;
  departmentName: string | null;
  asOf: string;
  kpis: DashboardKpis;
  /** Every status, zeros included, in the status's natural order. */
  casesByStatus: StatusCount[];
  /** Null on a personal dashboard. Busiest first. */
  workload: WorkloadEntry[] | null;
  /** Per case type, for cases closed in the last 90 days. */
  cycleTimes: CycleTime[];
  /** Twelve Monday-start weeks, oldest first. */
  weeklyVolume: WeeklyVolume[];
}

export interface DashboardKpis {
  /** Open, in progress or on hold. */
  openCases: number;
  overdueCases: number;
  /** Open cases due today or in the next six days. */
  dueThisWeek: number;
  /** Closed (completed or rejected) since the first of the month; cancellations don't count. */
  closedThisMonth: number;
  /** Unclaimed tasks waiting in the queue(s) the dashboard covers. */
  queuedTasks: number;
}

export interface StatusCount {
  status: CaseStatus;
  count: number;
}

export interface WorkloadEntry {
  userId: number;
  fullName: string;
  role: UserRole;
  departmentName: string | null;
  activeTasks: number;
  overdueTasks: number;
}

export interface CycleTime {
  caseTypeId: number;
  caseTypeName: string;
  closedCount: number;
  averageDays: number;
  medianDays: number;
}

export interface WeeklyVolume {
  /** The Monday the week starts on. */
  weekStart: string;
  opened: number;
  closed: number;
}
