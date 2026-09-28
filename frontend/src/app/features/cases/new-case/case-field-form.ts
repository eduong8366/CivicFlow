import { AbstractControl, FormControl, FormGroup, FormRecord, ValidatorFn, Validators } from '@angular/forms';
import { CaseTypeField } from '../../../core/api/cases.models';

// A case type's custom fields ("the general form") as reactive form controls, and back to the
// text values the API stores.

export type FieldControls = FormRecord<FormControl<unknown>>;

/** A control per field, keyed by the field's key, with the field's rules. */
export function fieldControls(fields: readonly CaseTypeField[]): FieldControls {
  const record = new FormRecord<FormControl<unknown>>({});
  for (const field of fields) {
    record.addControl(field.key, new FormControl<unknown>(initialValue(field), validatorsFor(field)));
  }

  return record;
}

function initialValue(field: CaseTypeField): unknown {
  return field.dataType === 'Checkbox' ? false : null;
}

function validatorsFor(field: CaseTypeField): ValidatorFn[] {
  if (!field.isRequired) {
    return [];
  }

  // A required checkbox is a confirmation: it must be ticked.
  return [field.dataType === 'Checkbox' ? Validators.requiredTrue : Validators.required];
}

/**
 * The form's values as the API takes them: numbers in invariant form, dates as yyyy-MM-dd,
 * checkboxes as "true"/"false", and blanks as null.
 */
export function fieldValues(fields: readonly CaseTypeField[], controls: FieldControls): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const field of fields) {
    const value = controls.get(field.key)?.value;
    switch (field.dataType) {
      case 'Checkbox':
        values[field.key] = value === true ? 'true' : 'false';
        break;
      case 'Number':
        // The input's type is bound per field, so its value arrives as text, not a number.
        values[field.key] = numberText(value);
        break;
      default:
        values[field.key] = typeof value === 'string' && value.trim() ? value.trim() : null;
    }
  }

  return values;
}

/** A number in invariant form ("1234.5"); text that isn't a number is passed on for the API to reject. */
function numberText(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return null;
  }

  const number = Number(text);
  return Number.isFinite(number) ? String(number) : text;
}

/**
 * Puts a 400's validation messages on the controls they belong to. The API keys errors by
 * property path (`Title`, `RequesterEmail`, `Fields.parcelNumber`); returns the messages that
 * match no control, to show on their own.
 */
export function applyServerErrors(form: FormGroup, errors: Record<string, string[]>): string[] {
  const unmatched: string[] = [];
  for (const [key, messages] of Object.entries(errors)) {
    const control = controlFor(form, key);
    if (control) {
      control.setErrors({ ...control.errors, server: messages[0] });
      control.markAsTouched();
    } else {
      unmatched.push(...messages);
    }
  }

  return unmatched;
}

function controlFor(form: FormGroup, key: string): AbstractControl | null {
  const [head, ...rest] = key.split('.');
  const name = camelCase(head);
  if (name === 'fields' && rest.length) {
    const fields = form.get('fields') as FormGroup | null;
    const fieldKey = rest.join('.');
    const match = Object.keys(fields?.controls ?? {}).find((k) => k.toLowerCase() === fieldKey.toLowerCase());
    return match ? fields!.get(match) : null;
  }

  return rest.length ? null : form.get(name);
}

function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * The message for a control's first problem. Admins write field labels in any style ("Parcel
 * Number", "Owner-occupied"), so messages use the label as written rather than build a sentence
 * around it.
 */
export function controlMessage(control: AbstractControl, label: string, kind: 'input' | 'checkbox' = 'input'): string | null {
  const errors = control.errors;
  if (!errors) {
    return null;
  }

  if (errors['server']) {
    return errors['server'] as string;
  }

  if (errors['required']) {
    return kind === 'checkbox' ? `Tick “${label}” to continue.` : `${label} is required.`;
  }

  if (errors['email']) {
    return 'Enter an email address like name@example.com.';
  }

  if (errors['maxlength']) {
    return `${label} can be at most ${(errors['maxlength'] as { requiredLength: number }).requiredLength} characters.`;
  }

  return `Check ${label}.`;
}
