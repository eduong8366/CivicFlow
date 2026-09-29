import { DatePipe, DecimalPipe, LowerCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, numberAttribute } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { CaseStatus } from '../../core/api/cases.models';
import { DashboardApi } from '../../core/api/dashboard.api';
import { DashboardSummary } from '../../core/api/dashboard.models';
import { LookupsApi } from '../../core/api/lookups.api';
import { problemMessage } from '../../core/api/problem-details';
import { AuthService } from '../../core/auth/auth.service';
import { caseStatusLabel } from '../../shared/labels';
import { ChartPanel, LegendKey } from './chart-panel';
import {
  barChartHeight,
  barEndLabels,
  chartColors,
  cycleTimeChart,
  cycleTimeSummary,
  days,
  shortDate,
  statusChart,
  statusSummary,
  volumeChart,
  volumeSummary,
  workloadChart,
  workloadSummary,
} from './dashboard-charts';

interface KpiTile {
  label: string;
  value: number;
  tone: 'accent' | 'danger' | 'warning' | 'success' | 'muted';
  /** A filtered view of the cases or tasks the figure counts, where one exists. */
  link?: { commands: string[]; queryParams?: Params; text: string };
}

/** The chart shows this many people; the table lists everyone. */
export const workloadChartLimit = 15;

