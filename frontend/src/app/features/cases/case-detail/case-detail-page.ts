import { DatePipe, Location } from '@angular/common';
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
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';
import { CasesApi, CaseStatusChange } from '../../../core/api/cases.api';
import { CaseDetail } from '../../../core/api/cases.models';
import { problemMessage } from '../../../core/api/problem-details';
import { formatFieldValue } from '../../../shared/labels';
import { PriorityTag, StatusChip } from '../../../shared/status-chip';
import { statusChangeMessage } from './case-actions';
import { CaseAttachments } from './case-attachments';
import { CaseComments } from './case-comments';
import { CaseHistory } from './case-history';
import { CaseStatusDialog, CaseStatusDialogData } from './case-status-dialog';
import { ActionFailure, CaseUpdate, TaskActions } from './task-actions';
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
    MatButtonModule,
    MatProgressBarModule,
    PriorityTag,
    RouterLink,
    StatusChip,
    TaskActions,
    WorkflowStepper,
  ],
  templateUrl: './case-detail-page.html',
  styleUrl: './case-detail-page.scss',
})
export class CaseDetailPage {
  private readonly casesApi = inject(CasesApi);
  private readonly title = inject(Title);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

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
  /** Bumped after a hold, cancel or reopen, whose reason is kept as a comment. */
  protected readonly commentsVersion = signal(0);

  /** What the last action did, or why it failed. */
  protected readonly notice = linkedSignal<number, { kind: 'success' | 'error'; message: string } | null>({
    source: this.id,
    computation: () => null,
  });
  private readonly noticeElement = viewChild<ElementRef<HTMLElement>>('noticeBox');

  protected readonly showTaskActions = computed(() => {
    const actions = this.currentTask()?.actions;
    return !!actions && (actions.canClaim || actions.canAssign || actions.canComplete);
  });

  protected activityChanged(): void {
    this.historyVersion.update((version) => version + 1);
  }

  /** An action succeeded: show the case as the API returned it, and say what happened. */
  protected applyUpdate(update: CaseUpdate): void {
    this.detail.set(update.detail);
    this.activityChanged();
    this.showNotice('success', update.message);
  }

  protected actionFailed(failure: ActionFailure): void {
    if (failure.stale) {
      this.detail.reload();
      this.activityChanged();
    }

    this.showNotice('error', failure.message);
  }

  protected changeStatus(change: CaseStatusChange): void {
    const c = this.case();
    if (!c) {
      return;
    }

    const wasOnHold = c.status === 'OnHold';
    const data: CaseStatusDialogData = { caseId: c.id, caseNumber: c.caseNumber, change, resume: change === 'reopen' && wasOnHold };
    this.dialog
      .open<CaseStatusDialog, CaseStatusDialogData, CaseDetail>(CaseStatusDialog, { data, width: '520px', maxWidth: 'calc(100vw - 32px)' })
      .afterClosed()
      .subscribe((updated) => {
        if (updated) {
          this.commentsVersion.update((version) => version + 1);
          this.applyUpdate({ detail: updated, message: statusChangeMessage(change, wasOnHold, updated) });
        }
      });
  }

  private showNotice(kind: 'success' | 'error', message: string): void {
    this.notice.set({ kind, message });
    // The control that was used may be gone (a completed step's form), so focus lands on the result.
    afterNextRender(() => this.noticeElement()?.nativeElement.focus(), { injector: this.injector });
  }
}
