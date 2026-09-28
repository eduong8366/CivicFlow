import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TaskListItem } from '../../core/api/tasks.models';
import { PriorityTag, StatusChip } from '../../shared/status-chip';

/**
 * Tasks as a table, soonest due first (the API's order). My Work shows each case's status; a queue
 * shows the department and the claim and assign buttons instead.
 */
@Component({
  selector: 'app-task-table',
  imports: [DatePipe, MatButtonModule, MatTableModule, PriorityTag, RouterLink, StatusChip],
  template: `
    <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="caption()" [attr.aria-busy]="loading()">
      <table mat-table [dataSource]="tasks()">
        <caption class="cf-visually-hidden">{{ caption() }}, soonest due first</caption>

        <ng-container matColumnDef="dueDate">
          <th mat-header-cell *matHeaderCellDef>Step due</th>
          <td mat-cell *matCellDef="let row" class="nowrap">
            @if (row.dueDate) {
              {{ row.dueDate | date: 'mediumDate' }}
            } @else {
              <span class="sub">No due date</span>
            }
            @if (row.isOverdue) {
              <div class="overdue-tag">Overdue</div>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="case">
          <th mat-header-cell *matHeaderCellDef>Case</th>
          <td mat-cell *matCellDef="let row">
            <a [routerLink]="['/cases', row.caseId]" class="case-link">{{ row.caseNumber }}</a>
            <div class="title">{{ row.caseTitle }}</div>
            <div class="sub">{{ row.caseTypeName }}</div>
          </td>
        </ng-container>

        <ng-container matColumnDef="step">
          <th mat-header-cell *matHeaderCellDef>Step</th>
          <td mat-cell *matCellDef="let row">
            <div>{{ row.name }}</div>
            <div class="sub">Step {{ row.sequence }}</div>
          </td>
        </ng-container>

        <ng-container matColumnDef="department">
          <th mat-header-cell *matHeaderCellDef>Department</th>
          <td mat-cell *matCellDef="let row">{{ row.departmentName }}</td>
        </ng-container>

        <ng-container matColumnDef="priority">
          <th mat-header-cell *matHeaderCellDef>Priority</th>
          <td mat-cell *matCellDef="let row"><app-priority-tag class="compact" [priority]="row.casePriority" /></td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Case status</th>
          <td mat-cell *matCellDef="let row"><app-status-chip [status]="row.caseStatus" /></td>
        </ng-container>

        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef><span class="cf-visually-hidden">Actions</span></th>
          <td mat-cell *matCellDef="let row" class="actions">
            <button
              mat-flat-button
              type="button"
              [disabled]="busyTaskId() !== null"
              [attr.aria-label]="'Claim ' + row.name + ' on ' + row.caseNumber"
              (click)="claim.emit(row)"
            >
              {{ busyTaskId() === row.id ? 'Claiming…' : 'Claim' }}
            </button>
            @if (canAssign()) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="busyTaskId() !== null"
                [attr.aria-label]="'Assign ' + row.name + ' on ' + row.caseNumber"
                (click)="assign.emit(row)"
              >
                Assign…
              </button>
            }
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns()"></tr>
        <tr mat-row *matRowDef="let row; columns: columns()" [class.row-overdue]="row.isOverdue"></tr>
        <tr class="mat-mdc-row" *matNoDataRow>
          <td class="mat-mdc-cell empty" [attr.colspan]="columns().length">{{ emptyMessage() }}</td>
        </tr>
      </table>
    </div>
  `,
  styles: `
    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      min-width: 820px;
    }

    th.mat-mdc-header-cell {
      font-weight: 700;
      color: var(--cf-ink);
      background: var(--cf-ground);
    }

    td.mat-mdc-cell {
      padding-top: 10px;
      padding-bottom: 10px;
      vertical-align: top;
    }

    .case-link {
      font-weight: 700;
      white-space: nowrap;
    }

    .title {
      font-weight: 600;
    }

    .sub {
      font-size: 0.8125rem;
      color: var(--cf-muted);
    }

    .nowrap {
      white-space: nowrap;
    }

    .row-overdue td:first-child {
      box-shadow: inset 4px 0 0 var(--cf-danger);
    }

    .overdue-tag {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--cf-danger);
    }

    .actions {
      white-space: nowrap;

      button + button {
        margin-left: 8px;
      }
    }

    .empty {
      padding: 24px;
      color: var(--cf-muted);
    }
  `,
})
export class TaskTable {
  readonly tasks = input.required<TaskListItem[]>();
  readonly mode = input.required<'mine' | 'queue'>();
  /** For the table's caption, e.g. "Your tasks". */
  readonly caption = input.required<string>();
  readonly emptyMessage = input.required<string>();
  /** Queue mode: show the department column, for lists spanning several queues. */
  readonly showDepartment = input(false);
  /** Queue mode: supervisors and admins can assign. */
  readonly canAssign = input(false);
  /** The task whose claim is in flight; every row's buttons wait meanwhile. */
  readonly busyTaskId = input<number | null>(null);
  readonly loading = input(false);

  readonly claim = output<TaskListItem>();
  readonly assign = output<TaskListItem>();

  protected readonly columns = computed(() =>
    this.mode() === 'mine'
      ? ['dueDate', 'case', 'step', 'priority', 'status']
      : ['dueDate', 'case', 'step', ...(this.showDepartment() ? ['department'] : []), 'priority', 'actions'],
  );
}
