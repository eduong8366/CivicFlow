import { DatePipe, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, numberAttribute, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';
import { CasesApi } from '../../../core/api/cases.api';
import { problemMessage } from '../../../core/api/problem-details';
import { formatFieldValue } from '../../../shared/labels';
import { PriorityTag, StatusChip } from '../../../shared/status-chip';
import { CaseAttachments } from './case-attachments';
import { CaseComments } from './case-comments';
import { CaseHistory } from './case-history';
import { WorkflowStepper } from './workflow-stepper';

/**
 * One case: its header and status, the workflow, the current step, its details and custom fields,
 * and its comments, attachments and history.
 */
@Component({
  selector: 'app-case-detail-page',
  imports: [
    CaseAttachments,
    CaseComments,
    CaseHistory,
    DatePipe,
    MatProgressBarModule,
    PriorityTag,
    RouterLink,
    StatusChip,
    WorkflowStepper,
  ],
  templateUrl: './case-detail-page.html',
  styleUrl: './case-detail-page.scss',
})
export class CaseDetailPage {
  private readonly casesApi = inject(CasesApi);
  private readonly title = inject(Title);

  /** The `:id` route parameter (component input binding). */
  readonly id = input.required({ transform: numberAttribute });

  protected readonly detail = rxResource({
    params: () => this.id(),
    // The page title names the case: "BLD-2026-000020 · CivicFlow".
    stream: ({ params }) => this.casesApi.get(params).pipe(tap((c) => this.title.setTitle(`${c.caseNumber} · CivicFlow`))),
  });
  protected readonly case = computed(() => (this.detail.hasValue() ? this.detail.value() : null));

  protected readonly loadError = computed(() => {
    const error = this.detail.error();
    if (!error) {
      return null;
    }

    if (error instanceof HttpErrorResponse && error.status === 404) {
      return { heading: 'Case not found', message: "There's no case with this number. It may have been mistyped." };
    }

    if (error instanceof HttpErrorResponse && error.status === 403) {
      return {
        heading: 'Access denied',
        message: "This case isn't routed to your department or assigned to you. Ask a supervisor if you need it.",
      };
    }

    return { heading: "Case couldn't be loaded", message: problemMessage(error) };
  });

  protected readonly currentTask = computed(() => this.case()?.tasks.find((task) => task.status === 'Active') ?? null);
  protected readonly fields = computed(() =>
    (this.case()?.fields ?? []).map((field) => ({ ...field, display: formatFieldValue(field) })),
  );

  /** Set when this page was reached by creating the case. */
  protected readonly created = signal((inject(Location).getState() as { created?: boolean } | null)?.created === true);

  /** Bumped when a comment or file is added, so the history shows it. */
  protected readonly historyVersion = signal(0);

  protected activityChanged(): void {
    this.historyVersion.update((version) => version + 1);
  }
}
