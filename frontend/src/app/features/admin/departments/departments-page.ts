import { afterNextRender, Component, computed, ElementRef, inject, Injector, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AdminDepartmentsApi } from '../../../core/api/admin.api';
import { AdminDepartment } from '../../../core/api/admin.models';
import { problemMessage } from '../../../core/api/problem-details';
import { openDepartmentDialog } from './department-dialog';

/** Departments: where workflow steps are routed and where people work. */
@Component({
  selector: 'app-departments-page',
  imports: [MatButtonModule, MatProgressBarModule, MatTableModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h1>Departments</h1>
        <p class="lede">Each workflow step is routed to a department's queue, and staff and supervisors belong to one.</p>
      </div>
      <button mat-flat-button type="button" (click)="add()">New department</button>
    </div>

    @if (notice(); as notice) {
      <div #noticeBox class="cf-alert cf-alert--success" role="status" tabindex="-1">{{ notice }}</div>
    }

    <section class="cf-panel results" aria-labelledby="departments-heading">
      <div class="results-head">
        <h2 id="departments-heading">All departments</h2>
        <p class="count" role="status">
          @if (departments.isLoading() && !rows()) {
            Loading…
          } @else if (rows(); as rows) {
            {{ rows.length }} {{ rows.length === 1 ? 'department' : 'departments' }} · {{ activeCount() }} active
          }
        </p>
      </div>

      @if (departments.isLoading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading departments" />
      }

      @if (departments.error(); as error) {
        <div class="cf-alert cf-alert--error" role="alert">{{ errorMessage(error) }}</div>
      }

      @if (rows(); as rows) {
        <div class="table-scroll" tabindex="0" role="region" aria-labelledby="departments-heading">
          <table mat-table [dataSource]="rows">
            <caption class="cf-visually-hidden">Departments, with the people, workflow steps and active tasks in each</caption>

            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Department</th>
              <td mat-cell *matCellDef="let row">
                <div class="name">{{ row.name }}</div>
                <div class="sub">{{ row.code }}</div>
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

            <ng-container matColumnDef="people">
              <th mat-header-cell *matHeaderCellDef class="number">Active people</th>
              <td mat-cell *matCellDef="let row" class="number">
                @if (row.activeUserCount) {
                  <a
                    [routerLink]="['/admin/users']"
                    [queryParams]="{ department: row.id }"
                    [attr.aria-label]="row.activeUserCount + ' active people in ' + row.name"
                    >{{ row.activeUserCount }}</a
                  >
                } @else {
                  0
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="steps">
              <th mat-header-cell *matHeaderCellDef class="number">Workflow steps</th>
              <td mat-cell *matCellDef="let row" class="number">{{ row.activeStepCount }}</td>
            </ng-container>

            <ng-container matColumnDef="tasks">
              <th mat-header-cell *matHeaderCellDef class="number">Active tasks</th>
              <td mat-cell *matCellDef="let row" class="number">{{ row.activeTaskCount }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="cf-visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let row" class="actions">
                <button mat-stroked-button type="button" [attr.aria-label]="'Edit ' + row.name" (click)="edit(row)">Edit…</button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" [class.row-inactive]="!row.isActive"></tr>
            <tr class="mat-mdc-row" *matNoDataRow>
              <td class="mat-mdc-cell empty" [attr.colspan]="columns.length">No departments yet.</td>
            </tr>
          </table>
        </div>
      }
    </section>
  `,
  styleUrl: '../admin-pages.scss',
  styles: `
    table {
      min-width: 640px;
    }
  `,
})
export class DepartmentsPage {
  private readonly api = inject(AdminDepartmentsApi);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  protected readonly columns = ['name', 'status', 'people', 'steps', 'tasks', 'actions'];
  protected readonly departments = rxResource({ stream: () => this.api.list() });
  /** The list on screen; after a save it stays while the refreshed one loads. */
  protected readonly rows = linkedSignal<AdminDepartment[] | undefined, AdminDepartment[] | null>({
    source: () => (this.departments.hasValue() ? this.departments.value() : undefined),
    computation: (value, previous) => value ?? (this.departments.error() ? null : (previous?.value ?? null)),
  });
  protected readonly activeCount = computed(() => this.rows()?.filter((d) => d.isActive).length ?? 0);

  protected readonly notice = signal<string | null>(null);
  private readonly noticeElement = viewChild<ElementRef<HTMLElement>>('noticeBox');

  protected errorMessage(error: unknown): string {
    return problemMessage(error, "The departments couldn't be loaded. Please try again.");
  }

  protected add(): void {
    openDepartmentDialog(this.dialog, null).subscribe((saved) => saved && this.saved(`${saved.name} (${saved.code}) was added.`));
  }

  protected edit(department: AdminDepartment): void {
    openDepartmentDialog(this.dialog, department).subscribe((saved) => {
      if (!saved) {
        return;
      }

      const change =
        saved.isActive === department.isActive ? 'was saved' : saved.isActive ? 'is active again' : 'is now inactive';
      this.saved(`${saved.name} ${change}.`);
    });
  }

  private saved(message: string): void {
    this.departments.reload();
    this.notice.set(message);
    afterNextRender(() => this.noticeElement()?.nativeElement.focus(), { injector: this.injector });
  }
}