/**
 * KPI tiles and charts for the caller's scope: personal for staff, their department for
 * supervisors, and the agency for admins, who can narrow it to one department (`?department=`).
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [ChartPanel, DatePipe, DecimalPipe, LowerCasePipe, MatFormFieldModule, MatProgressBarModule, MatSelectModule, RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly lookups = inject(LookupsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly user = inject(AuthService).user;

  /** Admins only: the `?department=` query parameter (component input binding). */
  readonly department = input(undefined, { transform: (value: unknown) => (value ? numberAttribute(value) : undefined) });

  protected readonly isAdmin = computed(() => this.user()?.role === 'Admin');
  protected readonly departmentId = computed(() => {
    const id = this.department();
    return this.isAdmin() && id && Number.isInteger(id) ? id : undefined;
  });

  protected readonly departments = rxResource({
    params: () => this.isAdmin() || undefined,
    stream: () => this.lookups.departments(),
    defaultValue: [],
  });

  private readonly summaryResource = rxResource({
    params: () => ({ departmentId: this.departmentId() }),
    stream: ({ params }) => this.dashboardApi.summary(params),
  });
  /** The last summary stays on screen (dimmed) while another department's loads. */
  protected readonly summary = linkedSignal<{ value: DashboardSummary | null; failed: boolean }, DashboardSummary | null>({
    source: () => ({
      value: this.summaryResource.hasValue() ? this.summaryResource.value() : null,
      failed: !!this.summaryResource.error(),
    }),
    computation: (state, previous) => state.value ?? (state.failed ? null : (previous?.value ?? null)),
  });
  protected readonly loading = this.summaryResource.isLoading;
  protected readonly error = computed(() => {
    const error = this.summaryResource.error();
    if (!error) {
      return null;
    }

    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'That department doesn’t exist. Choose another from the list.';
    }

    return problemMessage(error, "The dashboard couldn't be loaded. Please try again.");
  });

  protected readonly heading = computed(() => {
    const summary = this.summary();
    switch (summary?.scope) {
      case 'Personal':
        return 'My dashboard';
      case 'Department':
        return `${summary.departmentName} dashboard`;
      case 'Agency':
        return 'Agency dashboard';
      default:
        return 'Dashboard';
    }
  });
  protected readonly lede = computed(() => {
    const summary = this.summary();
    switch (summary?.scope) {
      case 'Personal':
        return 'Cases you opened or have been assigned a step on.';
      case 'Department':
        return `Cases with a step routed to ${summary.departmentName}.`;
      case 'Agency':
        return 'Every case in the agency.';
      default:
        return '';
    }
  });

  /** Case search filters that match the dashboard's scope, or null when none do (personal). */
  private readonly caseFilter = computed<Params | null>(() => {
    const summary = this.summary();
    if (!summary || summary.scope === 'Personal') {
      return null;
    }

    return summary.departmentId ? { departmentId: summary.departmentId } : {};
  });

  protected readonly tiles = computed<KpiTile[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }

    const { kpis } = summary;
    const filter = this.caseFilter();
    const queueLink = this.queueLink(summary);
    return [
      { label: 'Open cases', value: kpis.openCases, tone: 'accent' },
      {
        label: 'Overdue',
        value: kpis.overdueCases,
        tone: 'danger',
        link: filter ? { commands: ['/cases'], queryParams: { ...filter, overdue: true }, text: 'View overdue cases' } : undefined,
      },
      { label: 'Due in the next 7 days', value: kpis.dueThisWeek, tone: 'warning' },
      { label: 'Closed this month', value: kpis.closedThisMonth, tone: 'success' },
      {
        label: summary.scope === 'Agency' ? 'Waiting in queues' : 'Waiting in the queue',
        value: kpis.queuedTasks,
        tone: 'muted',
        link: queueLink ? { ...queueLink, text: 'Open the queue' } : undefined,
      },
    ];
  });

  protected readonly statusChart = computed(() => statusChart(this.summary()?.casesByStatus ?? []));
  protected readonly statusSummary = computed(() => statusSummary(this.summary()?.casesByStatus ?? []));

  protected readonly volumeChart = computed(() => volumeChart(this.summary()?.weeklyVolume ?? []));
  protected readonly volumeSummary = computed(() => volumeSummary(this.summary()?.weeklyVolume ?? []));
  protected readonly volumeLegend: LegendKey[] = [
    { label: 'Opened', color: chartColors.series },
    { label: 'Closed', color: chartColors.closed },
  ];
  protected readonly volumeEmpty = computed(() =>
    this.summary()?.weeklyVolume.some((w) => w.opened || w.closed) ? null : 'No cases were opened or closed in the last 12 weeks.',
  );

  protected readonly workload = computed(() => this.summary()?.workload ?? null);
  protected readonly workloadChart = computed(() => workloadChart((this.workload() ?? []).slice(0, workloadChartLimit)));
  protected readonly workloadSummary = computed(() => workloadSummary(this.workload() ?? []));
  protected readonly workloadLegend: LegendKey[] = [
    { label: 'Not overdue', color: chartColors.series },
    { label: 'Overdue', color: chartColors.overdue },
  ];
  protected readonly workloadNote = computed(() => {
    const count = this.workload()?.length ?? 0;
    return count > workloadChartLimit ? `The ${workloadChartLimit} busiest of ${count} people; the numbers list everyone.` : undefined;
  });
  protected readonly workloadHeight = computed(() => barChartHeight(Math.min(this.workload()?.length ?? 0, workloadChartLimit)));
  protected readonly workloadEmpty = computed(() => (this.workload()?.length ? null : 'Nobody here takes tasks yet.'));

  protected readonly cycleTimes = computed(() => this.summary()?.cycleTimes ?? []);
  protected readonly cycleTimeChart = computed(() => cycleTimeChart(this.cycleTimes()));
  protected readonly cycleTimeSummary = computed(() => cycleTimeSummary(this.cycleTimes()));
  protected readonly cycleTimeEmpty = computed(() => (this.cycleTimes().length ? null : 'No cases closed in the last 90 days.'));

  protected readonly countLabels = [barEndLabels()];
  protected readonly dayLabels = [barEndLabels((value) => value.toFixed(1))];
  protected readonly barChartHeight = barChartHeight;
  protected readonly days = days;
  protected readonly shortDate = shortDate;
  protected readonly statusLabel = (status: CaseStatus) => caseStatusLabel(status);

  /** Case search for one status, in the dashboard's scope. */
  protected statusLink(status: CaseStatus): Params | null {
    const filter = this.caseFilter();
    return filter ? { ...filter, status } : null;
  }

  protected chooseDepartment(id: number | null): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { department: id ?? undefined } });
  }

  private queueLink(summary: DashboardSummary): { commands: string[]; queryParams?: Params } | null {
    if (this.isAdmin()) {
      return { commands: ['/queue'], queryParams: summary.departmentId ? { department: summary.departmentId } : undefined };
    }

    // The queue is the user's own department's; without one there's no queue.
    return this.user()?.departmentId ? { commands: ['/queue'] } : null;
  }
}
