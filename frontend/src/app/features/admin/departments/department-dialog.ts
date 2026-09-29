import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { AdminDepartmentsApi } from '../../../core/api/admin.api';
import { AdminDepartment } from '../../../core/api/admin.models';
import { problemMessage, problemOf } from '../../../core/api/problem-details';
import { applyServerErrors, errorMessage } from '../../../shared/form-errors';

/** What still depends on a department, as a phrase: "3 people and 2 workflow steps". */
export function departmentBlockers(department: AdminDepartment): string | null {
  const parts = [
    counted(department.activeUserCount, 'active person', 'active people'),
    counted(department.activeStepCount, 'workflow step', 'workflow steps'),
    counted(department.activeTaskCount, 'active task', 'active tasks'),
  ].filter((part): part is string => part !== null);

  if (!parts.length) {
    return null;
  }

  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function counted(count: number, one: string, many: string): string | null {
  return count ? `${count} ${count === 1 ? one : many}` : null;
}

const codeWording = { pattern: 'Code must be letters and digits, starting with a letter.' };

/** Adds a department, or renames or (de)activates one. Closes with the saved department. */
@Component({
  selector: 'app-department-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ department ? 'Edit ' + department.name : 'New department' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" maxlength="100" required cdkFocusInitial />
          <mat-error>{{ message('name', 'Name') }}</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Code</mat-label>
          <input matInput formControlName="code" maxlength="10" required class="code" />
          <mat-hint>A short name for lists and reports, e.g. PZ. Stored in capitals.</mat-hint>
          <mat-error>{{ message('code', 'Code', codeWording) }}</mat-error>
        </mat-form-field>

        @if (department) {
          <mat-checkbox formControlName="isActive" [aria-describedby]="blockers() ? 'active-blockers' : ''">Active</mat-checkbox>
          @if (blockers(); as blockers) {
            <p id="active-blockers" class="note">
              It can't be deactivated while it has {{ blockers }}. Move or finish those first.
            </p>
          } @else if (!department.isActive) {
            <p class="note">Inactive departments can't be chosen for people or workflow steps.</p>
          }
        }

        @if (error(); as error) {
          <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : department ? 'Save changes' : 'Add department' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      margin-bottom: 8px;
    }

    .code {
      text-transform: uppercase;
    }

    .note {
      margin: 4px 0 0;
      color: var(--cf-muted);
      font-size: 0.875rem;
    }

    .cf-alert {
      margin-top: 12px;
    }
  `,
})
export class DepartmentDialog {
  private readonly api = inject(AdminDepartmentsApi);
  private readonly dialogRef = inject<MatDialogRef<DepartmentDialog, AdminDepartment>>(MatDialogRef);

  /** Null when adding one. */
  protected readonly department = inject<AdminDepartment | null>(MAT_DIALOG_DATA);
  protected readonly codeWording = codeWording;

  protected readonly form = new FormGroup({
    name: new FormControl(this.department?.name ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    code: new FormControl(this.department?.code ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10), Validators.pattern(/^\s*[A-Za-z][A-Za-z0-9]*\s*$/)],
    }),
    isActive: new FormControl(this.department?.isActive ?? true, { nonNullable: true }),
  });

  /** Only an active department with nothing depending on it can be deactivated. */
  protected readonly blockers = computed(() =>
    this.department?.isActive ? departmentBlockers(this.department) : null,
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (this.blockers()) {
      this.form.controls.isActive.disable();
    }
  }

  protected message(name: 'name' | 'code', label: string, wording = {}): string | null {
    return errorMessage(this.form.controls[name], label, wording);
  }

  protected save(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const request = { name: value.name.trim(), code: value.code.trim().toUpperCase(), isActive: value.isActive };
    this.saving.set(true);
    (this.department ? this.api.update(this.department.id, request) : this.api.create(request)).subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        const problem = problemOf(error);
        const unmatched =
          error instanceof HttpErrorResponse && error.status === 400 && problem?.errors
            ? applyServerErrors(this.form, problem.errors)
            : null;
        if (unmatched === null || unmatched.length) {
          this.error.set(unmatched?.[0] ?? problemMessage(error, "The department couldn't be saved. Please try again."));
        }
      },
    });
  }
}

/** Opens the department dialog; emits the saved department, or nothing if it was dismissed. */
export function openDepartmentDialog(dialog: MatDialog, department: AdminDepartment | null): Observable<AdminDepartment | undefined> {
  return dialog
    .open<DepartmentDialog, AdminDepartment | null, AdminDepartment>(DepartmentDialog, {
      data: department,
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    })
    .afterClosed();
}
