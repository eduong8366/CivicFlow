import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
import { CaseDetail } from '../core/api/cases.models';
import { LookupsApi } from '../core/api/lookups.api';
import { problemMessage } from '../core/api/problem-details';
import { TasksApi } from '../core/api/tasks.api';

/** The task being assigned, from a case's tasks or a queue row. */
export interface AssignDialogData {
  taskId: number;
  taskName: string;
  caseNumber: string;
  departmentId: number;
  departmentName: string;
  assigneeId: number | null;
}

/** The choice that sends the task back to its department queue. */
const queue = 'queue';

/**
 * Assigns a task to someone in its department, or returns it to the queue. It closes with the
 * updated case, or with nothing when dismissed.
 */
@Component({
  selector: 'app-assign-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>Assign {{ data.taskName }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="context">{{ data.caseNumber }} · {{ data.departmentName }}</p>

        @if (users.error()) {
          <div class="cf-alert cf-alert--error" role="alert">The department's staff couldn't be loaded.</div>
        }

        <mat-form-field appearance="outline">
          <mat-label>Assign to</mat-label>
          <mat-select formControlName="assignee" required>
            @if (data.assigneeId !== null) {
              <mat-option [value]="queue">Nobody: return it to the {{ data.departmentName }} queue</mat-option>
            }
            @for (user of choices(); track user.id) {
              <mat-option [value]="user.id">
                {{ user.fullName }}
                @if (user.role !== 'Staff') {
                  <span class="note">· {{ user.role }}</span>
                }
                @if (user.id === data.assigneeId) {
                  <span class="note">· assigned now</span>
                }
              </mat-option>
            }
          </mat-select>
          <mat-hint>Active people in {{ data.departmentName }}</mat-hint>
          <mat-error>Choose who should do this step.</mat-error>
        </mat-form-field>

        @if (error(); as error) {
          <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Assign' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .context {
      margin: 0 0 16px;
      color: var(--cf-muted);
    }

    mat-form-field {
      width: 100%;
    }

    .note {
      color: var(--cf-muted);
      font-size: 0.875rem;
    }

    .cf-alert {
      margin-top: 12px;
    }
  `,
})
export class AssignDialog {
  private readonly tasksApi = inject(TasksApi);
  private readonly lookups = inject(LookupsApi);
  private readonly dialogRef = inject<MatDialogRef<AssignDialog, CaseDetail>>(MatDialogRef);

  protected readonly data = inject<AssignDialogData>(MAT_DIALOG_DATA);
  protected readonly queue = queue;
  protected readonly users = rxResource({
    stream: () => this.lookups.users({ departmentId: this.data.departmentId }),
    defaultValue: [],
  });
  // Admins without a department can hold tasks but aren't in the department's list.
  protected readonly choices = computed(() => this.users.value().filter((user) => user.departmentId === this.data.departmentId));

  protected readonly form = new FormGroup({
    assignee: new FormControl<number | typeof queue | null>(this.data.assigneeId, Validators.required),
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    const choice = this.form.controls.assignee.value;
    if (choice === null) {
      this.form.controls.assignee.markAsTouched();
      return;
    }

    const assigneeId = choice === queue ? null : choice;
    if (assigneeId === this.data.assigneeId) {
      // Nothing to change.
      this.dialogRef.close();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.tasksApi.assign(this.data.taskId, assigneeId).subscribe({
      next: (updated) => this.dialogRef.close(updated),
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(problemMessage(error, "The task couldn't be assigned. Please try again."));
      },
    });
  }
}

/** Opens the assign dialog; emits the updated case, or nothing if it was dismissed or unchanged. */
export function openAssignDialog(dialog: MatDialog, data: AssignDialogData): Observable<CaseDetail | undefined> {
  return dialog
    .open<AssignDialog, AssignDialogData, CaseDetail>(AssignDialog, { data, width: '480px', maxWidth: 'calc(100vw - 32px)' })
    .afterClosed();
}
