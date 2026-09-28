import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LookupsApi } from '../../core/api/lookups.api';
import { PagedResult } from '../../core/api/paging';
import { problemMessage } from '../../core/api/problem-details';
import { TasksApi } from '../../core/api/tasks.api';
import { TaskListItem } from '../../core/api/tasks.models';
import { AuthService } from '../../core/auth/auth.service';
import { openAssignDialog } from '../../shared/assign-dialog';
import { keepPrevious, ResultState, taskPageSizes } from './task-paging';
import { TaskTable } from './task-table';

interface Notice {
  kind: 'success' | 'error';
  message: string;
  /** Links to the case the action was on. */
  caseId?: number;
  caseNumber?: string;
}

/**
 * Unassigned work waiting in a department's queue, soonest due first. Anyone in the department can
 * claim a task; supervisors and admins can also assign it. Admins can view any queue, or all.
 */
@Component({
  selector: 'app-queue-page',
  imports: [MatFormFieldModule, MatPaginatorModule, MatProgressBarModule, MatSelectModule, RouterLink, TaskTable],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ heading() }}</h1>
        <p class="lede">Unassigned steps waiting for someone to pick them up.</p>
      </div>
      @if (isAdmin()) {
        <mat-form-field appearance="outline" class="department" subscriptSizing="dynamic">
          <mat-label>Department</mat-label>
          <mat-select [value]="departmentId() ?? null" (valueChange)="chooseDepartment($event)">
            <mat-option [value]="null">All departments</mat-option>
            @for (department of departments.value(); track department.id) {
              <mat-option [value]="department.id">{{ department.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>

    @if (notice(); as n) {
      <div
        #noticeBox
        class="cf-alert"
        [class.cf-alert--success]="n.kind === 'success'"
        [class.cf-alert--error]="n.kind === 'error'"
        [attr.role]="n.kind === 'error' ? 'alert' : 'status'"
        tabindex="-1"
      >
        {{ n.message }}
        @if (n.caseId) {
          <a [routerLink]="['/cases', n.caseId]">Open {{ n.caseNumber }}</a>
        }
      </div>
    }

    <section class="cf-panel results" aria-labelledby="queue-heading">
      <div class="results-head">
        <h2 id="queue-heading">Waiting</h2>
        <p class="count" role="status">
          @if (tasks.isLoading()) {
            Loading…
          } @else if (page(); as page) {
            {{ page.totalCount }} unassigned {{ page.totalCount === 1 ? 'task' : 'tasks' }}
          }
        </p>
      </div>

      @if (tasks.isLoading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading the queue" />
      }

      @if (error(); as error) {
        <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
      }

      @if (page(); as page) {
        <app-task-table
          mode="queue"
          [caption]="heading()"
          [tasks]="page.items"
          [showDepartment]="isAdmin() && !departmentId()"
          [canAssign]="canAssign()"
          [busyTaskId]="claiming()"
          [loading]="tasks.isLoading()"
          emptyMessage="The queue is empty: every active step has someone on it."
          (claim)="claim($event)"
          (assign)="assign($event)"
        />
        @if (page.totalCount > pageSizes[0]) {
          <mat-paginator
            [length]="page.totalCount"
            [pageIndex]="page.page - 1"
            [pageSize]="page.pageSize"
            [pageSizeOptions]="pageSizes"
            (page)="changePage($event)"
            aria-label="Queue pages"
          />
        }
      }
    </section>
  `,
  styleUrl: './task-pages.scss',
})
export class QueuePage {
  private readonly tasksApi = inject(TasksApi);
  private readonly lookups = inject(LookupsApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly user = inject(AuthService).user;

  /** Admins only: the `?department=` query parameter (component input binding). */
  readonly department = input(undefined, { transform: (value: unknown) => (value ? numberAttribute(value) : undefined) });

  protected readonly isAdmin = computed(() => this.user()?.role === 'Admin');
  protected readonly canAssign = computed(() => this.user()?.role !== 'Staff');
  /** The queue shown. Others always see their own department's, which the API picks. */
  protected readonly departmentId = computed(() => {
    const id = this.department();
    return this.isAdmin() && id && Number.isInteger(id) ? id : undefined;
  });

  protected readonly departments = rxResource({
    params: () => this.isAdmin() || undefined,
    stream: () => this.lookups.departments(),
    defaultValue: [],
  });
  protected readonly heading = computed(() => {
    if (!this.isAdmin()) {
      const name = this.user()?.departmentName;
      return name ? `${name} queue` : 'Department queue';
    }

    const id = this.departmentId();
    const name = id ? this.departments.value().find((d) => d.id === id)?.name : undefined;
    return id ? `${name ?? 'Department'} queue` : 'All department queues';
  });

  protected readonly pageSizes = taskPageSizes;
  /** Back to the first page when the department changes. */
  private readonly paging = linkedSignal({
    source: this.departmentId,
    computation: (): { page: number; pageSize: number } => ({ page: 1, pageSize: taskPageSizes[0] }),
  });
  protected readonly tasks = rxResource({
    params: () => ({ departmentId: this.departmentId(), ...this.paging() }),
    stream: ({ params }) => this.tasksApi.queue(params),
  });
  protected readonly page = linkedSignal<ResultState<TaskListItem>, PagedResult<TaskListItem> | null>({
    source: () => ({ value: this.tasks.hasValue() ? this.tasks.value() : null, failed: !!this.tasks.error() }),
    computation: keepPrevious,
  });
  protected readonly error = computed(() => {
    const error = this.tasks.error();
    return error ? problemMessage(error, "The queue couldn't be loaded. Please try again.") : null;
  });

  protected readonly claiming = signal<number | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  private readonly noticeElement = viewChild<ElementRef<HTMLElement>>('noticeBox');

  protected chooseDepartment(id: number | null): void {
    this.notice.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { department: id ?? undefined } });
  }

  protected changePage(event: PageEvent): void {
    this.paging.set({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected claim(task: TaskListItem): void {
    this.claiming.set(task.id);
    this.tasksApi.claim(task.id).subscribe({
      next: () => {
        this.claiming.set(null);
        this.tasks.reload();
        this.showNotice({
          kind: 'success',
          message: `You claimed ${task.name} on ${task.caseNumber}. It's in My work.`,
          caseId: task.caseId,
          caseNumber: task.caseNumber,
        });
      },
      error: (error: unknown) => {
        this.claiming.set(null);
        this.tasks.reload();
        const taken = error instanceof HttpErrorResponse && (error.status === 409 || error.status === 403);
        this.showNotice({
          kind: 'error',
          message: taken
            ? `${task.name} on ${task.caseNumber} was taken or changed before your claim went through. The queue has been refreshed.`
            : problemMessage(error, "The task couldn't be claimed. Please try again."),
        });
      },
    });
  }

  protected assign(task: TaskListItem): void {
    openAssignDialog(this.dialog, {
      taskId: task.id,
      taskName: task.name,
      caseNumber: task.caseNumber,
      departmentId: task.departmentId,
      departmentName: task.departmentName,
      assigneeId: null,
    }).subscribe((updated) => {
      if (!updated) {
        return;
      }

      this.tasks.reload();
      const assignee = updated.tasks.find((t) => t.id === task.id)?.assigneeName;
      this.showNotice({
        kind: 'success',
        message: `${task.name} on ${task.caseNumber} is assigned to ${assignee ?? 'them'}.`,
        caseId: task.caseId,
        caseNumber: task.caseNumber,
      });
    });
  }

  private showNotice(notice: Notice): void {
    this.notice.set(notice);
    // The row that was acted on has left the queue, so focus lands on the result.
    afterNextRender(() => this.noticeElement()?.nativeElement.focus(), { injector: this.injector });
  }
}
