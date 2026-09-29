import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AdminCaseTypesApi } from '../../../core/api/admin.api';
import { problemMessage } from '../../../core/api/problem-details';

/** Every case type, active or not, with what it contains and how many cases use it. */
@Component({
  selector: 'app-case-types-page',
  imports: [MatButtonModule, MatProgressBarModule, MatTableModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h1>Case types</h1>
        <p class="lede">Each type has its own form fields and workflow. Changes apply to new cases straight away.</p>
      </div>
      <a mat-flat-button routerLink="/admin/case-types/new">New case type</a>
    </div>

    <section class="cf-panel results" aria-labelledby="types-heading">
      <div class="results-head">
        <h2 id="types-heading">All case types</h2>
        <p class="count" role="status">
          @if (caseTypes.isLoading()) {
            Loading…
          } @else if (caseTypes.hasValue()) {
            {{ caseTypes.value().length }} {{ caseTypes.value().length === 1 ? 'type' : 'types' }} · {{ activeCount() }} active
          }
        </p>
      </div>

      @if (caseTypes.isLoading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading case types" />
      }

      @if (error(); as error) {
        <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
      }

      @if (caseTypes.hasValue()) {
        <div class="table-scroll" tabindex="0" role="region" aria-labelledby="types-heading">
          <table mat-table [dataSource]="caseTypes.value()">
            <caption class="cf-visually-hidden">Case types, with their fields, steps and cases</caption>

            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Case type</th>
              <td mat-cell *matCellDef="let row">
                <a class="name" [routerLink]="['/admin/case-types', row.id]">{{ row.name }}</a>
                @if (row.description) {
                  <div class="sub">{{ row.description }}</div>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="prefix">
              <th mat-header-cell *matHeaderCellDef>Prefix</th>
              <td mat-cell *matCellDef="let row" class="nowrap">{{ row.prefix }}</td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let row">
                <span class="state" [class.state--active]="row.isActive" [class.state--inactive]="!row.isActive">
                  {{ row.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="fields">
              <th mat-header-cell *matHeaderCellDef class="number">Fields</th>
              <td mat-cell *matCellDef="let row" class="number">{{ row.fieldCount }}</td>
            </ng-container>

            <ng-container matColumnDef="steps">
              <th mat-header-cell *matHeaderCellDef class="number">Steps</th>
              <td mat-cell *matCellDef="let row" class="number">{{ row.stepCount }}</td>
            </ng-container>

            <ng-container matColumnDef="cases">
              <th mat-header-cell *matHeaderCellDef class="number">Cases</th>
              <td mat-cell *matCellDef="let row" class="number nowrap">
                @if (row.caseCount) {
                  <a
                    routerLink="/cases"
                    [queryParams]="{ caseTypeId: row.id }"
                    [attr.aria-label]="row.caseCount + ' ' + row.name + ' cases, ' + row.openCaseCount + ' open'"
                    >{{ row.caseCount }}</a
                  >
                  <div class="sub">{{ row.openCaseCount }} open</div>
                } @else {
                  0
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="cf-visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let row" class="actions">
                <a mat-stroked-button [routerLink]="['/admin/case-types', row.id]" [attr.aria-label]="'Design ' + row.name">Design</a>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" [class.row-inactive]="!row.isActive"></tr>
            <tr class="mat-mdc-row" *matNoDataRow>
              <td class="mat-mdc-cell empty" [attr.colspan]="columns.length">No case types yet. Add one to start taking cases.</td>
            </tr>
          </table>
        </div>
      }
    </section>
  `,
  styleUrl: '../admin-pages.scss',
  styles: `
    table {
      min-width: 760px;
    }

    a.name {
      display: inline-block;
    }
  `,
})
export class CaseTypesPage {
  private readonly api = inject(AdminCaseTypesApi);

  protected readonly columns = ['name', 'prefix', 'status', 'fields', 'steps', 'cases', 'actions'];
  protected readonly caseTypes = rxResource({ stream: () => this.api.list() });
  protected readonly activeCount = computed(() => (this.caseTypes.hasValue() ? this.caseTypes.value().filter((t) => t.isActive).length : 0));
  protected readonly error = computed(() => {
    const error = this.caseTypes.error();
    return error ? problemMessage(error, "The case types couldn't be loaded. Please try again.") : null;
  });
}
