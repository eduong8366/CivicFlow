import { Component, computed, input, output, signal } from '@angular/core';
import { attachmentRules } from '../../core/api/attachments.api';
import { formatBytes } from '../labels';

/** Why a file can't be attached, or null if it can. Mirrors the API's rules. */
export function fileProblem(file: Pick<File, 'name' | 'size'>): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!(attachmentRules.extensions as readonly string[]).includes(extension)) {
    return `${file.name} can't be attached. Allowed types: ${attachmentRules.extensions.join(', ')}.`;
  }

  if (file.size === 0) {
    return `${file.name} is empty.`;
  }

  if (file.size > attachmentRules.maxSizeBytes) {
    return `${file.name} is ${formatBytes(file.size)}; files can be at most ${formatBytes(attachmentRules.maxSizeBytes)}.`;
  }

  return null;
}

let nextId = 0;

/**
 * Picks a file to attach, by button or by dropping it on the control, and checks it against the
 * upload rules before anything is sent. The parent uploads the file and reports server errors
 * back through `error`.
 */
@Component({
  selector: 'app-file-uploader',
  template: `
    <div
      class="drop"
      [class.dragging]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <input
        #input
        [id]="inputId"
        type="file"
        class="cf-visually-hidden"
        [accept]="accept"
        [disabled]="busy()"
        [attr.aria-describedby]="hintId + (message() ? ' ' + errorId : '')"
        (change)="onChange(input)"
      />
      <label [for]="inputId" class="pick" [class.disabled]="busy()">{{ busy() ? 'Uploading…' : label() }}</label>
      <span [id]="hintId" class="hint">or drop a file here · {{ typesHint }} up to {{ maxSize }}</span>
    </div>
    @if (message(); as message) {
      <div [id]="errorId" class="error" role="alert">{{ message }}</div>
    }
  `,
  styleUrl: './file-uploader.scss',
})
export class FileUploader {
  readonly label = input('Upload file');
  readonly busy = input(false);
  /** A problem the API reported with the last upload. */
  readonly error = input<string | null>(null);

  /** A file that passed the checks, ready to upload. */
  readonly fileSelected = output<File>();

  protected readonly inputId = `file-uploader-${nextId++}`;
  protected readonly hintId = `${this.inputId}-hint`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly accept = attachmentRules.extensions.join(',');
  protected readonly typesHint = 'PDF, images, text and Office files';
  protected readonly maxSize = formatBytes(attachmentRules.maxSizeBytes);
  protected readonly dragging = signal(false);
  private readonly localError = signal<string | null>(null);
  protected readonly message = computed(() => this.localError() ?? this.error());

  protected onChange(input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Clear the input so choosing the same file again still fires a change.
    input.value = '';
    if (file) {
      this.select(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.busy()) {
      event.preventDefault();
      this.dragging.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file && !this.busy()) {
      this.select(file);
    }
  }

  private select(file: File): void {
    const problem = fileProblem(file);
    this.localError.set(problem);
    if (!problem) {
      this.fileSelected.emit(file);
    }
  }
}
