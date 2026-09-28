import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Attachment } from './activity.models';
import { PagedResult, PageQuery, queryParams } from './paging';

/** The API's upload rules, mirrored so a file can be refused before it's sent. */
export const attachmentRules = {
  maxSizeBytes: 10 * 1024 * 1024,
  extensions: ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx'],
} as const;

@Injectable({ providedIn: 'root' })
export class AttachmentsApi {
  private readonly http = inject(HttpClient);

  /** A case's attachments, newest first. */
  list(caseId: number, page: PageQuery = {}): Observable<PagedResult<Attachment>> {
    return this.http.get<PagedResult<Attachment>>(`/api/cases/${caseId}/attachments`, { params: queryParams(page) });
  }

  upload(caseId: number, file: File): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Attachment>(`/api/cases/${caseId}/attachments`, form);
  }

  /**
   * The file's content. A plain link can't carry the bearer token, so downloads go through
   * HttpClient and are saved from the blob (see `saveBlob`).
   */
  download(id: number): Observable<Blob> {
    return this.http.get(`/api/attachments/${id}/download`, { responseType: 'blob' });
  }
}

/** Hands a downloaded file to the browser to save. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
