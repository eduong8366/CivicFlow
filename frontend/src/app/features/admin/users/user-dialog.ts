import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { map, Observable, startWith } from 'rxjs';
import { Department } from '../../../core/api/activity.models';
import { AdminUsersApi } from '../../../core/api/admin.api';
import { AdminUser, passwordRules, userRoles } from '../../../core/api/admin.models';
import { problemMessage, problemOf } from '../../../core/api/problem-details';
import { UserRole } from '../../../core/auth/auth.models';
import { applyServerErrors, errorMessage } from '../../../shared/form-errors';

export interface UserDialogData {
  /** Null when adding someone. */
  user: AdminUser | null;
  /** Every department, inactive ones included, so a user's current one can be shown. */
  departments: Department[];
  /** The signed-in admin, who can't deactivate themselves or give up the Admin role. */
  currentUserId: number;
}

export const roleDescriptions: Record<UserRole, string> = {
  Staff: 'Works cases in their department: claims and completes steps.',
  Supervisor: "Also assigns work, puts cases on hold, cancels and reopens them, and sees the department's audit log.",
  Admin: 'Manages people, departments and case types, and sees every case and the full audit log.',
};

/** Staff and supervisors need a department; admins may be agency-wide. */
function departmentForRole(control: AbstractControl): ValidationErrors | null {
  const role = control.parent?.get('role')?.value as UserRole | undefined;
  return role !== 'Admin' && control.value === null ? { required: true } : null;
}

/**
 * What saving will do to someone's open work: deactivating them, or moving them to another
 * department, sends their active tasks back to the department queues.
 */
export function workloadWarning(
  user: Pick<AdminUser, 'fullName' | 'activeTaskCount' | 'departmentId' | 'departmentName' | 'isActive'>,
  change: { isActive: boolean; departmentId: number | null },
): string | null {
  const tasks = user.activeTaskCount;
  if (!tasks || !user.isActive) {
    return null;
  }

  const count = `${tasks === 1 ? 'Their active task goes' : `Their ${tasks} active tasks go`}`;
  if (!change.isActive) {
    return `${count} back to the department queues, for someone else to claim.`;
  }

  if (change.departmentId !== user.departmentId && user.departmentId !== null) {
    return `${count} back to the ${user.departmentName ?? 'old department'} queue${tasks === 1 ? '' : 's'}.`;
  }

  return null;
}

