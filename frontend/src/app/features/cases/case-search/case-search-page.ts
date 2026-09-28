import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CaseTypesApi } from '../../../core/api/case-types.api';
import { CasesApi } from '../../../core/api/cases.api';
import {
  casePriorities,
  CasePriority,
  CaseListItem,
  CaseSearchQuery,
  CaseSortField,
  CaseStatus,
  caseStatuses,
} from '../../../core/api/cases.models';
import { LookupsApi } from '../../../core/api/lookups.api';
import { PagedResult } from '../../../core/api/paging';
import { problemMessage } from '../../../core/api/problem-details';
import { caseStatusLabel } from '../../../shared/labels';
import { PriorityTag, StatusChip } from '../../../shared/status-chip';
import { pageSizes, parseSearchParams, toSearchParams } from './case-search-query';

interface ResultState {
  value: PagedResult<CaseListItem> | null;
  failed: boolean;
}

/** Table columns that sort, and the API sort field for each. */
const sortColumns: Record<string, CaseSortField> = {
  caseNumber: 'CaseNumber',
  priority: 'Priority',
  dueDate: 'DueDate',
  createdAt: 'CreatedAt',
};

/**
 * Case search: filters, a server-side sorted and paged table, and the result count. The URL holds
 * the search, so the filters, sorting and paging all work by navigating.
 */
@Component({
  selector: 'app-case-search-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    PriorityTag,
    ReactiveFormsModule,
    RouterLink,
    StatusChip,
  ],
  templateUrl: './case-search-page.html',
  styleUrl: './case-search-page.scss',
})
export class CaseSearchPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly casesApi = inject(CasesApi);
  private readonly lookups = inject(LookupsApi);
  private readonly caseTypesApi = inject(CaseTypesApi);

  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseSearchParams)), {
    initialValue: {} as CaseSearchQuery,
  });

  protected readonly results = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.casesApi.search(params),
  });

  // Filter choices. If one fails to load, its filter just has no options.
  protected readonly caseTypes = rxResource({ stream: () => this.caseTypesApi.list(), defaultValue: [] });
  protected readonly departments = rxResource({ stream: () => this.lookups.departments(), defaultValue: [] });
  protected readonly users = rxResource({ stream: () => this.lookups.users(), defaultValue: [] });

  protected readonly statuses = caseStatuses.map((value) => ({ value, label: caseStatusLabel(value) }));
  protected readonly priorities = casePriorities;
  protected readonly pageSizes = pageSizes;
  protected readonly columns = ['caseNumber', 'title', 'type', 'status', 'priority', 'current', 'dueDate', 'createdAt'];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    search: '',
    caseTypeId: null as number | null,
    status: null as CaseStatus | null,
    priority: null as CasePriority | null,
    departmentId: null as number | null,
    assigneeId: null as number | null,
    createdFrom: '',
    createdTo: '',
    overdue: false,
  });

  protected readonly error = computed(() => {
    const error = this.results.error();
    return error ? problemMessage(error, 'The search failed. Please try again.') : null;
  });
  /**
   * The page on screen. While the next one loads the last one stays, so sorting or paging doesn't
   * rebuild the table (which would drop keyboard focus and make the page jump).
   */
  protected readonly page = linkedSignal<ResultState, PagedResult<CaseListItem> | null>({
    source: () => ({ value: this.results.hasValue() ? this.results.value() : null, failed: !!this.results.error() }),
    computation: (state, previous) => state.value ?? (state.failed ? null : (previous?.value ?? null)),
  });
  protected readonly sortActive = computed(() => {
    const sort = this.query().sort ?? 'CreatedAt';
    return Object.keys(sortColumns).find((column) => sortColumns[column] === sort) ?? 'createdAt';
  });
  protected readonly sortDirection = computed(() => (this.query().descending === false ? 'asc' : 'desc'));
  protected readonly filterCount = computed(() => {
    const { sort, descending, page, pageSize, ...filters } = this.query();
    return Object.values(filters).filter((value) => value !== undefined).length;
  });

  constructor() {
    // The form shows the search in the URL, including after Back or a header search.
    effect(() => {
      const query = this.query();
      untracked(() =>
        this.form.reset({
          search: query.search ?? '',
          caseTypeId: query.caseTypeId ?? null,
          status: query.status ?? null,
          priority: query.priority ?? null,
          departmentId: query.departmentId ?? null,
          assigneeId: query.assigneeId ?? null,
          createdFrom: query.createdFrom ?? '',
          createdTo: query.createdTo ?? '',
          overdue: query.overdue ?? false,
        }),
      );
    });
  }

  protected applyFilters(): void {
    const filters = this.form.getRawValue();
    const { sort, descending, pageSize } = this.query();
    this.navigate({
      search: filters.search.trim() || undefined,
      caseTypeId: filters.caseTypeId ?? undefined,
      status: filters.status ?? undefined,
      priority: filters.priority ?? undefined,
      departmentId: filters.departmentId ?? undefined,
      assigneeId: filters.assigneeId ?? undefined,
      createdFrom: filters.createdFrom || undefined,
      createdTo: filters.createdTo || undefined,
      overdue: filters.overdue || undefined,
      sort,
      descending,
      pageSize,
    });
  }

  protected clearFilters(): void {
    const { sort, descending, pageSize } = this.query();
    this.navigate({ sort, descending, pageSize });
  }

  protected sortBy(sort: Sort): void {
    // Clearing the sort returns to the default, newest first.
    const field = sort.direction ? sortColumns[sort.active] : undefined;
    this.navigate({ ...this.query(), sort: field, descending: sort.direction === 'asc' ? false : undefined, page: undefined });
  }

  protected changePage(event: PageEvent): void {
    this.navigate({ ...this.query(), page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected readonly sortLabels: Record<string, string> = {
    caseNumber: 'case number',
    priority: 'priority',
    dueDate: 'due date',
    createdAt: 'date opened',
  };

  private navigate(query: CaseSearchQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toSearchParams(query) });
  }
}
