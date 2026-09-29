import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { tap } from 'rxjs';
import { Department } from '../../../core/api/activity.models';
import { AdminCaseTypesApi } from '../../../core/api/admin.api';
import { AdminCaseType, fieldDataTypes, taskOutcomes } from '../../../core/api/admin.models';
import { TaskOutcome } from '../../../core/api/cases.models';
import { LookupsApi } from '../../../core/api/lookups.api';
import { problemMessage, problemOf } from '../../../core/api/problem-details';
import { HasUnsavedChanges } from '../../../core/unsaved-changes.guard';
import { applyServerErrors, errorMessage, ErrorWording } from '../../../shared/form-errors';
import { outcomeLabel } from '../../../shared/labels';
import {
  CaseTypeForm,
  caseTypeForm,
  dropReturnFromFirstStep,
  fieldForm,
  FieldForm,
  keyWording,
  maxFields,
  maxSteps,
  moveControl,
  prefixWording,
  saveRequest,
  stepForm,
  StepForm,
  totalSlaDays,
} from './case-type-form';

interface ErrorLink {
  /** The element to focus, or empty for a message about no one control. */
  id: string;
  message: string;
}

type ListName = 'fields' | 'steps';

const slaWording: ErrorWording = { pattern: 'SLA days must be a whole number.' };

/**
 * The case type designer: a type's details, the custom fields its New Case form asks for, and
 * the workflow steps its cases go through. Fields and steps reorder by dragging or with the move
 * buttons (for keyboards); fields and steps that existing cases use can't be removed.
 */