/** Adds an account or edits one. Closes with the saved user. */
@Component({
  selector: 'app-user-dialog',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ user ? 'Edit ' + user.fullName : 'New user' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Full name</mat-label>
          <input matInput formControlName="fullName" maxlength="150" autocomplete="off" required cdkFocusInitial />
          <mat-error>{{ message('fullName', 'Full name') }}</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email" type="email" maxlength="256" autocomplete="off" required />
          <mat-hint>They sign in with this.</mat-hint>
          <mat-error>{{ message('email', 'Email') }}</mat-error>
        </mat-form-field>

        @if (!user) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Password</mat-label>
            <input
              matInput
              formControlName="password"
              [type]="showPassword() ? 'text' : 'password'"
              [maxlength]="passwordRules.maxLength"
              autocomplete="new-password"
              required
            />
            <mat-hint>At least {{ passwordRules.minLength }} characters. Give it to them securely.</mat-hint>
            <mat-error>{{ message('password', 'Password') }}</mat-error>
          </mat-form-field>
          <mat-checkbox class="show" [checked]="showPassword()" (change)="showPassword.set($event.checked)">Show password</mat-checkbox>
        }

        <fieldset>
          <legend>Role</legend>
          <mat-radio-group formControlName="role" aria-label="Role" class="roles">
            @for (role of roles; track role) {
              <div class="role">
                <mat-radio-button [value]="role" [attr.aria-describedby]="'role-' + role">{{ role }}</mat-radio-button>
                <div class="role-description" [id]="'role-' + role">{{ roleDescriptions[role] }}</div>
              </div>
            }
          </mat-radio-group>
          @if (isSelf) {
            <p class="note">You can't change your own role or deactivate your own account, so there's always an administrator.</p>
          }
        </fieldset>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Department</mat-label>
          <mat-select formControlName="departmentId" [required]="role() !== 'Admin'">
            @if (role() === 'Admin') {
              <mat-option [value]="null">None: works across the agency</mat-option>
            }
            @for (department of departmentChoices(); track department.id) {
              <mat-option [value]="department.id">
                {{ department.name }}
                @if (!department.isActive) {
                  <span class="option-note">· inactive</span>
                }
              </mat-option>
            }
          </mat-select>
          <mat-error>{{ message('departmentId', 'Department') }}</mat-error>
        </mat-form-field>

        @if (user) {
          <mat-checkbox formControlName="isActive">Active: can sign in</mat-checkbox>
          @if (user.isActive && !value().isActive) {
            <p class="note">They won't be able to sign in. Anyone already signed in keeps access until their session ends (within an hour).</p>
          }
        }

        @if (warning(); as warning) {
          <div class="cf-alert cf-alert--warning">{{ warning }}</div>
        }
        @if (user && (value().role !== user.role || value().departmentId !== user.departmentId)) {
          <p class="note">Role and department changes take effect the next time they sign in.</p>
        }

        @if (error(); as error) {
          <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : user ? 'Save changes' : 'Add user' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      margin-bottom: 8px;
    }

    .show {
      display: block;
      margin: -4px 0 12px;
    }

    fieldset {
      margin: 0 0 16px;
      padding: 0;
      border: 0;
    }

    legend {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .role-description {
      padding-left: 40px;
      margin-top: -8px;
      margin-bottom: 4px;
      font-size: 0.875rem;
      color: var(--cf-muted);
    }

    .note {
      margin: 4px 0 8px;
      color: var(--cf-muted);
      font-size: 0.875rem;
    }

    .option-note {
      color: var(--cf-muted);
      font-size: 0.875rem;
    }

    .cf-alert {
      margin-top: 12px;
    }
  `,
})
export class UserDialog {
  private readonly api = inject(AdminUsersApi);
  private readonly dialogRef = inject<MatDialogRef<UserDialog, AdminUser>>(MatDialogRef);
  private readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);

  protected readonly user = this.data.user;
  protected readonly isSelf = this.user?.id === this.data.currentUserId;
  protected readonly roles = userRoles;
  protected readonly roleDescriptions = roleDescriptions;
  protected readonly passwordRules = passwordRules;

  protected readonly form = new FormGroup({
    fullName: new FormControl(this.user?.fullName ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    email: new FormControl(this.user?.email ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(256)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: this.user
        ? []
        : [Validators.required, Validators.minLength(passwordRules.minLength), Validators.maxLength(passwordRules.maxLength)],
    }),
    role: new FormControl<UserRole>(this.user?.role ?? 'Staff', { nonNullable: true }),
    departmentId: new FormControl<number | null>(this.user?.departmentId ?? null, departmentForRole),
    isActive: new FormControl(this.user?.isActive ?? true, { nonNullable: true }),
  });

  // Raw: the role and active controls are disabled when admins edit themselves.
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly role = computed(() => this.value().role);
  /** Active departments, plus the user's own if it has since been deactivated. */
  protected readonly departmentChoices = computed(() =>
    this.data.departments.filter((d) => d.isActive || d.id === this.user?.departmentId),
  );
  protected readonly warning = computed(() => {
    const value = this.value();
    return this.user ? workloadWarning(this.user, { isActive: value.isActive, departmentId: value.departmentId }) : null;
  });

  protected readonly showPassword = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (this.isSelf) {
      this.form.controls.role.disable();
      this.form.controls.isActive.disable();
    }

    this.form.controls.role.valueChanges.subscribe(() => this.form.controls.departmentId.updateValueAndValidity());
  }

  protected message(name: keyof typeof this.form.controls, label: string): string | null {
    return errorMessage(this.form.controls[name], label);
  }

  protected save(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const details = { email: value.email.trim(), fullName: value.fullName.trim(), role: value.role, departmentId: value.departmentId };
    const request = this.user
      ? this.api.update(this.user.id, { ...details, isActive: value.isActive })
      : this.api.create({ ...details, password: value.password });

    this.saving.set(true);
    request.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        const problem = problemOf(error);
        const unmatched =
          error instanceof HttpErrorResponse && error.status === 400 && problem?.errors
            ? applyServerErrors(this.form, problem.errors)
            : null;
        if (unmatched === null || unmatched.length) {
          this.error.set(unmatched?.join(' ') || problemMessage(error, "The account couldn't be saved. Please try again."));
        }
      },
    });
  }
}

/** Opens the user dialog; emits the saved user, or nothing if it was dismissed. */
export function openUserDialog(dialog: MatDialog, data: UserDialogData): Observable<AdminUser | undefined> {
  return dialog
    .open<UserDialog, UserDialogData, AdminUser>(UserDialog, { data, width: '560px', maxWidth: 'calc(100vw - 32px)' })
    .afterClosed();
}
