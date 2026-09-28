import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CaseDetail } from './cases.models';
import { PagedResult, PageQuery, queryParams } from './paging';
import { CompleteTaskRequest, TaskListItem, TaskQueueQuery } from './tasks.models';

/** Workflow tasks. Every action returns the updated case. */
@Injectable({ providedIn: 'root' })
export class TasksApi {
  private readonly http = inject(HttpClient);

  /** The caller's active tasks, soonest due first. */
  mine(query: PageQuery = {}): Observable<PagedResult<TaskListItem>> {
    return this.http.get<PagedResult<TaskListItem>>('/api/tasks/mine', { params: queryParams(query) });
  }

  /** Unassigned tasks waiting in a department queue, soonest due first. */
  queue(query: TaskQueueQuery = {}): Observable<PagedResult<TaskListItem>> {
    return this.http.get<PagedResult<TaskListItem>>('/api/tasks/queue', { params: queryParams(query) });
  }

  claim(taskId: number): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(`/api/tasks/${taskId}/claim`, null);
  }

  /** Assigns the task, or returns it to its department queue when `assigneeId` is null. */
  assign(taskId: number, assigneeId: number | null): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(`/api/tasks/${taskId}/assign`, { assigneeId });
  }

  complete(taskId: number, request: CompleteTaskRequest): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(`/api/tasks/${taskId}/complete`, request);
  }
}
