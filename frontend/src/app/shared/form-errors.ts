import { AbstractControl, FormArray, FormControl, FormGroup } from '@angular/forms';

// Validation messages for reactive forms, and the API's 400s put onto the controls they're about.

/** Messages for errors whose default wording doesn't fit, e.g. `{ pattern: 'Use letters and digits.' }`. */
export type ErrorWording = Partial<Record<string, string>>;

/**
 * The message for a control's first problem, or null when it has none. Validators that return a
 * message as their error value (`{ duplicate: 'Each step needs a different name.' }`) are shown
 * as written.
 */
export function errorMessage(control: AbstractControl, label: string, wording: ErrorWording = {}): string | null {
  const errors = control.errors;
  if (!errors) {
    return null;
  }

  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }

  for (const key of Object.keys(errors)) {
    if (wording[key]) {
      return wording[key]!;
    }
  }

  if (errors['required']) {
    return `${label} is required.`;
  }

  if (errors['email']) {
    return 'Enter an email address like name@example.com.';
  }

  if (errors['minlength']) {
    return `${label} must be at least ${(errors['minlength'] as { requiredLength: number }).requiredLength} characters.`;
  }

  if (errors['maxlength']) {
    return `${label} can be at most ${(errors['maxlength'] as { requiredLength: number }).requiredLength} characters.`;
  }

  if (errors['min']) {
    return `${label} must be at least ${(errors['min'] as { min: number }).min}.`;
  }

  if (errors['max']) {
    return `${label} must be at most ${(errors['max'] as { max: number }).max}.`;
  }

  const written = Object.values(errors).find((value): value is string => typeof value === 'string');
  return written ?? `Check ${label}.`;
}

/**
 * A control path from an API error key: `Fields[0].Key` → `['fields', 0, 'key']`. The API names
 * properties in PascalCase; forms use camelCase.
 */
export function errorPath(key: string): (string | number)[] {
  const path: (string | number)[] = [];
  for (const part of key.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) {
      return [];
    }

    if (match[1]) {
      path.push(match[1].charAt(0).toLowerCase() + match[1].slice(1));
    }

    for (const index of match[2].matchAll(/\[(\d+)\]/g)) {
      path.push(Number(index[1]));
    }
  }

  return path;
}

/**
 * The enabled form control an API error key points at, if any. A key that goes deeper than a
 * control (`Fields[0].Options[2]`, when options are one text control) lands on that control.
 * Groups, arrays and disabled controls don't show messages, so errors about them are unmatched.
 */
export function controlForError(form: AbstractControl, key: string): FormControl | null {
  let current: AbstractControl | null = form;
  for (const segment of errorPath(key)) {
    if (current instanceof FormControl) {
      break;
    }

    if (current instanceof FormArray && typeof segment === 'number') {
      current = segment < current.length ? current.at(segment) : null;
    } else if (current instanceof FormGroup && typeof segment === 'string') {
      current = current.get(segment);
    } else {
      current = null;
    }

    if (!current) {
      return null;
    }
  }

  return current instanceof FormControl && current.enabled ? current : null;
}

/**
 * Puts a 400's validation messages on the controls they belong to, and returns the messages that
 * belong to no visible control, to show on their own.
 */
export function applyServerErrors(form: AbstractControl, errors: Record<string, string[]>): string[] {
  const unmatched: string[] = [];
  for (const [key, messages] of Object.entries(errors)) {
    const control = key ? controlForError(form, key) : null;
    if (control) {
      control.setErrors({ ...control.errors, server: messages[0] });
      control.markAsTouched();
    } else {
      unmatched.push(...messages);
    }
  }

  return unmatched;
}
