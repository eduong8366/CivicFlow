import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Comment, CreateCommentRequest } from './activity.models';
import { PagedResult, PageQuery, queryParams } from './paging';

@Injectable({ providedIn: 'root' })
export class CommentsApi {
  private readonly http = inject(HttpClient);

  /** A case's comments, oldest first. */
  list(caseId: number, page: PageQuery = {}): Observable<PagedResult<Comment>> {
    return this.http.get<PagedResult<Comment>>(`/api/cases/${caseId}/comments`, { params: queryParams(page) });
  }

  create(caseId: number, request: CreateCommentRequest): Observable<Comment> {
    return this.http.post<Comment>(`/api/cases/${caseId}/comments`, request);
  }
}
