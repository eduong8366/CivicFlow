import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AdminUsersApi } from '../../../core/api/admin.api';
import { AdminUser, userRoles } from '../../../core/api/admin.models';
import { LookupsApi } from '../../../core/api/lookups.api';
import { PagedResult } from '../../../core/api/paging';
import { problemMessage } from '../../../core/api/problem-details';
import { UserRole } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { keepPrevious, ResultState } from '../../tasks/task-paging';
import { openPasswordDialog } from './password-dialog';
import { openUserDialog } from './user-dialog';
import { parseUserFilters, toUserParams, toUserQuery, UserFilters, userPageSizes, UserStatusFilter } from './users-query';

/** User accounts: who can sign in, their role and department, and their current workload. */
@Component({
  selector: 'app-users-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    <div class="page-head">
      <div>
        <h1>Users</h1>
        <p class="lede">Accounts are deactivated rather than deleted, so the history keeps their names.</p>
      </div>
      <button mat-flat-button type="button" (click)="add()">New user</button>
    </div>

    <section class="cf-panel" aria-labelledby="filters-heading">
      <h2 id="filters-heading" class="cf-visually-hidden">Filters</h2>
      <form [formGroup]="form" (ngSubmit)="applyFilters()" class="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Name or email</mat-label>
          <input matInput formControlName="search" type="search" maxlength="100" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Role</mat-label>
          <mat-select formControlName="role">
            <mat-option [value]="null">Any role</mat-option>
            @for (role of roles; track role) {
              <mat-option [value]="role">{{ role }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Department</mat-label>
          <mat-select formControlName="department">
            <mat-option [value]="null">Any department</mat-option>
            @for (department of departments.value(); track department.id) {
              <mat-option [value]="department.id">{{ department.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Active and inactive</mat-option>
            <mat-option value="active">Active</mat-option>
            <mat-option value="inactive">Inactive</mat-option>
          </mat-select>
        </mat-form-field>

        <div class="form-actions">
          <button mat-flat-button type="submit">Filter</button>
          @if (filterCount()) {
            <button mat-stroked-button type="button" (click)="clearFilters()">Clear filters</button>
          }
        </div>
      </form>
    </section>

    @if (notice(); as notice) {
      <div #noticeBox class="cf-alert cf-alert--success" role="status" tabindex="-1">{{ notice }}</div>
    }

    <section class="cf-panel results" aria-labelledby="users-heading">
      <div class="results-head">
        <h2 id="users-heading">People</h2>
        <p class="count" role="status">
          @if (users.isLoading() && !page()) {
            Loading…
          } @else if (page(); as page) {
            {{ page.totalCount }} {{ page.totalCount === 1 ? 'account' : 'accounts' }}
            @if (filterCount()) {
              {{ page.totalCount === 1 ? 'matches' : 'match' }} {{ filterCount() === 1 ? 'this filter' : 'these ' + filterCount() + ' filters' }}
            }
          }
        </p>
      </div>

      @if (users.isLoading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading users" />
      }

      @if (error(); as error) {
        <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
      }

      @if (page(); as page) {
        <div class="table-scroll" tabindex="0" role="region" aria-labelledby="users-heading" [attr.aria-busy]="users.isLoading()">
          <table mat-table [dataSource]="page.items">
            <caption class="cf-visually-hidden">User accounts, by name</caption>

            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let row">
                <div class="name">
                  {{ row.fullName }}
                  @if (row.id === currentUserId()) {
                    <span class="sub">(you)</span>
                  }
                </div>
                <div class="sub">{{ row.email }}</div>
              </td>
            </ng-container>

            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>Role</th>
              <td mat-cell *matCellDef="let row">{{ row.role }}</td>
            </ng-container>

            <ng-container matColumnDef="department">
              <th mat-header-cell *matHeaderCellDef>Department</th>
              <td mat-cell *matCellDef="let row">
                @if (row.departmentName) {
                  {{ row.departmentName }}
                } @else {
                  <span class="sub">Agency-wide</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let row">
                <span class="state" [class.state--active]="row.isActive" [class.state--inactive]="!row.isActive">
                  {{ row.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="tasks">
              <th mat-header-cell *matHeaderCellDef class="number">Active tasks</th>
              <td mat-cell *matCellDef="let row" class="number">
                @if (row.activeTaskCount) {
                  <a
                    routerLink="/cases"
                    [queryParams]="{ assigneeId: row.id }"
                    [attr.aria-label]="row.activeTaskCount + ' active tasks: cases assigned to ' + row.fullName"
                    >{{ row.activeTaskCount }}</a
                  >
                } @else {
                  0
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="cf-visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let row" class="actions">
                <button mat-stroked-button type="button" [attr.aria-label]="'Edit ' + row.fullName" (click)="edit(row)">Edit…</button>
                <button mat-button type="button" [matMenuTriggerFor]="more" [attr.aria-label]="'More for ' + row.fullName">More</button>
                <mat-menu #more="matMenu">
                  <button mat-menu-item type="button" (click)="resetPassword(row)">Reset password…</button>
                  <a mat-menu-item routerLink="/audit" [queryParams]="{ userId: row.id }">Changes they made</a>
                </mat-menu>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" [class.row-inactive]="!row.isActive"></tr>
            <tr class="mat-mdc-row" *matNoDataRow>
              <td class="mat-mdc-cell empty" [attr.colspan]="columns.length">No accounts match. Try fewer filters.</td>
            </tr>
          </table>
        </div>

        @if (page.totalCount > pageSizes[0]) {
          <mat-paginator
            [length]="page.totalCount"
            [pageIndex]="page.page - 1"
            [pageSize]="page.pageSize"
            [pageSizeOptions]="pageSizes"
            (page)="changePage($event)"
            aria-label="User pages"
          />
        }
      }
    </section>
  `,
  styleUrl: '../admin-pages.scss',
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      align-items: start;
    }

    .form-actions {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    table {
      min-width: 760px;
    }
  `,
})
export class UsersPage {
  private readonly api = inject(AdminUsersApi);
  private readonly lookups = inject(LookupsApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  private readonly user = inject(AuthService).user;

  protected readonly currentUserId = computed(() => this.user()?.id ?? 0);
  protected readonly roles = userRoles;
  protected readonly pageSizes = userPageSizes;
  protected readonly columns = ['name', 'role', 'department', 'status', 'tasks', 'actions'];

  protected readonly filters = toSignal(this.route.queryParamMap.pipe(map(parseUserFilters)), { initialValue: {} as UserFilters });
  protected readonly users = rxResource({
    params: () => toUserQuery(this.filters()),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly page = linkedSignal<ResultState<AdminUser>, PagedResult<AdminUser> | null>({
    source: () => ({ value: this.users.hasValue() ? this.users.value() : null, failed: !!this.users.error() }),
    computation: keepPrevious,
  });
  protected readonly error = computed(() => {
    const error = this.users.error();
    return error ? problemMessage(error, "The accounts couldn't be loaded. Please try again.") : null;
  });
  /** Every department, inactive ones too, for the filter and the dialog. */
  protected readonly departments = rxResource({ stream: () => this.lookups.departments({ includeInactive: true }), defaultValue: [] });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    search: '',
    role: null as UserRole | null,
    department: null as number | null,
    status: null as UserStatusFilter | null,
  });
  protected readonly filterCount = computed(() => {
    const { search, role, department, status } = this.filters();
    return [search, role, department, status].filter((value) => value !== undefined).length;
  });

  protected readonly notice = signal<string | null>(null);
  private readonly noticeElement = viewChild<ElementRef<HTMLElement>>('noticeBox');

  constructor() {
    // The form shows the filters in the URL, including after Back or a link from another page.
    effect(() => {
      const filters = this.filters();
      untracked(() =>
        this.form.reset({
          search: filters.search ?? '',
          role: filters.role ?? null,
          department: filters.department ?? null,
          status: filters.status ?? null,
        }),
      );
    });
  }

  protected applyFilters(): void {
    const value = this.form.getRawValue();
    this.navigate({
      search: value.search.trim() || undefined,
      role: value.role ?? undefined,
      department: value.department ?? undefined,
      status: value.status ?? undefined,
      pageSize: this.filters().pageSize,
    });
  }

  protected clearFilters(): void {
    this.navigate({ pageSize: this.filters().pageSize });
  }

  protected changePage(event: PageEvent): void {
    this.navigate({ ...this.filters(), page: event.pageIndex + 1, pageSize: event.pageSize });
  }

  protected add(): void {
    openUserDialog(this.dialog, { user: null, departments: this.departments.value(), currentUserId: this.currentUserId() }).subscribe(
      (saved) => saved && this.saved(`${saved.fullName} can now sign in as ${saved.email}.`),
    );
  }

  protected edit(user: AdminUser): void {
    openUserDialog(this.dialog, { user, departments: this.departments.value(), currentUserId: this.currentUserId() }).subscribe(
      (saved) => {
        if (!saved) {
          return;
        }

        let message = `${saved.fullName}'s account was saved.`;
        if (user.isActive && !saved.isActive) {
          message = `${saved.fullName} was deactivated.` + (user.activeTaskCount ? ' Their tasks went back to the department queues.' : '');
        } else if (!user.isActive && saved.isActive) {
          message = `${saved.fullName} can sign in again.`;
        }

        this.saved(message);
      },
    );
  }

  protected resetPassword(user: AdminUser): void {
    openPasswordDialog(this.dialog, user).subscribe((done) => done && this.saved(`${user.fullName}'s password was changed.`));
  }

  private saved(message: string): void {
    this.users.reload();
    this.notice.set(message);
    afterNextRender(() => this.noticeElement()?.nativeElement.focus(), { injector: this.injector });
  }

  private navigate(filters: UserFilters): void {
    this.notice.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: toUserParams(filters) });
  }
}