@Component({
  selector: 'app-case-type-designer',
  imports: [
    DragDropModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './case-type-designer.html',
  styleUrl: './case-type-designer.scss',
})
export class CaseTypeDesigner implements HasUnsavedChanges {
  private readonly api = inject(AdminCaseTypesApi);
  private readonly lookups = inject(LookupsApi);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private readonly summary = viewChild<ElementRef<HTMLElement>>('errorSummary');
  private readonly noticeBox = viewChild<ElementRef<HTMLElement>>('noticeBox');

  /** The `:id` route parameter; absent on the new case type route. */
  readonly id = input<string>();

  protected readonly isNew = computed(() => this.id() === undefined);
  protected readonly typeId = computed(() => {
    const id = Number(this.id());
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  protected readonly caseType = rxResource({
    params: () => this.typeId() ?? undefined,
    stream: ({ params }) => this.api.get(params).pipe(tap((type) => this.title.setTitle(`${type.name} · CivicFlow`))),
  });
  // Inactive ones too, so a step routed to one can still show it.
  protected readonly departments = rxResource({ stream: () => this.lookups.departments({ includeInactive: true }), defaultValue: [] });

  /** The saved definition the form started from; null for a new type. */
  protected readonly loaded = signal<AdminCaseType | null>(null);
  protected readonly form = signal<CaseTypeForm>(caseTypeForm());

  protected readonly loadError = computed(() => {
    if (!this.isNew() && this.typeId() === null) {
      return "There's no case type at this address.";
    }

    const error = this.caseType.error();
    if (!error) {
      return null;
    }

    return error instanceof HttpErrorResponse && error.status === 404
      ? "This case type doesn't exist. It may have been removed."
      : problemMessage(error, "The case type couldn't be loaded. Please try again.");
  });
  protected readonly ready = computed(() => this.isNew() || this.loaded() !== null);

  protected readonly fieldTypes = fieldDataTypes;
  protected readonly outcomes = taskOutcomes;
  protected readonly outcomeLabel = outcomeLabel;
  protected readonly maxFields = maxFields;
  protected readonly maxSteps = maxSteps;
  protected readonly keyWording = keyWording;
  protected readonly prefixWording = prefixWording;
  protected readonly slaWording = slaWording;

  protected readonly saving = signal(false);
  protected readonly errors = signal<ErrorLink[]>([]);
  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(
    (inject(Location).getState() as { saved?: string } | null)?.saved ?? null,
  );
  /** Read out after reordering, adding or removing rows. */
  protected readonly announcement = signal('');

  constructor() {
    effect(() => {
      if (this.caseType.hasValue()) {
        const type = this.caseType.value();
        untracked(() => this.load(type));
      }
    });
  }

  /** The route guard asks before leaving with unsaved changes. */
  canLeave(): boolean {
    return !this.form().dirty || this.saving() || window.confirm('Leave without saving your changes to this case type?');
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.form().dirty) {
      event.preventDefault();
    }
  }

  protected departmentChoices(selectedId: number | null): Department[] {
    return this.departments.value().filter((d) => d.isActive || d.id === selectedId);
  }

  protected isInactiveDepartment(id: number | null): boolean {
    return id !== null && this.departments.value().some((d) => d.id === id && !d.isActive);
  }

  protected message(control: AbstractControl, label: string, wording?: ErrorWording): string | null {
    return errorMessage(control, label, wording);
  }

  /** Recomputed on each render, so it follows typing. */
  protected totalSla(): number {
    return totalSlaDays(this.form().controls.steps);
  }

  // Rows

  protected addField(): void {
    const fields = this.form().controls.fields;
    fields.push(fieldForm());
    fields.markAsDirty();
    this.announce(`Field ${fields.length} added.`);
    this.focusLater(`field-${fields.length - 1}-label`);
  }

  protected addStep(): void {
    const steps = this.form().controls.steps;
    steps.push(stepForm());
    steps.markAsDirty();
    this.announce(`Step ${steps.length} added.`);
    this.focusLater(`step-${steps.length - 1}-name`);
  }

  protected remove(list: ListName, index: number): void {
    const array = this.list(list);
    const name = this.rowName(list, index);
    array.removeAt(index);
    array.markAsDirty();
    let message = `${name} removed.`;
    if (list === 'steps' && index === 0 && dropReturnFromFirstStep(this.form().controls.steps)) {
      message += ` ${this.rowName('steps', 0)} is now first, so Return was turned off.`;
    }

    this.announce(message);
    this.focusLater(list === 'fields' ? 'add-field' : 'add-step');
  }

  protected move(list: ListName, from: number, to: number): void {
    this.reorder(list, from, to);
    const array = this.list(list);
    // Keep focus on the button that was used, unless that end of the list disabled it.
    const direction = to < from ? 'up' : 'down';
    const atEnd = direction === 'up' ? to === 0 : to === array.length - 1;
    this.focusLater(`${list === 'fields' ? 'field' : 'step'}-${to}-${atEnd ? (direction === 'up' ? 'down' : 'up') : direction}`);
  }

  protected drop(list: ListName, event: CdkDragDrop<unknown>): void {
    this.reorder(list, event.previousIndex, event.currentIndex);
  }

  protected toggleOutcome(step: StepForm, outcome: TaskOutcome, checked: boolean): void {
    const control = step.controls.allowedOutcomes;
    const chosen = new Set(control.value);
    if (checked) {
      chosen.add(outcome);
    } else {
      chosen.delete(outcome);
    }

    control.setValue(taskOutcomes.filter((o) => chosen.has(o)));
    control.markAsDirty();
    control.markAsTouched();
  }

  private reorder(list: ListName, from: number, to: number): void {
    const array = this.list(list);
    if (from === to) {
      return;
    }

    if (list === 'fields') {
      moveControl(this.form().controls.fields, from, to);
    } else {
      moveControl(this.form().controls.steps, from, to);
    }

    let message = `${this.rowName(list, to)} moved to position ${to + 1} of ${array.length}.`;
    if (list === 'steps' && dropReturnFromFirstStep(this.form().controls.steps)) {
      message += ` The first step can't return to an earlier one, so Return was turned off for ${this.rowName('steps', 0)}.`;
    }

    this.announce(message);
  }

  private list(list: ListName): FormArray<FieldForm> | FormArray<StepForm> {
    return list === 'fields' ? this.form().controls.fields : this.form().controls.steps;
  }

  private rowName(list: ListName, index: number): string {
    if (list === 'fields') {
      const label = this.form().controls.fields.at(index)?.controls.label.value.trim();
      return label ? `The ${label} field` : `Field ${index + 1}`;
    }

    const name = this.form().controls.steps.at(index)?.controls.name.value.trim();
    return name ? `The ${name} step` : `Step ${index + 1}`;
  }

  // Saving

  protected save(): void {
    const form = this.form();
    this.failure.set(null);
    this.notice.set(null);
    if (form.invalid) {
      form.markAllAsTouched();
      this.showErrors();
      return;
    }

    const existing = this.loaded();
    const request = saveRequest(form);
    this.saving.set(true);
    this.errors.set([]);
    (existing ? this.api.update(existing.id, request) : this.api.create(request)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (existing) {
          this.load(saved);
          this.title.setTitle(`${saved.name} · CivicFlow`);
          this.showNotice(`${saved.name} was saved.`);
        } else {
          form.markAsPristine();
          void this.router.navigate(['/admin/case-types', saved.id], {
            state: { saved: `${saved.name} was created. Staff can now open ${saved.prefix} cases.` },
          });
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const problem = problemOf(error);
        if (error instanceof HttpErrorResponse && error.status === 400 && problem?.errors) {
          this.showErrors(applyServerErrors(form, problem.errors));
        } else {
          this.failure.set(problemMessage(error, "The case type couldn't be saved. Please try again."));
          this.focusLater(null);
        }
      },
    });
  }

  private load(type: AdminCaseType): void {
    this.loaded.set(type);
    this.form.set(caseTypeForm(type));
    this.errors.set([]);
  }

  /** Lists every problem above the form, each linking to its control, and moves focus there. */
  private showErrors(extra: string[] = []): void {
    const links: ErrorLink[] = [];
    const add = (id: string, control: AbstractControl, label: string, wording?: ErrorWording, prefix = '') => {
      const message = control.invalid ? errorMessage(control, label, wording) : null;
      if (message) {
        links.push({ id, message: prefix + message });
      }
    };

    const c = this.form().controls;
    add('type-name', c.name, 'Name');
    add('type-prefix', c.prefix, 'Prefix', prefixWording);
    add('type-description', c.description, 'Description');

    if (c.fields.errors?.['duplicate']) {
      links.push({ id: 'add-field', message: c.fields.errors['duplicate'] as string });
    }
    c.fields.controls.forEach((field, i) => {
      const prefix = `Field ${i + 1}${field.controls.label.value.trim() ? ` (${field.controls.label.value.trim()})` : ''}: `;
      add(`field-${i}-label`, field.controls.label, 'Label', undefined, prefix);
      add(`field-${i}-key`, field.controls.key, 'Key', keyWording, prefix);
      add(`field-${i}-type`, field.controls.dataType, 'Type', undefined, prefix);
      add(`field-${i}-options`, field.controls.options, 'Options', undefined, prefix);
    });

    if (c.steps.errors?.['duplicate']) {
      links.push({ id: 'add-step', message: c.steps.errors['duplicate'] as string });
    }
    c.steps.controls.forEach((step, i) => {
      const prefix = `Step ${i + 1}${step.controls.name.value.trim() ? ` (${step.controls.name.value.trim()})` : ''}: `;
      add(`step-${i}-name`, step.controls.name, 'Name', undefined, prefix);
      add(`step-${i}-department`, step.controls.departmentId, 'Department', undefined, prefix);
      add(`step-${i}-sla`, step.controls.slaDays, 'SLA days', slaWording, prefix);
      add(`step-${i}-outcomes`, step.controls.allowedOutcomes, 'Outcomes', undefined, prefix);
    });

    this.errors.set([...links, ...extra.map((message) => ({ id: '', message }))]);
    this.focusLater(null);
  }

  protected focusField(event: Event, id: string): void {
    event.preventDefault();
    const target = document.getElementById(id);
    const focusable = target?.matches('input, textarea, select, button, [tabindex]') ? target : target?.querySelector<HTMLElement>('input, [tabindex]');
    focusable?.focus();
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    afterNextRender(() => this.noticeBox()?.nativeElement.focus(), { injector: this.injector });
  }

  private announce(message: string): void {
    // Cleared first so the same words are read again.
    this.announcement.set('');
    afterNextRender(() => this.announcement.set(message), { injector: this.injector });
  }

  /** Focuses an element by id once the view has updated, or the error summary when id is null. */
  private focusLater(id: string | null): void {
    afterNextRender(
      () => {
        const element = id ? document.getElementById(id) : this.summary()?.nativeElement;
        const focusable = element?.matches('input, textarea, button, [tabindex]') ? element : element?.querySelector<HTMLElement>('input, [tabindex]');
        focusable?.focus();
      },
      { injector: this.injector },
    );
  }
}
