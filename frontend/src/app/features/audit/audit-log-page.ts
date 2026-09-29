import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuditChange, AuditEntry, AuditQuery } from '../../core/api/activity.models';
import { AuditApi } from '../../core/api/audit.api';
import { LookupsApi } from '../../core/api/lookups.api';
import { PagedResult } from '../../core/api/paging';
import { problemMessage } from '../../core/api/problem-details';
import { AuthService } from '../../core/auth/auth.service';
import { humanize } from '../../shared/audit-timeline/audit-events';
import { keepPrevious, ResultState } from '../tasks/task-paging';
import {
  actionLabel,
  adminEntityTypes,
  auditActions,
  auditPageSizes,
  caseEntityTypes,
  entityTypeLabel,
  parseAuditParams,
  toAuditParams,
} from './audit-log-query';

/**
 * The audit log: every recorded change, newest first, filtered by who, what and when. Supervisors
 * see changes to cases involving their department; admins see everything, including accounts,
 * departments and case types.
 */
@Component({
  selector: 'app-audit-log-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './audit-log-page.html',
  styleUrl: './audit-log-page.scss',
})
export class AuditLogPage {
  private readonly api = inject(AuditApi);
  private readonly lookups = inject(LookupsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly user = inject(AuthService).user;

  protected readonly isAdmin = computed(() => this.user()?.role === 'Admin');
  protected readonly entityTypes = computed(() => (this.isAdmin() ? [...caseEntityTypes, ...adminEntityTypes] : caseEntityTypes));
  protected readonly actions = auditActions;
  protected readonly pageSizes = auditPageSizes;
  protected readonly columns = ['timestamp', 'user', 'action', 'record', 'changes'];
  protected readonly actionLabel = actionLabel;
  protected readonly entityTypeLabel = entityTypeLabel;
  protected readonly humanize = humanize;

  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseAuditParams)), { initialValue: {} as AuditQuery });
  protected readonly entries = rxResource({
    params: () => ({ ...this.query(), pageSize: this.query().pageSize ?? auditPageSizes[0] }),
    stream: ({ params }) => this.api.search(params),
  });
  protected readonly page = linkedSignal<ResultState<AuditEntry>, PagedResult<AuditEntry> | null>({
    source: () => ({ value: this.entries.hasValue() ? this.entries.value() : null, failed: !!this.entries.error() }),
    computation: keepPrevious,
  });
  protected readonly error = computed(() => {
    const error = this.entries.error();
    return error ? problemMessage(error, "The audit log couldn't be loaded. Please try again.") : null;
  });
  // Deactivated people too: old entries name people who have since left.
  protected readonly users = rxResource({ stream: () => this.lookups.users({ includeInactive: true }), defaultValue: [] });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    userId: null as number | null,
    entityType: null as string | null,
    action: null as string | null,
    from: '',
    to: '',
  });
  protected readonly filterCount = computed(() => {
    const { page, pageSize, ...filters } = this.query();
    return Object.values(filters).filter((value) => value !== undefined).length;
  });
  /** A single record's history, from a link; the form has no control for it. */
  protected readonly record = computed(() => {
    const { entityType, entityId } = this.query();
    return entityType && entityId ? `${entityTypeLabel(entityType)} #${entityId}` : null;
  });

  constructor() {
    // The form shows the filters in the URL, including after Back or a link from another page.
    effect(() => {
      const query = this.query();
      untracked(() =>
        this.form.reset({
          userId: query.userId ?? null,
          entityType: query.entityType ?? null,
          action: query.action ?? null,
          from: query.from ?? '',
          to: query.to ?? '',
        }),
      );
    });
  }

  protected applyFilters(): void {
    const value = this.form.getRawValue();
    const { entityType, entityId, caseId, pageSize } = this.query();
    this.navigate({
      userId: value.userId ?? undefined,
      entityType: value.entityType ?? undefined,
      // Keep a linked record's filter while its type is still chosen.
      entityId: value.entityType && value.entityType === entityType ? entityId : undefined,
      caseId,
      action: value.action ?? undefined,
      from: value.from || undefined,
      to: value.to || undefined,
      pageSize,
    });
  }

  protected clearFilters(): void {
    this.navigate({ pageSize: this.query().pageSize });
  }

  protected showAllRecords(): void {
    this.navigate({ ...this.query(), entityId: undefined, page: undefined });
  }

  protected changePage(event: PageEvent): void {
    this.navigate({ ...this.query(), page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected changeCount(entry: AuditEntry): number {
    return Object.keys(entry.changes).length;
  }

  /** Each changed property, in the order the API recorded them. */
  protected changesOf(entry: AuditEntry): { key: string; value: AuditChange }[] {
    return Object.entries(entry.changes).map(([key, value]) => ({ key, value }));
  }

  private navigate(query: AuditQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toAuditParams(query) });
  }
}
