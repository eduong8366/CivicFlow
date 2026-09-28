import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { CaseDetail, TaskOutcome, WorkflowTask } from '../../../core/api/cases.models';
import { problemMessage } from '../../../core/api/problem-details';
import { TasksApi } from '../../../core/api/tasks.api';
import { openAssignDialog } from '../../../shared/assign-dialog';
import { assignmentMessage, completionMessage, outcomeChoices } from './case-actions';

/** The result of an action: the case as it is now, and a sentence saying what happened. */
export interface CaseUpdate {
  detail: CaseDetail;
  message: string;
}

/** A failed action. `stale` means the case changed underneath the user and should be reloaded. */
export interface ActionFailure {
  message: string;
  stale: boolean;
}

const maxNotesLength = 2000;

/**
 * What the user can do with the current step: claim it, (re)assign it, or record an outcome.
 * Only the actions the API says the user may take are shown.
 */
@Component({
  selector: 'app-task-actions',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, ReactiveFormsModule],
  template: `
    @if (task().actions.canClaim || task().actions.canAssign) {
      <div class="buttons">
        @if (task().actions.canClaim) {
          <button mat-flat-button type="button" [disabled]="busy()" (click)="claim()">Claim this step</button>
        }
        @if (task().actions.canAssign) {
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="assign()">
            {{ task().assigneeId === null ? 'Assign…' : 'Reassign…' }}
          </button>
        }
      </div>
    }

    @if (task().actions.canComplete && choices().length) {
      <form [formGroup]="form" (ngSubmit)="complete()" class="decision">
        <h3 id="decision-heading">Record a decision</h3>
        <mat-radio-group formControlName="outcome" aria-labelledby="decision-heading" class="outcomes">
          @for (choice of choices(); track choice.outcome) {
            <mat-radio-button [value]="choice.outcome" [class]="'outcome outcome--' + choice.outcome">
              {{ choice.label }}
            </mat-radio-button>
          }
        </mat-radio-group>
        @if (form.controls.outcome.invalid && (form.controls.outcome.touched || submitted())) {
          <p class="field-error" role="alert">Choose a decision.</p>
        }
        @if (chosen(); as choice) {
          <p class="effect" aria-live="polite">{{ choice.effect }}</p>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notes{{ chosen()?.notesRequired ? '' : ' (optional)' }}</mat-label>
          <textarea matInput formControlName="notes" rows="3" [maxlength]="maxNotesLength" [required]="!!chosen()?.notesRequired"></textarea>
          @if (chosen()?.notesRequired) {
            <mat-hint>Say why, for the record{{ chosen()?.outcome === 'RequestInfo' ? ', and what you need' : '' }}.</mat-hint>
          }
          <mat-error>Notes are required for this decision.</mat-error>
        </mat-form-field>

        <div>
          <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Submit decision' }}</button>
        </div>
      </form>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .decision {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--cf-border);
      padding-top: 16px;
    }

    h3 {
      font-size: 1rem;
    }

    // The design's outcome "chips": each choice in its own bordered box.
    .outcomes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .outcome {
      border: 1px solid var(--cf-border);
      padding-right: 12px;
    }

    .outcome.mat-mdc-radio-checked {
      border: 2px solid var(--cf-accent);
      background: var(--cf-accent-tint);
      padding-right: 11px;
      margin: -1px;
    }

    .outcome--Reject.mat-mdc-radio-checked {
      border-color: var(--cf-danger);
      background: #f4e3db;
    }

    .effect {
      margin: 0;
      font-size: 0.9375rem;
    }

    .field-error {
      margin: 0;
      color: var(--cf-danger);
      font-size: 0.875rem;
    }
  `,
})
export class TaskActions {
  private readonly tasksApi = inject(TasksApi);
  private readonly dialog = inject(MatDialog);
  private readonly formDirective = viewChild(FormGroupDirective);

  readonly caseDetail = input.required<CaseDetail>();
  /** The case's active task. */
  readonly task = input.required<WorkflowTask>();
  readonly updated = output<CaseUpdate>();
  readonly failed = output<ActionFailure>();

  protected readonly maxNotesLength = maxNotesLength;
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly choices = computed(() => outcomeChoices(this.caseDetail().tasks, this.task()));

  protected readonly form = inject(FormBuilder).group({
    outcome: [null as TaskOutcome | null, Validators.required],
    notes: ['', Validators.maxLength(maxNotesLength)],
  });
  private readonly outcome = toSignal(this.form.controls.outcome.valueChanges, { initialValue: null });
  protected readonly chosen = computed(() => this.choices().find((c) => c.outcome === this.outcome()) ?? null);

  protected claim(): void {
    const task = this.task();
    this.run(this.tasksApi.claim(task.id), () => `You claimed ${task.name}. It's in your work list.`);
  }

  protected assign(): void {
    const task = this.task();
    openAssignDialog(this.dialog, {
      taskId: task.id,
      taskName: task.name,
      caseNumber: this.caseDetail().caseNumber,
      departmentId: task.departmentId,
      departmentName: task.departmentName,
      assigneeId: task.assigneeId,
    }).subscribe((detail) => {
      if (detail) {
        this.updated.emit({ detail, message: assignmentMessage(task.id, detail) });
      }
    });
  }

  protected complete(): void {
    this.submitted.set(true);
    const { outcome, notes } = this.form.getRawValue();
    const choice = this.chosen();
    const trimmed = notes?.trim() ?? '';
    if (!outcome || !choice) {
      this.form.controls.outcome.markAsTouched();
      return;
    }

    if (choice.notesRequired && !trimmed) {
      this.form.controls.notes.setErrors({ required: true });
      this.form.controls.notes.markAsTouched();
      return;
    }

    const task = this.task();
    this.run(this.tasksApi.complete(task.id, { outcome, notes: trimmed || null }), (detail) => {
      this.formDirective()?.resetForm({ outcome: null, notes: '' });
      this.submitted.set(false);
      return completionMessage(task, outcome, detail);
    });
  }

  private run(request: ReturnType<TasksApi['claim']>, message: (detail: CaseDetail) => string): void {
    this.busy.set(true);
    request.subscribe({
      next: (detail) => {
        this.busy.set(false);
        this.updated.emit({ detail, message: message(detail) });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        // 409 or 403: someone else acted on the step first, or the case or its assignment changed.
        const stale = error instanceof HttpErrorResponse && (error.status === 409 || error.status === 403);
        this.failed.emit({
          message: stale
            ? 'This case changed while you were working on it; someone else may have acted first. It now shows its current state.'
            : problemMessage(error, "That didn't work. Please try again."),
          stale,
        });
      },
    });
  }
}
