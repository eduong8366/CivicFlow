import { DatePipe, KeyValuePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { AuditEntry } from '../../core/api/activity.models';
import { AuditNames, groupAuditEntries, humanize } from './audit-events';

/**
 * A record's history as a timeline, newest first: who did what and when, in plain sentences, with
 * each event's exact field changes one click away.
 */
@Component({
  selector: 'app-audit-timeline',
  imports: [DatePipe, KeyValuePipe],
  templateUrl: './audit-timeline.html',
  styleUrl: './audit-timeline.scss',
})
export class AuditTimeline {
  /** Newest first, as the API returns them. */
  readonly entries = input.required<readonly AuditEntry[]>();
  readonly names = input<AuditNames>({ tasks: new Map(), users: new Map() });

  protected readonly events = computed(() => groupAuditEntries(this.entries(), this.names()));
  protected readonly humanize = humanize;
  protected readonly keepOrder = () => 0;
}
