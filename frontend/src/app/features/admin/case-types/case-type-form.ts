import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AdminCaseType, AdminCaseTypeField, AdminWorkflowStep, SaveCaseTypeRequest } from '../../../core/api/admin.models';
import { FieldDataType, TaskOutcome } from '../../../core/api/cases.models';

// The case type designer's form: details, then form fields and workflow steps as reorderable
// lists. It mirrors the API's rules so most problems show before saving; the API still checks
// everything (uniqueness across case types, fields and steps that existing cases use).

export const maxFields = 50;
export const maxSteps = 20;
export const maxOptions = 50;
export const maxSlaDays = 365;

export type FieldForm = FormGroup<{
  /** Null for a field added in this edit. Disabled: never edited, only sent back. */
  id: FormControl<number | null>;
  /** Existing cases have values for it, so it can't be removed or change type. */
  inUse: FormControl<boolean>;
  label: FormControl<string>;
  key: FormControl<string>;
  dataType: FormControl<FieldDataType>;
  isRequired: FormControl<boolean>;
  /** A select field's choices, one per line. */
  options: FormControl<string>;
}>;

export type StepForm = FormGroup<{
  id: FormControl<number | null>;
  /** Existing cases have tasks for it, so it can't be removed. */
  inUse: FormControl<boolean>;
  name: FormControl<string>;
  departmentId: FormControl<number | null>;
  slaDays: FormControl<number | null>;
  allowedOutcomes: FormControl<TaskOutcome[]>;
}>;

export type CaseTypeForm = FormGroup<{
  name: FormControl<string>;
  prefix: FormControl<string>;
  description: FormControl<string>;
  isActive: FormControl<boolean>;
  fields: FormArray<FieldForm>;
  steps: FormArray<StepForm>;
}>;

export const keyWording = { pattern: 'Key must be camelCase: letters and digits, starting with a lower-case letter.' };
export const prefixWording = { pattern: 'Prefix must be letters and digits, starting with a letter.' };

/** "Parcel Number" → "parcelNumber"; "2nd inspector?" → "field2ndInspector". */
export function fieldKeyFrom(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) {
    return '';
  }

  const key = words
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
  return (/^[a-z]/.test(key) ? key : `field${key}`).slice(0, 50);
}

/** A select field's choices from the one-per-line text: trimmed, blanks left out. */
export function parseOptions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);
}

/** A select field needs distinct choices; other types have none. */
const optionsValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (control.parent?.get('dataType')?.value !== 'Select') {
    return null;
  }

  const options = parseOptions(control.value ?? '');
  if (!options.length) {
    return { options: 'A select field needs at least one option.' };
  }

  if (options.length > maxOptions) {
    return { options: `A select field can have at most ${maxOptions} options.` };
  }

  if (options.some((option) => option.length > 100)) {
    return { options: 'Each option can be at most 100 characters.' };
  }

  const distinct = new Set(options.map((option) => option.toLowerCase()));
  return distinct.size === options.length ? null : { options: 'Each option must be different.' };
};

/** Work has to be able to move forward from every step. */
const outcomesValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const outcomes = (control.value ?? []) as TaskOutcome[];
  if (!outcomes.length) {
    return { outcomes: 'Choose the outcomes this step allows.' };
  }

  return outcomes.includes('Complete') || outcomes.includes('Approve')
    ? null
    : { outcomes: 'Each step must allow Complete or Approve, so work can move forward.' };
};

/** Case-insensitive, like the API: two rows with the same value. */
function distinctValidator(property: string, message: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const values = (control as FormArray<FormGroup>).controls
      .map((row) => String(row.get(property)?.value ?? '').trim().toLowerCase())
      .filter(Boolean);
    return new Set(values).size === values.length ? null : { duplicate: message };
  };
}

export function fieldForm(field?: AdminCaseTypeField): FieldForm {
  const form: FieldForm = new FormGroup({
    id: new FormControl({ value: field?.id ?? null, disabled: true }),
    inUse: new FormControl({ value: field?.inUse ?? false, disabled: true }, { nonNullable: true }),
    label: new FormControl(field?.label ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    key: new FormControl(field?.key ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/^\s*[a-z][A-Za-z0-9]*\s*$/)],
    }),
    dataType: new FormControl<FieldDataType>({ value: field?.dataType ?? 'Text', disabled: !!field?.inUse }, { nonNullable: true }),
    isRequired: new FormControl(field?.isRequired ?? false, { nonNullable: true }),
    options: new FormControl((field?.options ?? []).join('\n'), { nonNullable: true, validators: optionsValidator }),
  });

  form.controls.dataType.valueChanges.subscribe(() => form.controls.options.updateValueAndValidity());
  if (!field) {
    // A new field's key follows its label until someone edits the key.
    form.controls.label.valueChanges.subscribe((label) => {
      if (form.controls.key.pristine) {
        form.controls.key.setValue(fieldKeyFrom(label));
      }
    });
  }

  return form;
}

