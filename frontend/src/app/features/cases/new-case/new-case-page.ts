import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { CaseTypesApi } from '../../../core/api/case-types.api';
import { CasesApi } from '../../../core/api/cases.api';
import { casePriorities, CasePriority, CaseType, CaseTypeField } from '../../../core/api/cases.models';
import { problemMessage, problemOf } from '../../../core/api/problem-details';
import { applyServerErrors, controlMessage, fieldControls, FieldControls, fieldValues } from './case-field-form';

interface ErrorLink {
  id: string;
  message: string;
}

/**
 * Opens a case: choose a type, and the form adds that type's own fields (the "general form" an
 * admin defines) to the standard case and requester details.
 */
@Component({
  selector: 'app-new-case-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './new-case-page.html',
  styleUrl: './new-case-page.scss',
})
export class NewCasePage {
  private readonly router = inject(Router);
  private readonly casesApi = inject(CasesApi);
  private readonly injector = inject(Injector);
  private readonly errorSummary = viewChild<ElementRef<HTMLElement>>('errorSummary');

  private readonly caseTypesApi = inject(CaseTypesApi);

  protected readonly caseTypes = rxResource({ stream: () => this.caseTypesApi.list() });
  protected readonly priorities = casePriorities;

  protected readonly form = inject(FormBuilder).group({
    caseTypeId: [null as number | null, Validators.required],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(4000)],
    priority: ['Normal' as CasePriority, Validators.required],
    requesterName: ['', [Validators.required, Validators.maxLength(150)]],
    requesterEmail: ['', [Validators.email, Validators.maxLength(256)]],
    requesterPhone: ['', Validators.maxLength(30)],
    requesterAddress: ['', Validators.maxLength(300)],
    fields: fieldControls([]) as FieldControls,
  });

  private readonly caseTypeId = toSignal(
    this.form.controls.caseTypeId.valueChanges.pipe(startWith(this.form.controls.caseTypeId.value)),
  );
  protected readonly caseType = computed<CaseType | null>(() => {
    const types = this.caseTypes.hasValue() ? this.caseTypes.value() : [];
    return types.find((type) => type.id === this.caseTypeId()) ?? null;
  });
  protected readonly slaDays = computed(() => this.caseType()?.steps.reduce((sum, step) => sum + step.slaDays, 0) ?? 0);

  protected readonly busy = signal(false);
  protected readonly errors = signal<ErrorLink[]>([]);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    // A link can choose the type: /cases/new?type=2.
    const requested = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('type'));
    if (requested > 0) {
      this.form.controls.caseTypeId.setValue(requested);
    }

    // Each type brings its own fields; they're built once the chosen type is known.
    effect(() => {
      const type = this.caseType();
      untracked(() => this.form.setControl('fields', fieldControls(type?.fields ?? [])));
    });
  }

  /** Undefined for a moment after the type changes, until its controls are built. */
  protected fieldControl(field: CaseTypeField): FormControl<unknown> | undefined {
    return this.form.controls.fields.controls[field.key];
  }

  protected fieldId(field: CaseTypeField): string {
    return `field-${field.key}`;
  }

  protected message(control: AbstractControl, label: string, kind: 'input' | 'checkbox' = 'input'): string | null {
    return controlMessage(control, label, kind);
  }

  protected submit(): void {
    this.failure.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.showErrors();
      return;
    }

    const type = this.caseType()!;
    const value = this.form.getRawValue();
    const optional = (text: string | null) => text?.trim() || null;
    this.busy.set(true);
    this.casesApi
      .create({
        caseTypeId: type.id,
        title: value.title!.trim(),
        description: optional(value.description),
        priority: value.priority!,
        requesterName: value.requesterName!.trim(),
        requesterEmail: optional(value.requesterEmail),
        requesterPhone: optional(value.requesterPhone),
        requesterAddress: optional(value.requesterAddress),
        fields: fieldValues(type.fields, this.form.controls.fields),
      })
      .subscribe({
        next: (created) => void this.router.navigate(['/cases', created.id], { state: { created: true } }),
        error: (error: unknown) => {
          this.busy.set(false);
          const problem = problemOf(error);
          if (error instanceof HttpErrorResponse && error.status === 400 && problem?.errors) {
            const unmatched = applyServerErrors(this.form, problem.errors);
            this.showErrors(unmatched);
          } else {
            this.failure.set(problemMessage(error, "The case couldn't be created. Please try again."));
            this.focusSummary();
          }
        },
      });
  }

  /** Lists every problem at the top of the form, each linking to its field, and moves focus there. */
  private showErrors(extra: string[] = []): void {
    const links: ErrorLink[] = [];
    const add = (id: string, control: AbstractControl, label: string, kind?: 'input' | 'checkbox') => {
      const message = control.invalid ? controlMessage(control, label, kind) : null;
      if (message) {
        links.push({ id, message });
      }
    };

    const c = this.form.controls;
    add('case-type', c.caseTypeId, 'Case type');
    add('title', c.title, 'Title');
    add('description', c.description, 'Description');
    add('priority', c.priority, 'Priority');
    for (const field of this.caseType()?.fields ?? []) {
      const kind = field.dataType === 'Checkbox' ? 'checkbox' : 'input';
      const control = this.fieldControl(field);
      if (control) {
        add(this.fieldId(field), control, field.label, kind);
      }
    }
    add('requester-name', c.requesterName, 'Requester name');
    add('requester-email', c.requesterEmail, 'Email');
    add('requester-phone', c.requesterPhone, 'Phone');
    add('requester-address', c.requesterAddress, 'Address');

    this.errors.set([...links, ...extra.map((message) => ({ id: '', message }))]);
    this.focusSummary();
  }

  private focusSummary(): void {
    afterNextRender(() => this.errorSummary()?.nativeElement.focus(), { injector: this.injector });
  }

  protected focusField(event: Event, id: string): void {
    event.preventDefault();
    const target = document.getElementById(id);
    const focusable = target?.matches('input, textarea, select, [tabindex]') ? target : target?.querySelector('input');
    focusable?.focus();
  }
}
