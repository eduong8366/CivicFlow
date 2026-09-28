import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Comment } from '../../../core/api/activity.models';
import { CommentsApi } from '../../../core/api/comments.api';
import { maxPageSize } from '../../../core/api/paging';
import { problemMessage } from '../../../core/api/problem-details';

const maxBodyLength = 4000;

interface Loaded<T> {
  caseId: number;
  value: T | null;
}

/** A case's comments, oldest first, and a form to add one. Comments are internal unless unticked. */
@Component({
  selector: 'app-case-comments',
  imports: [DatePipe, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 id="comments-heading">Comments</h2>

    @if (comments.error()) {
      <div class="cf-alert cf-alert--error" role="alert">The comments couldn't be loaded.</div>
    }

    @if (items().length) {
      <ol class="comments" aria-labelledby="comments-heading">
        @for (comment of items(); track comment.id) {
          <li class="comment" [class.comment--public]="!comment.isInternal">
            <div class="meta">
              <strong>{{ comment.author.fullName }}</strong> ·
              <time [attr.datetime]="comment.createdAt">{{ comment.createdAt | date: 'MMM d, y, h:mm a' }}</time> ·
              {{ comment.isInternal ? 'Internal' : 'Public' }}
            </div>
            <div class="body">{{ comment.body }}</div>
          </li>
        }
      </ol>
    } @else if (comments.hasValue()) {
      <p class="empty">No comments yet.</p>
    }

    @if (hasMore()) {
      <button mat-stroked-button type="button" class="more" [disabled]="loadingMore()" (click)="loadMore()">
        {{ loadingMore() ? 'Loading…' : 'Show more comments' }}
      </button>
    }

    <form [formGroup]="form" (ngSubmit)="post()">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Add a comment</mat-label>
        <textarea matInput formControlName="body" rows="3" [maxlength]="maxBodyLength" required></textarea>
        @if (form.controls.body.value.length > maxBodyLength - 500) {
          <mat-hint align="end">{{ form.controls.body.value.length }} / {{ maxBodyLength }}</mat-hint>
        }
        <mat-error>Write a comment before posting.</mat-error>
      </mat-form-field>
      <div class="form-row">
        <mat-checkbox formControlName="isInternal">Internal only (not for the requester)</mat-checkbox>
        <button mat-flat-button type="submit" [disabled]="posting()">{{ posting() ? 'Posting…' : 'Post' }}</button>
      </div>
      @if (postError(); as error) {
        <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
      }
    </form>
    <div class="cf-visually-hidden" role="status">{{ announcement() }}</div>
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

    .comments {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    // Internal notes are amber, public ones navy, as in the design; the label says which, too.
    .comment {
      border-left: 4px solid #e5a000;
      background: #faf3d1;
      padding: 10px 14px;
    }

    .comment--public {
      border-left-color: var(--cf-accent);
      background: var(--cf-accent-tint);
    }

    .meta {
      font-size: 0.8125rem;
    }

    .body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .empty {
      margin: 0;
      color: var(--cf-muted);
    }

    .more {
      align-self: flex-start;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
  `,
})
export class CaseComments {
  private readonly api = inject(CommentsApi);
  private readonly formDirective = viewChild.required(FormGroupDirective);

  readonly caseId = input.required<number>();
  /**
   * Bumped when an action elsewhere on the page may have added a comment (a hold, cancel or
   * reopen reason is kept as one), to fetch them again.
   */
  readonly version = input(0);
  /** A comment was added, so the case history has a new entry. */
  readonly changed = output<void>();

  protected readonly maxBodyLength = maxBodyLength;
  protected readonly comments = rxResource({
    params: () => ({ caseId: this.caseId(), version: this.version() }),
    stream: ({ params }) => this.api.list(params.caseId, { pageSize: maxPageSize }),
  });

  /**
   * The loaded comments, plus later pages and new comments as they're added. On a refresh the old
   * ones stay until the new ones arrive.
   */
  protected readonly items = linkedSignal<Loaded<Comment[]>, Comment[]>({
    source: () => ({ caseId: this.caseId(), value: this.comments.hasValue() ? this.comments.value().items : null }),
    computation: (next, previous) => next.value ?? (previous?.source.caseId === next.caseId ? previous.value : []),
  });
  private readonly total = linkedSignal<Loaded<number>, number>({
    source: () => ({ caseId: this.caseId(), value: this.comments.hasValue() ? this.comments.value().totalCount : null }),
    computation: (next, previous) => next.value ?? (previous?.source.caseId === next.caseId ? previous.value : 0),
  });
  private readonly pagesLoaded = linkedSignal({
    source: () => ({ caseId: this.caseId(), version: this.version() }),
    computation: () => 1,
  });
  protected readonly hasMore = computed(() => this.items().length < this.total());
  protected readonly loadingMore = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    body: ['', [Validators.required, Validators.maxLength(maxBodyLength)]],
    isInternal: true,
  });
  protected readonly posting = signal(false);
  protected readonly postError = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected loadMore(): void {
    const page = this.pagesLoaded() + 1;
    this.loadingMore.set(true);
    this.api.list(this.caseId(), { page, pageSize: maxPageSize }).subscribe({
      next: (result) => {
        const known = new Set(this.items().map((c) => c.id));
        this.items.update((items) => [...items, ...result.items.filter((c) => !known.has(c.id))]);
        this.total.set(result.totalCount);
        this.pagesLoaded.set(page);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected post(): void {
    const { body, isInternal } = this.form.getRawValue();
    if (!body.trim()) {
      this.form.controls.body.setErrors({ required: true });
      this.form.controls.body.markAsTouched();
      return;
    }

    this.posting.set(true);
    this.postError.set(null);
    this.api.create(this.caseId(), { body: body.trim(), isInternal }).subscribe({
      next: (comment) => {
        this.posting.set(false);
        this.items.update((items) => [...items, comment]);
        this.total.update((total) => total + 1);
        // Through the directive, so the form is no longer "submitted" and the empty box shows no error.
        this.formDirective().resetForm({ body: '', isInternal });
        this.announcement.set('Comment posted.');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.posting.set(false);
        this.postError.set(problemMessage(error, "The comment couldn't be posted. Please try again."));
      },
    });
  }
}
