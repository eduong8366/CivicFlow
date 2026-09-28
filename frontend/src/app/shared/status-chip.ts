import { Component, computed, input } from '@angular/core';
import { CasePriority, CaseResolution, CaseStatus } from '../core/api/cases.models';
import { caseStatusLabel } from './labels';

/** A case's status as a coloured tag. The text says it all; colour only reinforces it. */
@Component({
  selector: 'app-status-chip',
  template: `<span class="chip" [class]="'chip--' + tone()">{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-block;
      padding: 1px 10px;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.5;
      white-space: nowrap;
      border: 1px solid transparent;
    }

    // Every fill keeps at least 4.5:1 against its text.
    .chip--open {
      border-color: var(--cf-accent);
      color: var(--cf-accent);
      background: var(--cf-surface);
    }
    .chip--active {
      background: var(--cf-accent);
      color: #ffffff;
    }
    .chip--hold {
      background: #ffbe2e;
      color: var(--cf-ink);
    }
    .chip--closed {
      background: #216e1f;
      color: #ffffff;
    }
    .chip--rejected {
      background: var(--cf-danger);
      color: #ffffff;
    }
    .chip--cancelled {
      background: var(--cf-muted);
      color: #ffffff;
    }
  `,
})
export class StatusChip {
  readonly status = input.required<CaseStatus>();
  readonly resolution = input<CaseResolution | null>(null);

  protected readonly label = computed(() => caseStatusLabel(this.status(), this.resolution()));
  protected readonly tone = computed(() => {
    switch (this.status()) {
      case 'Open':
        return 'open';
      case 'InProgress':
        return 'active';
      case 'OnHold':
        return 'hold';
      case 'Cancelled':
        return 'cancelled';
      case 'Closed':
        return this.resolution() === 'Rejected' ? 'rejected' : 'closed';
    }
  });
}

/** A case's priority; high and urgent stand out. */
@Component({
  selector: 'app-priority-tag',
  template: `<span class="tag" [class.tag--high]="priority() === 'High'" [class.tag--urgent]="priority() === 'Urgent'"
    >{{ priority() }}<span class="suffix"> priority</span></span
  >`,
  styles: `
    .tag {
      display: inline-block;
      padding: 0 9px;
      border: 1px solid var(--cf-muted);
      font-size: 0.875rem;
      line-height: 1.5;
      white-space: nowrap;
    }
    .tag--high {
      font-weight: 700;
      border-width: 2px;
      padding: 0 8px;

    }
    .tag--urgent {
      font-weight: 700;
      color: var(--cf-danger);
      border: 2px solid var(--cf-danger);
      padding: 0 8px;

    }
    :host(.compact) .suffix {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class PriorityTag {
  readonly priority = input.required<CasePriority>();
}
