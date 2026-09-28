import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CasesApi, CaseStatusChange } from '../../../core/api/cases.api';
import { CaseDetail } from '../../../core/api/cases.models';
import { problemMessage } from '../../../core/api/problem-details';

export interface CaseStatusDialogData {
  caseId: number;
  caseNumber: string;
  change: CaseStatusChange;
  /** Resuming an on-hold case rather than reopening a closed one. */
  resume: boolean;
}

const maxReasonLength = 2000;

const wording: Record<CaseStatusChange | 'resume', { title: string; explanation: string; confirm: string }> = {
  hold: {
    title: 'Put the case on hold',
    explanation: 'Its current step is paused: nobody can claim or complete it until the case is resumed.',
    confirm: 'Put on hold',
  },
  cancel: {
    title: 'Cancel the case',
    explanation: 'Its remaining steps are skipped and the case closes. A supervisor can reopen it later.',
    confirm: 'Cancel case',
  },
  reopen: {
    title: 'Reopen the case',
    explanation: 'The step it last reached goes back to its department queue, and the steps after it run again.',
    confirm: 'Reopen case',
  },
  resume: {
    title: 'Resume the case',
    explanation: 'Its current step can be worked on again.',
    confirm: 'Resume case',
  },
};

/** Confirms a hold, cancel or reopen, with an optional reason. Closes with the updated case. */
@Component({
  selector: 'app-case-status-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ text.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="context">{{ data.caseNumber }}</p>
        <p>{{ text.explanation }}</p>
        <mat-form-field appearance="outline">
          <mat-label>Reason (optional)</mat-label>
          <textarea matInput formControlName="reason" rows="3" [maxlength]="maxReasonLength"></textarea>
          <mat-hint>Kept on the case as an internal comment.</mat-hint>
        </mat-form-field>
        @if (error(); as error) {
          <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Go back</button>
        <button mat-flat-button type="submit" [class.danger]="data.change === 'cancel'" [disabled]="saving()">
          {{ saving() ? 'Saving…' : text.confirm }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .context {
      margin: 0 0 8px;
      color: var(--cf-muted);
    }

    mat-form-field {
      width: 100%;
    }

    .cf-alert {
      margin-top: 12px;
    }

    .danger {
      --mat-button-filled-container-color: var(--cf-danger);
    }
  `,
})
export class CaseStatusDialog {
  private readonly casesApi = inject(CasesApi);
  private readonly dialogRef = inject<MatDialogRef<CaseStatusDialog, CaseDetail>>(MatDialogRef);

  protected readonly data = inject<CaseStatusDialogData>(MAT_DIALOG_DATA);
  protected readonly text = wording[this.data.resume ? 'resume' : this.data.change];
  protected readonly maxReasonLength = maxReasonLength;
  protected readonly form = new FormGroup({
    reason: new FormControl('', { nonNullable: true, validators: Validators.maxLength(maxReasonLength) }),
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    const reason = this.form.controls.reason.value.trim() || null;
    this.saving.set(true);
    this.error.set(null);
    this.casesApi.changeStatus(this.data.caseId, this.data.change, reason).subscribe({
      next: (updated) => this.dialogRef.close(updated),
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(problemMessage(error, "The case couldn't be updated. Please try again."));
      },
    });
  }
}
