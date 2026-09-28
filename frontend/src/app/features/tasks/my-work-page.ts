import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { PagedResult } from '../../core/api/paging';
import { problemMessage } from '../../core/api/problem-details';
import { TasksApi } from '../../core/api/tasks.api';
import { TaskListItem } from '../../core/api/tasks.models';
import { AuthService } from '../../core/auth/auth.service';
import { keepPrevious, ResultState, taskPageSizes } from './task-paging';
import { TaskTable } from './task-table';

/** The signed-in user's active tasks, soonest due first, with overdue ones marked. */
@Component({
  selector: 'app-my-work-page',
  imports: [MatPaginatorModule, MatProgressBarModule, RouterLink, TaskTable],
  template: `
    <h1>My work</h1>

    <section class="cf-panel results" aria-labelledby="tasks-heading">
      <div class="results-head">
        <h2 id="tasks-heading">Assigned to you</h2>
        <p class="count" role="status">
          @if (tasks.isLoading()) {
            Loading…
          } @else {
            {{ summary() }}
          }
        </p>
      </div>

      @if (tasks.isLoading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading your tasks" />
      }

      @if (error(); as error) {
        <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
      }

      @if (page(); as page) {
        <app-task-table
          mode="mine"
          caption="Your tasks"
          [tasks]="page.items"
          [loading]="tasks.isLoading()"
          emptyMessage="Nothing is assigned to you right now."
        />
        @if (page.totalCount > pageSizes[0]) {
          <mat-paginator
            [length]="page.totalCount"
            [pageIndex]="page.page - 1"
            [pageSize]="page.pageSize"
            [pageSizeOptions]="pageSizes"
            (page)="changePage($event)"
            aria-label="Task pages"
          />
        }
        @if (!page.totalCount && hasQueue()) {
          <p class="hint"><a routerLink="/queue">Claim a task from your department queue</a> to start on it.</p>
        }
      }
    </section>
  `,
  styleUrl: './task-pages.scss',
})
export class MyWorkPage {
  private readonly tasksApi = inject(TasksApi);

  protected readonly pageSizes = taskPageSizes;
  private readonly paging = signal({ page: 1, pageSize: taskPageSizes[0] });
  protected readonly tasks = rxResource({
    params: () => this.paging(),
    stream: ({ params }) => this.tasksApi.mine(params),
  });
  /** The page on screen; the last one stays while the next loads. */
  protected readonly page = linkedSignal<ResultState<TaskListItem>, PagedResult<TaskListItem> | null>({
    source: () => ({ value: this.tasks.hasValue() ? this.tasks.value() : null, failed: !!this.tasks.error() }),
    computation: keepPrevious,
  });
  /** "12 active tasks · 2 overdue". Overdue counts only the page on screen. */
  protected readonly summary = computed(() => {
    const page = this.page();
    if (!page) {
      return '';
    }

    const total = `${page.totalCount} active ${page.totalCount === 1 ? 'task' : 'tasks'}`;
    const overdue = page.items.filter((t) => t.isOverdue).length;
    return overdue ? `${total} · ${overdue} overdue${page.totalPages > 1 ? ' on this page' : ''}` : total;
  });
  protected readonly error = computed(() => {
    const error = this.tasks.error();
    return error ? problemMessage(error, "Your tasks couldn't be loaded. Please try again.") : null;
  });
  private readonly user = inject(AuthService).user;
  protected readonly hasQueue = computed(() => this.user()?.role === 'Admin' || this.user()?.departmentId != null);

  protected changePage(event: PageEvent): void {
    this.paging.set({ page: event.pageIndex + 1, pageSize: event.pageSize });
  }
}