export function stepForm(step?: AdminWorkflowStep): StepForm {
  return new FormGroup({
    id: new FormControl({ value: step?.id ?? null, disabled: true }),
    inUse: new FormControl({ value: step?.inUse ?? false, disabled: true }, { nonNullable: true }),
    name: new FormControl(step?.name ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    departmentId: new FormControl<number | null>(step?.departmentId ?? null, Validators.required),
    slaDays: new FormControl<number | null>(step?.slaDays ?? 5, [
      Validators.required,
      Validators.min(0),
      Validators.max(maxSlaDays),
      Validators.pattern(/^\d+$/),
    ]),
    allowedOutcomes: new FormControl<TaskOutcome[]>(step?.allowedOutcomes ?? ['Complete'], {
      nonNullable: true,
      validators: outcomesValidator,
    }),
  });
}

/** The designer's form for a case type, or for a new one with a single step to start from. */
export function caseTypeForm(type?: AdminCaseType): CaseTypeForm {
  return new FormGroup({
    name: new FormControl(type?.name ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    prefix: new FormControl(type?.prefix ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10), Validators.pattern(/^\s*[A-Za-z][A-Za-z0-9]*\s*$/)],
    }),
    description: new FormControl(type?.description ?? '', { nonNullable: true, validators: Validators.maxLength(500) }),
    isActive: new FormControl(type?.isActive ?? true, { nonNullable: true }),
    fields: new FormArray((type?.fields ?? []).map((field) => fieldForm(field)), [
      Validators.maxLength(maxFields),
      distinctValidator('key', 'Each field needs a different key.'),
    ]),
    steps: new FormArray(type ? type.steps.map((step) => stepForm(step)) : [stepForm({ name: 'Intake' } as AdminWorkflowStep)], [
      Validators.maxLength(maxSteps),
      distinctValidator('name', 'Each step needs a different name.'),
    ]),
  });
}

/** The API request for the form's current state, in the order shown. */
export function saveRequest(form: CaseTypeForm): SaveCaseTypeRequest {
  const value = form.getRawValue();
  return {
    name: value.name.trim(),
    prefix: value.prefix.trim().toUpperCase(),
    description: value.description.trim() || null,
    isActive: value.isActive,
    fields: value.fields.map((field) => ({
      id: field.id,
      key: field.key.trim(),
      label: field.label.trim(),
      dataType: field.dataType,
      isRequired: field.isRequired,
      options: field.dataType === 'Select' ? parseOptions(field.options) : [],
    })),
    steps: value.steps.map((step, i) => ({
      id: step.id,
      name: step.name.trim(),
      departmentId: step.departmentId ?? 0,
      slaDays: Number(step.slaDays ?? 0),
      // The first step has nothing to return to.
      allowedOutcomes: i === 0 ? step.allowedOutcomes.filter((o) => o !== 'Return') : step.allowedOutcomes,
    })),
  };
}

/** Moves a row within a list, keeping its control (and so its state). */
export function moveControl<T extends AbstractControl>(array: FormArray<T>, from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= array.length || to >= array.length) {
    return;
  }

  const control = array.at(from) as T;
  array.removeAt(from, { emitEvent: false });
  array.insert(to, control);
  array.markAsDirty();
}

/**
 * Takes Return off the first step, which has nothing to return to. Returns true if it had to,
 * so the change can be announced.
 */
export function dropReturnFromFirstStep(steps: FormArray<StepForm>): boolean {
  const first = steps.length ? steps.at(0).controls.allowedOutcomes : null;
  if (!first?.value.includes('Return')) {
    return false;
  }

  first.setValue(first.value.filter((o) => o !== 'Return'));
  return true;
}

/** The standard time a case of this type should take, if every step keeps to its SLA. */
export function totalSlaDays(steps: FormArray<StepForm>): number {
  return steps.controls.reduce((sum, step) => {
    const days = Number(step.controls.slaDays.value);
    return sum + (Number.isFinite(days) && days > 0 ? days : 0);
  }, 0);
}
