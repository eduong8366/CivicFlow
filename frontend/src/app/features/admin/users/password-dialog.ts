import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { AdminUsersApi } from '../../../core/api/admin.api';
import { AdminUser, passwordRules } from '../../../core/api/admin.models';
import { problemMessage, problemOf } from '../../../core/api/problem-details';
import { errorMessage } from '../../../shared/form-errors';

/** Sets a new password for someone, e.g. when they're locked out. Closes with true once it's set. */
@Component({
  selector: 'app-password-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>Reset password</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <p class="context">{{ user.fullName }} · {{ user.email }}</p>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>New password</mat-label>
          <input
            matInput
            formControlName="password"
            [type]="show() ? 'text' : 'password'"
            [maxlength]="passwordRules.maxLength"
            autocomplete="new-password"
            required
            cdkFocusInitial
          />
          <mat-hint>At least {{ passwordRules.minLength }} characters. Give it to them securely.</mat-hint>
          <mat-error>{{ message() }}</mat-error>
        </mat-form-field>
        <mat-checkbox [checked]="show()" (change)="show.set($event.checked)">Show password</mat-checkbox>
        <p class="note">Their current password stops working straight away. The change is recorded in the audit log; the password isn't.</p>
        @if (error(); as error) {
          <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Set password' }}</button>
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
      margin: 8px 0 0;
      color: var(--cf-muted);
      font-size: 0.875rem;
    }

    .cf-alert {
      margin-top: 12px;
    }
  `,
})
export class PasswordDialog {
  private readonly api = inject(AdminUsersApi);
  private readonly dialogRef = inject<MatDialogRef<PasswordDialog, boolean>>(MatDialogRef);

  protected readonly user = inject<AdminUser>(MAT_DIALOG_DATA);
  protected readonly passwordRules = passwordRules;
  protected readonly form = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(passwordRules.minLength), Validators.maxLength(passwordRules.maxLength)],
    }),
  });
  private readonly password = this.form.controls.password;
  protected readonly show = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected message(): string | null {
    return errorMessage(this.password, 'Password');
  }

  protected save(): void {
    this.error.set(null);
    if (this.password.invalid) {
      this.password.markAsTouched();
      return;
    }

    this.saving.set(true);
    this.api.resetPassword(this.user.id, this.password.value).subscribe({
      next: () => this.dialogRef.close(true),
      error: (error: unknown) => {
        this.saving.set(false);
        const problem = problemOf(error);
        const message = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
        if (error instanceof HttpErrorResponse && error.status === 400 && message) {
          // The password is the only thing the request carries.
          this.password.setErrors({ server: message });
          this.password.markAsTouched();
        } else {
          this.error.set(problemMessage(error, "The password couldn't be set. Please try again."));
        }
      },
    });
  }
}

/** Opens the reset password dialog; emits true once the password is set. */
export function openPasswordDialog(dialog: MatDialog, user: AdminUser): Observable<boolean | undefined> {
  return dialog
    .open<PasswordDialog, AdminUser, boolean>(PasswordDialog, { data: user, width: '480px', maxWidth: 'calc(100vw - 32px)' })
    .afterClosed();
}
