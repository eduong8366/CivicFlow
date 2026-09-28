import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { AuditEntry } from '../../../core/api/activity.models';
import { AuditApi } from '../../../core/api/audit.api';
import { WorkflowTask } from '../../../core/api/cases.models';
import { LookupsApi } from '../../../core/api/lookups.api';
import { AuditNames } from '../../../shared/audit-timeline/audit-events';
import { AuditTimeline } from '../../../shared/audit-timeline/audit-timeline';

const pageSize = 50;

/** A case's latest loaded value, or null while it loads. */
interface Loaded<T> {
  caseId: number;
  value: T | null;
}

/** The case's audit trail as a timeline, newest first, with older entries on request. */
@Component({
  selector: 'app-case-history',
  imports: [AuditTimeline, MatButtonModule],
  template: `
    <h2>History</h2>
    @if (history.error()) {
      <div class="cf-alert cf-alert--error" role="alert">The history couldn't be loaded.</div>
    } @else if (items(); as items) {
      <app-audit-timeline [entries]="items" [names]="names()" />
      @if (hasMore()) {
        <button mat-stroked-button type="button" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? 'Loading…' : 'Show earlier history' }}
        </button>
      }
    } @else {
      <p class="loading">Loading history…</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    h2 {
      font-size: 1.125rem;
    }

    button {
      align-self: flex-start;
    }

    .loading {
      margin: 0;
      color: var(--cf-muted);
    }
  `,
})
export class CaseHistory {
  private readonly api = inject(AuditApi);
  private readonly lookups = inject(LookupsApi);

  readonly caseId = input.required<number>();
  /** The case's tasks, to name steps the log refers to by id. */
  readonly tasks = input<readonly WorkflowTask[]>([]);
  /** Bumped when something on the page added to the history, to fetch it again. */
  readonly version = input(0);

  protected readonly history = rxResource({
    params: () => ({ caseId: this.caseId(), version: this.version() }),
    stream: ({ params }) => this.api.caseHistory(params.caseId, { pageSize }),
  });

  // Deactivated users too: old entries can name people who have since left.
  private readonly users = rxResource({
    stream: () => this.lookups.users({ includeInactive: true }),
    defaultValue: [],
  });

  /** The entries on screen; on a refresh the old ones stay until the new ones arrive. */
  protected readonly items = linkedSignal<Loaded<AuditEntry[]>, AuditEntry[] | null>({
    source: () => ({ caseId: this.caseId(), value: this.history.hasValue() ? this.history.value().items : null }),
    computation: (next, previous) => next.value ?? (previous?.source.caseId === next.caseId ? previous.value : null),
  });
  private readonly total = linkedSignal<Loaded<number>, number>({
    source: () => ({ caseId: this.caseId(), value: this.history.hasValue() ? this.history.value().totalCount : null }),
    computation: (next, previous) => next.value ?? (previous?.source.caseId === next.caseId ? previous.value : 0),
  });
  protected readonly hasMore = computed(() => (this.items()?.length ?? 0) < this.total());
  protected readonly loadingMore = signal(false);

  protected readonly names = computed<AuditNames>(() => ({
    tasks: new Map(this.tasks().map((task) => [String(task.id), task.name])),
    users: new Map(this.users.value().map((user) => [user.id, user.fullName])),
  }));

  protected loadMore(): void {
    const loaded = this.items() ?? [];
    const page = Math.floor(loaded.length / pageSize) + 1;
    this.loadingMore.set(true);
    this.api.caseHistory(this.caseId(), { page, pageSize }).subscribe({
      next: (result) => {
        const known = new Set(loaded.map((entry) => entry.id));
        this.items.set([...loaded, ...result.items.filter((entry) => !known.has(entry.id))]);
        this.total.set(result.totalCount);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }
}
