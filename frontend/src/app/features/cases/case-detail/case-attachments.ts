import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Attachment } from '../../../core/api/activity.models';
import { AttachmentsApi, saveBlob } from '../../../core/api/attachments.api';
import { maxPageSize } from '../../../core/api/paging';
import { problemMessage } from '../../../core/api/problem-details';
import { FileUploader } from '../../../shared/file-uploader/file-uploader';
import { formatBytes } from '../../../shared/labels';

/** A case's files, newest first: download any of them, or attach another. */
@Component({
  selector: 'app-case-attachments',
  imports: [DatePipe, FileUploader, MatButtonModule],
  template: `
    <h2 id="attachments-heading">Attachments</h2>

    @if (attachments.error()) {
      <div class="cf-alert cf-alert--error" role="alert">The attachments couldn't be loaded.</div>
    }

    @if (items().length) {
      <ul class="files" aria-labelledby="attachments-heading">
        @for (file of items(); track file.id) {
          <li>
            <button type="button" class="file-name" [disabled]="downloading() === file.id" (click)="download(file)">
              {{ file.fileName }}<span class="cf-visually-hidden">, download</span>
            </button>
            <div class="meta">
              {{ formatBytes(file.size) }} · {{ file.uploadedBy.fullName }} ·
              <time [attr.datetime]="file.uploadedAt">{{ file.uploadedAt | date: 'MMM d, y' }}</time>
              @if (downloading() === file.id) {
                · Downloading…
              }
            </div>
          </li>
        }
      </ul>
      @if (hasMore()) {
        <p class="note">Showing the newest {{ items().length }} of {{ total() }} files.</p>
      }
    } @else if (attachments.hasValue()) {
      <p class="note">No files attached yet.</p>
    }

    @if (downloadError(); as error) {
      <div class="cf-alert cf-alert--error" role="alert">{{ error }}</div>
    }

    <app-file-uploader
      label="Attach a file"
      [busy]="uploading()"
      [error]="uploadError()"
      (fileSelected)="upload($event)"
    />
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

    .files {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        padding: 8px 0;
        border-bottom: 1px solid var(--cf-border);
      }
    }

    // A button, since it fetches the file with the user's token, styled as the link it acts like.
    .file-name {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      font-weight: 600;
      color: var(--cf-accent);
      text-decoration: underline;
      text-align: left;
      overflow-wrap: anywhere;
      cursor: pointer;

      &:hover {
        color: var(--cf-accent-dark);
      }
    }

    .meta,
    .note {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--cf-muted);
    }
  `,
})
export class CaseAttachments {
  private readonly api = inject(AttachmentsApi);

  readonly caseId = input.required<number>();
  /** A file was attached, so the case history has a new entry. */
  readonly changed = output<void>();

  protected readonly formatBytes = formatBytes;
  protected readonly attachments = rxResource({
    params: () => this.caseId(),
    stream: ({ params }) => this.api.list(params, { pageSize: maxPageSize }),
  });
  protected readonly items = linkedSignal<Attachment[]>(() =>
    this.attachments.hasValue() ? this.attachments.value().items : [],
  );
  protected readonly total = linkedSignal(() => (this.attachments.hasValue() ? this.attachments.value().totalCount : 0));
  protected readonly hasMore = computed(() => this.items().length < this.total());

  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly downloading = signal<number | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected upload(file: File): void {
    this.uploading.set(true);
    this.uploadError.set(null);
    this.api.upload(this.caseId(), file).subscribe({
      next: (attachment) => {
        this.uploading.set(false);
        this.items.update((items) => [attachment, ...items]);
        this.total.update((total) => total + 1);
        this.announcement.set(`${attachment.fileName} attached.`);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.uploadError.set(problemMessage(error, "The file couldn't be uploaded. Please try again."));
      },
    });
  }

  protected download(file: Attachment): void {
    this.downloading.set(file.id);
    this.downloadError.set(null);
    this.api.download(file.id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        saveBlob(blob, file.fileName);
      },
      error: () => {
        this.downloading.set(null);
        this.downloadError.set(`${file.fileName} couldn't be downloaded. Please try again.`);
      },
    });
  }
}
